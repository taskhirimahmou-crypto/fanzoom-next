# Observability Foundation v1 — Runbook

این نسخه برای تشخیص سریع سلامت API، خطاهای PocketBase و کیفیت مسیر توصیه طراحی شده است. خروجی routeهای مهم یک header به نام `x-request-id` دارد و هر درخواست یک خط JSON استاندارد در stdout سرور تولید می‌کند.

## مرزهای ایمنی v1

- dashboard خصوصی فقط در Docker لوکال و مسیر `/admin/observability` فعال است. page و API هر دو مستقل از هم session و عضویت `app_admins` را با حداقل نقش `viewer` بررسی می‌کنند.
- API خصوصی `/api/admin/observability` فقط aggregate می‌دهد، `private, no-store` است و خارج از `FANZOOM_LOCAL_DOCKER=true` یا برای PocketBase غیرمحلی fail-closed می‌شود.
- گزارش Data Quality فقط با superuser محلی و فقط برای hostهای `127.0.0.1`، `localhost` یا `pocketbase` اجرا می‌شود. URLهای HTTPS و hostهای بیرونی عمداً رد می‌شوند.
- logger فقط فیلدهای allowlist را می‌نویسد. password، token، cookie، authorization، credential، email، IP خام، متن مقاله/نظر و payload کاربر ورودی logger نیستند.
- event خام در log کپی نمی‌شود؛ فقط `feedId` و `algorithmVersion` معتبرِ متنی در صورت وجود ثبت می‌شوند.
- هیچ notification خارجی فعال نیست. thresholdها فعلاً برای بررسی دستی هستند.

## اجرای محلی

ابتدا محیط محلی را بالا بیاورید:

```powershell
docker compose --env-file .env.docker.local -f compose.local.yml up --build -d
```

سلامت عمومی Next.js را بررسی کنید:

```powershell
Invoke-RestMethod http://127.0.0.1:3000/api/health
```

پاسخ عمومی فقط `status` دارد. در حالت سالم `200 {"status":"ok"}` و در حالت ناسالم `503 {"status":"unavailable"}` برمی‌گردد. این route فقط health API عمومی PocketBase را با `GET` و بدون credential صدا می‌زند؛ هیچ shared limiter bucket، write یا superuser session ایجاد نمی‌کند. flood protection آن در آینده بر عهده‌ی WAF است. جزئیات داخلی فقط به شکل errorCode محدود در log سرور دیده می‌شوند.

برای dashboard، ابتدا کاربر آزمایشی را با راهنمای `docs/admin-access.md` به نقش `viewer` متصل کنید، سپس با همان کاربر وارد شوید و این URL را باز کنید:

```text
http://127.0.0.1:3000/admin/observability?window=24h&surface=all&algorithm=all&tab=overview
```

فیلترها در URL حفظ می‌شوند. دکمه‌ی تازه‌سازی query جدید و بدون cache مشترک اجرا می‌کند. volume نام‌دار `fanzoom_observability_logs` نسخه‌ی JSONL allowlistشده‌ی logهای Next.js را نگه می‌دارد؛ حذف و ساخت دوباره‌ی container آن را حذف نمی‌کند، اما حذف صریح volume داده را پاک می‌کند.

برای گرفتن گزارش تجمیعی همراه با logهای فعلی:

```powershell
docker compose --env-file .env.docker.local -f compose.local.yml logs --no-color web | Set-Content -Encoding utf8 "$env:TEMP\fanzoom-web-observability.log"
$env:POCKETBASE_INTERNAL_URL = "http://127.0.0.1:8090"
node --env-file=.env.docker.local scripts/observability-report.mjs --log-file "$env:TEMP\fanzoom-web-observability.log"
Remove-Item Env:POCKETBASE_INTERNAL_URL
```

داخل Docker می‌توان بدون ساخت فایل موقت، log را از stdin داد:

```powershell
docker compose --env-file .env.docker.local -f compose.local.yml logs --no-color web | docker compose --env-file .env.docker.local -f compose.local.yml exec -T -e POCKETBASE_INTERNAL_URL=http://pocketbase:8090 web npm run observability:report -- --log-file -
```

دستور دوم فقط collection خصوصی `recommendation_events` در PocketBase آزمایشی را می‌خواند و شمارنده‌ها/نرخ‌ها را چاپ می‌کند. هیچ رکوردی ایجاد یا تغییر نمی‌دهد.

## ترتیب عیب‌یابی

