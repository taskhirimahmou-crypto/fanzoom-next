# بسته‌ی انتشار دستی Backend فن‌زوم (PocketBase 0.30.0)

این راهنما برای انتشار دستی PocketBase روی Liara است. اجرای هیچ‌کدام از دستورهای «محلی» به Liara، Vercel یا production وصل نمی‌شود. Push یا Merge گیت، backend را منتشر نمی‌کند.

## نتیجه‌ی فعلی: NO-GO

بسته‌ی محلی قابل ساخت و rehearsal نسخه‌ی 0.30.0 موفق است، اما شروع انتشار production هنوز مجاز نیست. سه gate باز مانده است:

1. backup نمایش‌داده‌شده‌ی `/pb_data` مربوط به `2026-09-06 06:19:00` با حجم نمایشی `1.93 GB` هنوز دانلود، hash و restore نشده است.
2. نام دقیق ۱۹ migration موجود روی disk و نام‌های ثبت‌شده در جدول داخلی migration هنوز با ۱۰ migration جدید مقایسه نشده‌اند.
3. فرمان واقعی startup/entrypoint در image دقیق `registry.c2.liara.ir/one-click-apps/pocketbase:0.30.0` اثبات نشده است. registry از محیط محلی پاسخ 403 داد و template عمومی فعلی Liara فقط image، port و mountها را نشان می‌دهد؛ command را نشان نمی‌دهد.

تا بسته‌شدن هر سه gate، restart production ممنوع است.

## وضعیت واقعی ثبت‌شده

| مورد | مقدار | محل مشاهده/اقدام |
|---|---|---|
| PocketBase | `0.30.0` | پنل/لاگ سرویس Liara |
| image | `registry.c2.liara.ir/one-click-apps/pocketbase:0.30.0` | تنظیمات استقرار Liara |
| port | `8090` | تنظیمات برنامه Liara |
| دامنه | `https://my-backend-fanzoom.liara.run` | دامنه‌ی پیش‌فرض Liara |
| disk داده | `/pb_data` | مدیریت diskهای Liara |
| disk hook | `/pb_hooks`؛ فعلاً خالی | File Browser/مدیریت فایل Liara |
| disk migration | `/pb_migrations`؛ ۱۹ فایل قدیمی | File Browser/مدیریت فایل Liara |
| public files | `/pb_public` | مدیریت diskهای Liara |
| Application URL | `http://localhost:8090` | پنل مدیریتی PocketBase |
| Proxy Header | غیرفعال | پنل مدیریتی PocketBase |
| PocketBase rate limit / Batch API | غیرفعال | پنل مدیریتی PocketBase |
| zero-downtime | غیرفعال | تنظیمات برنامه Liara |

## محتوای دقیق release

فقط ۱۴ فایل زیر وارد bundle می‌شوند. `pb_migrations/README.md`، Dockerfile، env، schema export، database، backup و فایل شخصی وارد bundle نمی‌شوند.

### migrationها؛ به همین ترتیب

1. `202608110001_bootstrap_core_schema.js`
2. `202608110002_migrate_legacy_history.js`
3. `202608110003_create_recommendation_events.js`
4. `202608110004_add_personalization_consent.js`
5. `202608260001_add_direct_recommendation_surface.js`
6. `202608260002_harden_comment_moderation.js`
7. `202608310001_create_app_admins.js`
8. `202608310002_create_shared_rate_limiter.js`
9. `202608310003_create_app_admin_audit.js`
10. `202608310004_add_app_admin_timestamps.js`

### hookها

- `admin_access.pb.js`
- `atomic_views.pb.js`
- `rate_limit_policies.json`
- `shared_rate_limit.pb.js`

## ساخت و تأیید bundle

محل اجرا: **PowerShell روی همین کامپیوتر و همین repository؛ فقط local**.

```powershell
npm.cmd run release:pocketbase:build
```

این دستور یک پوشه‌ی جدید و یکتا در `.local-observability/release-bundles/` می‌سازد. هر فایل را از allowlist ثابت می‌خواند، syntax فایل‌های JavaScript و JSON را کنترل می‌کند و دو فایل زیر را می‌سازد:

- `manifest.json`: نسخه‌ی هدف، تعداد فایل‌ها، اندازه و SHA-256 هر فایل
- `SHA256SUMS.txt`: hash قابل مقایسه بعد از upload

