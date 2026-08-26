migrate((app) => {
  const comments = app.findCollectionByNameOrId("comments")

  // Comment creation and moderation are server-only. Existing records and the
  // user's existing ability to delete their own comments are left untouched.
  comments.createRule = null
  comments.updateRule = null
  app.save(comments)
}, () => {
  // Intentionally non-destructive: do not reopen a known moderation bypass.
})
