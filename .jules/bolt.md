## 2024-10-24 - PocketBase N+1 Query Optimization
**Learning:** Fetching relational data in PocketBase (like users who commented on an article) by mapping over unique IDs and executing multiple `getOne` requests leads to N+1 query bottlenecks and decreased backend performance.
**Action:** Always use PocketBase's `expand` parameter (e.g., `expand: 'user'`) in `getList` or `getFullList` queries to fetch related records in a single database request.
