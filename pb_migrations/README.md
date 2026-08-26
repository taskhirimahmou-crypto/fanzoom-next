# PocketBase migrations

`pb_migrations` is now the canonical source of truth for the Fanzoom schema.
The legacy `scripts/setup-collections.mjs` script is retained only for old bootstrap workflows.

Apply pending migrations with the PocketBase executable used by the deployment:

```text
pocketbase migrate up
```

The foundation migrations are intentionally non-destructive:

- existing collections and fields are preserved;
- `reading_history` is the canonical history collection;
- legacy `history` records are copied and the legacy collection is retained;
- `recommendation_events` is locked to superusers and written only by the Next.js server;
- identified recommendation instrumentation is opt-in through `users.personalizationEnabled`;
- down migrations do not delete production data.

Take a normal database backup before applying schema migrations in production. After applying,
regenerate `src/lib/pb-types.ts` with `pocketbase-typegen` when the deployment schema is reachable.