برای ساخت ZIP و بررسی دوباره‌ی محتوای ZIP:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\build-pocketbase-release-bundle.ps1
```

در کنار ZIP یک فایل `.sha256` ساخته می‌شود. bundle در `.gitignore` است و commit نمی‌شود؛ script، test و راهنما commit می‌شوند.

## Gate نام migrationهای production

PocketBase نام migrationهای اجراشده را ثبت می‌کند. برابر بودن تعداد «۱۹» کافی نیست؛ هم نام فایل‌های disk و هم history دیتابیس باید با release مقایسه شوند. collision ممکن است باعث skip شدن فایل جدید یا ترتیب اشتباه شود.

1. محل اجرا: **Liara File Browser**. فقط نام ۱۹ فایل `/pb_migrations` را بردارید؛ محتوا لازم نیست. آن‌ها را، هر نام در یک خط، در یک فایل محلی مانند `production-disk-migrations.txt` ذخیره کنید.
2. محل اجرا: **کامپیوتر محلی روی backup restoreشده**. script read-only پایین فهرست `appliedMigrations` را می‌دهد. فقط همان نام‌ها را در `production-applied-migrations.txt` قرار دهید.
3. محل اجرا: **کامپیوتر محلی**:

```powershell
node .\scripts\deployment\check-production-migrations.mjs `
  --disk-list .\production-disk-migrations.txt `
  --applied-list .\production-applied-migrations.txt
