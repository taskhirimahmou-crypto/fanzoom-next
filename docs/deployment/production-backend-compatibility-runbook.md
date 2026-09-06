# Runbook استقرار کنترل‌شده‌ی Backend در Liara

این سند فقط دستور کار است. اجرای rehearsal این repository هیچ اتصال یا تغییری در Liara و Vercel ایجاد نمی‌کند.

## پیش‌شرط‌های غیرحساس

پیش از GO این موارد را از پنل Liara ثبت و با تیم تطبیق دهید؛ مقدار secretها را در گزارش یا گفتگو کپی نکنید:

- نسخه‌ی دقیق PocketBase باید با image آزمایش‌شده (`0.40.0`) یکسان باشد یا rehearsal با همان نسخه تکرار شود.
- مسیر mount دیسک پایدار باید شامل `/pb/pb_data` باشد؛ ephemeral filesystem قابل قبول نیست.
- نام/هش SHA-256 آخرین schema export و زمان تهیه‌ی آن ثبت شود.
- تعداد رکوردهای شش collection `users`, `articles`, `bookmarks`, `comments`, `history`, `reading_history` و تعداد duplicateهای `articles.slug` و `bookmarks(user,article)` به‌صورت عددی و بدون داده‌ی شخصی ثبت شود.
- ظرفیت آزاد دیسک برای database فعلی، فایل‌های uploadشده و حداقل یک backup کامل کافی باشد.

## فایل‌هایی که باید همراه Backend منتشر شوند

- همه‌ی فایل‌های `pb_migrations/` با ترتیب عددی نام فایل.
- `pb_hooks/atomic_views.pb.js`.
- `pb_hooks/shared_rate_limit.pb.js` و `pb_hooks/rate_limit_policies.json`.
- `pb_hooks/admin_access.pb.js`.
- `docker/pocketbase.Dockerfile` و `docker/pocketbase-entrypoint.sh`.

هیچ schema export، database، backup، `.env` یا credential نباید وارد Git شود.

## Environment Variableها

### Liara / PocketBase

- `PB_SUPERUSER_EMAIL`
- `PB_SUPERUSER_PASSWORD`
- `VIEW_RATE_LIMIT_SECRET`
- `SHARED_RATE_LIMIT_HOOK_SECRET`
- `SHARED_RATE_LIMIT_HOOK_SECRET_PREVIOUS` فقط هنگام rotation

### Vercel / Next.js

- `NEXT_PUBLIC_POCKETBASE_URL` (تنها URL عمومی؛ secret نیست)
- `POCKETBASE_INTERNAL_URL`
- `POCKETBASE_ADMIN_EMAIL`
- `POCKETBASE_ADMIN_PASSWORD`
- `VIEW_RATE_LIMIT_SECRET`
- `VIEW_TRUSTED_PROXY_IP_HEADER` فقط پس از تأیید نام header قابل اعتماد از مستندات/پنل deployment؛ در غیر این صورت خالی بماند
- `SHARED_RATE_LIMIT_HOOK_SECRET`
- `RATE_LIMIT_KEY_SECRET`
- `SHARED_RATE_LIMIT_MODE` (ابتدا `shadow`، سپس `enforce`)
- `SHARED_RATE_LIMIT_TIMEOUT_MS` اختیاری

تمام موارد بالا به‌جز `NEXT_PUBLIC_POCKETBASE_URL` server-only هستند و نباید پیشوند `NEXT_PUBLIC_` بگیرند.

## Backup و تأیید آن

1. یک maintenance window تعیین و writeهای برنامه را متوقف کنید.
2. از PocketBase Dashboard یا API رسمی Backups با superuser یک backup کامل بسازید.
3. پایان عملیات backup را تأیید و فایل را روی یک محل مستقل دانلود کنید.
4. اندازه‌ی غیرصفر و SHA-256 فایل دانلودشده را ثبت کنید؛ فایل را باز یا در Git قرار ندهید.
5. در Liara وجود دیسک پایدار و امکان دانلود/بارگذاری فایل backup را جدا تأیید کنید.
6. rollback قابل اتکا یعنی restore همین backup کامل؛ down migration مخرب اجرا نشود.

## ثبت baseline بدون PII

پیش از migration فقط خروجی عددی این queryها/فیلترها را ثبت کنید:

- count هر شش collection اصلی.
- count کاربران با `personalizationEnabled=true` (قبل از migration باید field وجود نداشته باشد یا نتیجه مستند شود).
- duplicate count برای `articles.slug` و `bookmarks(user,article)`؛ وجود duplicate مانع migration index یکتا است.
- count جفت‌های یکتای `(user,article)` در `history` و `reading_history`.
- count رکوردهای `history` با relation خالی یا خراب و `last_read` خالی.

