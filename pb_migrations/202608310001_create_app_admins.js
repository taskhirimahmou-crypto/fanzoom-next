// Application-level dashboard roles. This collection is deliberately private:
// membership is resolved only by trusted server code and never grants PocketBase
// superuser privileges.
migrate((app) => {
  const users = app.findCollectionByNameOrId("users")

  let collection
  try {
    collection = app.findCollectionByNameOrId("app_admins")
  } catch {
    collection = null
  }

  if (!collection) {
    collection = new Collection({
      type: "base",
      name: "app_admins",
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { name: "user", type: "relation", required: true, collectionId: users.id, maxSelect: 1 },
        {
          name: "role",
          type: "select",
          required: true,
          values: ["owner", "admin", "viewer"],
          maxSelect: 1,
        },
        { name: "enabled", type: "bool" },
      ],
    })
  } else {
    if (!collection.fields.getByName("user")) {
      collection.fields.add(new RelationField({
        name: "user",
        required: true,
        collectionId: users.id,
        maxSelect: 1,
      }))
    }
    if (!collection.fields.getByName("role")) {
      collection.fields.add(new SelectField({
        name: "role",
        required: true,
        values: ["owner", "admin", "viewer"],
        maxSelect: 1,
      }))
    }
    if (!collection.fields.getByName("enabled")) {
      collection.fields.add(new BoolField({ name: "enabled" }))
    }
  }

  collection.listRule = null
  collection.viewRule = null
  collection.createRule = null
  collection.updateRule = null
  collection.deleteRule = null

  const indexes = collection.indexes || []
  if (!indexes.some((index) => String(index).includes("idx_app_admins_user_unique"))) {
    collection.addIndex("idx_app_admins_user_unique", true, "user", "")
  }

  app.save(collection)
}, () => {
  // Intentionally non-destructive: role data is never deleted automatically.
})
