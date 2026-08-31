// PocketBase wraps registered callbacks in isolated runtime scopes, therefore
// every callback keeps its helpers local instead of relying on module globals.
routerAdd("POST", "/api/fanzoom/rate-limit/check", (e) => {
  const path = "/api/fanzoom/rate-limit/check"
  const now = Date.now()
  const input = e.requestInfo().body
  const policies = JSON.parse(toString($os.readFile(__hooks + "/rate_limit_policies.json")))
  const valid = input && typeof input === "object" &&
    /^[0-9a-f-]{36}$/i.test(input.decisionId || "") &&
    Array.isArray(input.buckets) && input.buckets.length >= 1 && input.buckets.length <= 4 &&
    Object.keys(input).every((key) => key === "decisionId" || key === "buckets")
  if (!valid) throw e.badRequestError("Invalid limiter request")
  const seen = {}
  for (const bucket of input.buckets) {
    if (!bucket || typeof bucket !== "object" || !policies[bucket.policy] ||
        !/^[a-f0-9]{64}$/i.test(bucket.keyHash || "") || seen[bucket.policy] ||
        !Object.keys(bucket).every((key) => key === "policy" || key === "keyHash")) {
      throw e.badRequestError("Invalid limiter bucket")
    }
    seen[bucket.policy] = true
  }

  const raw = JSON.stringify({ decisionId: input.decisionId, buckets: input.buckets })
  if (raw.length > 8192) throw e.badRequestError("Request body is too large")
  const signedParts = [input.decisionId]
  for (const bucket of input.buckets) signedParts.push(bucket.policy, bucket.keyHash)
  const signedBody = signedParts.join("\n")
  const timestamp = e.request.header.get("X-Fanzoom-Timestamp") || ""
  const signature = e.request.header.get("X-Fanzoom-Signature") || ""
  if (!/^\d{13}$/.test(timestamp) || Math.abs(now - Number(timestamp)) > 60000 || !/^[a-f0-9]{64}$/i.test(signature)) {
    throw e.unauthorizedError("Invalid limiter signature")
  }
  const canonical = "v1\nPOST\n" + path + "\n" + timestamp + "\n" + $security.sha256(signedBody)
  const current = $os.getenv("SHARED_RATE_LIMIT_HOOK_SECRET") || ""
  const previous = $os.getenv("SHARED_RATE_LIMIT_HOOK_SECRET_PREVIOUS") || ""
  const signed = (current.length >= 32 && $security.equal($security.hs256(canonical, current), signature)) ||
    (previous.length >= 32 && $security.equal($security.hs256(canonical, previous), signature))
  if (!signed) throw e.unauthorizedError("Invalid limiter signature")

  let output = null
  try {
    e.app.runInTransaction((txApp) => {
      const cached = new DynamicModel({ response_json: "" })
      try {
        txApp.db().newQuery("SELECT response_json FROM fanzoom_rate_limit_decisions WHERE decision_id = {:decisionId} AND expires_at_ms > {:now}")
          .bind({ decisionId: input.decisionId, now }).one(cached)
      } catch { cached.response_json = "" }
      if (cached.response_json) {
        output = JSON.parse(cached.response_json)
        output.retryDeduplicated = true
        output.writeCount = 0
        return
      }

      let allowed = true
      let retryAfterSeconds = 0
      let writeCount = 0
      const results = []
      for (const requested of input.buckets) {
        const policy = policies[requested.policy]
        const capacity = Number(policy.capacity)
        const windowMs = Number(policy.windowSeconds) * 1000
        const capacityMicros = capacity * 1000000
        const row = new DynamicModel({ tokens_micros: capacityMicros, last_refill_ms: now })
        try {
          txApp.db().newQuery("SELECT tokens_micros, last_refill_ms FROM fanzoom_rate_limit_buckets WHERE policy = {:policy} AND key_hash = {:keyHash}")
            .bind({ policy: requested.policy, keyHash: requested.keyHash }).one(row)
        } catch {}
        const elapsed = Math.max(0, now - Number(row.last_refill_ms || now))
        const windowReset = elapsed >= windowMs
        const available = windowReset ? capacityMicros : Number(row.tokens_micros)
        const windowStartedAt = windowReset ? now : Number(row.last_refill_ms || now)
        const bucketAllowed = available >= 1000000
        const remaining = bucketAllowed ? available - 1000000 : available
        const waitMs = bucketAllowed ? 0 : Math.max(1, windowMs - (now - windowStartedAt))
        allowed = allowed && bucketAllowed
        retryAfterSeconds = Math.max(retryAfterSeconds, Math.max(1, Math.ceil(waitMs / 1000)))
        results.push({ policy: requested.policy, layer: policy.layer, allowed: bucketAllowed })
        txApp.db().newQuery(`
          INSERT INTO fanzoom_rate_limit_buckets
            (policy, key_hash, tokens_micros, last_refill_ms, expires_at_ms, created_at_ms, updated_at_ms)
          VALUES ({:policy}, {:keyHash}, {:tokens}, {:now}, {:expires}, {:now}, {:now})
          ON CONFLICT(policy, key_hash) DO UPDATE SET
            tokens_micros = excluded.tokens_micros,
            last_refill_ms = excluded.last_refill_ms,
            expires_at_ms = excluded.expires_at_ms,
            updated_at_ms = excluded.updated_at_ms
        `).bind({ policy: requested.policy, keyHash: requested.keyHash, tokens: remaining, now: windowStartedAt, expires: now + (windowMs * 2) }).execute()
        writeCount++
      }
      output = { allowed, retryAfterSeconds: allowed ? 0 : retryAfterSeconds, results, retryDeduplicated: false, writeCount: writeCount + 1 }
      txApp.db().newQuery(`
        INSERT INTO fanzoom_rate_limit_decisions (decision_id, response_json, expires_at_ms, created_at_ms)
        VALUES ({:decisionId}, {:response}, {:expires}, {:now})
      `).bind({ decisionId: input.decisionId, response: JSON.stringify(output), expires: now + (5 * 60 * 1000), now }).execute()
    })
  } catch (error) {
    if (String(error).toLowerCase().includes("busy")) return e.json(503, { error: "sqlite_busy" })
    e.app.logger().error("shared rate limiter hook failed", "error", String(error))
    throw error
  }
  if (!output.allowed) e.response.header().set("Retry-After", String(output.retryAfterSeconds))
  return e.json(output.allowed ? 200 : 429, output)
})