```

خروجی باید `compatible: true`، تعداد production برابر ۱۹، collision خالی و timestamp همه‌ی releaseها جدیدتر از production باشد. این دو فایل موقت را commit نکنید.

## شمارش duplicateها بدون اتصال production

روش زیر فقط فایل SQLite استخراج‌شده از **backup محلی** را با `readOnly: true` و `PRAGMA query_only=ON` باز می‌کند. هیچ slug، userId یا articleId چاپ نمی‌شود؛ فقط تعداد گروه‌های duplicate و سطرهای اضافه نمایش داده می‌شود.

محل اجرا: **کامپیوتر محلی، بعد از دانلود و استخراج backup**.

```powershell
npm.cmd run release:pocketbase:inspect -- --db "D:\safe-rehearsal\pb_data\data.db"
```

اعداد موردنیاز:

- `duplicates.articlesSlug.groups` و `extraRows`
- `duplicates.bookmarksUserArticle.groups` و `extraRows`
- `missingKeys`
- `appliedMigrations` برای gate قبلی

این script هیچ index یا migrationی ایجاد نمی‌کند. برای اطمینان بیشتر، backup استخراج‌شده را روی یک copy محلی اجرا کنید و SHA-256 فایل `data.db` را قبل و بعد مقایسه کنید.

## اثبات امن رفتار restart image

مستند رسمی PocketBase می‌گوید migrationهای unapplied در migrations directory هنگام `serve` به‌طور خودکار اجرا می‌شوند و `pocketbase migrate up` نیز آن‌ها را صریح اجرا می‌کند. اما برای production باید ثابت شود image لیارا واقعاً:

- binary نسخه‌ی 0.30.0 را اجرا می‌کند؛
- `--dir=/pb_data` دارد؛
- `--migrationsDir=/pb_migrations` دارد؛
- `--hooksDir=/pb_hooks` دارد؛
- قبل از serve یا از طریق serve migrationها را اجرا می‌کند؛
- در خطای migration startup را متوقف می‌کند.

template عمومی فعلی Liara mountهای مشابه را نشان می‌دهد، اما image/tag و command آن با اطلاعات production یکسان نیست؛ پس مدرک کافی نیست.

روش اثبات بدون دست‌زدن به production، یکی از این دو است:

1. **ترجیحی — Liara/پشتیبانی:** digest immutable image و مقدار Entrypoint/Cmd همان tag را بدون secret دریافت کنید.
2. **محیط موقت Liara یا registry read-only:** همان image را روی یک برنامه‌ی آزمایشی با چهار disk خالی اجرا کنید؛ یک migration sentinel کاملاً additive در `/pb_migrations` بگذارید؛ restart کنید؛ از log و schema ثابت کنید دقیقاً یک بار اجرا شده و اجرای دوم no-op است. سپس محیط موقت حذف می‌شود. این آزمایش نباید از backup یا credential production استفاده کند.

تا یکی از این دو روش ثبت نشده، restart-migration برابر «تأییدنشده» و نتیجه NO-GO است.

## چک‌لیست انتشار دستی

### A. backup و baseline — قبل از maintenance window

- [ ] **Liara > Disk `/pb_data` > Backups:** backup جدید بسازید و منتظر وضعیت completed بمانید.
- [ ] **Liara:** backup را دانلود کنید. backup صرفاً «نمایش‌داده‌شده» قابل rollback نیست.
- [ ] **کامپیوتر محلی:** اندازه‌ی دقیق bytes و SHA-256 را ثبت کنید:

```powershell
Get-Item -LiteralPath "D:\backups\fanzoom-pb-data-backup.zip" | Select-Object Name,Length,LastWriteTimeUtc
Get-FileHash -Algorithm SHA256 -LiteralPath "D:\backups\fanzoom-pb-data-backup.zip"
```

- [ ] **کامپیوتر محلی:** archive را تست و روی مسیر موقت استخراج کنید؛ `data.db` باید وجود داشته باشد.
- [ ] **Docker محلی:** restore را با PocketBase 0.30.0 تمرین کنید و health، schema و countها را بخوانید.
- [ ] **Liara File Browser:** از `/pb_migrations` و `/pb_hooks` نیز archive/فهرست قبل از انتشار بگیرید. backup روزانه‌ی `/pb_data` این دو disk جدا را پوشش نمی‌دهد.
- [ ] **پنل PocketBase/read-only backup:** count تمام collectionها و duplicateهای بالا را ثبت کنید. فقط عدد؛ بدون PII.

### B. secretها — فقط نام، هرگز مقدار در ticket/log

**Liara > Application > Environment Variables (PocketBase):**

- [ ] `SHARED_RATE_LIMIT_HOOK_SECRET`
- [ ] `SHARED_RATE_LIMIT_HOOK_SECRET_PREVIOUS` فقط برای rotation و سپس حذف کنترل‌شده

image فعلی ممکن است envهای startup دیگری داشته باشد؛ آن‌ها باید از تنظیم فعلی Liara export/ثبت شوند، نه از روی Dockerfile repository حدس زده شوند.

**Vercel > FanZoom Project > Settings > Environment Variables:**

- [ ] `NEXT_PUBLIC_POCKETBASE_URL` (عمومی، دامنه‌ی PocketBase)
- [ ] `POCKETBASE_INTERNAL_URL`
- [ ] `POCKETBASE_ADMIN_EMAIL`
- [ ] `POCKETBASE_ADMIN_PASSWORD`
- [ ] `VIEW_RATE_LIMIT_SECRET`
- [ ] `RATE_LIMIT_KEY_SECRET`
- [ ] `SHARED_RATE_LIMIT_HOOK_SECRET` (با Liara یکسان)
- [ ] `SHARED_RATE_LIMIT_MODE`؛ rollout ابتدا `shadow`، بعداً `enforce`
- [ ] `SHARED_RATE_LIMIT_TIMEOUT_MS` در صورت override آگاهانه
- [ ] `APP_URL`

هیچ secret نباید `NEXT_PUBLIC_` باشد. `VIEW_TRUSTED_PROXY_IP_HEADER` تا وقتی Vercel/Liara نام header قابل اعتماد و رفتار حذف header جعلی را رسماً تأیید نکرده‌اند، unset بماند.

### C. upload — بدون replace کردن پوشه‌ها

- [ ] **کامپیوتر محلی:** SHA-256 ZIP و ۱۴ فایل را دوباره بررسی کنید.
- [ ] **Liara:** روش توقف سرویس همراه با دسترسی File Browser به diskها را از مستند/پشتیبانی تأیید کنید. PocketBase 0.30.0 به‌طور پیش‌فرض تغییر `pb_hooks` را watch و برنامه را restart می‌کند؛ hookها را روی سرویس زنده یکی‌یکی upload نکنید.
- [ ] **Liara Service:** maintenance را شروع و سرویس را متوقف کنید، یا روش atomic و اثبات‌شده‌ی image برای staging فایل‌ها را به‌کار ببرید.
- [ ] **Liara File Browser/روش مدیریت فایل سرویس:** فقط ۱۰ فایل `.js` release را به `/pb_migrations` اضافه کنید؛ ۱۹ فایل قبلی را حذف یا overwrite نکنید.
- [ ] **Liara File Browser/روش مدیریت فایل سرویس:** در حالت متوقف، چهار فایل hook را کامل به `/pb_hooks` اضافه کنید. ابتدا JSON policy و سپس سه فایل `.pb.js` قرار گیرند.
- [ ] **Liara:** اندازه و SHA-256 فایل uploadشده را در صورت پشتیبانی File Browser مقایسه کنید؛ در غیر این صورت download-back و hash محلی بگیرید.
- [ ] `README.md`، `manifest.json` و `SHA256SUMS.txt` را داخل `/pb_migrations` یا `/pb_hooks` نگذارید.

### D. restart و migration — فقط بعد از بسته‌شدن gate image

- [ ] **Vercel/عملیات سایت:** maintenance window فعال و writeهای حساس (comment/history/bookmark) متوقف مانده باشند.
- [ ] **Liara:** از log قبل از restart یک snapshot زمانی بگیرید.
- [ ] **Liara Service:** فقط یک restart کنترل‌شده انجام دهید. zero-downtime خاموش است؛ این مرحله downtime واقعی دارد.
- [ ] **Liara Logs:** نسخه 0.30.0، load شدن hookها، اجرای هر ۱۰ migration و نبود error/`SQLITE_BUSY` را ببینید.
- [ ] اگر command واقعی به‌جای auto migration نیازمند `migrate up` صریح باشد، آن command باید ابتدا روی محیط موقت اثبات و سپس مطابق سازوکار رسمی همان image اجرا شود؛ داخل پنل Admin schema را دستی import نکنید.
- [ ] اجرای migration دوم باید no-op باشد؛ برای اثبات آن restart اضافه و بی‌دلیل روی production نکنید. history migration را read-only بررسی کنید.

### E. smoke test backend

- [ ] `GET https://my-backend-fanzoom.liara.run/api/health` پاسخ 200 بدهد.
- [ ] **PocketBase Admin > Collections:** `news` و تمام collection/field قدیمی حفظ شده باشند.
- [ ] consent کاربران قدیمی پیش‌فرض خاموش باشد.
- [ ] count هیچ collection قبلی کم نشده باشد؛ افزایش canonical `reading_history` فقط مطابق گزارش migration مجاز است.
- [ ] client معمولی نتواند `recommendation_events`، `app_admins` یا `app_admin_audit` را list/create/update/delete کند.
- [ ] ساخت مستقیم comment، مخصوصاً `approved`، 403 شود؛ endpoint Next رسمی comment را `pending` بسازد.
- [ ] hook shared limiter امضای معتبر را بپذیرد و امضای غلط/منقضی را رد کند.
- [ ] در نبود secret لازم، hook fail-open نشود.
- [ ] atomic view یک increment کنترل‌شده را دقیقاً یک واحد ثبت کند.
- [ ] لاگ‌ها secret، token، email، IP خام یا payload کامل نداشته باشند.
- [ ] **Liara File Browser:** SHA-256 فایل‌های backend با `SHA256SUMS.txt` برابر باشد؛ اگر hash server-side ندارد، فایل‌ها را download-back و محلی hash کنید.

