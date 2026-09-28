# Production backup rehearsal — 2026-09-28

This report contains aggregate checks only. The production backup, database copies, downloaded migrations and temporary test credentials remain outside Git.

## Inputs and isolation

- Liara `/pb_data` backup dated 2026-09-06; SHA-256 matched `EA8994C11C762BEC08CC99FB32CB60EE425C15A399A86ACF10DF3692196656F5` before testing.
- All 19 existing production migration files were supplied from a separately verified private download. Ten new migration files and four hook files were added only to isolated Docker volumes.
- PocketBase 0.30.0 was downloaded from the official release during the local image build; its release archive checksum passed. The image is **not** Liara's exact one-click image.
- The original backup and original migration files were mounted read-only during copying. All test writes occurred in isolated Docker volumes.

## Results

| Check | Result |
|---|---|
| Production-equivalent `serve --http=0.0.0.0:8090 --dir=/pb_data --publicDir=/pb_public` startup | Health 200 |
| SQLite `quick_check` before and after migration | `ok` / `ok` |
| Applied migration count | 25 before; 35 after; exactly 10 new files |
| Old collections, columns and indexes removed | 0 |
| Original collection counts reduced | 0 |
| `reading_history` canonical backfill | 16 to 79; `history` remained 63 |
| New collections | `recommendation_events`, `app_admins`, `app_admin_audit` |
| Internal limiter tables and consent columns | Present |
| Direct comment create/update rules | Server-only |
| Second server start | 35 migrations, 0 additions, unchanged schema/rules/counts |
| Next.js + PocketBase integration against upgraded backup copy | 37/37 assertions passed |
| PocketBase and Next.js log scan | 0 `SQLITE_BUSY`, panic/fatal, email-pattern and local-test-secret matches |
| Rollback simulation | Pre-migration backup copy plus the original 19 migrations and empty hooks started with health 200; schema, rules, migration history and all collection counts matched the original |
| Unit tests | 194/194 passed |
| TypeScript | Passed |
| Full lint | 0 errors, 10 existing warnings |
| Production build | Passed after network access allowed the Google Fonts fetch |

The first sandboxed production-build attempt failed because Google Fonts could not be reached. The full build was rerun with network access and exited successfully.

## Limits before live rollout

- The tested backup is from 2026-09-06. A fresh production backup and a fresh read-only data/migration comparison are required immediately before changing Liara.
- This exercise tested the PocketBase 0.30.0 binary and equivalent command, not the immutable digest of Liara's one-click image.
- Rollback was simulated with a fresh local volume restored from the pre-migration backup. Liara's own restore control and its duration were not exercised.
- Restart downtime and Vercel-to-Liara latency were not measured in the live environment. A controlled maintenance window and post-change monitoring remain necessary.
- The Docker image build's `npm ci` audit summary reported 8 dependency advisories. A fresh runtime-only `npm audit --omit=dev` reported 5: 1 critical, 3 high and 1 moderate. The critical finding covers Next.js 16.2.11 through the AVIF image optimization path; upgrade and regression testing are required before a production merge. The Windows-hosted-server advisory bundled into the same Next.js finding does not describe the Vercel hosting topology.

No production service, Liara setting, Vercel setting or Git remote was changed during this rehearsal.