routerAdd("GET", "/api/fanzoom/rate-limit/metrics", (e) => {
  const path = "/api/fanzoom/rate-limit/metrics"
  const now = Date.now()
  const timestamp = e.request.header.get("X-Fanzoom-Timestamp") || ""
  const signature = e.request.header.get("X-Fanzoom-Signature") || ""
  if (!/^\d{13}$/.test(timestamp) || Math.abs(now - Number(timestamp)) > 60000 || !/^[a-f0-9]{64}$/i.test(signature)) {
    throw e.unauthorizedError("Invalid limiter signature")
  }
  const canonical = "v1\nGET\n" + path + "\n" + timestamp + "\n" + $security.sha256("")
  const current = $os.getenv("SHARED_RATE_LIMIT_HOOK_SECRET") || ""
  const previous = $os.getenv("SHARED_RATE_LIMIT_HOOK_SECRET_PREVIOUS") || ""
  const signed = (current.length >= 32 && $security.equal($security.hs256(canonical, current), signature)) ||
    (previous.length >= 32 && $security.equal($security.hs256(canonical, previous), signature))
  if (!signed) throw e.unauthorizedError("Invalid limiter signature")
  const counts = new DynamicModel({ active_buckets: 0, cleanup_backlog: 0, oldest_expired_ms: 0 })
  e.app.db().newQuery(`
    SELECT
      (SELECT COUNT(*) FROM fanzoom_rate_limit_buckets WHERE expires_at_ms > {:now}) AS active_buckets,
      ((SELECT COUNT(*) FROM fanzoom_rate_limit_buckets WHERE expires_at_ms <= {:now}) +
       (SELECT COUNT(*) FROM fanzoom_rate_limit_decisions WHERE expires_at_ms <= {:now})) AS cleanup_backlog,
      COALESCE({:now} - MIN(expires_at_ms), 0) AS oldest_expired_ms
    FROM (
      SELECT expires_at_ms FROM fanzoom_rate_limit_buckets WHERE expires_at_ms <= {:now}
      UNION ALL SELECT expires_at_ms FROM fanzoom_rate_limit_decisions WHERE expires_at_ms <= {:now}
    )
  `).bind({ now }).one(counts)
  const cleanup = new DynamicModel({ buckets_deleted_total: 0, decisions_deleted_total: 0, last_buckets_deleted: 0, last_decisions_deleted: 0, last_run_ms: 0 })
  e.app.db().newQuery("SELECT * FROM fanzoom_rate_limit_cleanup WHERE id = 1").one(cleanup)
  return e.json(200, {
    activeBuckets: Number(counts.active_buckets || 0),
    cleanupBacklog: Number(counts.cleanup_backlog || 0),
    oldestExpiredAgeMs: Math.max(0, Number(counts.oldest_expired_ms || 0)),
    cleanupDeleted: Number(cleanup.buckets_deleted_total || 0) + Number(cleanup.decisions_deleted_total || 0),
    lastCleanupDeleted: Number(cleanup.last_buckets_deleted || 0) + Number(cleanup.last_decisions_deleted || 0),
    lastCleanupAt: Number(cleanup.last_run_ms || 0),
  })
})

