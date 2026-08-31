// PocketBase 0.40 doesn't add created/updated fields to base collections
// implicitly. Add them without rewriting existing membership data so owner
// management can sort new and changed records deterministically.
migrate((app) => {
  const collection = app.findCollectionByNameOrId("app_admins")

  if (!collection.fields.getByName("created")) {
    collection.fields.add(new AutodateField({
      name: "created",
      onCreate: true,
    }))
  }

  if (!collection.fields.getByName("updated")) {
    collection.fields.add(new AutodateField({
      name: "updated",
      onCreate: true,
      onUpdate: true,
    }))
  }

  app.save(collection)
}, () => {
  // Intentionally non-destructive: membership data and timestamps are retained.
})