### F. هماهنگی backend و GitHub/Vercel

1. backend را دستی آماده و smoke کنید؛ Push گیت این مرحله را انجام نمی‌دهد.
2. تغییر rule کامنت می‌تواند frontend قدیمی‌ای را که مستقیم به PocketBase می‌نویسد موقتاً بشکند؛ بنابراین maintenance window را تا انتشار frontend سازگار باز نگه دارید.
3. فقط بعد از سبز شدن backend، branch را review و به `main` merge کنید.
4. **Vercel:** deployment ناشی از `main` را مشاهده کنید و health Next، auth، comment، history و recommendation را smoke کنید.
5. shared limiter ابتدا `shadow` باشد؛ بعد از مشاهده‌ی metricها جداگانه به `enforce` برود. WAF مرحله‌ی مستقل است.

## downtime

چون zero-downtime خاموش است، restart حداقل یک بازه‌ی قطع سرویس ایجاد می‌کند. مدت دقیق را نمی‌توان از repository نتیجه گرفت؛ شامل توقف container، اجرای migrationها روی SQLite حدود 1.93 GB، load hookها و آماده‌شدن health است. در این بازه Vercel ممکن است 502/503 ببیند و writeها ممکن است شکست بخورند. زمان باید با همان image و یک copy هم‌اندازه از backup benchmark شود و maintenance window از p95 مشاهده‌شده بزرگ‌تر انتخاب شود.