cronAdd("fanzoom-rate-limit-cleanup", "*/15 * * * *", () => {
  const now = Date.now()
  const limit = 1000
  $app.runInTransaction((txApp) => {
    const bucketRows = arrayOf(new DynamicModel({ policy: "", key_hash: "" }))
    txApp.db().newQuery("SELECT policy, key_hash FROM fanzoom_rate_limit_buckets WHERE expires_at_ms <= {:now} ORDER BY expires_at_ms LIMIT {:limit}")
      .bind({ now, limit }).all(bucketRows)
    for (const row of bucketRows) {
      txApp.db().newQuery("DELETE FROM fanzoom_rate_limit_buckets WHERE policy = {:policy} AND key_hash = {:keyHash} AND expires_at_ms <= {:now}")
        .bind({ policy: row.policy, keyHash: row.key_hash, now }).execute()
    }
    const decisions = arrayOf(new DynamicModel({ decision_id: "" }))
    txApp.db().newQuery("SELECT decision_id FROM fanzoom_rate_limit_decisions WHERE expires_at_ms <= {:now} ORDER BY expires_at_ms LIMIT {:limit}")
      .bind({ now, limit }).all(decisions)
    for (const row of decisions) {
      txApp.db().newQuery("DELETE FROM fanzoom_rate_limit_decisions WHERE decision_id = {:decisionId} AND expires_at_ms <= {:now}")
        .bind({ decisionId: row.decision_id, now }).execute()
    }
    txApp.db().newQuery(`
      UPDATE fanzoom_rate_limit_cleanup SET
        last_run_ms = {:now},
        buckets_deleted_total = buckets_deleted_total + {:bucketCount},
        decisions_deleted_total = decisions_deleted_total + {:decisionCount},
        last_buckets_deleted = {:bucketCount},
        last_decisions_deleted = {:decisionCount}
      WHERE id = 1
    `).bind({ now, bucketCount: bucketRows.length, decisionCount: decisions.length }).execute()
  })
})