هیچ email، userId، متن comment/article یا رکورد خام در گزارش قرار نگیرد.

## ترتیب Backend-first سپس Frontend

1. Vercel production را تغییر ندهید و writeهای سایت را موقتاً متوقف کنید.
2. backup و baseline عددی بالا را بگیرید و hash را تأیید کنید.
3. image جدید PocketBase را با migrationها و hookها آماده کنید، اما قبل از جایگزینی مطمئن شوید همه‌ی envهای Liara حاضرند.
4. سرویس PocketBase را restart/deploy کنید. entrypoint ابتدا migrationها را اجرا می‌کند؛ failure باعث خروج process می‌شود و نباید serve ناامن رخ دهد.
5. log migration را بررسی کنید و health/read-only checks پایین را اجرا کنید.
6. countهای اصلی را با baseline مقایسه کنید. افزایش مورد انتظار `reading_history` فقط از copy جفت‌های legacy گمشده است؛ کاهش هر collection ممنوع است.
7. مستقیم‌بودن API Rules خصوصی، moderation comment و hookهای limiter/views را smoke-test کنید.
8. Next.js را ابتدا با `SHARED_RATE_LIMIT_MODE=shadow` منتشر کنید و metricهای backend error/SQLite busy را پایش کنید.
9. بعد از window پایش موفق، Next.js را به `enforce` ببرید. WAF یک فاز مستقل است.

restart لازم است: یک بار هنگام جایگزینی image/backend برای بارگذاری migration و hook و یک بار در rollback پس از restore. تغییر Frontend به restart دستی PocketBase نیاز ندارد.

## Health و بررسی‌های read-only پس از migration

- `GET /api/health` PocketBase باید 200 برگرداند.
- health عمومی Next.js فقط وضعیت کلی را برگرداند و detail/credential افشا نکند.
- schema export جدید بگیرید و فقط نام collection، field، index و API Ruleها را با گزارش rehearsal مقایسه کنید.
- count شش collection اصلی، consent غیرفعال کاربران موجود و تعداد جفت‌های history را دوباره ثبت کنید.
- با user معمولی، list/create روی `recommendation_events`, `app_admins`, `app_admin_audit` باید 403 باشد.
- ساخت مستقیم comment حتی با `status=approved` باید 403 باشد؛ API رسمی Next.js باید comment را `pending` بسازد.
- limiter metrics فقط با امضای server-side قابل دسترسی باشد؛ key hash یا شناسه‌ی خام نباید برگردد.
- یک increment view کنترل‌شده انجام دهید و مقدار دقیقاً یک واحد زیاد شود.

## معیار توقف و rollback

فوراً متوقف شوید اگر migration exit code غیرصفر دارد، duplicate index error دیده می‌شود، collection/field حذف شده، count رکوردهای اصلی کاهش یافته، consent کاربر موجود فعال شده، private API Rule باز است، comment approved مستقیم ساخته می‌شود، limiter بدون secret شروع یا fail-open می‌شود، `SQLITE_BUSY` دیده می‌شود، health پایدار نیست یا latency/5xx از threshold Runbook observability عبور می‌کند.

Rollback:

1. Frontend جدید را فعال نکنید یا به deployment قبلی برگردانید.
2. PocketBase را متوقف کنید تا write تازه ایجاد نشود.
3. backup تأییدشده‌ی پیش از migration را restore کنید. restore رسمی PocketBase process را restart می‌کند.
4. image/backend قبلی را با schema قبلی بالا بیاورید؛ migrationهای جدید را روی database restoreشده دوباره auto-run نکنید.
5. health و countها را با baseline تطبیق دهید و تا تحلیل علت، rollout را بسته نگه دارید.

## اجرای rehearsal محلی

```powershell
$out = Join-Path $env:TEMP "fanzoom-backend-rehearsal"
powershell -ExecutionPolicy Bypass -File .\scripts\run-backend-compatibility-rehearsal.ps1 `
  -SchemaPath "C:\path\to\pb_schema.json" `
  -OutputDirectory $out
```

این دستور فقط container و volume ثابت `fanzoom-backend-rehearsal` را می‌سازد و در پایان همان volume موقت را حذف می‌کند. report و backup آزمایشی در مسیر خروجی باقی می‌مانند؛ هیچ host یا credential production مصرف نمی‌شود.

## منابع رسمی

- PocketBase API Backups: <https://pocketbase.io/docs/api-backups/>
- PocketBase JavaScript migrations: <https://pocketbase.io/docs/js-migrations/>
- Liara File Browser و انتقال backup دیسک: <https://developers.liara.ir/pages/file-browser>
- Vercel Environment Variables: <https://vercel.com/docs/environment-variables>
