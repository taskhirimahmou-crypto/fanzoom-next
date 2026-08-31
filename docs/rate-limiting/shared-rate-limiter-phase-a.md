# Shared Rate Limiter Core — Phase A

این فاز فقط زیرساخت محلی PocketBase را آماده می‌کند. WAF هنوز فعال نیست و هیچ تنظیمی در Vercel یا Liara تغییر نکرده است.

## جریان درخواست

1. Route Handler یک `requestId` برای observability می‌سازد؛ این مقدار هرگز `decisionId` نیست.
2. session معمولی کاربر refresh می‌شود. این عملیات superuser نیست.
3. Next.js برای identifier تأییدشده‌ی user/visitor یک HMAC با `RATE_LIMIT_KEY_SECRET` می‌سازد. مقدار خام از process خارج نمی‌شود.
4. یک `decisionId` تصادفی داخلی ساخته می‌شود و visitor/user policyها در یک body امضاشده به hook ارسال می‌شوند.
5. hook با secret فعلی یا قبلی، timestamp حداکثر ۶۰ ثانیه و مقایسه‌ی constant-time درخواست را اعتبارسنجی می‌کند.
6. تمام bucketها در یک transaction کوتاه SQLite مصرف می‌شوند. retry با همان `decisionId` پاسخ ذخیره‌شده را بدون charge جدید می‌گیرد.
7. فقط نتیجه‌ی مجاز یک permit داخلی می‌سازد. `getAdminPocketBase` بدون این permit قبل از login superuser متوقف می‌شود.
8. در `enforce`، deny برابر 429 و خرابی backend برابر 503 fail-closed است. در `shadow` فقط تصمیم log می‌شود و عملیات ادامه می‌یابد.

برای route احراز هویت‌شده بعد از refresh session، visitor و user در **یک check، یک transaction و یک RTT PocketBase** بررسی می‌شوند. views فقط یک bucket و یک RTT دارد. health عمومی هیچ bucket، write یا superuser ندارد. دو مرحله‌کردن check لازم نشد؛ هزینه‌ی آن یک RTT اضافی Vercel→Liara و یک transaction اضافی بود.

## مالکیت لایه‌ها

- WAF آینده: coarse global/abuse limit پیش از Function.
- PocketBase: policyهای visitor و user که بین همه‌ی Function instanceها مشترک‌اند.
- حافظه‌ی process: فقط deduplication ده‌دقیقه‌ای view باقی مانده و مرجع quota امنیتی نیست.

یک global row مشترک ساخته نشده است؛ بنابراین Phase A hotspot سراسری ندارد. anonymous بدون هویت server-verified عمداً در یک identity fail-safe مشترک قرار می‌گیرد تا header یا cookie دلخواه visitor جدید نسازد. routeهای authenticated از user refresh‌شده و views از cookie امضاشده‌ی server استفاده می‌کنند.

## ماتریس عملیات privileged

| Route / operation | policy | bucketها | check/RTT پیش از superuser |
|---|---|---:|---:|
| `POST /api/recommendation-events` | `recommendation-events` | visitor + user | 1 / 1 |
| `POST /api/recommendation-events/served` | `served` | visitor + user | 1 / 1 |
| `GET /api/recommended` و trusted served write | `recommended` | visitor + user | 1 / 1 |
| `POST /api/history` و trusted open write | `history` | visitor + user | 1 / 1 |
| `POST /api/comments` و trusted comment write | `comments` | visitor + user | 1 / 1 |
| `POST/DELETE /api/bookmarks` و trusted bookmark write | `bookmarks` | visitor + user | 1 / 1 |
| `POST /api/views` | `views` | verified visitor | 1 / 1 |
| `GET /api/admin/observability` و membership/data query | `admin-observability` | visitor + user | 1 / 1 |

`getAdminPocketBase` آخرین guard است. تلاش بدون permit، metric `privileged_operation_without_shared_limiter` تولید می‌کند و باید همیشه صفر باشد.

