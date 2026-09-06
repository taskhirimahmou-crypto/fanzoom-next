# Runbook استقرار کنترل‌شده‌ی Backend در Liara

این سند فقط راهنمای اجرای دستی است. PocketBase روی Liara مستقل از GitHub و Vercel منتشر می‌شود؛ Push یا Merge هیچ migration، hook یا executableای را به Liara منتقل نمی‌کند. import کردن schema نیز جای اجرای migration، انتقال داده و نصب hookها را نمی‌گیرد.

## نتیجه‌ی rehearsal مرجع

- تاریخ اجرای محلی: 2026-09-06
- snapshot: `pb_schema.json`
- SHA-256: `c70960b6d7e339b1deaf009b61d6ba5efd829518a9bfaa8a0535772eb9bb6dbf`
- نسخه‌ی درخواستی: PocketBase `0.30.0`
- خروجی واقعی executable داخل container: `pocketbase version 0.30.0`
- نتیجه‌ی migration: هر ۱۰ migration اجرا شد؛ اجرای دوم `No new migrations to apply` بود.
- نتیجه‌ی مسیرهای برنامه: ۳۷ assertion واقعی Next.js روی همان دیتابیس ارتقایافته موفق شد.
- نتیجه‌ی restore: schema و count هر ۱۳ collection snapshot دقیقاً به وضعیت قبل برگشت.

این PASS فقط سازگاری محلی را ثابت می‌کند و به‌تنهایی مجوز production نیست. تا زمانی که اطلاعات نصب و backup واقعی پایین تأیید نشده‌اند، وضعیت rollout برابر **NO-GO** است.

## اطلاعاتی که repository درباره‌ی production ندارد

قبل از هر تغییر، مالک سرویس باید این موارد غیرحساس را از Liara ثبت کند؛ credential یا محتوای دیتابیس لازم نیست:

1. PocketBase با image سفارشی اجرا می‌شود یا binary خام؟
2. نام image/tag فعلی یا مسیر دقیق executable چیست؟
3. فرمان startup و working directory فعلی چیست؟
4. نام disk پایدار، mount path و مسیر واقعی `pb_data` چیست؟
5. `pb_migrations` و `pb_hooks` اکنون چگونه روی سرویس قرار می‌گیرند؟
6. restart/deploy policy و تعداد instanceهای PocketBase چیست؟
7. backup داخلی PocketBase روی همان disk است یا storage مستقل/S3؟
8. آخرین backup واقعی چه زمانی گرفته و restore آن کجا آزمایش شده است؟
9. health check فعلی Liara به کدام URL و port متصل است؟

روش قابل بازتولید موجود در repository فقط Dockerfile و entrypoint است. اگر production از روش دیگری استفاده می‌کند، دستورهای همان روش باید ابتدا در یک clone موقت از disk تمرین شوند.

## خطر مهم نسخه

`docker/pocketbase.Dockerfile` برای توسعه‌ی معمولی فعلاً default نسخه‌ی `0.40.0` دارد. برای ساخت سازگار با production باید build arg صریح `PB_VERSION=0.30.0` داده و خروجی executable پیش از انتشار کنترل شود. ساخت بدون این arg می‌تواند ناخواسته binary دیگری بسازد و ممنوع است.

محل اجرا: **ماشین build محلی/CI ایزوله، نه پنل PocketBase و نه Vercel**.

```powershell
docker build --build-arg PB_VERSION=0.30.0 -f docker/pocketbase.Dockerfile -t fanzoom-pocketbase:0.30.0-recommender .
docker run --rm --entrypoint /pb/pocketbase fanzoom-pocketbase:0.30.0-recommender --version
```

خروجی خط دوم باید دقیقاً شامل `pocketbase version 0.30.0` باشد. image ساخته‌شده را تا قبل از عبور checklist production منتشر نکنید.

## تفاوت دقیق schema مرجع و schema ارتقایافته

هیچ collection یا field قبلی حذف نشد. `news`، `Site_Logo` و همه‌ی fieldها و ruleهای قبلی آن‌ها حفظ شدند.

- collectionهای افزوده: `recommendation_events`, `app_admins`, `app_admin_audit`
- `users`: افزودن `personalizationEnabled` و `personalizationConsentAt`
- `reading_history`: افزودن `last_read` و تنظیم ruleهای canonical history
- `comments`: فقط سخت‌کردن create/update rule برای جلوگیری از moderation bypass
- جدول‌های SQL داخلی و غیرقابل دسترسی از Record API: `fanzoom_rate_limit_buckets`, `fanzoom_rate_limit_decisions`