## Application URL و Proxy Header

- `Application URL=http://localhost:8090` برای یک backend عمومی production مقدار مناسبی نیست و ممکن است absolute linkهای email/auth را اشتباه بسازد. این release آن را تغییر نمی‌دهد. پس از تأیید flowهای OAuth/email، تغییر جداگانه‌ی آن به origin عمومی واقعی PocketBase باید در **PocketBase Admin > Settings** تمرین و smoke شود.
- Proxy Header خاموش فعلاً fail-safeتر است. تا Liara header معتبر و حذف header ارسالی client را مستند نکرده، آن را فعال نکنید. limiter فعلی identifier خام IP را ذخیره نمی‌کند و view endpoint fallback cookie امضاشده دارد.
- خاموش بودن Batch API با ingestion فعلی سازگار است؛ مسیر اصلی served به `/api/batch` PocketBase وابسته نیست.
- built-in rate limiting PocketBase جای shared limiter برنامه یا WAF آینده را نمی‌گیرد. تغییر آن خارج از این release است.

## rollback واقعی

Down migration مخرب اجرا نکنید.

1. **Vercel:** frontend جدید را deploy نکنید یا به deployment سالم قبلی rollback کنید.
2. **Liara:** PocketBase را متوقف کنید تا write جدید ایجاد نشود.
3. **Liara File Browser:** `/pb_migrations` را دقیقاً به فهرست ۱۹ فایل قبل برگردانید و چهار hook جدید را از `/pb_hooks` کنار بگذارید/به نسخه‌ی قبل برگردانید.
4. **Liara Disk `/pb_data`:** backup دانلود و restore-شده‌ی قبل از migration را restore کنید.
5. ترتیب مراحل ۳ و ۴ حیاتی است: اگر دیتابیس قدیمی با migrationهای جدید روی disk restart شود، migrationها دوباره اعمال می‌شوند.
6. **Liara:** image/digest و env قبلی را تأیید و یک restart کنترل‌شده انجام دهید.
7. **read-only:** hash schema و count تمام collectionها را با baseline تطبیق دهید.

## معیار توقف فوری

- backup دانلود نشده، SHA-256 ثبت نشده یا restore محلی شکست خورده است؛
- نام ۱۹ migration یا history اعمال‌شده با ابزار سازگار نیست؛
- Entrypoint/Cmd image دقیق ثابت نشده است؛
- executable چیزی غیر از 0.30.0 گزارش می‌کند؛
- هر migration/hook خطا، loop restart یا fail-open دارد؛
- count قدیمی کم می‌شود یا collection/field قدیمی مثل `news` ناپدید می‌شود؛
- consent قدیمی فعال می‌شود؛
- private collection یا approved comment از client قابل ساخت است؛
- `SQLITE_BUSY` تکرارشونده، 5xx، latency یا health نامعمول است؛
- rollback با `/pb_data` و snapshot دو disk کد آماده نیست.

## منابع رسمی

- PocketBase migrations: <https://pocketbase.io/docs/js-migrations/>
- PocketBase 0.30.0 serve migration source: <https://github.com/pocketbase/pocketbase/blob/v0.30.0/apis/serve.go>
- PocketBase 0.30.0 default hook/migration directories and hook watch: <https://github.com/pocketbase/pocketbase/blob/v0.30.0/plugins/jsvm/jsvm.go>
- PocketBase backup/restore: <https://pocketbase.io/docs/api-backups/>
- PocketBase production: <https://pocketbase.io/docs/going-to-production/>
- PocketBase 0.30.0: <https://github.com/pocketbase/pocketbase/releases/tag/v0.30.0>
- template عمومی Liara: <https://github.com/liara-cloud/compose-templates/tree/master/pocketbase>
- Liara File Browser: <https://developers.liara.ir/pages/file-browser>
- Liara disk backup download: <https://developers.liara.ir/pass/disks/download-backup-disk>
- Liara zero-downtime: <https://developers.liara.ir/pass/settings/zero-downtime>
- Vercel environment variables: <https://vercel.com/docs/environment-variables>