### routeهای بدون عملیات privileged

| Route / گروه | رفتار PocketBase | shared limiter دیتابیسی | دلیل |
|---|---|---:|---|
| `GET /api/health` | فقط `GET /api/health` عمومی PocketBase، بدون credential | 0 check / 0 write | uptime probe باید read-only باشد و خرابی PocketBase را گزارش کند، نه اینکه به limiter همان backend وابسته باشد |
| `/api/auth/*` | auth معمولی کاربر، بدون superuser | ندارد | خارج از مرز عملیات privileged؛ WAF آینده coarse abuse را پوشش می‌دهد |
| `/api/profile/interests` و `/api/profile/personalization` | session و رکورد خود کاربر، بدون superuser | ندارد | user-scoped است و credential مدیریتی ندارد |
| `/api/local-test/rate-limit-benchmark` | فقط benchmark core | فقط در Docker development | در production همیشه 404 و جزو surface محصول نیست |

schema check عمیق health فقط داخل dashboard خصوصی اجرا می‌شود؛ آن مسیر در ردیف `admin-observability` بالا permit معتبر دارد. حذف health عمومی از limiter نباید و در تست‌ها نیز metric `privileged_operation_without_shared_limiter` را افزایش نداد.

## Secretها و rotation

Production به سه env server-only با حداقل ۳۲ بایت entropy نیاز دارد:

- `SHARED_RATE_LIMIT_HOOK_SECRET`
- `SHARED_RATE_LIMIT_HOOK_SECRET_PREVIOUS` فقط در بازه‌ی rotation
- `RATE_LIMIT_KEY_SECRET`

هیچ‌کدام `NEXT_PUBLIC_` نیستند. secret در URL، migration، source و log قرار نمی‌گیرد. در Docker محلی تک-instance فعلی، entrypoint فقط برای تست از secret آزمایشی موجود fallback می‌گیرد؛ topology چند-instance secretهای تصادفی runtime دریافت می‌کند.

Rotation: ابتدا مقدار فعلی را به previous منتقل و مقدار فعلی جدید را هم‌زمان روی Next/PocketBase قرار دهید؛ بعد از اتمام عمر requestهای in-flight و rollout کامل، previous را حذف کنید.

## Cleanup

cron هر ۱۵ دقیقه حداکثر ۱۰۰۰ bucket و ۱۰۰۰ decision منقضی را در transaction محدود حذف می‌کند. شرط expiry دوباره هنگام delete بررسی می‌شود، پس bucket فعال حذف نمی‌شود. metrics امضاشده شامل active buckets، backlog، oldest expired age و deleted total است؛ هیچ key hash در پاسخ وجود ندارد.

## Rollout

1. local fresh/existing migration و تست‌ها.
2. local `shadow`: denyها log می‌شوند ولی درخواست مسدود نمی‌شود.
3. local `enforce`: 429/503 واقعاً اعمال می‌شود.
4. staging تک-instance یا محدود با alertها؛ سپس چند-instance.
5. WAF coarse limit در فاز مستقل.

## Thresholdهای پیشنهادی

- `privileged_operation_without_shared_limiter > 0`: بحرانی.
- `failClosed > 0` یا backend error بیش از ۱٪ در ۵ دقیقه: بحرانی.
- `sqliteBusy > 0`: rollout متوقف و contention بررسی شود.
- p95 hook latency بیش از ۱۵۰ms برای ۱۰ دقیقه: هشدار؛ بیش از ۳۰۰ms: توقف rollout و ارزیابی Redis.
- cleanup backlog بیش از ۱۰هزار یا oldest expired بیش از ۳۰ دقیقه: هشدار.
- deny rate ناگهانی بیش از ۳ برابر baseline: policy/WAF و abuse بررسی شود.

## Benchmark کنترل‌شده