در fixture محلی، count تمام collectionهای snapshot ثابت ماند؛ فقط `reading_history` از ۳ به ۴ رسید، چون یک زوج legacy گمشده به‌صورت مورد انتظار copy شد. دو duplicate موجود حذف نشدند، رکورد ناقص حفظ شد و جدیدترین `last_read` merge شد. پس از اجرای routeهای برنامه نیز همه‌ی رکوردهای نماینده باقی ماندند. login آزمایشی یک `_authOrigins` موقت ساخت؛ restore نهایی count آن را نیز دقیقاً به مقدار قبل برگرداند.

## سازگاری hookها با PocketBase 0.30.0

سورس tag رسمی و اجرای واقعی همان binary بررسی شد:

- `routerAdd` و `cronAdd` در JSVM tag موجودند.
- `RequestEvent.HasSuperuserAuth`, `RequestInfo`, `PathValue`, پاسخ JSON و خطاهای HTTP مورد استفاده‌ی hookها موجودند.
- `RunInTransaction`, `FindCollectionByNameOrId`, `FindRecordById`, `FindFirstRecordByFilter`, `Save` و queryهای DB موجودند.
- `DynamicModel`, `arrayOf`, `$security.sha256/hs256/equal` و `$os.getenv/readFile` موجودند.
- `onRecordUpdateRequest` و `onRecordDeleteRequest` موجودند.

علاوه بر بررسی سورس، hookهای `shared_rate_limit`, `atomic_views` و `admin_access` روی binary واقعی 0.30.0 اجرا شدند. ناسازگاری API مشاهده نشد؛ بنابراین ارتقای PocketBase برای این feature لازم تشخیص داده نشد. هر ارتقای آینده از 0.30.0 یک پروژه‌ی جدا با مطالعه‌ی changelog تمام نسخه‌های میانی، backup واقعی و rehearsal restore مستقل است.

منابع نسخه‌ای:

- <https://github.com/pocketbase/pocketbase/releases/tag/v0.30.0>
- <https://github.com/pocketbase/pocketbase/blob/v0.30.0/plugins/jsvm/binds.go>
- <https://github.com/pocketbase/pocketbase/blob/v0.30.0/core/event_request.go>
- <https://github.com/pocketbase/pocketbase/blob/v0.30.0/core/db_tx.go>
- <https://github.com/pocketbase/pocketbase/blob/v0.30.0/tools/router/event.go>

## فایل‌های backend که باید دستی منتشر شوند

محل انتقال: **روش استقرار سرویس/مدیریت فایل Liara که باید از اطلاعات نصب فعلی تأیید شود**.

- تمام فایل‌های `pb_migrations/` با نام و ترتیب فعلی
- `pb_hooks/atomic_views.pb.js`
- `pb_hooks/shared_rate_limit.pb.js`
- `pb_hooks/rate_limit_policies.json`
- `pb_hooks/admin_access.pb.js`
- در روش Docker: `docker/pocketbase.Dockerfile` و `docker/pocketbase-entrypoint.sh`

هیچ schema export، `pb_data`، backup، `.env` یا credential نباید وارد Git/image عمومی شود.

## متغیرهای محیطی و محل تنظیم

### Liara / تنظیمات Environment سرویس PocketBase

- `PB_SUPERUSER_EMAIL`
- `PB_SUPERUSER_PASSWORD`
- `VIEW_RATE_LIMIT_SECRET`
- `SHARED_RATE_LIMIT_HOOK_SECRET`
- `SHARED_RATE_LIMIT_HOOK_SECRET_PREVIOUS` فقط هنگام rotation

entrypoint موجود بدون `VIEW_RATE_LIMIT_SECRET` و `SHARED_RATE_LIMIT_HOOK_SECRET` از startup ارتقایافته جلوگیری می‌کند. اگر production این entrypoint را اجرا نمی‌کند، preflight معادل آن باید به فرمان startup واقعی اضافه و دوباره rehearsal شود.

### Vercel / Project Settings / Environment Variables

این متغیرها فقط هنگام انتشار frontend بعدی لازم‌اند؛ در مرحله‌ی backend تغییرشان ندهید:

- `NEXT_PUBLIC_POCKETBASE_URL`؛ تنها مقدار عمومی و بدون secret
- `POCKETBASE_INTERNAL_URL`
- `POCKETBASE_ADMIN_EMAIL`
- `POCKETBASE_ADMIN_PASSWORD`
- `VIEW_RATE_LIMIT_SECRET`
- `VIEW_TRUSTED_PROXY_IP_HEADER` فقط بعد از تأیید header قابل اعتماد Vercel
- `SHARED_RATE_LIMIT_HOOK_SECRET`
- `RATE_LIMIT_KEY_SECRET`
- `SHARED_RATE_LIMIT_MODE`؛ ابتدا `shadow` و بعد از پایش `enforce`
- `SHARED_RATE_LIMIT_TIMEOUT_MS` اختیاری
- `APP_URL`

تمام credentialها و secretها server-only هستند و نباید پیشوند `NEXT_PUBLIC_` داشته باشند.

## backup واقعی پیش از migration

1. محل اجرا: **پنل مدیریتی PocketBase، Settings > Backups**. maintenance window را شروع و writeهای frontend را متوقف کنید.
2. backup کامل بسازید و پایان عملیات را تأیید کنید.
3. فایل را به یک محل مستقل دانلود کنید؛ اندازه‌ی غیرصفر و SHA-256 آن را ثبت کنید.
4. محل اجرا: **Liara Disk/File Browser یا سازوکار backup disk تأییدشده‌ی پروژه**. وجود disk پایدار، mount درست و فضای کافی را ثبت کنید.
5. restore همان backup را روی یک سرویس موقت با PocketBase 0.30.0 آزمایش کنید و countها را تطبیق دهید.
6. تا وقتی backup واقعی و restore آزمایشی آن تأیید نشده، rollout ممنوع است.

PocketBase می‌گوید backup داخلی snapshot کامل `pb_data` است و restore process را restart می‌کند. down migration مخرب جایگزین restore نیست.

## baseline عددی بدون PII

محل اجرا: **پنل مدیریتی PocketBase یا script read-only با superuser در maintenance window**.

- count تمام ۱۳ collection snapshot، نه فقط collectionهای recommender
- count duplicateهای واقعی `articles.slug` و `bookmarks(user,article)`
- count جفت‌های `(user,article)` در `history` و `reading_history`
- count رکوردهای ناقص history و relationهای خراب
- count commentها براساس status
- hash schema export تازه

فقط عددها ثبت شوند؛ email، userId، متن مقاله/comment و رکورد خام وارد گزارش نشود. duplicateهای واقعی production هنوز تأیید نشده‌اند.

## ترتیب دستی backend-first سپس frontend

1. **پنل PocketBase:** schema export تازه، baseline عددی و backup کامل بگیرید.
2. **Liara Disk/File Browser/Storage:** mount و وجود backup مستقل را تأیید کنید.
3. **ماشین build ایزوله:** package را با binary دقیق 0.30.0، migrationها و hookها بسازید؛ `--version` را ثبت کنید.
4. **Liara Environment Variables:** secretهای لازم را موجود/قابل rotation کنید؛ مقدارشان را در ticket یا log ننویسید.
5. **روش استقرار دستی Liara:** image یا bundle را مطابق روش فعلیِ تأییدشده جایگزین کنید. Push GitHub این کار را انجام نمی‌دهد.
6. **سرویس Liara:** با writeهای متوقف، migrationها را یک بار اجرا کنید. در روش repository، entrypoint قبل از serve فرمان `migrate up` را اجرا می‌کند.
7. **سرویس Liara:** restart/deploy لازم است تا executable، schema cache و hookهای جدید هم‌زمان load شوند.
8. **پنل PocketBase و health:** log migration، schema، ruleها، countها و smoke testهای پایین را بررسی کنید.
9. **Vercel:** فقط پس از تأیید کامل backend، frontend را با limiter در حالت `shadow` منتشر کنید.
10. **Vercel:** پس از window پایش موفق، `SHARED_RATE_LIMIT_MODE=enforce` شود. WAF فاز جداست.

اگر نصب فعلی raw binary باشد، مسیرهای `<CONFIRMED_...>` باید پیش از اجرا با اطلاعات واقعی Liara جایگزین شوند:

```sh
./pocketbase migrate up --dir=<CONFIRMED_PB_DATA> --migrationsDir=<CONFIRMED_MIGRATIONS_DIR>
./pocketbase serve --http=0.0.0.0:8090 --dir=<CONFIRMED_PB_DATA> --migrationsDir=<CONFIRMED_MIGRATIONS_DIR> --hooksDir=<CONFIRMED_HOOKS_DIR>
```

این مسیر raw هنوز production-specific و تأییدنشده است؛ command با placeholder هرگز اجرا نشود.

## health و smoke check پس از migration

- **Liara/Public:** `GET /api/health` خود PocketBase باید 200 باشد.
- **Vercel/Public، بعد از frontend:** `/api/health` فقط status کلی و requestId امن برگرداند.
- **پنل PocketBase:** schema export جدید بگیرید و collection/field/index/ruleها را با diff rehearsal مقایسه کنید.
- **پنل PocketBase/read-only script:** count تمام collectionهای قبلی نباید کم شود؛ افزایش `reading_history` فقط به‌اندازه‌ی زوج‌های legacy گمشده مجاز است.
- **client معمولی:** list/create روی `recommendation_events`, `app_admins`, `app_admin_audit` باید 403 باشد.
- **client معمولی:** ساخت مستقیم comment، حتی با `status=approved`، باید 403 باشد.
- **Next API:** comment رسمی باید `pending` ساخته شود.
- **hook signed:** limiter معتبر پاسخ بدهد، امضای جعلی/منقضی را رد کند و key hash خام برنگرداند.
- **hook views:** یک increment کنترل‌شده دقیقاً یک واحد اضافه کند.
- **Next API:** consent خاموش هیچ recommendation event جدید نسازد.

## معیار توقف و rollback

فوراً متوقف شوید اگر version executable دقیقاً 0.30.0 نیست، migration خطا دارد، collection/field حذف شده، count قبلی کم شده، consent موجود فعال شده، private rule باز است، comment approved مستقیم ساخته می‌شود، hook بدون secret fail-open است، `SQLITE_BUSY` تکرارشونده دیده می‌شود، health ناپایدار است یا 5xx/latency از threshold Runbook observability عبور می‌کند.

Rollback:

1. **Vercel:** frontend جدید را منتشر نکنید یا به deployment قبلی برگردانید.
2. **Liara Service:** PocketBase را متوقف کنید تا write تازه ایجاد نشود.
3. **پنل PocketBase یا روش restore تأییدشده:** backup کامل پیش از migration را restore کنید.
4. **Liara Service/Files:** binary و hookهای قبلی را بالا بیاورید؛ migrationهای جدید روی database restoreشده auto-run نشوند.
5. **Liara Service:** restart لازم است.
6. **پنل/read-only checks:** schema hash و تمام countها را با baseline تطبیق دهید.

## اجرای rehearsal محلی 0.30.0

محل اجرا: **Docker محلی؛ هیچ اتصال production ندارد**.

```powershell
$out = Join-Path $env:TEMP "fanzoom-backend-rehearsal-pb030"
powershell -ExecutionPolicy Bypass -File .\scripts\run-backend-compatibility-rehearsal.ps1 `
  -SchemaPath "C:\Users\mahmo\Downloads\pb_schema.json" `
  -ExpectedSchemaSha256 "C70960B6D7E339B1DEAF009B61D6BA5EFD829518A9BFAA8A0535772EB9BB6DBF" `
  -PocketBaseVersion "0.30.0" `
  -OutputDirectory $out
```

این دستور فقط project و volume ثابت `fanzoom-backend-rehearsal` را می‌سازد و در پایان حذف می‌کند. report و backup آزمایشی در output محلی باقی می‌مانند. `-KeepEnvironment` فقط برای عیب‌یابی لوکال است.

## منابع رسمی عملیاتی

- PocketBase backup/restore: <https://pocketbase.io/docs/api-backups/>
- PocketBase production backup guidance: <https://pocketbase.io/docs/going-to-production/>
- PocketBase migrations: <https://pocketbase.io/docs/js-migrations/>
- Liara File Browser: <https://developers.liara.ir/pages/file-browser>
- Liara disk backups API: <https://developers.liara.ir/pass/disks/get-backups-disk>
- Vercel Environment Variables: <https://vercel.com/docs/environment-variables>
