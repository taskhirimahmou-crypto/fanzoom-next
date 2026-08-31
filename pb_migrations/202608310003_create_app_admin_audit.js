// Private, append-only audit records for application-level admin access.
// Existing memberships are preserved and receive a deterministic bootstrap
// entry so access metrics can be reconstructed from the audit source alone.
migrate((app) => {
  const users = app.findCollectionByNameOrId("users")
  const appAdmins = app.findCollectionByNameOrId("app_admins")

  let audit
  try {
    audit = app.findCollectionByNameOrId("app_admin_audit")
  } catch {
    audit = null
  }

  if (!audit) {
    audit = new Collection({
      type: "base",
      name: "app_admin_audit",
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { name: "actorAdmin", type: "relation", collectionId: appAdmins.id, maxSelect: 1 },
        { name: "targetUser", type: "relation", collectionId: users.id, maxSelect: 1 },
        {
          name: "action",
          type: "select",
          required: true,
          values: ["bootstrap", "grant", "role_change", "enable", "revoke", "access_denied", "mutation_failed"],
          maxSelect: 1,
        },
        { name: "beforeRole", type: "select", values: ["owner", "admin", "viewer"], maxSelect: 1 },
        { name: "afterRole", type: "select", values: ["owner", "admin", "viewer"], maxSelect: 1 },
        { name: "beforeEnabled", type: "bool" },
        { name: "afterEnabled", type: "bool" },
        { name: "requestId", type: "text", required: true, max: 100 },
        { name: "occurredAt", type: "date", required: true },
        {
          name: "outcome",
          type: "select",
          required: true,
          values: ["success", "denied", "failed"],
          maxSelect: 1,
        },
      ],
    })
  }

  audit.listRule = null
  audit.viewRule = null
  audit.createRule = null
  audit.updateRule = null
  audit.deleteRule = null

  const indexes = audit.indexes || []
  if (!indexes.some((index) => String(index).includes("idx_app_admin_audit_occurred"))) {
    audit.addIndex("idx_app_admin_audit_occurred", false, "occurredAt", "")
  }
  if (!indexes.some((index) => String(index).includes("idx_app_admin_audit_action_outcome"))) {
    audit.addIndex("idx_app_admin_audit_action_outcome", false, "action,outcome", "")
  }
  app.save(audit)

  const existingAudits = app.findAllRecords("app_admin_audit")
  for (const membership of app.findAllRecords("app_admins")) {
    const requestId = `migration-bootstrap-${membership.id}`
    if (existingAudits.some((record) => record.getString("requestId") === requestId)) continue

    const record = new Record(audit)
    record.set("actorAdmin", membership.id)
    record.set("targetUser", membership.getString("user"))
    record.set("action", "bootstrap")
    record.set("afterRole", membership.getString("role"))
    record.set("afterEnabled", membership.getBool("enabled"))
    record.set("requestId", requestId)
    record.set("occurredAt", membership.getString("created") || new Date().toISOString())
    record.set("outcome", "success")
    app.save(record)
    existingAudits.push(record)
  }
}, () => {
  // Intentionally non-destructive: access and audit records are retained.
})