1. `docker compose ... ps` را ببینید؛ `pocketbase` و `web` باید healthy باشند.
2. `/api/health` را صدا بزنید. `unavailable` یعنی ابتدا log متناظر با همان `x-request-id` را پیدا کنید.
3. `errorCode` را بررسی کنید؛ متن exception یا credential عمداً log نمی‌شود.
4. اگر `pocketbase_unavailable` است، health داخلی PocketBase و شبکه‌ی Compose را بررسی کنید.
5. schema mismatch فقط در health عمیق dashboard خصوصی بررسی می‌شود. health عمومی صرفاً availability را می‌سنجد و ledger یا schema داخلی را افشا نمی‌کند.
6. اگر `served_partial_failure` است، تعداد failure را از پاسخ endpoint و unique indexهای `recommendation_events` بررسی کنید؛ retry با همان idempotencyKey امن است.
7. اگر `invalid_attribution` رشد کرده، زنجیره‌ی لینک توصیه تا served/open و انقضای ۳۰ دقیقه‌ای served evidence را بررسی کنید.
8. اگر `atomic_view_failure` دیده شد، health PocketBase و بارگذاری `pb_hooks/atomic_views.pb.js` در image محلی را بررسی کنید. شکست migration در entrypoint با `pocketbase_migration_failure` ثبت می‌شود.

## Thresholdهای پیشنهادی اولیه

این مقادیر نقطه‌ی شروع staging هستند و بعد از یک هفته baseline باید بازتنظیم شوند:

| سیگنال | هشدار پیشنهادی | اقدام اول |
| --- | --- | --- |
| پاسخ 5xx | بیش از ۲٪ در ۵ دقیقه و حداقل ۲۰ درخواست | route/errorCode غالب و سلامت PocketBase |
| latency | p95 بیش از ۱۰۰۰ms در ۱۰ دقیقه و حداقل ۳۰ نمونه | تفکیک route و زمان PocketBase |
| event ingestion failure | بیش از ۱٪ در ۵ دقیقه | validation، consent، rate limit و PB write |
| feed خالی | بیش از ۵٪ feedهای موفق یا ۳ feed پیاپی | interests، query و موجودی article |
| served بدون impression | نسبت impression/served کمتر از ۲۰٪ با حداقل ۱۰۰ served | observer client، consent و render کارت |
| attribution نامعتبر | بیش از ۲٪ openهای توصیه‌ای یا ۱۰ مورد در ۱۰ دقیقه | query contract و served evidence |
| PocketBase unavailable | ۲ health failure پیاپی | شبکه، container و migration/hook startup |
| served partial failure | هر مورد | unique index، retry و خطای write |

## معماری dashboard خصوصی فعلی و آینده

نسخه‌ی فعلی read-only است: session عادی کاربر با `requireUser` refresh می‌شود، membership خصوصی `app_admins` سمت سرور خوانده می‌شود و superuser client فقط در DAL سرور برای query محدود و aggregate استفاده می‌شود. dashboard هیچ mutation یا provisioning control ندارد.

برای محیط چند-instance آینده، query مستقیم باید با یک job زمان‌بندی‌شده جایگزین شود که metricهای aggregate و بدون شناسه را در collection خصوصی بنویسد. API داشبورد فقط همان aggregateها را با cache خصوصی/کوتاه‌عمر بخواند؛ rate limiter مشترک، audit trail دسترسی و retention اجرایی نیز پیش از production لازم‌اند. superuser credential هرگز نباید به browser، URL یا response برسد.

## محدودیت‌های شناخته‌شده

- logهای v1 روی stdout هستند؛ بدون نگهداری/ارسال امن، بعد از حذف container قابل بازیابی نیستند.
- dashboard فقط mirror ساختاریافته‌ی Next.js را می‌خواند؛ stdout عمومی PocketBase و hookهایی که event ساختاریافته‌ی متناظر در Next.js ندارند فعلاً در نمودارها دیده نمی‌شوند.
- shared rate limiter بین instanceها داخل PocketBase مشترک است؛ فقط deduplication ده‌دقیقه‌ای views process-local باقی مانده و مرجع quota امنیتی نیست.
- CLI فقط logهایی را می‌بیند که در فایل ورودی داده شده‌اند؛ نبود فایل یعنی 429، 5xx و latency مقدار صفر/بدون نمونه دارند.
- health عمومی فقط availability PocketBase را می‌سنجد؛ schema contract در dashboard خصوصی بررسی می‌شود، نه تاریخچه‌ی کامل ledger migration.
- داده‌ی client رفتار انسانی را اثبات نمی‌کند؛ consistency سمت سرور فقط جعل ساده و drift را محدود می‌کند.
- notification، tracing توزیع‌شده، هزینه‌ی query و resource metrics هنوز وجود ندارند.
- query فعلی برای حجم محلی با سقف ۱۰٬۰۰۰ event مناسب است؛ برای production باید pre-aggregation و index/query budget جدا طراحی شود.

## retention پیشنهادی

- structured operational logs: ۱۴ روز در staging و ۳۰ روز در production، در صورت تصویب privacy/security.
- aggregateهای روزانه‌ی بدون شناسه: ۹۰ تا ۱۸۰ روز.
- raw authenticated recommendation events: فعلاً پیشنهاد RFC برابر ۱۸۰ روز است، اما اجرای retention باید پس از تأیید policy و مسیر delete/export انجام شود.
- فایل log محلی موقت را بعد از پایان بررسی حذف کنید؛ این فایل نباید commit شود.
