routerAdd("POST", "/api/fanzoom/articles/{id}/increment-view", (e) => {
  if (!e.hasSuperuserAuth()) {
    throw e.unauthorizedError("Superuser authentication is required")
  }

  const id = e.request.pathValue("id")
  if (!/^[a-z0-9]{15}$/i.test(id)) {
    throw e.badRequestError("Invalid article id")
  }

  const result = new DynamicModel({ views: 0 })
  try {
    e.app.db()
      .newQuery("UPDATE articles SET views = COALESCE(views, 0) + 1 WHERE id = {:id} RETURNING views")
      .bind({ id })
      .one(result)
  } catch (error) {
    throw e.notFoundError("Article not found", error)
  }

  return e.json(200, { views: result.views })
})
