// Non-destructive bootstrap for the collections that already exist in Fanzoom.
// Existing fields and records are preserved; only missing collections/fields are added.
migrate((app) => {
  function findCollection(name) {
    try {
      return app.findCollectionByNameOrId(name)
    } catch {
      return null
    }
  }

  function hasField(collection, name) {
    return Boolean(collection.fields.getByName(name))
  }

  function addMissingFields(collection, factories) {
    let changed = false
    for (const [name, createField] of Object.entries(factories)) {
      if (!hasField(collection, name)) {
        collection.fields.add(createField())
        changed = true
      }
    }
    return changed
  }

  function ensureIndex(collection, name, unique, fields) {
    if ((collection.indexes || []).some((index) => String(index).includes(name))) {
      return false
    }
    collection.addIndex(name, unique, fields, "")
    return true
  }

  const categorySlugs = [
    "mobile-tablet",
    "hardware-pc",
    "ai-robotics",
    "cybersecurity",
    "gaming",
    "wearables",
    "audio-visual",
    "smart-home",
    "smart-mobility",
    "software-os",
    "tech-business",
  ]

  let users = findCollection("users")
  if (!users) {
    users = new Collection({
      type: "auth",
      name: "users",
      listRule: "id = @request.auth.id",
      viewRule: "id = @request.auth.id",
      createRule: "",
      updateRule: "id = @request.auth.id",
      deleteRule: "id = @request.auth.id",
      fields: [
        { name: "displayName", type: "text" },
        { name: "avatar", type: "file", maxSelect: 1, maxSize: 2097152 },
        { name: "bio", type: "text" },
        { name: "interests", type: "select", values: categorySlugs, maxSelect: 11 },
      ],
      passwordAuth: { enabled: true, identityFields: ["email"] },
    })
    app.save(users)
  } else {
    const changed = addMissingFields(users, {
      displayName: () => new TextField({ name: "displayName" }),
      avatar: () => new FileField({ name: "avatar", maxSelect: 1, maxSize: 2097152 }),
      bio: () => new TextField({ name: "bio" }),
      interests: () => new SelectField({ name: "interests", values: categorySlugs, maxSelect: 11 }),
    })
    if (changed) app.save(users)
  }

  let articles = findCollection("articles")
  if (!articles) {
    articles = new Collection({
      type: "base",
      name: "articles",
      listRule: "status = 'published'",
      viewRule: "status = 'published'",
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { name: "title", type: "text", required: true, presentable: true },
        { name: "slug", type: "text", required: true },
        { name: "excerpt", type: "text" },
        { name: "content", type: "editor" },
        { name: "category", type: "select", values: categorySlugs, maxSelect: 1 },
        { name: "image", type: "url" },
        { name: "status", type: "select", values: ["draft", "published", "archived"], maxSelect: 1 },
        { name: "views", type: "number" },
        { name: "readTime", type: "number" },
        { name: "author", type: "text" },
        { name: "sourceUrl", type: "url" },
        { name: "publishedAt", type: "date" },
        { name: "featured", type: "bool" },
      ],
    })
    ensureIndex(articles, "idx_articles_slug", true, "slug")
    app.save(articles)
  } else {
    let changed = addMissingFields(articles, {
      title: () => new TextField({ name: "title", required: true, presentable: true }),
      slug: () => new TextField({ name: "slug", required: true }),
      excerpt: () => new TextField({ name: "excerpt" }),
      content: () => new EditorField({ name: "content" }),
      category: () => new SelectField({ name: "category", values: categorySlugs, maxSelect: 1 }),
      image: () => new URLField({ name: "image" }),
      status: () => new SelectField({ name: "status", values: ["draft", "published", "archived"], maxSelect: 1 }),
      views: () => new NumberField({ name: "views" }),
      readTime: () => new NumberField({ name: "readTime" }),
      author: () => new TextField({ name: "author" }),
      sourceUrl: () => new URLField({ name: "sourceUrl" }),
      publishedAt: () => new DateField({ name: "publishedAt" }),
      featured: () => new BoolField({ name: "featured" }),
    })
    changed = ensureIndex(articles, "idx_articles_slug", true, "slug") || changed
    if (changed) app.save(articles)
  }

  let bookmarks = findCollection("bookmarks")
  if (!bookmarks) {
    bookmarks = new Collection({
      type: "base",
      name: "bookmarks",
      listRule: "@request.auth.id = user.id",
      viewRule: "@request.auth.id = user.id",
      createRule: "@request.auth.id = user.id",
      updateRule: null,
      deleteRule: "@request.auth.id = user.id",
      fields: [
        { name: "user", type: "relation", required: true, collectionId: users.id, maxSelect: 1 },
        { name: "article", type: "relation", required: true, collectionId: articles.id, maxSelect: 1 },
      ],
    })
    ensureIndex(bookmarks, "idx_bookmarks_user_article", true, "user, article")
    app.save(bookmarks)
  } else {
    let changed = addMissingFields(bookmarks, {
      user: () => new RelationField({ name: "user", required: true, collectionId: users.id, maxSelect: 1 }),
      article: () => new RelationField({ name: "article", required: true, collectionId: articles.id, maxSelect: 1 }),
    })
    changed = ensureIndex(bookmarks, "idx_bookmarks_user_article", true, "user, article") || changed
    if (changed) app.save(bookmarks)
  }

  let comments = findCollection("comments")
  if (!comments) {
    comments = new Collection({
      type: "base",
      name: "comments",
      listRule: "status = 'approved'",
      viewRule: "status = 'approved'",
      createRule: "@request.auth.id = user.id",
      updateRule: null,
      deleteRule: "@request.auth.id = user.id",
      fields: [
        { name: "user", type: "relation", required: true, collectionId: users.id, maxSelect: 1 },
        { name: "article", type: "relation", required: true, collectionId: articles.id, maxSelect: 1 },
        { name: "content", type: "text", required: true },
        { name: "status", type: "select", values: ["pending", "approved", "rejected"], maxSelect: 1 },
      ],
    })
    app.save(comments)
  } else {
    const changed = addMissingFields(comments, {
      user: () => new RelationField({ name: "user", required: true, collectionId: users.id, maxSelect: 1 }),
      article: () => new RelationField({ name: "article", required: true, collectionId: articles.id, maxSelect: 1 }),
      content: () => new TextField({ name: "content", required: true }),
      status: () => new SelectField({ name: "status", values: ["pending", "approved", "rejected"], maxSelect: 1 }),
    })
    if (changed) app.save(comments)
  }

  let readingHistory = findCollection("reading_history")
  if (!readingHistory) {
    readingHistory = new Collection({
      type: "base",
      name: "reading_history",
      listRule: "@request.auth.id = user.id",
      viewRule: "@request.auth.id = user.id",
      createRule: "@request.auth.id = user.id",
      updateRule: "@request.auth.id = user.id",
      deleteRule: "@request.auth.id = user.id",
      fields: [
        { name: "user", type: "relation", required: true, collectionId: users.id, maxSelect: 1 },
        { name: "article", type: "relation", required: true, collectionId: articles.id, maxSelect: 1 },
        { name: "progress", type: "number", min: 0, max: 100 },
        { name: "last_read", type: "date" },
      ],
    })
    app.save(readingHistory)
  } else {
    const changed = addMissingFields(readingHistory, {
      user: () => new RelationField({ name: "user", required: true, collectionId: users.id, maxSelect: 1 }),
      article: () => new RelationField({ name: "article", required: true, collectionId: articles.id, maxSelect: 1 }),
      progress: () => new NumberField({ name: "progress", min: 0, max: 100 }),
      last_read: () => new DateField({ name: "last_read" }),
    })
    readingHistory.listRule = "@request.auth.id = user.id"
    readingHistory.viewRule = "@request.auth.id = user.id"
    readingHistory.createRule = "@request.auth.id = user.id"
    readingHistory.updateRule = "@request.auth.id = user.id"
    readingHistory.deleteRule = "@request.auth.id = user.id"
    if (changed) app.save(readingHistory)
    else app.save(readingHistory)
  }
}, () => {
  // Intentionally non-destructive: legacy deployments may already depend on these collections.
})
