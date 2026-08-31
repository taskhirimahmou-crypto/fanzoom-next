# Observability v1 — Data Dictionary

## قرارداد واحد CLI و dashboard

تعریف canonical همه‌ی metricها در `src/lib/observability/metrics.mjs` است. CLI و API خصوصی dashboard هر دو همین تابع pure را اجرا می‌کنند؛ بنابراین یک fixture یکسان باید خروجی عددی یکسان بسازد. بازه‌ها rolling و دقیقاً UTC هستند: `24h` برابر ۲۴ ساعت، `7d` برابر ۱۶۸ ساعت و `30d` برابر ۷۲۰ ساعت تا زمان refresh. هر دو مرز شروع و پایان شامل می‌شوند.

فیلترهای `surface` و `algorithmVersion` فقط funnel توصیه را محدود می‌کنند. metricهای عملیاتی log (مانند 429، 5xx و latency) فقط با بازه‌ی زمانی محدود می‌شوند؛ UI این scope را صریح نمایش می‌دهد تا denominatorها با هم مخلوط نشوند. query رخدادها در صفحه‌های حداکثر ۲۰۰تایی و سقف ۱۰٬۰۰۰ رکورد انجام می‌شود. log محلی نیز به ۵ MiB و ۲۰٬۰۰۰ ردیف آخر محدود است و رسیدن به سقف در پاسخ aggregate علامت می‌خورد.

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

## metricهای امنیت و دسترسی

این metricها از `app_admin_audit` خصوصی و در query صفحه‌بندی‌شده‌ی حداکثر ۵۰۰۰ رکورد ساخته می‌شوند؛
email و relationهای خام هرگز عضو DTO نیستند. state فعال هر کاربر از آخرین audit موفق تا انتهای بازه
بازسازی می‌شود.

| Metric | تعریف / denominator | تصمیم |
| --- | --- | --- |
| `security.activeAdminsByRole` | تعداد آخرین state موفق با `enabled=true` به تفکیک owner/admin/viewer؛ مخرج ندارد | ظرفیت دسترسی و بررسی حداقل یک owner |
| `security.changes.grant` | audit موفق action=grant در window | روند اعطای دسترسی |
| `roleChange` | audit موفق role_change در window | تغییر سطح اختیار |
| `enable/revoke` | audit موفق enable/revoke در window | فعال‌سازی و لغو دسترسی |
| `deniedAttempts` | audit outcome=denied در window | تلاش غیرمجاز یا invariant محافظتی |
| `failedMutations` | audit outcome=failed در window | خرابی backend/mutation |
| `singleOwnerWarning` | دقیقاً یک owner فعال در state بازسازی‌شده | هشدار continuity؛ خود mutation همچنان lockout را رد می‌کند |
| `recentChanges` | حداکثر ۲۰ action/outcome/time/requestId امن | triage بدون PII |

## metricهای dashboard و denominator

| نمایش | صورت | مخرج | واحد / نبود نمونه |
| --- | --- | --- | --- |
| error rate | پاسخ‌های 5xx | تمام `http_request_completed` در بازه | درصد؛ بدون پاسخ `null` |
| engaged-read rate | engaged attributed معتبر | open attributed معتبر | درصد؛ بدون open `null` |
| empty-feed rate | `recommended_feed_empty` یکتا | پاسخ‌های `/api/recommended` | درصد؛ بدون پاسخ feed `null` |
| data coverage | مجموع served/impression/open/engaged با tuple کامل | تمام eventهای یکتای همین چهار مرحله، direct و attributed | درصد؛ بدون event `null` |
| conversion هر مرحله | count مرحله‌ی فعلی | count مرحله‌ی قبلی | درصد؛ بدون مرحله‌ی قبلی `null` |
| p95 latency | نمونه‌ی nearest-rank صدک ۹۵ | `durationMs` معتبر و نامنفی | میلی‌ثانیه؛ بدون نمونه `null` |

`freshness.lastEventAt` آخرین زمان event، `lastLogAt` آخرین log و `lastAuditAt` آخرین audit خوانده‌شده
است؛ `lastObservedAt` جدیدترینِ این سه است. `generatedAt` زمان محاسبه است و نباید به‌جای freshness منبع
تفسیر شود. `datasetKind=test` یعنی داده از stack محلی Docker آمده و در UI با برچسب «داده‌ی آزمایشی»
نمایش داده می‌شود.

## قرارداد خروجی امن dashboard

Browser فقط count، rate، bucket زمانی، نام allowlistشده‌ی route/event/error، status و requestId معتبر UUID را دریافت می‌کند. رکورد خام، `userId`، email، IP، token، cookie، authorization، متن مقاله/نظر و credential PocketBase عضو DTO نیست. `recentIssues` حداکثر ۲۰ ردیف امن و `routeStats` حداکثر ۲۰ route دارد.

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
