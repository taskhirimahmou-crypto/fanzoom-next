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

برای route احراز هویت‌شده بعد از refresh session، visitor و user در **یک check، یک transaction و یک RTT PocketBase** بررسی می‌شوند. health و views فقط یک bucket و یک RTT دارند. دو مرحله‌کردن check لازم نشد؛ هزینه‌ی آن یک RTT اضافی Vercel→Liara و یک transaction اضافی بود.

## مالکیت لایه‌ها

- WAF آینده: coarse global/abuse limit پیش از Function.
- PocketBase: policyهای visitor و user که بین همه‌ی Function instanceها مشترک‌اند.
- حافظه‌ی process: فقط deduplication ده‌دقیقه‌ای view باقی مانده و مرجع quota امنیتی نیست.

یک global row مشترک ساخته نشده است؛ بنابراین Phase A hotspot سراسری ندارد. anonymous بدون هویت server-verified عمداً در یک identity fail-safe مشترک قرار می‌گیرد تا header یا cookie دلخواه visitor جدید نسازد. routeهای authenticated از user refresh‌شده و views از cookie امضاشده‌ی server استفاده می‌کنند.

## ماتریس عملیات privileged

| Route / operation | policy | bucketها | check/RTT پیش از superuser |
|---|---|---:|---:|
| `GET /api/health` | `health` | visitor | 1 / 1 |
| `POST /api/recommendation-events` | `recommendation-events` | visitor + user | 1 / 1 |
| `POST /api/recommendation-events/served` | `served` | visitor + user | 1 / 1 |
| `GET /api/recommended` و trusted served write | `recommended` | visitor + user | 1 / 1 |
| `POST /api/history` و trusted open write | `history` | visitor + user | 1 / 1 |
| `POST /api/comments` و trusted comment write | `comments` | visitor + user | 1 / 1 |
| `POST/DELETE /api/bookmarks` و trusted bookmark write | `bookmarks` | visitor + user | 1 / 1 |
| `POST /api/views` | `views` | verified visitor | 1 / 1 |
| `GET /api/admin/observability` و membership/data query | `admin-observability` | visitor + user | 1 / 1 |

`getAdminPocketBase` آخرین guard است. تلاش بدون permit، metric `privileged_operation_without_shared_limiter` تولید می‌کند و باید همیشه صفر باشد.

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

## Benchmark baseline ثبت‌شده

قبل از Phase A روی Docker تک-instance و `GET /api/health` با ۴۰ درخواست/هم‌زمانی ۴:

| mode | p50 | p95 | throughput |
|---|---:|---:|---:|
| baseline | 162.07 ms | 197.27 ms | 23.86 req/s |
| shadow (۳ instance، warm) | 109.40 ms | 138.47 ms | 34.77 req/s |
| enforce (۳ instance، warm) | 116.88 ms | 166.42 ms | 30.82 req/s |

هر ردیف بالا ۴۰ درخواست با concurrency=4 است. تست فشار جداگانه با ۱۲۰ درخواست هم‌زمان در shadow برابر ۱۲۰/۰ و در enforce دقیقاً ۶۰/۶۰ allowed/denied بود؛ هر سه Next instance پاسخ دادند، `SQLITE_BUSY=0` و p95 فشار به‌ترتیب 1690.97ms و 1168.43ms بود. این اعداد فشار burst هستند و با benchmark کم‌فشار بالا یکی نیستند. اگر در staging `SQLITE_BUSY`، اختلاف از N دقیق، یا p95 نامتناسب مشاهده شود، gate سبز نیست و Redis گزینه‌ی جایگزین است.
