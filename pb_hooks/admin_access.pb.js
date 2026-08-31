// Private application-admin mutation boundary. The browser cannot call this
// route because it requires PocketBase superuser authentication held only by
// the Next.js server. Every expected outcome is written without PII.

onRecordUpdateRequest((e) => {
  throw e.forbiddenError("Admin audit records are append-only")
}, "app_admin_audit")

onRecordDeleteRequest((e) => {
  throw e.forbiddenError("Admin audit records are append-only")
}, "app_admin_audit")

routerAdd("POST", "/api/fanzoom/admin-access/mutate", (e) => {
  if (!e.hasSuperuserAuth()) throw e.unauthorizedError("Superuser authentication is required")

  const input = e.requestInfo().body
  const keys = input && typeof input === "object" ? Object.keys(input) : []
  const valid = input && typeof input === "object" &&
    keys.length === 5 &&
    keys.every((key) => ["actorUserId", "targetUserId", "role", "enabled", "requestId"].includes(key)) &&
    /^[a-z0-9]{15}$/i.test(input.actorUserId || "") &&
    /^[a-z0-9]{15}$/i.test(input.targetUserId || "") &&
    (input.role === "viewer" || input.role === "admin") &&
    typeof input.enabled === "boolean" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.requestId || "")
  if (!valid) throw e.badRequestError("Invalid admin access mutation")

  let output = null
  e.app.runInTransaction((txApp) => {
    const auditCollection = txApp.findCollectionByNameOrId("app_admin_audit")
    const adminCollection = txApp.findCollectionByNameOrId("app_admins")

    const appendAudit = (values) => {
      const audit = new Record(auditCollection)
      if (values.actorAdmin) audit.set("actorAdmin", values.actorAdmin)
      if (values.targetUser) audit.set("targetUser", values.targetUser)
      audit.set("action", values.action)
      if (values.beforeRole) audit.set("beforeRole", values.beforeRole)
      if (values.afterRole) audit.set("afterRole", values.afterRole)
      audit.set("beforeEnabled", values.beforeEnabled === true)
      audit.set("afterEnabled", values.afterEnabled === true)
      audit.set("requestId", input.requestId)
      audit.set("occurredAt", new Date().toISOString())
      audit.set("outcome", values.outcome)
      txApp.save(audit)
    }

    let actor = null
    try {
      actor = txApp.findFirstRecordByFilter(
        "app_admins",
        "user = {:userId}",
        { userId: input.actorUserId },
      )
    } catch {}

    if (!actor || actor.getString("role") !== "owner" || !actor.getBool("enabled")) {
      appendAudit({
        actorAdmin: actor ? actor.id : "",
        action: "access_denied",
        outcome: "denied",
      })
      output = { status: 403, error: "owner_required" }
      return
    }

    let targetUser = null
    try {
      targetUser = txApp.findRecordById("users", input.targetUserId)
    } catch {}
    if (!targetUser) {
      appendAudit({
        actorAdmin: actor.id,
        action: "mutation_failed",
        outcome: "failed",
      })
      output = { status: 404, error: "target_not_found" }
      return
    }

    let membership = null
    try {
      membership = txApp.findFirstRecordByFilter(
        "app_admins",
        "user = {:userId}",
        { userId: input.targetUserId },
      )
    } catch {}

    const beforeRole = membership ? membership.getString("role") : ""
    const beforeEnabled = membership ? membership.getBool("enabled") : false

    if (membership && beforeRole === "owner") {
      const owners = new DynamicModel({ total: 0 })
      txApp.db().newQuery(
        "SELECT COUNT(*) AS total FROM app_admins WHERE role = 'owner' AND enabled = TRUE",
      ).one(owners)
      const error = input.actorUserId === input.targetUserId
        ? "self_lockout_forbidden"
        : Number(owners.total || 0) <= 1
          ? "last_owner_protected"
          : "owner_transfer_required"
      appendAudit({
        actorAdmin: actor.id,
        targetUser: targetUser.id,
        action: "mutation_failed",
        beforeRole,
        afterRole: beforeRole,
        beforeEnabled,
        afterEnabled: beforeEnabled,
        outcome: "denied",
      })
      output = { status: 409, error }
      return
    }

    if (membership && beforeRole === input.role && beforeEnabled === input.enabled) {
      appendAudit({
        actorAdmin: actor.id,
        targetUser: targetUser.id,
        action: "mutation_failed",
        beforeRole,
        afterRole: beforeRole,
        beforeEnabled,
        afterEnabled: beforeEnabled,
        outcome: "denied",
      })
      output = { status: 409, error: "no_change" }
      return
    }

    let action = "grant"
    if (membership) {
      if (beforeRole !== input.role) action = "role_change"
      else if (!beforeEnabled && input.enabled) action = "enable"
      else if (beforeEnabled && !input.enabled) action = "revoke"
    }

    if (!membership) {
      membership = new Record(adminCollection)
      membership.set("user", targetUser.id)
    }
    membership.set("role", input.role)
    membership.set("enabled", input.enabled)
    txApp.save(membership)

    appendAudit({
      actorAdmin: actor.id,
      targetUser: targetUser.id,
      action,
      beforeRole,
      afterRole: input.role,
      beforeEnabled,
      afterEnabled: input.enabled,
      outcome: "success",
    })
    output = {
      status: 200,
      result: { role: input.role, enabled: input.enabled, action },
    }
  })

  return e.json(output.status, output.result || { error: output.error })
})

