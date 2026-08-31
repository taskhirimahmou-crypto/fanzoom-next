// Internal SQLite tables, deliberately not PocketBase collections. They are
// unreachable through the Record API and contain only HMAC-pseudonymous keys.
migrate((app) => {
  app.db().newQuery(`
    CREATE TABLE IF NOT EXISTS fanzoom_rate_limit_buckets (
      policy TEXT NOT NULL,
      key_hash TEXT NOT NULL,
      tokens_micros INTEGER NOT NULL,
      last_refill_ms INTEGER NOT NULL,
      expires_at_ms INTEGER NOT NULL,
      created_at_ms INTEGER NOT NULL,
      updated_at_ms INTEGER NOT NULL,
      PRIMARY KEY (policy, key_hash)
    ) WITHOUT ROWID
  `).execute()
  app.db().newQuery(`
    CREATE INDEX IF NOT EXISTS idx_fz_rl_buckets_expiry
    ON fanzoom_rate_limit_buckets (expires_at_ms)
  `).execute()
  app.db().newQuery(`
    CREATE TABLE IF NOT EXISTS fanzoom_rate_limit_decisions (
      decision_id TEXT PRIMARY KEY,
      response_json TEXT NOT NULL,
      expires_at_ms INTEGER NOT NULL,
      created_at_ms INTEGER NOT NULL
    ) WITHOUT ROWID
  `).execute()
  app.db().newQuery(`
    CREATE INDEX IF NOT EXISTS idx_fz_rl_decisions_expiry
    ON fanzoom_rate_limit_decisions (expires_at_ms)
  `).execute()
  app.db().newQuery(`
    CREATE TABLE IF NOT EXISTS fanzoom_rate_limit_cleanup (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      last_run_ms INTEGER NOT NULL DEFAULT 0,
      buckets_deleted_total INTEGER NOT NULL DEFAULT 0,
      decisions_deleted_total INTEGER NOT NULL DEFAULT 0,
      last_buckets_deleted INTEGER NOT NULL DEFAULT 0,
      last_decisions_deleted INTEGER NOT NULL DEFAULT 0
    )
  `).execute()
  app.db().newQuery(`
    INSERT OR IGNORE INTO fanzoom_rate_limit_cleanup (id) VALUES (1)
  `).execute()
}, () => {
  // Non-destructive by design: rollback never removes limiter/audit state.
})
