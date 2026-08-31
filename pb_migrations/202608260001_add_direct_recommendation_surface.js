migrate((app) => {
  const collection = app.findCollectionByNameOrId("recommendation_events")
  const surface = collection.fields.getByName("surface")
  if (!surface) throw new Error("recommendation_events.surface is missing")

  const values = Array.isArray(surface.values) ? surface.values : []
  if (!values.includes("direct")) {
    surface.values = [...values, "direct"]
    app.save(collection)
  }
}, () => {
  // Non-destructive: existing direct events must remain valid on rollback.
})