routerAdd("POST", "/api/fanzoom/admin-access/audit-denied", (e) => {
  if (!e.hasSuperuserAuth()) throw e.unauthorizedError("Superuser authentication is required")

  const input = e.requestInfo().body
  const keys = input && typeof input === "object" ? Object.keys(input) : []
  const valid = input && typeof input === "object" &&
    keys.every((key) => ["actorUserId", "targetUserId", "action", "outcome", "requestId"].includes(key)) &&
    /^[a-z0-9]{15}$/i.test(input.actorUserId || "") &&
    (!input.targetUserId || /^[a-z0-9]{15}$/i.test(input.targetUserId)) &&
    (input.action === "access_denied" || input.action === "mutation_failed") &&
    (input.outcome === "denied" || input.outcome === "failed") &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.requestId || "")
  if (!valid) throw e.badRequestError("Invalid admin audit request")

  e.app.runInTransaction((txApp) => {
    let actor = null
    try {
      actor = txApp.findFirstRecordByFilter("app_admins", "user = {:userId}", {
        userId: input.actorUserId,
      })
    } catch {}
    const audit = new Record(txApp.findCollectionByNameOrId("app_admin_audit"))
    if (actor) audit.set("actorAdmin", actor.id)
    if (input.targetUserId) audit.set("targetUser", input.targetUserId)
    audit.set("action", input.action)
    audit.set("requestId", input.requestId)
    audit.set("occurredAt", new Date().toISOString())
    audit.set("outcome", input.outcome)
    txApp.save(audit)
  })

  return e.json(201, { created: true })
})

routerAdd("POST", "/api/fanzoom/admin-access/bootstrap-owner", (e) => {
  if (!e.hasSuperuserAuth()) throw e.unauthorizedError("Superuser authentication is required")
  const input = e.requestInfo().body
  const keys = input && typeof input === "object" ? Object.keys(input) : []
  if (!input || keys.length !== 2 || !keys.every((key) => key === "userId" || key === "requestId") ||
      !/^[a-z0-9]{15}$/i.test(input.userId || "") ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.requestId || "")) {
    throw e.badRequestError("Invalid owner bootstrap request")
  }

  let output = null
  e.app.runInTransaction((txApp) => {
    const owners = new DynamicModel({ total: 0 })
    txApp.db().newQuery("SELECT COUNT(*) AS total FROM app_admins WHERE role = 'owner' AND enabled = TRUE").one(owners)
    if (Number(owners.total || 0) > 0) {
      output = { status: 409, error: "owner_already_exists" }
      return
    }
    let user = null
    try { user = txApp.findRecordById("users", input.userId) } catch {}
    if (!user) {
      output = { status: 404, error: "target_not_found" }
      return
    }
    let membership = null
    try {
      membership = txApp.findFirstRecordByFilter("app_admins", "user = {:userId}", { userId: input.userId })
    } catch {}
    const beforeRole = membership ? membership.getString("role") : ""
    const beforeEnabled = membership ? membership.getBool("enabled") : false
    if (!membership) {
      membership = new Record(txApp.findCollectionByNameOrId("app_admins"))
      membership.set("user", user.id)
    }
    membership.set("role", "owner")
    membership.set("enabled", true)
    txApp.save(membership)

    const audit = new Record(txApp.findCollectionByNameOrId("app_admin_audit"))
    audit.set("actorAdmin", membership.id)
    audit.set("targetUser", user.id)
    audit.set("action", "bootstrap")
    if (beforeRole) audit.set("beforeRole", beforeRole)
    audit.set("afterRole", "owner")
    audit.set("beforeEnabled", beforeEnabled)
    audit.set("afterEnabled", true)
    audit.set("requestId", input.requestId)
    audit.set("occurredAt", new Date().toISOString())
    audit.set("outcome", "success")
    txApp.save(audit)
    output = { status: 201, result: { role: "owner", enabled: true } }
  })
  return e.json(output.status, output.result || { error: output.error })
})