topology در تمام حالت‌ها یکسان است: سه Next.js dev instance، یک nginx round-robin و یک PocketBase مشترک. هر mode/concurrency پنج بار اجرا شد؛ هر بار ۳۰ warm-up داشت. ترتیب modeها و concurrencyها چرخشی بود. برای حذف selection bias دو policy تست server-only استفاده شد: ظرفیت ۱۰۰۰ برای latency مجاز خالص و ظرفیت ۶۰ برای ۱۲۰ درخواست saturated. سناریوی allowed/saturated نیز در cycleهای زوج و فرد جابه‌جا شد.

هر سلول زیر aggregate پنج اجرا و ۶۰۰ نمونه‌ی allowed است؛ shadow/enforce همچنین ۳۰۰ نمونه‌ی denied دارند:

| mode | concurrency | allowed median / p95 | denied median / p95 | hook RTT allowed median / p95 | hook RTT denied median / p95 |
|---|---:|---:|---:|---:|---:|
| baseline | 1 | 15.26 / 20.55 ms | — | 0 / 0 | — |
| shadow | 1 | 15.64 / 27.21 ms | 15.61 / 28.00 ms | 3.46 / 5.62 ms | 3.53 / 4.99 ms |
| enforce | 1 | 15.58 / 26.95 ms | 16.12 / 26.81 ms | 3.47 / 5.64 ms | 3.55 / 5.31 ms |
| baseline | 4 | 10.68 / 20.99 ms | — | 0 / 0 | — |
| shadow | 4 | 17.11 / 29.15 ms | 16.89 / 25.41 ms | 4.09 / 8.31 ms | 3.94 / 7.63 ms |
| enforce | 4 | 17.78 / 30.47 ms | 17.99 / 30.73 ms | 4.11 / 10.16 ms | 4.05 / 7.95 ms |
| baseline | 20 | 46.48 / 83.14 ms | — | 0 / 0 | — |
| shadow | 20 | 67.92 / 111.10 ms | 68.26 / 99.13 ms | 23.04 / 41.45 ms | 20.64 / 34.34 ms |
| enforce | 20 | 65.98 / 119.70 ms | 66.47 / 101.23 ms | 21.93 / 43.57 ms | 20.99 / 36.98 ms |
| baseline | 120 | 174.34 / 320.07 ms | — | 0 / 0 | — |
| shadow | 120 | 265.67 / 465.06 ms | 387.69 / 508.46 ms | 24.70 / 63.71 ms | 21.62 / 39.86 ms |
| enforce | 120 | 290.05 / 499.86 ms | 397.42 / 543.63 ms | 24.78 / 73.82 ms | 22.49 / 52.68 ms |

overhead واقعی allowed نسبت به baseline:

| concurrency | shadow median / p95 | enforce median / p95 |
|---:|---:|---:|
| 1 | +0.38 / +6.66 ms | +0.32 / +6.40 ms |
| 4 | +6.43 / +8.16 ms | +7.10 / +9.48 ms |
| 20 | +21.44 / +27.96 ms | +19.50 / +36.56 ms |
| 120 | +91.33 / +144.99 ms | +115.71 / +179.79 ms |

baseline صفر write و صفر RTT دارد. یک bucket در shadow/enforce دقیقاً دو write منطقی (bucket + decision) و یک RTT دارد؛ routeهای visitor+user سه write منطقی در همان یک transaction و یک RTT دارند. در تمام پنج cycle، saturated دقیقاً ۶۰ allowed/۶۰ denied بود، هر سه instance استفاده شدند، `SQLITE_BUSY=0` ماند، ۱۵ cleanup هم‌زمان ۲۳۸۶ ردیف منقضی را حذف کرد و بیشترین backlog مشاهده‌شده ۹ بود. این اعداد فقط baseline محلی‌اند؛ latency واقعی Vercel→Liara باید در staging دوباره اندازه‌گیری شود.
