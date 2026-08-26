// Private, append-only event store. All writes go through the Next.js server endpoint.
migrate((app) => {
  const users = app.findCollectionByNameOrId("users")
  const articles = app.findCollectionByNameOrId("articles")

  let collection
  try {
    collection = app.findCollectionByNameOrId("recommendation_events")
  } catch {
    collection = null
  }

  const eventTypes = [
    "served",
    "impression",
    "open",
    "engaged",
    "progress_milestone",
    "bookmark_add",
    "bookmark_remove",
    "share",
    "comment",
    "not_interested",
  ]
  const surfaces = ["home", "for_you", "direct", "article", "bookmarks", "history", "search", "category", "unknown"]

  if (!collection) {
    collection = new Collection({
      type: "base",
      name: "recommendation_events",
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { name: "eventId", type: "text", required: true, max: 64 },
        { name: "idempotencyKey", type: "text", required: true, max: 128 },
        { name: "userId", type: "relation", required: true, collectionId: users.id, maxSelect: 1 },
        { name: "articleId", type: "relation", required: true, collectionId: articles.id, maxSelect: 1 },
        { name: "eventType", type: "select", required: true, values: eventTypes, maxSelect: 1 },
        { name: "surface", type: "select", required: true, values: surfaces, maxSelect: 1 },
        { name: "feedId", type: "text", max: 64 },
        { name: "rank", type: "number", min: 0 },
        { name: "algorithmVersion", type: "text", max: 96 },
        { name: "occurredAt", type: "date", required: true },
        { name: "receivedAt", type: "date", required: true },
        { name: "engagedSeconds", type: "number", min: 0, max: 86400 },
        { name: "maxProgress", type: "number", min: 0, max: 100 },
        { name: "reasonCode", type: "text", max: 64 },
      ],
    })
  } else {
    const fields = {
      eventId: () => new TextField({ name: "eventId", required: true, max: 64 }),
      idempotencyKey: () => new TextField({ name: "idempotencyKey", required: true, max: 128 }),
      userId: () => new RelationField({ name: "userId", required: true, collectionId: users.id, maxSelect: 1 }),
      articleId: () => new RelationField({ name: "articleId", required: true, collectionId: articles.id, maxSelect: 1 }),
      eventType: () => new SelectField({ name: "eventType", required: true, values: eventTypes, maxSelect: 1 }),
      surface: () => new SelectField({ name: "surface", required: true, values: surfaces, maxSelect: 1 }),
      feedId: () => new TextField({ name: "feedId", max: 64 }),
      rank: () => new NumberField({ name: "rank", min: 0 }),
      algorithmVersion: () => new TextField({ name: "algorithmVersion", max: 96 }),
      occurredAt: () => new DateField({ name: "occurredAt", required: true }),
      receivedAt: () => new DateField({ name: "receivedAt", required: true }),
      engagedSeconds: () => new NumberField({ name: "engagedSeconds", min: 0, max: 86400 }),
      maxProgress: () => new NumberField({ name: "maxProgress", min: 0, max: 100 }),
      reasonCode: () => new TextField({ name: "reasonCode", max: 64 }),
    }
    for (const [name, createField] of Object.entries(fields)) {
      if (!collection.fields.getByName(name)) collection.fields.add(createField())
    }
  }

  collection.listRule = null
  collection.viewRule = null
  collection.createRule = null
  collection.updateRule = null
  collection.deleteRule = null

  const indexes = collection.indexes || []
  if (!indexes.some((index) => String(index).includes("idx_recommendation_events_event_id"))) {
    collection.addIndex("idx_recommendation_events_event_id", true, "eventId", "")
  }
  if (!indexes.some((index) => String(index).includes("idx_recommendation_events_user_idempotency"))) {
    collection.addIndex("idx_recommendation_events_user_idempotency", true, "userId, idempotencyKey", "")
  }
  if (!indexes.some((index) => String(index).includes("idx_recommendation_events_user_received"))) {
    collection.addIndex("idx_recommendation_events_user_received", false, "userId, receivedAt", "")
  }
  if (!indexes.some((index) => String(index).includes("idx_recommendation_events_article_received"))) {
    collection.addIndex("idx_recommendation_events_article_received", false, "articleId, receivedAt", "")
  }

  app.save(collection)
}, () => {
  // Intentionally non-destructive. Event retention will be handled by a later explicit policy migration.
})
