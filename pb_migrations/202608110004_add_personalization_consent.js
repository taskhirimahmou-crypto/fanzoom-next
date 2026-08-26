// Explicit opt-in for identified recommendation instrumentation.
// Existing users remain opted out because PocketBase bool fields default to false.
migrate((app) => {
  const users = app.findCollectionByNameOrId("users")
  let changed = false

  if (!users.fields.getByName("personalizationEnabled")) {
    users.fields.add(new BoolField({ name: "personalizationEnabled" }))
    changed = true
  }
  if (!users.fields.getByName("personalizationConsentAt")) {
    users.fields.add(new DateField({ name: "personalizationConsentAt" }))
    changed = true
  }

  if (changed) app.save(users)
}, () => {
  // Intentionally non-destructive: consent history and user data are retained.
})
