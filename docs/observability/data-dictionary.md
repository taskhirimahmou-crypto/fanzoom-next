# Observability v1 — Data Dictionary

## قرارداد structured log

| فیلد | معنی | منبع | استفاده |
| --- | --- | --- | --- |
| `timestamp` | زمان UTC تولید log | server logger | ترتیب رخدادها و window زمانی |
| `level` | `debug/info/warn/error` | server logger | اولویت بررسی |
| `eventName` | نام پایدار رخداد | route/hook/startup | aggregation و alert |
| `requestId` | UUID correlation هر درخواست | header معتبر ورودی یا UUID سرور | دنبال‌کردن یک درخواست بین Next.js و PocketBase |
| `route` | مسیر ثابت API | route handler | پیدا کردن محل خطا |
| `statusCode` | نتیجه‌ی HTTP یا معادل startup | response/handler | نرخ 429 و 5xx |
| `durationMs` | زمان route تا پاسخ | request context | میانگین و p95 latency |
| `feedId` | شناسه‌ی feed در صورت وجود | contract معتبر recommendation | اتصال رخدادهای یک feed، بدون userId |
| `algorithmVersion` | نسخه‌ی الگوریتم | baseline/event contract | مقایسه‌ی نسخه‌ها |
| `errorCode` | کد محدود و بدون متن exception | handler | عیب‌یابی بدون نشت داده |

`null` برای سه فیلد اختیاری به معنی «در این رخداد کاربرد ندارد» است. logger هیچ metadata آزاد یا object خطا نمی‌پذیرد.

## metricهای Data Quality

| Metric | تعریف دقیق | منبع | تصمیم |
| --- | --- | --- | --- |
| `funnel.stages.served` | تعداد event یکتای دارای attribution کامل پس از dedupe userId+idempotencyKey | recommendation_events محلی | حجم funnel توصیه‌ای بدون مخلوط‌شدن direct |
| `impression` | کارت‌هایی که شرط ۵۰٪/۱ ثانیه را گذرانده‌اند | recommendation_events | کیفیت دیده‌شدن واقعی |
| `open` | open ثبت‌شده از history endpoint trusted | recommendation_events | تبدیل مشاهده به مطالعه |
| `engaged` | مطالعه‌ی فعال که threshold client و consistency server را گذرانده | recommendation_events | کیفیت مطالعه |
| `servedToImpression` | impression / served؛ صفر مخرج برابر `null` | aggregate | خطای render/observer یا جذابیت پایین |
| `impressionToOpen` | open / impression | aggregate | جذابیت کارت/عنوان |
| `openToEngaged` | engaged / open | aggregate | کیفیت صفحه و محتوا |
| `segments` | همان funnel به تفکیک surface و algorithmVersion | aggregate | مقایسه‌ی محل و نسخه |
| `duplicateEvents` | رکورد اضافه با userId+idempotencyKey تکراری | aggregate | کنترل idempotency/migration drift |
| `duplicateGroups` | تعداد کلیدهایی که حداقل یک duplicate دارند | aggregate | تشخیص گستردگی مشکل |
| `incompleteEvents` | recommendation surface بدون tuple کامل یا direct با attribution مخلوط | aggregate | پیدا کردن contract drift |
| `unattributedEvents` | funnel event بدون feedId/rank/algorithmVersion | aggregate | تفکیک direct legitimate از recommendation؛ همراه surface تفسیر شود |
| `invalidAttributionEvents` | attribution ناقص یا attribution روی surface غیرتوصیه‌ای | aggregate | جلوگیری از آلودگی داده |
| `eventTotals` | تعداد کل stageها، شامل direct و attributed | aggregate | کنترل حجم خام؛ برای conversion استفاده نمی‌شود |
| `responses429` | log پایان request با status=429 | structured logs | فشار/abuse و tuning limiter |
| `responses5xx` | log پایان request با status 500..599 | structured logs | سلامت runtime/backend |
| `emptyFeeds` | تعداد `recommended_feed_empty` | structured logs | موجودی/interest/query issue |
| `servedPartialFailures` | تعداد `served_partial_failure` | structured logs | سلامت write و retry |
| `invalidAttributions` | تعداد رد attribution سمت سرور | structured logs | drift یا جعل ساده |
| `pocketBaseFailures` | تعداد `pocketbase_failure` | structured logs | availability وابستگی |
| `latency.averageMs` | میانگین duration فقط برای `http_request_completed` | structured logs | روند کلی latency |
| `latency.p95Ms` | nearest-rank p95 duration | structured logs | tail latency و alert |

## eventNameهای عملیاتی v1

- `http_request_completed`
- `pocketbase_failure`
- `event_validation_failed`
- `rate_limit_exceeded`
- `served_partial_failure`
- `invalid_attribution`
- `atomic_view_failure`
- `consent_rejection`
- `recommended_feed_empty`
- `schema_mismatch`
- `pocketbase_migration_failure`
- `pocketbase_startup_failure`
- `personalization_consent_updated`

برای تحلیل funnel، direct open و engaged باید جدا از recommendation segment تفسیر شوند. عدد `unattributedEvents` به تنهایی خطا نیست؛ `invalidAttributionEvents` معیار ناسازگاری قرارداد است.
