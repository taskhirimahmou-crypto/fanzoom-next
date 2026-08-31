// reading_history is canonical. Legacy history records are copied, never deleted.
migrate((app) => {
  const canonical = app.findCollectionByNameOrId("reading_history")

  const canonicalRecords = app.findAllRecords("reading_history")
  for (const record of canonicalRecords) {
    if (!record.getString("last_read")) {
      record.set("last_read", record.getString("updated") || record.getString("created"))
      app.save(record)
    }
  }

  let legacy
  try {
    legacy = app.findCollectionByNameOrId("history")
  } catch {
    legacy = null
  }
  if (!legacy) return

  const legacyRecords = app.findAllRecords("history")
  for (const legacyRecord of legacyRecords) {
    const userId = legacyRecord.getString("user")
    const articleId = legacyRecord.getString("article")
    if (!userId || !articleId) continue

    const legacyLastRead =
      legacyRecord.getString("last_read") ||
      legacyRecord.getString("updated") ||
      legacyRecord.getString("created")

    let existing
    try {
      existing = app.findFirstRecordByFilter(
        "reading_history",
        "user = {:userId} && article = {:articleId}",
        { userId, articleId },
      )
    } catch {
      existing = null
    }

    if (!existing) {
      const migrated = new Record(canonical)
      migrated.set("user", userId)
      migrated.set("article", articleId)
      migrated.set("last_read", legacyLastRead)
      try {
        app.save(migrated)
      } catch {
        // Preserve the source row and continue if an old relation is no longer valid.
      }
      continue
    }

    const currentLastRead = existing.getString("last_read")
    if (legacyLastRead && (!currentLastRead || legacyLastRead > currentLastRead)) {
      existing.set("last_read", legacyLastRead)
      try {
        app.save(existing)
      } catch {
        // The legacy record is retained, so a failed merge is non-destructive.
      }
    }
  }
}, () => {
  // The legacy collection is preserved and copied records are intentionally retained.
})
