# RFC: Phase 0 موتور پیشنهاد فن‌زوم

- وضعیت: **Proposed — decision-complete با چند پیش‌شرط اجرایی مشخص**
- محدوده: قرارداد داده، اندازه‌گیری، حریم خصوصی، migration و برنامه‌ی اجرا
- خارج از محدوده‌ی این RFC: فعال‌کردن runtime، تولید embedding، ساخت profile، ranker و هر تغییر رفتاری محصول
- مبنای audit: commit `a5eab4ff2ee9056fa472d87a72f89e9210a94f39` روی branch `main`
- تاریخ audit: ۲۰ مرداد ۱۴۰۵ / 2026-08-11
- نسخه‌ی قرارداد: `phase-0-rfc/v1`

## 1. خلاصه‌ی تصمیم

Phase 0 باید قبل از هر ranker یا embedding، چهار مسئله را قطعی کند:

1. `reading_history` نام و schema canonical تاریخچه‌ی مطالعه است؛ collection فعلی/احتمالی `history` منبع legacy باقی می‌ماند و تا پایان دوره‌ی rollback حذف نمی‌شود.
2. همه‌ی داده‌های قابل‌اعتماد توصیه‌گر از یک event log خصوصی و append-only به نام `recommendation_events` عبور می‌کنند. client هیچ‌وقت `userId`، `rank`، `algorithm_version` یا reason قابل‌اعتماد را تعیین نمی‌کند.
3. pagination آینده بر مبنای **feed snapshot + cursor امضاشده** است، نه offset روی ranking متغیر.
4. anonymous personalization فقط پس از consent و با شناسه‌ی تصادفی/هش‌شده انجام می‌شود و داده‌ی مهمان هنگام login به‌طور خودکار به حساب وصل نمی‌شود.

زیرساخت MVP همان Next.js + PocketBase است. Kafka، vector database، feature store یا سرویس ML جدید در Phase 0 وارد نمی‌شود. قراردادها طوری version شده‌اند که بعداً storage یا retrieval بدون تغییر API عمومی قابل تعویض باشد.

## 2. اهداف و اصول

### 2.1. اهداف Phase 0

- ثبت واقعیت فعلی repository و جداکردن آن از schema یا workflow production که در repo موجود نیست.
- رفع تصمیم معماری `history` در برابر `reading_history` بدون حذف داده.
- تعریف schema دقیق collectionهای پایه‌ی توصیه‌گر.
- تعریف event taxonomy، idempotency، attribution و impression معتبر.
- تعریف consent، retention، export/delete/reset و مدل actor.
- تعریف قرارداد taxonomy، entity و versioning enrichment بدون اجرای enrichment.
- تعیین metrics، observability، failure handling، test plan و acceptance criteria.

### 2.2. اصول الزام‌آور

- **Server authoritative:** client فقط observation را گزارش می‌کند؛ هویت، snapshot context و attribution را server استخراج یا اعتبارسنجی می‌کند.
- **Append-only evidence:** event پذیرفته‌شده update نمی‌شود؛ اصلاح معنایی با event جدید یا نسخه‌ی جدید builder انجام می‌شود.
- **No silent merge:** داده‌ی anonymous و authenticated بدون اقدام صریح کاربر merge نمی‌شود.
- **Privacy by default:** guest بدون consent، actor پایدار و behavioral profile سمت server ندارد.
- **Version everything:** event schema، الگوریتم، profile builder، taxonomy، entity registry، prompt، normalizer و embedding قرارداد نسخه دارند.
- **Reversible defaults:** تصمیم‌های آسان‌التغییر با default محافظه‌کارانه شروع می‌شوند و config-driven می‌مانند.
- **No hidden runtime change in this RFC:** این سند به‌تنهایی هیچ رفتار production را تغییر نمی‌دهد.

## 3. Current State Audit

### 3.1. مبنای repository و Next.js

- `AGENTS.md:1-6` هشدار می‌دهد که رفتار این نسخه‌ی Next.js باید از مستندات bundled خوانده شود.
- `package.json:12-30` نسخه‌های `next@16.2.11`، `pocketbase@0.27.0`، React 19 و Vitest را ثبت می‌کند. نسخه‌ی package کلاینت PocketBase، نسخه‌ی binary/server production را ثابت نمی‌کند.
- `next.config.ts:3-12` فقط remote image و `serverExternalPackages` را تنظیم کرده و `cacheComponents` را فعال نکرده است.
- مستند bundled همین نسخه در `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md:51` می‌گوید Route Handlerهای `GET` به‌طور پیش‌فرض cache نیستند. همان سند در خطوط 124 و 144 رفتار request-time و محدودیت `use cache` در body را مشخص می‌کند.
- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/cookies.md:6-8,67-82` نشان می‌دهد `cookies()` async و request-time است و write cookie باید در Route Handler یا Server Function انجام شود.
- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/unstable_cache.md:8-10,35-46` استفاده‌ی فعلی از `unstable_cache` را توضیح می‌دهد و مهاجرت آینده به Cache Components/`use cache` را توصیه می‌کند؛ این مهاجرت بخشی از Phase 0 نیست.

### 3.2. PocketBase schema و drift

- `scripts/setup-collections.mjs:28-37` اگر collection وجود داشته باشد آن را بدون مقایسه یا update schema برمی‌گرداند؛ بنابراین این script migration یا drift detector نیست.
- `scripts/setup-collections.mjs:40-65` schema عمومی `articles` را می‌سازد؛ published articleها list/view عمومی‌اند.
- `scripts/setup-collections.mjs:67-82` فقط فیلدهای گمشده‌ی `users` را اضافه می‌کند و migration معکوس یا validation کامل ندارد.
- `scripts/setup-collections.mjs:84-115` `bookmarks` و `comments` را تعریف می‌کند. bookmark index یکتای `(user, article)` دارد؛ comment با statusهای `pending/approved/rejected` تعریف شده است.
- `scripts/setup-collections.mjs:117-131` فقط `reading_history(user, article, progress)` را تعریف می‌کند، اما index یکتای `(user, article)` ندارد.
- `src/lib/pb-types.ts:8-19,160-165,211-234` فقط collection `reading_history` و type آن را می‌شناسد؛ collection یا type به نام `history` وجود ندارد.
- `src/lib/pb-types.ts:181-195` فیلد `name` را در users نشان می‌دهد که در setup script تعریف نشده است. این یک نشانه‌ی drift یا provenance متفاوت typegen است، نه مدرک schema production.
- در آغاز audit، هیچ `pb_migrations/`، `pb_hooks/`، schema export یا migration versioned در repository وجود نداشت. حین کنترل نهایی، artifactهای untracked هم‌زمان ظاهر شدند؛ وضعیت و ناسازگاری آن‌ها در بخش 3.12 ثبت شده است. schema export و مدرک اجرای production همچنان وجود ندارد.

**نتیجه:** repository دو artifact غیرهم‌ارز دارد: setup script و snapshot تولیدشده‌ی typeها. هیچ‌کدام جای export واقعی production را نمی‌گیرد.

### 3.3. `history` در برابر `reading_history`

- `src/app/api/history/route.ts:16-27` روی collection ناموجود در setup/typeها به نام `history` upsert می‌کند و فیلد `last_read` می‌نویسد.
- `src/app/api/history/route.ts:45-50` حذف history را نیز از همان collection انجام می‌دهد.
- `src/app/history/page.tsx:28-44` collection `history` را query می‌کند ولی result را به `ReadingHistoryResponse` cast کرده و `last_read` را با cast ثانویه می‌خواند.
- `src/components/ReadingTracker.tsx:14-22` فقط در mount صفحه و فقط برای کاربر loginشده یک POST با `{articleId}` می‌فرستد.
- `src/app/article/[slug]/page.tsx:259-269` tracker را بعد از body مقاله render می‌کند، اما render location به معنای tracking viewport نیست؛ component خروجی `null` دارد.

**نتیجه:** وضعیت production یکی از این حالات است و repo آن را تعیین نمی‌کند:

1. `history` دستی در production ساخته شده است؛
2. production با setup script همگام نیست؛
3. route فعلی در محیط تازه شکست می‌خورد؛
4. هر دو collection با داده‌های متفاوت وجود دارند.

RFC هیچ‌کدام را فرض نمی‌کند؛ migration با union هر دو منبع طراحی شده است.

### 3.4. ReadingTracker و view tracking

- `ReadingTracker` هیچ scroll depth، active time، visibility، focus، viewport intersection، reading session یا idempotency key ندارد (`src/components/ReadingTracker.tsx:1-25`).
- `src/components/ViewTracker.tsx:12-29` یک view را فقط با `sessionStorage` در همان tab/session deduplicate و بلافاصله POST می‌کند.
- `src/app/api/views/route.ts:20-52` در هر درخواست با credential superuser به PocketBase وارد می‌شود و مقدار views را به شکل read-modify-write افزایش می‌دهد.
- endpoint views rate limit، actor، impression context یا atomic increment ندارد و client می‌تواند `articleId` را تکرار کند (`src/app/api/views/route.ts:5-65`). این view تجمعی نباید به‌عنوان سیگنال قابل‌اعتماد user taste استفاده شود.

### 3.5. Bookmark، comment و share

- bookmark route هویت را از auth server می‌گیرد و فقط `articleId` از client می‌پذیرد (`src/app/api/bookmarks/route.ts:6-23,27-44`). این trust boundary برای userId درست است.
- bookmark client هیچ request/impression/reading context ارسال نمی‌کند (`src/components/BookmarkButton.tsx:20-35`).
- comment route user را از auth server می‌گیرد و comment را با status `pending` می‌سازد (`src/app/api/comments/route.ts:5-29`).
- comment route فیلد `autodate` را می‌نویسد (`src/app/api/comments/route.ts:19-28`)، ولی این فیلد در setup یا generated type دیده نمی‌شود؛ این نیز schema gap است.
- comment client فقط `{articleId, body}` می‌فرستد و attribution ندارد (`src/components/CommentsSection.tsx:45-65`).
- share صرفاً clipboard copy است و هیچ API یا event ندارد (`src/components/ShareButton.tsx:6-17`). «کپی موفق» اثبات share به شخص دیگر نیست و در taxonomy با `share_copy` نام‌گذاری می‌شود.

### 3.6. پیشنهادها، pagination و context

- `src/app/api/recommended/route.ts:5-29` فقط کاربر auth collection `users` را می‌پذیرد، `offset` و `limit` را بدون range validation parse می‌کند و بدون interests خروجی خالی می‌دهد.
- `src/app/api/recommended/route.ts:31-34` `hasMore` را صرفاً با `articles.length === limit` محاسبه می‌کند؛ اگر pool دقیقاً در مرز تمام شود یک درخواست اضافه ایجاد می‌شود.
- `src/lib/articles-server.ts:204-249` برای هر category دوازده مقاله‌ی جدید می‌گیرد و round-robin می‌کند.
- `src/lib/articles-server.ts:251-258` pagination فعلی `slice(offset, offset + limit)` روی همان pool است.
- `src/components/ForYouClient.tsx:12-33` offset را برابر تعداد itemهای client می‌فرستد و itemها را append می‌کند.
- `src/app/for-you/page.tsx:15-28,53-77` فقط برای authenticated user دارای interests feed می‌سازد؛ user بدون interests empty state می‌گیرد.
- `src/app/page.tsx:220-235,301-317` همین recommendation را برای carousel صفحه‌ی اصلی استفاده می‌کند.
- `src/components/SecondaryCard.tsx:16-21` فقط Article می‌گیرد و link آن request id، rank، reason یا impression context ندارد.
- هیچ reference واقعی به `request_id`، `algorithm_version`، `reason_code`، impression، cursor، snapshot یا `not_interested` در application code وجود ندارد.

### 3.7. cacheهای مرتبط

- `src/lib/articles-server.ts:80-90,92-117,132-147` داده‌های عمومی home/article/category/related را با `unstable_cache` cache می‌کند.
- `src/lib/articles-server.ts:207-248` pool عمومی recommendation را برای ۶۰ ثانیه cache می‌کند؛ interests هم در key parts و هم argument تابع cache حضور دارد.
- ranking user-specific فعلی وجود ندارد؛ فقط pool دسته‌ها cache می‌شود.
- `src/app/page.tsx:50-60` و `src/app/layout.tsx:93-106` از React `cache()` برای memoization خواندن user در render استفاده می‌کنند؛ این جای feed snapshot نیست.
- `/api/recommended` explicit static caching ندارد و request URL/cookie مصرف می‌کند؛ با رفتار Next.js 16.2.11 یک Route Handler request-time است.

**تصمیم cache:** candidateهای عمومی می‌توانند cache شوند؛ actor profile، snapshot و ranking نهایی هرگز در cache مشترک بدون actor-bound key قرار نمی‌گیرند.

### 3.8. احراز هویت و anonymous session

- `src/lib/pocketbase.ts:4-18` برای هر call instance تازه‌ی PocketBase می‌سازد که از نشت auth بین requestها جلوگیری می‌کند.
- `src/lib/auth-cookies.ts:12-30` cookie `pb_auth` را JSON parse و `{token, record}` را بدون `authRefresh()` در authStore ذخیره می‌کند؛ comment فایل ادعای refresh دارد ولی implementation ندارد.
- login cookie را به‌شکل JSON `{token, record}` می‌نویسد (`src/app/api/auth/login/route.ts:14-25`).
- register cookie را فقط به‌شکل raw token می‌نویسد (`src/app/api/auth/register/route.ts:26-34`) و با parser فعلی ناسازگار است.
- Google callback دوباره قرارداد JSON را استفاده می‌کند (`src/app/api/auth/google/callback/route.ts:33-47`).
- endpoint `set-cookie` یک export کامل cookie را داخل value کوکی دیگری قرار می‌دهد (`src/app/api/auth/set-cookie/route.ts:21-33`)؛ با parser مرکزی قرارداد واحدی ندارد.
- هیچ anonymous actor cookie، session contract یا consent state در codebase وجود ندارد.

**نتیجه:** قبل از event ingestion، auth cookie serialization باید یک قرارداد واحد و تست‌شده داشته باشد. این RFC شکل آن fix را تعیین می‌کند، اما آن را پیاده نمی‌کند.

### 3.9. privacy و consent فعلی

- privacy page می‌گوید برای مهمان «هیچ داده‌ی شخصی ذخیره نمی‌شود» و views تجمیعی/بدون شناسایی است (`src/app/privacy/page.tsx:33-40`).
- همان صفحه فقط cookieهای auth/preferences/analytics را به‌صورت کلی ذکر می‌کند (`src/app/privacy/page.tsx:43-58`).
- UI یا API برای behavioral personalization consent، خاموش‌کردن personalization، reset/export/delete profile یا retention وجود ندارد.

ذخیره‌ی actor پایدار anonymous بدون به‌روزرسانی policy و consent با متن فعلی سازگار نیست.

### 3.10. n8n، Gemini و production artifacts

- scan کامل repository به‌جز کلمه‌ی `gemini` در keyword یک category، هیچ workflow، webhook contract، prompt، model id، output schema، retry policy یا export مربوط به n8n/Gemini نشان نداد.
- schema واقعی production PocketBase، نسخه‌ی binary، row counts، backup policy و deployment topology در repo نیست.
- scriptهای `migrate-sanity.mjs` و `seed-articles.mjs` فقط ingest مقاله‌اند و قرارداد n8n/Gemini نیستند.

**Gap قطعی:** تصمیم‌های Phase 1 درباره‌ی model/prompt/dimension تا دریافت artifactهای بخش Unknowns نباید قطعی یا اجرا شوند.

### 3.11. tests فعلی

- فقط `src/lib/articles.test.ts` و `src/lib/categories.test.ts` وجود دارند.
- برای auth، history، API routes، schema drift، event validation، pagination و migration test موجود نیست.

### 3.12. تغییرات هم‌زمان و untracked هنگام پایان audit

در شروع این task، `git status` تمیز و scan migration خالی بود. هنگام کنترل نهایی، بین ساعت 22:05:36 و 22:07:40 به وقت workspace، فایل‌های untracked زیر توسط یک فرایند/کار دیگر در همان worktree ظاهر شدند. provenance آن‌ها از repository قابل تشخیص نیست و این task آن‌ها را ایجاد یا ویرایش نکرده است:

```text
pb_migrations/202608110001_bootstrap_core_schema.js
pb_migrations/202608110002_migrate_legacy_history.js
pb_migrations/202608110003_create_recommendation_events.js
src/app/api/recommendation-events/route.ts
src/lib/pocketbase-admin.ts
src/lib/rate-limit.ts
src/lib/recommender/contracts.ts
src/lib/recommender/event-service.ts
src/lib/recommender/pocketbase-repository.ts
src/lib/recommender/validation.ts
src/lib/history/history-service.ts
src/lib/pocketbase-id.ts
src/lib/views/view-service.ts
src/app/api/history/route.ts (modified)
src/app/history/page.tsx (modified)
src/app/api/views/route.ts (modified)
src/components/ViewTracker.tsx (modified)
src/lib/recommendations/baseline.ts
src/app/api/recommended/route.ts (modified)
src/app/for-you/page.tsx (modified)
src/app/page.tsx (modified)
src/components/ForYouClient.tsx (modified)
src/components/RecommendedCarousel.tsx (modified)
src/lib/articles-server.ts (modified)
scripts/setup-collections.mjs (modified while audit was active)
src/lib/pb-types.ts (modified while audit was active)
```

این snapshot جدید read-only audit شد و با قرارداد این RFC سازگار نیست:

- bootstrap فقط `progress` و `last_read` را به `reading_history` اضافه می‌کند و index یکتای `(user,article)` یا schema canonical بخش 8 را نمی‌سازد (`pb_migrations/202608110001_bootstrap_core_schema.js:182-213`).
- backfill رکوردهای بدون user/article را silently skip می‌کند، export/checksum/quarantine/dry-run ندارد و collection target را هنگام migration مستقیم mutate می‌کند (`pb_migrations/202608110002_migrate_legacy_history.js:23-58`). rollback آن فقط comment است (`:60-62`).
- event migration فقط authenticated `userId` و article required دارد، anonymous actor را پشتیبانی نمی‌کند و فیلدهای request/impression/snapshot/consent/payload قرارداد این RFC را ندارد (`pb_migrations/202608110003_create_recommendation_events.js:15-52,83-97`).
- route جدید فقط authenticated user را می‌پذیرد و client اجازه دارد `surface`, `feedId`, `rank`, `algorithmVersion` و `reasonCode` را تعیین کند (`src/app/api/recommendation-events/route.ts:10-29`, `src/lib/recommender/validation.ts:21-33,74-94,127-142`). این خلاف server-authoritative attribution است.
- rate limiter جدید in-memory و process-local است (`src/lib/rate-limit.ts:12-62`) و در چند instance مشترک نیست؛ default این RFC تا روشن‌شدن topology باید به‌عنوان best-effort محلی شناخته شود، نه کنترل abuse قطعی.
- admin helper در هر ingest با credential superuser login می‌کند (`src/lib/pocketbase-admin.ts:10-19`)؛ RFC client مرکزی server-only و تصمیم deploy مشخص می‌خواهد.
- تغییر هم‌زمان history، runtime را از `history` به read union و canonical-first write تغییر می‌دهد (`src/lib/history/history-service.ts:51-97`, `src/app/api/history/route.ts:1-29`). fallback روی **هر** error انجام می‌شود، بنابراین network/permission/schema error از «collection وجود ندارد» تفکیک نمی‌شود؛ این رفتار بدون test/migration gate پذیرفته نیست.
- delete هم‌زمان تلاش می‌کند از هر دو collection حذف کند و error هر collection را swallow می‌کند (`src/lib/history/history-service.ts:99-128`). این تغییر رفتاری خارج از scope فعلی کاربر است و این RFC آن را تأیید نمی‌کند.
- تغییر هم‌زمان views، counter را atomic و dedupe/rate-limit را process-local کرده است (`src/lib/views/view-service.ts:25-49,68-76`). visitor key از IP و user-agent hash می‌شود و در نبود secret اختصاصی به admin email یا literal fallback متکی است (`src/app/api/views/route.ts:18-22`, `src/lib/views/view-service.ts:52-65`). این contract نیازمند privacy/secret/topology review است و recommendation evidence محسوب نمی‌شود.
- تغییر هم‌زمان recommendation فقط `feedId` و algorithm label به offset API اضافه کرده و همچنان snapshot/cursor ندارد؛ `feedId` client-provided پذیرفته می‌شود، `hasMore` هنوز با طول page محاسبه می‌شود و rank/reason/context per item ساخته نشده است (`src/app/api/recommended/route.ts:19-49`, `src/components/ForYouClient.tsx:21-32`). این implementation معادل feed contract بخش 20 نیست.
- baseline هم‌زمان فقط round-robin را extract و algorithm string ثابت می‌کند (`src/lib/recommendations/baseline.ts:1-25`). config hash immutable، snapshot، impression token یا stable item contract ندارد.

در آخرین snapshot audit، `scripts/setup-collections.mjs` و `src/lib/pb-types.ts` نیز هم‌زمان modified شدند و فرایند هنوز worktree را تغییر می‌داد. بنابراین مبنای قابل‌تکرار این RFC همان commit ثبت‌شده در header است؛ بخش 3.12 فقط تغییرات هم‌زمان مشاهده‌شده را quarantine می‌کند. **پیش از اجرای مرحله‌ی بعد باید audit از HEAD/working tree تثبیت‌شده دوباره انجام شود.**

**Gate:** این فایل‌های هم‌زمان نباید به‌عنوان اجرای پذیرفته‌شده‌ی Phase 0 یا مبنای production migration در نظر گرفته شوند تا owner آن‌ها، provenance، tests و reconciliation با این RFC مشخص شود. این RFC آن‌ها را حذف یا اصلاح نمی‌کند تا تغییرات احتمالی کاربر حفظ شوند.

## 4. Decisions

| ID | تصمیم | Default برگشت‌پذیر | دلیل کوتاه |
|---|---|---|---|
| D-001 | collection canonical تاریخچه `reading_history` است | بله | با setup و generated types هم‌نام است و نام هدف را دقیق‌تر بیان می‌کند. |
| D-002 | `history` تا ۳۰ روز پس از cutover read-only نگه داشته می‌شود | بله | rollback و reconciliation بدون حذف داده. |
| D-003 | event log خصوصی، append-only و server-written است | بله | جلوگیری از جعل user/rank/reason و امکان replay. |
| D-004 | private collectionها API rule عمومی ندارند (`null`) | بله | client مستقیم نباید evidence یا profile بسازد. |
| D-005 | MVP با PocketBase و Next Route Handler اجرا می‌شود | بله | مقیاس فعلی زیرساخت اضافه را توجیه نمی‌کند. |
| D-006 | pagination آینده feed snapshot + HMAC cursor است | بله | ترتیب ثابت، attribution دقیق و جلوگیری از duplicate/gap. |
| D-007 | snapshot مصرفی ۳۰ دقیقه معتبر و ۷ روز نگهداری می‌شود | بله، config | تعادل UX pagination و debug/analytics. |
| D-008 | impression viewable برابر ۵۰٪ کارت برای ۱۰۰۰ms پیوسته است | بله، config | render ساده را حذف و معیار قابل‌آزمایش می‌سازد. |
| D-009 | explicit interaction روی کارت نیز exposure معتبر می‌سازد | بله | open/not-interested اثبات می‌کند کاربر کارت را دیده، حتی اگر ۱ ثانیه کامل نشده باشد. |
| D-010 | event idempotency با key یکتای server-derived اعمال می‌شود | بله | retry امن و at-least-once delivery بدون double count. |
| D-011 | actor anonymous فقط بعد از opt-in پایدار می‌شود | بله | تطابق با privacy-by-default و policy فعلی. |
| D-012 | anonymous data هنگام login merge نمی‌شود و cookie rotate می‌شود | بله | جلوگیری از اتصال پنهان هویت‌ها. |
| D-013 | existing authenticated users در mode `explicit_only` شروع می‌کنند | بله | رفتار interests حفظ می‌شود ولی behavioral inference بدون consent فعال نمی‌شود. |
| D-014 | raw recommendation events برای ۱۸۰ روز نگه‌داری می‌شوند | بله، config/policy | برای evaluation زمانی کافی و از نگهداری نامحدود جلوگیری می‌کند. |
| D-015 | taxonomy/registry در MVP فایل JSON versioned داخل repo است | بله | ساده، reviewable و بدون سرویس تازه. |
| D-016 | topic آزاد model مستقیماً canonical topic نمی‌شود | بله | جلوگیری از آشفتگی alias و drift. |
| D-017 | embedding در `article_features` خصوصی و nullable است | بله | Phase 0 بدون embedding deploy می‌شود و مدل public article سبک می‌ماند. |
| D-018 | dimension از پاسخ provider ثبت و validate می‌شود، hardcode نمی‌شود | بله | artifact واقعی model در repo نیست و dimension می‌تواند تغییر کند. |
| D-019 | algorithm version شامل config hash immutable است | بله | هر impression به رفتار دقیق ranker قابل انتساب می‌شود. |
| D-020 | رخداد جانبی recommendation نباید موفقیت bookmark/comment را fail کند | بله | telemetry failure نباید mutation اصلی کاربر را خراب کند. |
| D-021 | `offset` در API جدید پذیرفته نمی‌شود؛ فقط cursor | بله | جلوگیری از drift صفحه‌ها. |
| D-022 | Kafka/vector DB در MVP ممنوع است مگر thresholdهای بخش 20 رد شوند | بله | پیچیدگی زودهنگام حذف می‌شود و مسیر مهاجرت باز می‌ماند. |

## 5. Assumptions

این موارد assumption اجرایی‌اند و باید در preflight تأیید شوند؛ RFC بر اساس آن‌ها schema production را جعل نمی‌کند:

- ID مقاله و user در PocketBase پایدار است.
- زمان canonical همه‌ی recordها UTC/ISO-8601 است و نمایش locale فقط در UI انجام می‌شود.
- PocketBase production از fieldهای `json`, `relation`, `select`, `date`, `number`, `bool` و indexهای SQLite پشتیبانی می‌کند؛ exact server version باید قبل از migration ثبت شود.
- یک secret manager برای `ANON_ACTOR_HMAC_KEY` و `RECOMMENDATION_CONTEXT_HMAC_KEY` در محیط deploy وجود دارد یا فراهم می‌شود.
- article body برای محاسبه‌ی content hash قابل دسترس server-side است.
- endpointهای Next.js و PocketBase از یک origin policy مشخص قابل فراخوانی‌اند.
- owner محصول defaultهای consent/retention را قبل از فعال‌سازی runtime تأیید می‌کند؛ نبود تأیید مانع ساخت schema خصوصی نیست ولی مانع collection رفتاری production است.

## 6. Unknowns و artifact لازم

| Unknown واقعی | چرا از repo قابل استنتاج نیست | artifact لازم برای قطعی‌شدن |
|---|---|---|
| schema و داده‌ی production PocketBase | setup و typegen provenance ندارند | export sanitized همه‌ی collections شامل fields/rules/indexes، خروجی `pocketbase --version`، row count و duplicate/orphan report برای `history` و `reading_history` |
| محل و روش deploy/migration PocketBase | binary/deployment repo اینجا نیست | آدرس repository یا artifact deploy، روش backup/restore و دسترسی staging |
| workflowهای n8n | هیچ export/contract در repo نیست | export sanitized JSON هر workflow، trigger/schedule، sample input/output، retry/error path و نام credentialها بدون secret |
| قرارداد فعلی Gemini | model/prompt/provider log موجود نیست | model ID دقیق، API/SDK، promptها، JSON output نمونه، quota، retention/data-region setting |
| ظرفیت و topology واقعی | DAU/QPS و single/multi instance مشخص نیست | p50/p95/peak feed requests، article opens، events/sec، Vercel/PB topology و محدودیت storage |
| چارچوب حقوقی و متن consent | jurisdiction و policy approval معلوم نیست | تصمیم owner/legal درباره‌ی opt-in، retention، سن consent و متن policy |
| مالک editorial taxonomy/entity | روند review مشخص نیست | owner، SLA review و منبع seed taxonomy/entity aliases |

این هفت مورد تنها blockerهای واقعی‌اند. تعیین owner/provenance و reconcileکردن فایل‌های هم‌زمان بخش 3.12 زیر Unknownهای اول و دوم قرار می‌گیرد، نه یک فرض تازه. defaultهای این RFC اجازه‌ی ساخت کد و test در local/staging را می‌دهند؛ سه مورد اول برای migration production الزامی‌اند.

## 7. Out of Scope

- فراخوانی embedding یا Gemini و backfill محتوایی
- ساخت clustering، user taste builder یا session intent runtime
- candidate generation معنایی، ANN، vector DB یا ranker
- MMR، exploration فعال یا explanation UI
- تغییر فعلی carousel، `/for-you` یا رفتار user-facing
- A/B test فعال و dashboard production
- Kafka، queue خارجی، warehouse یا streaming platform
- حذف collection legacy `history` در همان release cutover
- تغییر `views` counter مگر در task مستقل امنیت/atomicity

## 8. Canonical schema برای history

### 8.1. انتخاب

نام canonical: `reading_history`.

این collection یک **نمای materialized و user-facing از سابقه‌ی مطالعه** است، نه evidence قابل‌اعتماد ranker. profile builder در آینده از `recommendation_events` می‌خواند. بنابراین حتی اگر user بتواند history خودش را حذف کند، event policy و personalization reset مسیرهای مستقل و شفاف دارند.

### 8.2. schema نهایی `reading_history`

PocketBase system fields یعنی `id`, `created`, `updated` خودکارند.

| Field | PB type | Required | Default | Validation / معنا | Index |
|---|---|---:|---|---|---|
| `user` | relation -> `users`, maxSelect=1 | yes | — | owner رکورد | unique composite + actor sort |
| `article` | relation -> `articles`, maxSelect=1 | yes | — | مقاله‌ی موجود | unique composite + article lookup |
| `first_opened_at` | date | yes بعد از backfill | server now | اولین زمان قابل‌اثبات | — |
| `last_opened_at` | date | yes بعد از backfill | server now | آخرین open معتبر | `(user,last_opened_at DESC)` |
| `open_count` | number, integer, min=1 | yes | `1` | count از زمان cutover؛ legacy فقط lower bound است | — |
| `max_progress` | number, min=0,max=100 | yes | `0` | بیشترین scroll progress معتبر | — |
| `total_engaged_seconds` | number, integer,min=0 | yes | `0` | جمع active seconds معتبر | — |
| `last_engaged_at` | date | no | `null` | آخرین session دارای engagement | — |
| `completed_at` | date | no | `null` | اولین completion معتبر | — |
| `last_reading_session_id` | text,max=64 | no | `null` | UUID session اخیر، نه actor ID | — |
| `history_schema_version` | text,max=32 | yes | `reading-history/v2` | قرارداد writer | — |
| `migration_sources` | json,max=8KB | yes | `[]` | فقط شناسه و collection منبع برای audit | — |
| `progress` | number | no، deprecated | مقدار legacy | فقط دوره‌ی rollback؛ writer جدید استفاده نمی‌کند | — |

Indexes:

```sql
CREATE UNIQUE INDEX idx_reading_history_user_article
ON reading_history (user, article);

CREATE INDEX idx_reading_history_user_last_opened
ON reading_history (user, last_opened_at DESC);

CREATE INDEX idx_reading_history_article
ON reading_history (article);
```

API rules در دوره‌ی compatibility:

```text
listRule:   @request.auth.id = user.id
viewRule:   @request.auth.id = user.id
createRule: @request.auth.id = user.id
updateRule: @request.auth.id = user.id
deleteRule: @request.auth.id = user.id
```

Writer رسمی باید Next BFF باشد؛ owner rules موقتاً compatibility را حفظ می‌کند. ranker هرگز `reading_history` را evidence امن فرض نمی‌کند.

## 9. Migration و backfill بدون حذف داده

### 9.1. Preflight اجباری

قبل از هر write به production:

1. exact PocketBase version و checksum binary ثبت شود.
2. backup کامل database و file storage گرفته و restore آن در staging تمرین شود.
3. schema export برای `history`, `reading_history`, `users`, `articles` ثبت شود.
4. برای هر source این گزارش تولید شود: row count، unique `(user,article)`، duplicate count، orphan user/article، null/invalid date، distribution `progress`، min/max timestamp.
5. writerهای خارج از repo که به هر دو collection می‌نویسند شناسایی شوند.
6. migration در staging روی clone داده اجرا و reconciliation report امضا شود.

### 9.2. ترتیب migration

1. اگر `reading_history` وجود ندارد، آن را با schema بخش 8 بسازید. اگر وجود دارد، fieldهای جدید را **فقط add** کنید؛ در این مرحله هیچ field حذف یا rename نشود.
2. required بودن `first_opened_at` و `last_opened_at` تا پایان backfill موقتاً false باشد.
3. export immutable از هر دو source با checksum نگه دارید.
4. union رکوردهای `history` و `reading_history` را بر کلید `(user,article)` group کنید.
5. mapping deterministic زیر را اعمال کنید:
   - `first_opened_at = min(valid source.created)`
   - `last_opened_at = max(history.last_read, source.updated, source.created)` فقط میان تاریخ‌های معتبر
   - `max_progress = max(reading_history.max_progress, reading_history.progress)` فقط پس از تأیید scale در preflight
   - `open_count = max(1, تعداد source rowها)` و در report با عنوان **legacy lower bound** ثبت شود؛ API قدیمی openهای تکراری را از قبل از دست داده است.
   - `migration_sources = [{collection,id,created,updated}]`
6. رکورد orphan یا value خارج از range silently drop/clamp نشود؛ raw record در export و quarantine report باقی بماند و migration برای آن pair fail/skip صریح بدهد.
7. upsert target باید idempotent باشد: اجرای دوباره نتیجه‌ی یکسان و row count یکسان بدهد.
8. پس از dedupe، unique index ساخته شود. اگر index fail شد، cutover متوقف می‌شود.
9. reconciliation: تعداد pairهای target باید برابر union unique pairها باشد؛ برای هر pair checksum mapping با source مقایسه شود.
10. compatibility release موقت، write را به canonical و legacy dual-write می‌کند و read با feature flag `READING_HISTORY_SOURCE=reading_history|history` قابل برگشت است.
11. پس از حداقل ۷ روز و صفر mismatch، read canonical می‌شود؛ legacy ruleها read-only می‌شوند.
12. `history` و deprecated `progress` حداقل ۳۰ روز نگه داشته می‌شوند. حذف آن‌ها RFC/approval جدا و backup قابل restore می‌خواهد.

### 9.3. چیزی که backfill نمی‌تواند بازسازی کند

API فعلی یک row را upsert می‌کند و فقط `last_read` را نگه می‌دارد. تعداد واقعی openهای گذشته، active time، impression origin و scroll واقعی وجود ندارد. migration نباید این داده‌ها را تخمین بزند یا جعل کند.

### 9.4. Rollback plan

- قبل از cutover: migration additive است؛ rollback یعنی stop writer و استفاده از sourceهای قبلی. field/collection جدید حذف نمی‌شود.
- پس از dual-write: feature flag read را به `history` برمی‌گرداند؛ delta target برای replay نگه داشته می‌شود.
- اگر corruption مشاهده شد: writeها متوقف، backup staging-verified restore و reconciliation دوباره اجرا می‌شود.
- legacy تا پایان window حذف نمی‌شود، بنابراین rollback به restore فوری وابسته نیست.
- rollback هیچ event/profile جدید را به legacy history تبدیل نمی‌کند؛ فقط behavior فعلی تاریخچه را حفظ می‌کند.

## 10. Actor و trust model

```ts
export type ActorContext =
  | {
      actorType: 'user';
      actorKey: `user:${string}`; // server-derived PocketBase user id
      userId: string;
      mode: 'off' | 'explicit_only' | 'behavioral';
    }
  | {
      actorType: 'anonymous';
      actorKey: `anon:${string}`; // HMAC-SHA256(raw anonymous cookie)
      userId: null;
      mode: 'off' | 'behavioral';
    };
```

قواعد:

- client هرگز `actorKey` یا `userId` در payload نمی‌فرستد.
- user actor از auth cookie معتبر و refreshشده ساخته می‌شود.
- anonymous raw ID برابر ۳۲ byte random است و در cookie `fz_anon` با `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, `Max-Age=30d` قرار می‌گیرد.
- database فقط HMAC آن شناسه را می‌بیند. IP یا user-agent جزء actor key نیست.
- بدون consent، cookie پایدار ساخته نمی‌شود و behavioral event شخص‌محور ذخیره نمی‌شود.
- login/logout anonymous cookie را rotate می‌کند. هیچ row، profile یا affinity به user منتقل نمی‌شود.
- merge آینده فقط با UI و consent صریح و event audit جدا ممکن است؛ در MVP وجود ندارد.

## 11. schema دقیق `recommendation_events`

این collection خصوصی، append-only و evidence اصلی است.

| Field | PB type | Required | Default | Validation / منبع | Index |
|---|---|---:|---|---|---|
| `event_schema_version` | text,max=40 | yes | `recommendation-event/v1` | allowlist | — |
| `event_type` | select | yes | — | enum بخش 15 | `(event_type,occurred_at)` |
| `actor_type` | select `user,anonymous` | yes | — | server-derived | `(actor_key,occurred_at)` |
| `actor_key` | text,max=80 | yes | — | server-derived؛ هرگز public | `(actor_key,occurred_at)` |
| `user` | relation -> users,max=1 | no | `null` | فقط actor user | `(user,occurred_at)` |
| `article` | relation -> articles,max=1 | conditional | `null` | برای event مقاله‌ای required | `(article,event_type,occurred_at)` |
| `target_type` | select `article,topic,entity,source,profile,consent` | no | `article` | برای preference/control | — |
| `target_key` | text,max=160 | no | `null` | canonical ID؛ نه label آزاد | — |
| `client_event_id` | text,max=64 | yes | — | UUID v4/v7 validated | — |
| `idempotency_key` | text,max=180 | yes | — | server-derived | **unique** |
| `session_id_hash` | text,max=80 | yes | — | server-derived browser/app session | `(session_id_hash,occurred_at)` |
| `reading_session_id` | text,max=64 | no | `null` | UUID client، shape validated | `(reading_session_id,occurred_at)` |
| `occurred_at` | date | yes | server receive time اگر غایب | client time فقط در skew مجاز | `(event_type,occurred_at)` |
| `received_at` | date | yes | server now | authoritative ingest time | — |
| `surface` | select | no | `null` | server از context | `(surface,occurred_at)` |
| `request_id` | text,max=64 | no | `null` | server از snapshot | `(request_id,rank)` |
| `feed_snapshot` | relation -> feed_snapshots,max=1 | no | `null` | server از context | — |
| `impression_id` | text,max=64 | no | `null` | instance item؛ event impression | index |
| `attributed_impression_id` | text,max=64 | no | `null` | downstream attribution | index |
| `rank` | number,integer,min=1,max=500 | no | `null` | server از snapshot | `(request_id,rank)` |
| `algorithm_version` | text,max=100 | no | `null` | server از snapshot | index |
| `reason_code` | select | no | `null` | server از snapshot | index |
| `attribution_status` | select | yes | `none` | enum زیر | index |
| `engaged_seconds` | number,integer,min=0,max=86400 | yes | `0` | cumulative validated | — |
| `max_progress` | number,min=0,max=100 | yes | `0` | cumulative validated | — |
| `consent_version` | text,max=40 | no | `null` | server preference snapshot | — |
| `payload` | json,max=2048 bytes | yes | `{}` | per-event allowlist؛ بدون body comment/PII | — |
| `trace_id` | text,max=64 | no | `null` | server observability | index |

Indexes:

```sql
CREATE UNIQUE INDEX idx_reco_events_idempotency
ON recommendation_events (idempotency_key);

CREATE INDEX idx_reco_events_actor_time
ON recommendation_events (actor_key, occurred_at DESC);

CREATE INDEX idx_reco_events_user_time
ON recommendation_events (user, occurred_at DESC);

CREATE INDEX idx_reco_events_article_type_time
ON recommendation_events (article, event_type, occurred_at DESC);

CREATE INDEX idx_reco_events_request_rank
ON recommendation_events (request_id, rank);

CREATE INDEX idx_reco_events_impression
ON recommendation_events (impression_id);

CREATE INDEX idx_reco_events_attributed_impression
ON recommendation_events (attributed_impression_id);

CREATE INDEX idx_reco_events_type_time
ON recommendation_events (event_type, occurred_at DESC);
```

API rules:

```text
listRule: null
viewRule: null
createRule: null
updateRule: null
deleteRule: null
```

فقط Next BFF با credential server-only می‌نویسد. application contract update را ممنوع می‌کند؛ delete فقط retention/privacy job است.

Invariantهای writer:

- actor user: `user != null` و `actor_key = user:<server user id>`.
- actor anonymous: `user = null` و `actor_key` از HMAC cookie.
- recommendation-attributed event باید context token معتبر داشته باشد؛ client fields جایگزین token نمی‌شوند.
- `rank`, `surface`, `request_id`, `algorithm_version`, `reason_code` با item snapshot برابرند.

## 12. schema دقیق `article_features`

| Field | PB type | Required | Default | Validation / معنا | Index |
|---|---|---:|---|---|---|
| `article` | relation -> articles,max=1 | yes | — | یک feature row برای هر مقاله | **unique** |
| `feature_schema_version` | text,max=40 | yes | `article-features/v1` | قرارداد row | — |
| `content_hash` | text,max=80 | yes | — | lowercase SHA-256 hex | index |
| `content_hash_algorithm` | text,max=32 | yes | `sha256` | allowlist | — |
| `normalizer_version` | text,max=40 | yes | `content-normalizer/v1` | immutable | index |
| `taxonomy_version` | text,max=40 | yes | `topics/v1` | repo artifact version | index |
| `entity_registry_version` | text,max=40 | yes | `entities/v1` | repo artifact version | — |
| `extractor_provider` | text,max=40 | no | `null` | Phase 1 | — |
| `extractor_model` | text,max=100 | no | `null` | exact provider model ID | — |
| `prompt_version` | text,max=80 | no | `null` | file/version + hash | index |
| `embedding_provider` | text,max=40 | no | `null` | Phase 1 | — |
| `embedding_model` | text,max=100 | no | `null` | exact model ID | index |
| `embedding_dimension` | number,integer,min=1,max=65536 | no | `null` | برابر length واقعی vector | — |
| `embedding_version` | text,max=160 | no | `null` | قرارداد بخش 19 | index |
| `embedding_normalized` | bool | yes | `false` | آیا L2-normalized است | — |
| `embedding` | json,max طبق dimension approved | no | `null` | array فقط پس از Phase 1 | — |
| `topic_ids` | json,max=8KB | yes | `[]` | string[] canonical و unique | — |
| `concepts` | json,max=8KB | yes | `[]` | free-form explainability | — |
| `entities` | json,max=16KB | yes | `[]` | canonical entity refs | — |
| `unresolved_entities` | json,max=8KB | yes | `[]` | نیازمند review؛ ranking hard affinity نمی‌گیرد | — |
| `content_type` | select | yes | `unknown` | `news,review,guide,analysis,comparison,opinion,unknown` | index |
| `depth` | select | yes | `unknown` | `brief,standard,deep,unknown` | — |
| `language` | text,max=12 | yes | `fa` | BCP-47 preferred | index |
| `quality_score` | number,min=0,max=1 | no | `null` | version-dependent؛ Phase 1 | — |
| `status` | select | yes | `pending` | `pending,processing,ready,partial,failed,stale` | `(status,updated)` |
| `generated_at` | date | no | `null` | آخرین خروجی موفق | — |
| `last_attempt_at` | date | no | `null` | آخرین attempt | index |
| `retry_count` | number,integer,min=0 | yes | `0` | bounded by worker policy | — |
| `error_code` | text,max=80 | no | `null` | code بدون raw provider payload/PII | index |

Indexes:

```sql
CREATE UNIQUE INDEX idx_article_features_article
ON article_features (article);

CREATE INDEX idx_article_features_status_updated
ON article_features (status, updated);

CREATE INDEX idx_article_features_content_hash
ON article_features (content_hash);

CREATE INDEX idx_article_features_embedding_version
ON article_features (embedding_version);
```

API rules همه `null` هستند. مقاله‌ی public هرگز embedding/topics internal را به‌طور ناخواسته برنمی‌گرداند.

## 13. schema دقیق `user_taste_profiles`

این collection materialized و rebuildable است؛ منبع consent نیست.

| Field | PB type | Required | Default | Validation / معنا | Index |
|---|---|---:|---|---|---|
| `actor_type` | select `user,anonymous` | yes | — | server-derived | — |
| `actor_key` | text,max=80 | yes | — | یک profile برای هر actor | **unique** |
| `user` | relation -> users,max=1 | no | `null` | فقط actor user | unique/index |
| `profile_schema_version` | text,max=40 | yes | `taste-profile/v1` | shape قرارداد | — |
| `builder_version` | text,max=100 | yes | `unbuilt/v0` | Phase 0 profile نمی‌سازد | index |
| `status` | select | yes | `uninitialized` | `uninitialized,building,ready,stale,failed,disabled` | `(status,updated)` |
| `positive_clusters` | json,max=64KB | yes | `[]` | حداکثر ۵ cluster در MVP آینده | — |
| `negative_clusters` | json,max=32KB | yes | `[]` | جدا از positive | — |
| `topic_affinities` | json,max=32KB | yes | `{}` | canonical topic -> score/evidence | — |
| `entity_affinities` | json,max=32KB | yes | `{}` | canonical entity -> score/evidence | — |
| `category_affinities` | json,max=8KB | yes | `{}` | category slug -> score/evidence | — |
| `source_affinities` | json,max=16KB | yes | `{}` | canonical source -> score/evidence | — |
| `format_affinities` | json,max=8KB | yes | `{}` | content_type -> score/evidence | — |
| `long_term_state` | json,max=32KB | yes | `{}` | builder-owned/versioned | — |
| `session_state` | json,max=16KB | yes | `{}` | short half-life state | — |
| `explicit_preferences` | json,max=16KB | yes | `{}` | snapshot؛ source of truth جای دیگر است | — |
| `evidence_count` | number,integer,min=0 | yes | `0` | effective evidence count | — |
| `strong_evidence_count` | number,integer,min=0 | yes | `0` | explicit/strong evidence | — |
| `confidence` | number,min=0,max=1 | yes | `0` | calibrated by builder version | index |
| `last_processed_event_at` | date | no | `null` | replay cursor pair | — |
| `last_processed_event_id` | text,max=32 | no | `null` | tie-breaker همان timestamp | — |
| `last_event_at` | date | no | `null` | freshness/expiry | index |
| `built_at` | date | no | `null` | آخرین build موفق | — |
| `expires_at` | date | no | `null` | anonymous inactivity cleanup | index |
| `error_code` | text,max=80 | no | `null` | last failure code | — |

Indexes:

```sql
CREATE UNIQUE INDEX idx_taste_profiles_actor
ON user_taste_profiles (actor_key);

CREATE UNIQUE INDEX idx_taste_profiles_user
ON user_taste_profiles (user);

CREATE INDEX idx_taste_profiles_status_updated
ON user_taste_profiles (status, updated);

CREATE INDEX idx_taste_profiles_expiry
ON user_taste_profiles (expires_at);
```

همه‌ی API rules `null` هستند. Phase 0 فقط row/schema `uninitialized` را ممکن می‌کند؛ profile builder در scope نیست.

نمونه‌ی shape آینده، بدون فعال‌سازی:

```json
{
  "profile_schema_version": "taste-profile/v1",
  "builder_version": "taste-builder/1.0.0+cfg.a13f09",
  "status": "ready",
  "positive_clusters": [
    {"cluster_id":"p1","centroid":[0.1,-0.2],"weight":0.74,"evidence":18}
  ],
  "negative_clusters": [],
  "topic_affinities": {
    "privacy": {"score":0.82,"evidence":12,"updated_at":"2026-08-11T10:00:00Z"}
  },
  "confidence": 0.61
}
```

اعداد vector نمونه و غیرواقعی‌اند؛ dimension/model تا Phase 1 تعیین نمی‌شود.

## 14. schema دقیق `feed_snapshots`

| Field | PB type | Required | Default | Validation / معنا | Index |
|---|---|---:|---|---|---|
| `actor_type` | select `user,anonymous` | yes | — | server-derived | — |
| `actor_key` | text,max=80 | yes | — | owner داخلی | `(actor_key,expires_at)` |
| `user` | relation -> users,max=1 | no | `null` | فقط actor user | index |
| `request_id` | text,max=64 | yes | — | server UUID v7 | **unique** |
| `surface` | select | yes | — | enum بخش 15 | `(surface,generated_at)` |
| `algorithm_version` | text,max=100 | yes | — | immutable config hash | index |
| `profile_version` | text,max=100 | no | `null` | builder version مصرف‌شده | — |
| `taxonomy_version` | text,max=40 | yes | `topics/v1` | feed context | — |
| `personalization_mode` | select | yes | — | `off,explicit_only,behavioral,cold_start` | index |
| `seed` | text,max=64 | yes | — | deterministic exploration seed | — |
| `items` | json,max=256KB | yes | `[]` | حداکثر ۲۰۰ `SnapshotItem` | — |
| `item_count` | number,integer,min=0,max=200 | yes | `0` | باید با items.length برابر باشد | — |
| `page_size` | number,integer,min=1,max=20 | yes | `10` | initial/default page | — |
| `cursor_version` | text,max=32 | yes | `feed-cursor/v1` | parser version | — |
| `snapshot_checksum` | text,max=80 | yes | — | SHA-256 canonical items/context | — |
| `generated_at` | date | yes | server now | creation time | — |
| `expires_at` | date | yes | `generated_at + 30m` | pagination validity | `(actor_key,expires_at)` |
| `retention_until` | date | yes | `generated_at + 7d` | cleanup | index |
| `status` | select | yes | `active` | `active,expired,invalidated` | `(status,retention_until)` |
| `trace_id` | text,max=64 | no | `null` | correlation | index |

```ts
export type SnapshotItem = {
  itemId: string;          // UUID v7، instance در این snapshot
  impressionId: string;    // UUID v7، instance exposure
  articleId: string;
  rank: number;            // 1-based و ثابت
  score: number | null;    // baseline می‌تواند null باشد
  reasonCode: ReasonCode;
  secondaryReasonCodes: ReasonCode[];
  exploration: boolean;
};
```

Indexes:

```sql
CREATE UNIQUE INDEX idx_feed_snapshots_request
ON feed_snapshots (request_id);

CREATE INDEX idx_feed_snapshots_actor_expiry
ON feed_snapshots (actor_key, expires_at DESC);

CREATE INDEX idx_feed_snapshots_status_retention
ON feed_snapshots (status, retention_until);
```

همه‌ی API rules `null` هستند.

## 15. قرارداد enumها، request context و reason

```ts
export type RecommendationSurface =
  | 'home_for_you'
  | 'for_you_feed'
  | 'article_related'
  | 'onboarding_preview';

export type AlgorithmVersion =
  `reco-${string}/${number}.${number}.${number}+cfg.${string}`;

export type ReasonCode =
  | 'explicit_category'
  | 'explicit_topic'
  | 'explicit_entity'
  | 'topic_affinity'
  | 'entity_affinity'
  | 'source_affinity'
  | 'semantic_cluster'
  | 'session_interest'
  | 'recent_high_quality'
  | 'trending_normalized'
  | 'popular_fallback'
  | 'exploration'
  | 'editorial'
  | 'non_personalized_fallback'
  | 'legacy_category_round_robin';

export type AttributionStatus =
  | 'none'
  | 'valid_impression'
  | 'interaction_confirmed'
  | 'context_without_impression'
  | 'direct'
  | 'expired';
```

- `request_id`: UUID v7 server-generated برای یک snapshot/feed refresh.
- `rank`: از ۱ شروع می‌شود و تا پایان snapshot ثابت است.
- `algorithm_version`: code version + hash config immutable؛ تغییر وزن یا rule، hash جدید می‌خواهد.
- `reason_code`: از feature واقعی winner تولید می‌شود؛ LLM اجازه ندارد بعداً دلیل بسازد.
- `surface`: caller-controlled string آزاد نیست؛ endpoint آن را از allowlist می‌پذیرد و در snapshot تثبیت می‌کند.

Baseline فعلی هنگام instrumentation باید با `reco-category-round-robin/1.0.0+cfg.<hash>` و reason `legacy_category_round_robin` شناخته شود.

## 16. Event taxonomy و payload

### 16.1. envelope client

```ts
export type ClientEventEnvelope<TType extends ClientEventType> = {
  schemaVersion: 'recommendation-event/v1';
  clientEventId: string;       // UUID v4/v7
  eventType: TType;
  occurredAt: string;          // ISO-8601؛ server محدودیت skew اعمال می‌کند
  articleId?: string;
  readingSessionId?: string;
  recommendationContext?: string; // opaque, signed, short-lived
  payload: ClientEventPayloadMap[TType];
};
```

client این fieldها را **نباید** بفرستد و اگر بفرستد request رد می‌شود: `userId`, `actorKey`, `rank`, `requestId`, `surface`, `algorithmVersion`, `reasonCode`, `consentVersion`.

### 16.2. taxonomy دقیق

| Event type | زمان تولید | payload client | شرط server | idempotency suffix |
|---|---|---|---|---|
| `recommendation_impression` | ۵۰٪/۱s یا interaction | `impressionId, visibleRatio, visibleMs, method` | token/snapshot/item match | `imp:<impressionId>` |
| `article_open` | article page hydrated یا تعامل link | `readingSessionId, navigationMethod` | article published؛ context optional | `open:<readingSessionId>` |
| `reading_progress` | milestoneهای 25/50/75/90 | `milestone,maxProgress,engagedSeconds` | monotonic و once/session | `read:<session>:progress:<milestone>` |
| `reading_engaged` | active time 15/45/90/180 و سپس هر 300s | `thresholdSeconds,engagedSeconds,maxProgress` | threshold crossed، monotonic | `read:<session>:engaged:<threshold>` |
| `reading_complete` | completion rule | `engagedSeconds,maxProgress,expectedReadSeconds` | server rule دوباره validate | `read:<session>:complete` |
| `reading_end` | pagehide/unmount | `engagedSeconds,maxProgress,endReason` | max یک event/session | `read:<session>:end` |
| `bookmark_add` | mutation موفق | `mutationId,readingSessionId?` | bookmark record واقعاً ایجاد شده | `bookmark:<recordId>:add` |
| `bookmark_remove` | mutation موفق | `mutationId,readingSessionId?` | delete موفق؛ toggleهای بعدی event جدید | `bookmark:<mutationId>:remove` |
| `comment_submit` | create موفق | `mutationId,readingSessionId?` | comment id server؛ body در event کپی نشود | `comment:<commentId>:submit` |
| `share_copy` | clipboard write موفق | `readingSessionId?` | outcome فقط copy است | `share:<clientEventId>:copy` |
| `share_complete` | Web Share promise resolve | `channel='web_share',readingSessionId?` | cancellation event مثبت نیست | `share:<clientEventId>:complete` |
| `not_interested` | اقدام روی card | `reason` | snapshot item match؛ explicit interaction exposure می‌سازد | `feedback:<itemId>:not_interested` |
| `feedback_undo` | undo موفق | `originalClientEventId` | original feedback owner match | `feedback:<itemId>:undo` |
| `follow_topic`/`unfollow_topic` | preference mutation | `topicId,mutationId` | canonical topic exists | `pref:<mutationId>` |
| `mute_topic`/`unmute_topic` | preference mutation | `topicId,mutationId,duration?` | canonical topic exists | `pref:<mutationId>` |
| `follow_entity`/`unfollow_entity` | preference mutation | `entityId,mutationId` | canonical entity exists | `pref:<mutationId>` |
| `mute_entity`/`unmute_entity` | preference mutation | `entityId,mutationId,duration?` | canonical entity exists | `pref:<mutationId>` |
| `personalization_consent` | consent change | `mode,policyVersion` | server stores preference first | `consent:<mutationId>` |
| `profile_reset` | reset کامل شد | `scope` | purge completed/queued | `reset:<mutationId>` |

```ts
type NotInterestedReason =
  | 'topic'
  | 'source'
  | 'duplicate'
  | 'already_seen'
  | 'too_shallow'
  | 'clickbait'
  | 'temporary'
  | 'similar_content';

export type ClientEventType =
  | 'recommendation_impression'
  | 'article_open'
  | 'reading_progress'
  | 'reading_engaged'
  | 'reading_complete'
  | 'reading_end'
  | 'bookmark_add'
  | 'bookmark_remove'
  | 'comment_submit'
  | 'share_copy'
  | 'share_complete'
  | 'not_interested'
  | 'feedback_undo'
  | 'follow_topic'
  | 'unfollow_topic'
  | 'mute_topic'
  | 'unmute_topic'
  | 'follow_entity'
  | 'unfollow_entity'
  | 'mute_entity'
  | 'unmute_entity'
  | 'personalization_consent'
  | 'profile_reset';

type MutationContext = {
  mutationId: string;
  readingSessionId?: string;
};

type PreferenceMutation = {
  mutationId: string;
};

type ClientEventPayloadMap = {
  recommendation_impression: {
    impressionId: string;
    visibleRatio: number;
    visibleMs: number;
    method: 'viewability' | 'interaction';
  };
  article_open: {
    readingSessionId: string;
    navigationMethod: 'link' | 'new_tab' | 'direct' | 'history';
  };
  reading_progress: {
    milestone: 25 | 50 | 75 | 90;
    maxProgress: number;
    engagedSeconds: number;
  };
  reading_engaged: {
    thresholdSeconds: 15 | 45 | 90 | 180 | number;
    engagedSeconds: number;
    maxProgress: number;
  };
  reading_complete: {
    engagedSeconds: number;
    maxProgress: number;
    expectedReadSeconds: number;
  };
  reading_end: {
    engagedSeconds: number;
    maxProgress: number;
    endReason: 'pagehide' | 'navigation' | 'unmount';
  };
  bookmark_add: MutationContext;
  bookmark_remove: MutationContext;
  comment_submit: MutationContext;
  share_copy: {
    readingSessionId?: string;
    channel: 'clipboard';
  };
  share_complete: {
    readingSessionId?: string;
    channel: 'web_share';
  };
  not_interested: { reason: NotInterestedReason };
  feedback_undo: { originalClientEventId: string };
  follow_topic: PreferenceMutation & { topicId: string };
  unfollow_topic: PreferenceMutation & { topicId: string };
  mute_topic: PreferenceMutation & {
    topicId: string;
    duration: '24h' | '7d' | '30d' | 'until_unmuted';
  };
  unmute_topic: PreferenceMutation & { topicId: string };
  follow_entity: PreferenceMutation & { entityId: string };
  unfollow_entity: PreferenceMutation & { entityId: string };
  mute_entity: PreferenceMutation & {
    entityId: string;
    duration: '24h' | '7d' | '30d' | 'until_unmuted';
  };
  unmute_entity: PreferenceMutation & { entityId: string };
  personalization_consent: PreferenceMutation & {
    mode: 'off' | 'explicit_only' | 'behavioral';
    analyticsEnabled: boolean;
    policyVersion: string;
  };
  profile_reset: PreferenceMutation & {
    scope: 'learned_profile' | 'all_personalization_data';
  };
};
```

برای `bookmark_*` و `comment_submit`، client record ID دیتابیس را تعیین نمی‌کند. route اصلی پس از mutation موفق، record ID واقعی را به event writer داخلی می‌دهد؛ `mutationId` فقط retry درخواست HTTP را idempotent می‌کند.

### 16.3. نمونه‌ی JSON impression

```json
{
  "schemaVersion": "recommendation-event/v1",
  "clientEventId": "0191f318-2d9c-7b12-8f1a-4c8bba57d1b8",
  "eventType": "recommendation_impression",
  "occurredAt": "2026-08-11T17:00:01.245Z",
  "articleId": "pb_article_id",
  "recommendationContext": "v1.opaque.signed-token",
  "payload": {
    "impressionId": "0191f318-0010-7d33-8100-49c1b228bce1",
    "visibleRatio": 0.67,
    "visibleMs": 1054,
    "method": "viewability"
  }
}
```

Response idempotent:

```json
{
  "accepted": true,
  "duplicate": false,
  "eventId": "pocketbase_record_id",
  "serverTime": "2026-08-11T17:00:01.410Z"
}
```

Retry همان payload باید `200` با `duplicate:true` بدهد، نه row دوم.

## 17. تعریف impression معتبر

### 17.1. مسیر viewability

یک card فقط وقتی impression است که همه‌ی این شروط هم‌زمان برقرار باشند:

1. `IntersectionObserver` حداقل `intersectionRatio >= 0.50` گزارش کند؛
2. این وضعیت حداقل ۱۰۰۰ms پیوسته بماند؛
3. `document.visibilityState === 'visible'`؛
4. `document.hasFocus() === true`؛
5. snapshot/context هنوز معتبر باشد؛
6. impression برای همان `impressionId` قبلاً پذیرفته نشده باشد.

خروج از هر شرط قبل از ۱۰۰۰ms timer را reset می‌کند. صرف SSR، hydration، DOM mount یا قرار گرفتن خارج viewport impression نیست.

### 17.2. مسیر interaction-confirmed

اگر user پیش از ۱ ثانیه روی `open`, `not_interested` یا «چرا این؟» اقدام کند، server به‌شکل idempotent ابتدا impression با `method=interaction` می‌سازد و سپس action را به آن نسبت می‌دهد. این مسیر render ساده را impression نمی‌کند؛ interaction انسانی exposure را اثبات می‌کند.

### 17.3. validation server

- signed context شامل `version,actorBinding,snapshotId,itemId,articleId,impressionId,rank,surface,algorithmVersion,expiresAt,keyId` است.
- token هیچ email/raw user id قابل‌خواندن ندارد و HMAC-SHA256 با key versioned امضا می‌شود.
- server snapshot item و actor binding را دوباره می‌خواند؛ client visible ratio به‌تنهایی قابل‌اعتماد نیست.
- ratio و time برای abuse detection ثبت می‌شوند، ولی attribution fields از snapshot می‌آیند.

## 18. engaged reading algorithm

### 18.1. reading session

- برای هر article page load یک UUID `readingSessionId` ساخته می‌شود.
- `article_open` یک‌بار پس از hydration و تأیید article ثبت می‌شود.
- reload session جدید است؛ یک tab برگشتی که page در bfcache حفظ شده است session قبلی را ادامه می‌دهد، مشروط به عدم `pagehide persisted=false`.

### 18.2. active-time state machine

timer با `performance.now()` کار می‌کند و هر ۱ ثانیه tick دارد. delta فقط وقتی جمع می‌شود که:

```text
document.visibilityState === "visible"
AND document.hasFocus() === true
AND articleBody.isIntersecting === true
AND now - lastUserActivityAt <= 30s
```

`lastUserActivityAt` با `scroll`, `pointerdown`, `keydown`, `touchstart` به‌روزرسانی می‌شود. برای جلوگیری از جهش timer پس از sleep، delta هر tick حداکثر ۲ ثانیه است. hidden/blur/off-viewport/idle زمان صفر می‌گیرند.

### 18.3. progress

progress نسبت به body مقاله، نه کل document، محاسبه می‌شود:

```ts
progress = clamp(
  ((viewportBottom - articleTop) / articleHeight) * 100,
  0,
  100,
);
maxProgress = Math.max(previousMaxProgress, progress);
```

milestoneهای `25,50,75,90` فقط یک‌بار در هر reading session ارسال می‌شوند. lazy-load/resize محاسبه را دوباره انجام می‌دهد ولی milestone قبلی تکرار نمی‌شود.

### 18.4. time milestones و completion

- `reading_engaged`: در ۱۵، ۴۵، ۹۰، ۱۸۰ ثانیه و سپس هر ۳۰۰ ثانیه active time.
- `expectedReadSeconds = max(30, article.readTime * 60)`؛ اگر readTime معتبر نیست، server از word count آینده یا default ۶۰ استفاده می‌کند و source را در payload internal ثبت می‌کند.
- `reading_complete` وقتی پذیرفته می‌شود که:

```text
maxProgress >= 90
AND engagedSeconds >= min(60, max(15, 0.25 * expectedReadSeconds))
```

- `reading_end` با `navigator.sendBeacon` یا `fetch(...,{keepalive:true})` و idempotency ارسال می‌شود. عدم رسیدن end event، milestoneهای قبلی را باطل نمی‌کند.

### 18.5. read quality مشتق‌شده

tracker score نهایی نمی‌سازد. builder آینده از داده‌ی versioned استفاده می‌کند:

```text
completionRatio = maxProgress / 100
timeRatio = min(1, engagedSeconds / expectedReadSeconds)
readQuality = 0.55 * completionRatio + 0.45 * timeRatio
```

وزن‌ها config و builder-versioned هستند و در Phase 0 فعال نمی‌شوند.

## 19. Attribution رخدادها

### 19.1. اصل

recommendation context opaque روی card/link حمل می‌شود. server فقط وقتی `attributed_impression_id` می‌گذارد که impression معتبر همان actor/article وجود داشته باشد یا explicit interaction همان request آن را ایجاد کند.

### 19.2. پنجره‌ها

| Event | attribution rule | window default |
|---|---|---|
| `article_open` | context همان snapshot item + impression معتبر | ۳۰ دقیقه از snapshot |
| reading events | همان `readingSessionId` که open attributed دارد | تا پایان session، حداکثر ۲۴ ساعت |
| bookmark/comment/share | reading session attributed؛ در نبود آن latest valid impression همان actor/article | ۲۴ ساعت |
| `not_interested` | همان snapshot item؛ interaction impression می‌سازد | تا expiry snapshot |
| follow/mute | اگر از «چرا این؟» یا card آمده context؛ در profile page attribution ندارد | ۳۰ دقیقه |

اگر context معتبر باشد ولی impression وجود نداشته و action هم exposure-confirming نباشد، event با `context_without_impression` ذخیره می‌شود و در CTR denominator یا attributed conversion وارد نمی‌شود.

### 19.3. mutationهای موجود

- Bookmark/comment mutation باید اول نتیجه‌ی اصلی را ثبت کند و سپس event را با ID واقعی record بسازد.
- اگر event write fail شود، mutation اصلی success باقی می‌ماند؛ structured log و retry idempotent اجرا می‌شود.
- comment body، email، display name یا clipboard content در recommendation event کپی نمی‌شود.
- `share_copy` فقط intent/clipboard success است و metric «confirmed external share» نام نمی‌گیرد.

## 20. Feed snapshot و cursor contract

### 20.1. endpoint آینده

همان path فعلی حفظ می‌شود:

```text
GET /api/recommended?surface=for_you_feed&limit=10
GET /api/recommended?cursor=<opaque-signed-cursor>&limit=10
```

- initial request snapshot می‌سازد.
- request بعدی فقط cursor می‌فرستد؛ `offset` و `surface` همراه cursor رد می‌شوند.
- `limit` عدد صحیح `1..20` و default `10` است.
- snapshot حداکثر ۲۰۰ item دارد.

```ts
export type RecommendedFeedResponse = {
  requestId: string;
  snapshotId: string;
  algorithmVersion: AlgorithmVersion;
  surface: RecommendationSurface;
  items: Array<{
    article: ArticlePublicDto;
    rank: number;
    reasonCode: ReasonCode;
    exploration: boolean;
    recommendationContext: string;
  }>;
  nextCursor: string | null;
  hasMore: boolean;
  expiresAt: string;
};
```

نمونه:

```json
{
  "requestId": "0191f3a5-2e88-7c02-a8fd-f0dc0353d6f1",
  "snapshotId": "pb_snapshot_id",
  "algorithmVersion": "reco-category-round-robin/1.0.0+cfg.92a3f1",
  "surface": "for_you_feed",
  "items": [
    {
      "article": {"id":"a1","slug":"sample","title":"نمونه"},
      "rank": 1,
      "reasonCode": "legacy_category_round_robin",
      "exploration": false,
      "recommendationContext": "v1.opaque.signed-token"
    }
  ],
  "nextCursor": "v1.opaque.signed-cursor",
  "hasMore": true,
  "expiresAt": "2026-08-11T17:30:00Z"
}
```

### 20.2. cursor claims

```ts
type FeedCursorClaims = {
  v: 'feed-cursor/v1';
  snapshotId: string;
  actorBinding: string; // truncated HMAC، نه actorKey خام
  nextIndex: number;
  expiresAt: number;
  keyId: string;
};
```

cursor `base64url(payload).base64url(hmac)` و opaque برای client است. هر تغییر، expiry یا actor mismatch پاسخ `410 CURSOR_EXPIRED` یا `403 CURSOR_ACTOR_MISMATCH` می‌دهد. client در expiry feed تازه می‌گیرد.

`hasMore = nextIndex < item_count`؛ نه مقایسه‌ی طول page با limit. یک snapshot در pageهای بعدی reorder نمی‌شود و item تکراری ندارد.

### 20.3. cache

- snapshot/profile/response actor-specific shared-cache نمی‌شود.
- candidate query عمومی می‌تواند cache versioned داشته باشد.
- `Cache-Control: private, no-store` برای response شخصی default است.
- مهاجرت `unstable_cache` به `use cache` task مستقل است؛ Next config فعلی Cache Components ندارد.

## 21. collection کمکی consent: `personalization_preferences`

این collection لازم است چون `user_taste_profiles` rebuildable است و نباید source of truth consent باشد.

| Field | PB type | Required | Default | معنا | Index |
|---|---|---:|---|---|---|
| `actor_type` | select `user,anonymous` | yes | — | server-derived | — |
| `actor_key` | text,max=80 | yes | — | owner داخلی | unique |
| `user` | relation -> users,max=1 | no | `null` | user actor | unique/index |
| `mode` | select | yes | user:`explicit_only`, guest:`off` | `off,explicit_only,behavioral` | index |
| `analytics_enabled` | bool | yes | `false` | pseudonymous product analytics | — |
| `policy_version` | text,max=40 | no | `null` | متن consent پذیرفته‌شده | — |
| `consented_at` | date | no | `null` | آخرین opt-in | — |
| `revoked_at` | date | no | `null` | آخرین revoke | — |
| `reset_at` | date | no | `null` | eventهای قبل از آن هرگز rebuild نمی‌شوند | index |
| `expires_at` | date | no | guest:+30d inactivity | anonymous cleanup | index |

همه ruleها `null` و index یکتای actor لازم است.

رفتار modeها:

- `off`: behavioral collection/use متوقف؛ feed عمومی/non-personalized.
- `explicit_only`: interests/followهای صریح قابل استفاده؛ read behavior profile نمی‌سازد.
- `behavioral`: event/profile مجاز طبق policy version.

## 22. Consent، خاموش‌کردن، reset، export، delete و retention

### 22.1. defaultها

- existing authenticated users: `explicit_only`؛ category interests فعلی حفظ می‌شود.
- new authenticated users: `explicit_only` پس از انتخاب interests؛ behavioral opt-in جدا.
- guest: `off`؛ anonymous personalization نیازمند opt-in روشن است.
- analytics consent مستقل است؛ خاموش بودن آن مانع event شخص‌محور metrics می‌شود.

### 22.2. خاموش‌کردن

اثر باید فوری باشد:

1. writer behavioral event را رد/skip می‌کند؛
2. ranker آینده profile را مصرف نمی‌کند؛
3. active snapshot personalized invalidated می‌شود؛
4. feed fallback عمومی/explicit-only برمی‌گردد؛
5. security/operational logs حداقلی و بدون actor behavioral باقی می‌مانند.

### 22.3. reset

دو action شفاف:

- **Reset learned profile:** `user_taste_profiles` حذف، behavioral events actor حذف یا purge queue می‌شوند، `reset_at` ثبت می‌شود؛ interests/follows صریح و bookmarks/comments باقی می‌مانند.
- **Delete all personalization data:** موارد بالا + preferenceهای صریح recommendation حذف و mode `off` می‌شود.

SLO فنی: توقف collection فوری؛ profile/snapshot invalidation زیر ۱ دقیقه؛ purge raw data حداکثر ۲۴ ساعت.

### 22.4. export

JSON export باید شامل این موارد باشد:

- consent/preference history فعلی؛
- inferred profile و نسخه‌ی builder؛
- recommendation events باقی‌مانده در retention؛
- feed reasons قابل‌انتساب در snapshotهای باقی‌مانده؛
- reading history، interests و follow/muteها.

secret token، internal HMAC، raw system log و داده‌ی کاربران دیگر export نمی‌شود.

### 22.5. delete و account deletion

- delete user باید با actor key، تمام events/profile/snapshots/preferences را پاک کند.
- anonymous delete با cookie فعلی actor hash را پیدا می‌کند؛ اگر cookie از دست رفته باشد actor قابل بازیابی نیست و TTL ۳۰ روز cleanup را تضمین می‌کند.
- relation cascade به‌تنهایی کافی نیست؛ cleanup job و reconciliation پس از delete لازم است.

### 22.6. retention defaults

| داده | retention default |
|---|---|
| raw `recommendation_events` authenticated | ۱۸۰ روز |
| anonymous events/profile | ۳۰ روز از آخرین فعالیت/consent |
| feed snapshots | قابل مصرف ۳۰ دقیقه، نگهداری ۷ روز |
| materialized authenticated profile | تا reset/off/account delete؛ اگر off شد حداکثر ۲۴h purge |
| operational structured logs | ۳۰ روز، بدون payload/actor key کامل |
| aggregate de-identified metrics | ۱۳ ماه |
| migration backup/export | حداقل ۳۰ روز پس از cutover موفق |

این defaultها برگشت‌پذیرند ولی پیش از production نیازمند تأیید owner/legal هستند. privacy page باید پیش از anonymous/behavioral collection به‌روزرسانی شود.

## 23. Taxonomy موضوع و canonical entity contract

### 23.1. source of truth MVP

دو فایل versioned و reviewشده در repo:

```text
config/recommendation/topics.v1.json
config/recommendation/entities.v1.json
```

مدل یا n8n حق تغییر مستقیم این فایل‌ها را ندارد.

```ts
export type TopicDefinition = {
  id: string;                 // stable ASCII kebab-case؛ هرگز reuse نشود
  parentId: string | null;
  nameFa: string;
  nameEn?: string;
  aliases: string[];
  status: 'active' | 'deprecated';
  mergedInto?: string;
};

export type CanonicalEntity = {
  id: `${EntityType}:${string}`;
  type: EntityType;
  canonicalNameFa: string;
  canonicalNameEn?: string;
  aliases: string[];
  externalIds?: Record<string, string>;
  status: 'active' | 'deprecated' | 'merged';
  mergedInto?: string;
};

export type EntityType =
  | 'company'
  | 'person'
  | 'product'
  | 'technology'
  | 'organization'
  | 'event'
  | 'place';
```

### 23.2. normalization

- Unicode NFKC؛ تبدیل `ي→ی` و `ك→ک`؛ normalize whitespace؛ lowercase برای alias لاتین.
- display label از canonical registry می‌آید، نه normalized alias.
- topic/entity ID immutable است؛ rename فقط label را عوض می‌کند.
- merge با `mergedInto` انجام می‌شود و ID قدیمی برای replay معتبر می‌ماند.
- خروجی model فقط ID موجود را canonical می‌نامد. مورد ناشناخته در `concepts` یا `unresolved_entities` با confidence قرار می‌گیرد و تا review affinity سخت نمی‌گیرد.

نمونه:

```json
{
  "topic_ids": ["generative-ai", "privacy"],
  "concepts": ["مدل زبانی روی دستگاه"],
  "entities": [
    {"id":"company:apple","confidence":0.98,"mentions":["اپل","Apple"]}
  ],
  "unresolved_entities": [
    {"name":"Galaxy Z Fold 8","type":"product","confidence":0.72}
  ]
}
```

## 24. Versioning قرارداد enrichment و embedding

Phase 0 فقط metadata contract را تثبیت می‌کند؛ embedding تولید نمی‌شود.

### 24.1. canonical content hash

```text
CONTENT-NORMALIZER: content-normalizer/v1
Unicode: NFKC
HTML: حذف script/style/boilerplate؛ تبدیل body به plain semantic text
Whitespace: collapse داخلی، trim خطوط
Input bytes (UTF-8):
v1\nLANG=<language>\nTITLE\n<title>\nEXCERPT\n<excerpt>\nBODY\n<body>
content_hash = lowercase hex SHA-256(input bytes)
```

هر تغییر الگوریتم normalizer نسخه‌ی جدید و hash جدید می‌خواهد.

### 24.2. embedding version

```ts
type EmbeddingContract = {
  provider: string;              // مثال صرفاً shape؛ مقدار واقعی unknown
  model: string;                 // exact provider model ID
  dimension: number;             // از response واقعی
  taskType: string;
  inputTemplateVersion: string;
  normalizerVersion: string;
  normalized: boolean;
};

embeddingVersion =
  `emb/v1:${provider}:${model}:${taskType}:${inputTemplateVersion}:${normalizerVersion}:${normalized ? 'l2' : 'raw'}`;
```

قواعد:

- dimension hardcode نمی‌شود و باید با `embedding.length` برابر باشد.
- mixed embedding versions در cosine/ranker مجاز نیست.
- تغییر model/task type/template/normalization record را `stale` می‌کند.
- vector در `article_features` private است؛ API public article آن را select نمی‌کند.

### 24.3. extractor/prompt

- `prompt_version = <file semantic version>+sha256.<short-hash>`.
- JSON Schema خروجی نیز version مستقل دارد؛ prompt version جای schema version را نمی‌گیرد.
- provider raw response در PocketBase ذخیره نمی‌شود مگر retention/security جدا و redacted.
- model ID، region، quota و prompt واقعی تا دریافت artifact n8n/Gemini Unknown باقی می‌ماند.

## 25. API validation، abuse protection و rate limiting

### 25.1. validation

- JSON body حداکثر ۸KB؛ batch event حداکثر ۲۰ item و ۶۴KB.
- `Content-Type: application/json`، same-origin `Origin/Host` برای mutation.
- UUID، PocketBase ID، enum، numeric range و ISO timestamp strict validate شوند.
- client clock skew مجاز: ±۵ دقیقه؛ خارج از آن `occurred_at=received_at` و error code/flag ثبت یا request با 422 رد شود. default: 422 برای impression، normalize برای `reading_end` با flag.
- article باید موجود و published باشد؛ exception برای eventهای retention/migration وجود ندارد.
- payload per-event allowlist و حداکثر ۲KB؛ unknown key رد شود.
- metadata شامل URL کامل، referrer query، comment body، email، IP یا user-agent خام نباشد.
- context/cursor HMAC constant-time verify و key rotation با `keyId`.

### 25.2. rate limit default

| Endpoint/action | actor limit | IP fallback | burst |
|---|---:|---:|---:|
| feed initial/refresh | ۳۰/min | ۶۰/min | ۵ |
| feed cursor page | ۶۰/min | ۱۲۰/min | ۱۰ |
| event ingest | ۱۲۰/min | ۲۴۰/min | ۲۰ |
| `not_interested`/preference | ۲۰/min | ۴۰/min | ۵ |
| bookmark/comment existing mutations | ۲۰/min | ۴۰/min | ۵ |
| export/reset/delete | ۳/hour | ۶/hour | ۱ |

IP فقط fallback abuse است؛ در app database ذخیره نمی‌شود. proxy log retention جداست. limitها config هستند و پس از load artifact بازتنظیم می‌شوند.

### 25.3. جلوگیری از جعل userId

- DTO public اصلاً user/actor fields ندارد.
- user از auth cookie refreshشده می‌آید.
- anonymous actor از cookie server-issued می‌آید.
- direct PocketBase write برای private collection با rule `null` رد می‌شود.
- signed recommendation context actor-bound است؛ token یک actor برای actor دیگر معتبر نیست.

### 25.4. credential server

MVP به یک client مرکزی server-only برای private collectionها نیاز دارد. استفاده‌ی پراکنده از email/password superuser در routeها ممنوع است. exact روش credential وابسته به PocketBase deployment artifact است؛ تا آن زمان ruleها private می‌مانند و production writer فعال نمی‌شود.

## 26. Metrics baseline و guardrails

### 26.1. baseline فعلی

قبل از هر ranker، baseline با الگوریتم `legacy_category_round_robin` ثبت می‌شود. چون امروز impression log وجود ندارد، CTR تاریخی معتبر قابل محاسبه نیست. baseline online از اولین release instrumentation و حداقل ۱۴ روز داده یا ۱۰هزار impression معتبر، هرکدام دیرتر است، ساخته می‌شود.

### 26.2. metricهای اصلی

| Metric | تعریف دقیق |
|---|---|
| Recommendation CTR | actor-itemهای دارای `article_open` attributed / impressionهای معتبر |
| Engaged read rate | impressionهایی که reading session آن‌ها `engaged >= 15s` دارد / impressionهای معتبر |
| Completion rate | attributed `reading_complete` / attributed opens |
| Bookmark rate | `bookmark_add` attributed / attributed opens |
| Comment submit rate | `comment_submit` attributed / attributed opens |
| Share intent rate | `share_copy + share_complete` attributed / attributed opens؛ جداگانه گزارش شوند |
| Not-interested rate | `not_interested` / impressionهای معتبر |
| Long-click rate | attributed open با `engaged >= 45s` / attributed opens |
| Session depth | تعداد article open متمایز در session |
| Duplicate rate | item تکراری در snapshot یا session / items served؛ target صفر در snapshot |
| Topic/source diversity | distinct canonical topic/source در top-K و entropy |
| Coverage | articleهای unique impression‌شده / eligible articleها در window |
| Calibration | توزیع topicهای impression/engagement در برابر profile distribution |

هر metric با `algorithm_version`, `surface`, `actor_type`, `personalization_mode` segment می‌شود. raw email/userId وارد dashboard dimension نمی‌شود.

### 26.3. guardrailها

- feed API p50/p95/p99 latency و error rate
- event ingest acceptance/rejection/duplicate rate
- empty-feed rate
- cursor expired/actor mismatch rate
- snapshot duplicate و ordering mismatch
- source/topic concentration در top 10
- exploration percentage در نسخه‌های آینده
- not-interested و hide-after-open rate
- PocketBase write latency، lock/error، database size/day
- profile stale/failed rate در آینده
- consent-off leakage: تعداد behavioral event پس از revoke باید صفر باشد
- deletion/reset SLO breach

### 26.4. offline evaluation آینده

split زمانی الزام است: events قبل از T profile، events بعد از T evaluation. Recall@K، NDCG@K، MRR، coverage، novelty، intra-list diversity و calibration گزارش می‌شوند. random split ممنوع است.

## 27. Observability

Structured log مشترک:

```json
{
  "level": "info",
  "operation": "recommendation_event_ingest",
  "trace_id": "...",
  "request_id": "...",
  "event_type": "recommendation_impression",
  "surface": "for_you_feed",
  "actor_type": "anonymous",
  "algorithm_version": "...",
  "result": "accepted",
  "error_code": null,
  "latency_ms": 42
}
```

ممنوع در log: raw auth/anon cookie، actor key کامل، email، comment body، context/cursor token، embedding، full payload.

لازم:

- trace ID از feed تا event و downstream mutation؛
- metric counter برای هر rejection code؛
- migration audit با source/target counts و checksum؛
- cleanup job report و delete SLO؛
- alert روی event failure >2% در ۵ دقیقه، feed error >1%، PB p95 write >500ms، consent leakage >0 و snapshot duplicate >0.

## 28. Failure modes و recovery

| Failure | رفتار default | Recovery |
|---|---|---|
| PocketBase event write unavailable | primary UI/mutation fail نشود؛ event retry محدود | ۳ retry exponential + idempotency؛ alert، بدون queue خارجی |
| snapshot write fail | personalized response بدون snapshot ارسال نشود | fallback عمومی بدون attribution یا 503؛ default fallback عمومی با `no-store` |
| cursor expired | 410 code مشخص | client feed تازه می‌گیرد |
| duplicate event | 200 `duplicate:true` | هیچ action لازم نیست |
| invalid/tampered context | 422/403 و un-attributed direct event در صورت مجاز | security metric؛ token rotate اگر گسترده |
| client clock skew | impression رد؛ end event normalize با flag | client clock metric |
| tracker hidden/blur | timer pause | با focus/visible resume |
| event بعد از consent revoke | writer رد و leakage alert | invalidate snapshot/profile، purge job |
| profile build آینده fail | last-known-good تا max staleness؛ سپس explicit/public fallback | status failed + rebuild retry |
| article feature fail آینده | article منتشر می‌ماند، status failed/partial | bounded retry/dead-letter report |
| migration interrupted | idempotent resume؛ legacy untouched | checkpoint/reconciliation، rollback flag |
| retention job fail | alert و retry | cleanup by indexed `retention_until/expires_at` |

MVP durable queue ندارد. اگر lost-event rate با retry بیش از ۰٫۵٪ شد یا write throughput از threshold بخش 31 عبور کرد، outbox/queue RFC جدید لازم است.

## 29. File-by-file implementation plan

این فهرست برنامه‌ی مرحله‌ی بعد است؛ در این RFC هیچ‌کدام ایجاد/تغییر نمی‌شوند.

### 29.1. Phase 0A — inventory و migration foundation

| File/artifact | تغییر آینده |
|---|---|
| PocketBase deployment repo: `pb_migrations/<timestamp>_recommendation_phase0.js` | migration additive collectionها/index/rules؛ path بعد از دریافت artifact deploy قطعی شود |
| `scripts/audit-pocketbase-schema.mjs` | read-only export و drift/count/duplicate/orphan report؛ secret در output redacted |
| `scripts/backfill-reading-history.mjs` | idempotent union/backfill + dry-run + reconciliation؛ هیچ delete |
| `scripts/rollback-reading-history-cutover.mjs` یا documented flag | rollback read source و report، نه schema destruction |
| `src/lib/pb-types.ts` | بعد از migration از schema staging regenerate؛ manual edit نشود |
| `scripts/setup-collections.mjs` | در نهایت deprecate یا تبدیل به verifier؛ اجرای بعدی Phase 0A |

### 29.2. Phase 0B — contracts و trust boundary

| File | تغییر آینده |
|---|---|
| `src/lib/recommendation/contracts.ts` | enumها، DTOها، version constants |
| `src/lib/recommendation/validation.ts` | strict per-event/cursor input validation |
| `src/lib/recommendation/actor-server.ts` | auth refresh، anon cookie/HMAC، consent resolution |
| `src/lib/recommendation/context-server.ts` | sign/verify cursor و recommendation context با key rotation |
| `src/lib/recommendation/pocketbase-admin.ts` | تنها server-only writer؛ exact credential پس از deploy artifact |
| `src/lib/recommendation/events-server.ts` | idempotency، enrichment server fields، append-only write |
| `src/lib/auth-cookies.ts` | قرارداد واحد import/export cookie و authRefresh |
| auth routes | استفاده از helper واحد؛ رفع raw-token/JSON/exportToCookie inconsistency |

### 29.3. Phase 0C — instrumentation بدون ranker جدید

| File | تغییر آینده |
|---|---|
| `src/app/api/recommendation-events/route.ts` | batch/single ingest، rate limit، no userId |
| `src/components/RecommendationImpression.tsx` | state machine 50%/1s/focus/visibility |
| `src/components/ReadingTracker.tsx` | engaged reading و milestones |
| `src/components/SecondaryCard.tsx` | optional typed recommendation context؛ generic card behavior حفظ شود |
| `src/components/RecommendedCarousel.tsx` | surface/context pass-through؛ rank ثابت |
| `src/components/ForYouClient.tsx` | snapshot/cursor pagination بعد از backend contract |
| `src/app/api/recommended/route.ts` | input validation، snapshot response، baseline algorithm only |
| bookmark/comment routes | post-success attribution event، primary mutation مستقل |
| `src/components/ShareButton.tsx` | تفکیک copy/web-share outcome و event |
| profile/privacy pages | mode، consent، reset/export/delete و policy متن |

### 29.4. Taxonomy و tests

| File | تغییر آینده |
|---|---|
| `config/recommendation/topics.v1.json` | controlled taxonomy seed |
| `config/recommendation/entities.v1.json` | canonical registry seed |
| `config/recommendation/*.schema.json` | JSON Schema validation |
| `src/lib/recommendation/*.test.ts` | unit contracts/state machines |
| `src/app/api/**/route.test.ts` | integration trust/rate/idempotency |
| `tests/migrations/phase-0-history.test.*` | migration fixtures و rerun/rollback |

هیچ n8n workflow تا دریافت export واقعی و تعریف owner file plan ندارد.

## 30. Test plan

### 30.1. Unit

- actor resolution و عدم پذیرش userId client
- anon cookie HMAC/rotation و no-merge
- context/cursor sign, verify, expiry, actor binding و key rotation
- idempotency key برای همه eventها
- per-event payload schema، enum/range/size/skew
- impression state machine با fake timers: render-only، 49٪، 50٪/999ms، blur/hidden/reset، interaction path
- engaged timer: visible/focus/viewport/activity، sleep delta cap، milestones once، lazy resize
- attribution windows و latest valid impression
- content normalization/hash golden vectors
- topic/entity normalization/merge/deprecation
- snapshot `hasMore`, cursor nextIndex، stable ranks و no duplicates

### 30.2. Integration — Next + PocketBase staging/container

- public/normal authenticated client برای چهار private collection create/list/view/update/delete نتواند.
- server writer create کند ولی application update path نداشته باشد.
- duplicate event دو request هم‌زمان فقط یک row بسازد و هر دو پاسخ قابل‌قبول باشند.
- tampered context، wrong actor، wrong article/rank و expired snapshot رد شوند.
- bookmark/comment success با event failure همچنان success بماند.
- consent off هیچ behavioral row نسازد.
- reset profile/snapshot را invalidate و purge job را ثبت کند.
- API response `Cache-Control: private, no-store` داشته باشد.
- limit/cursor invalid با code ثابت و بدون stack/secret پاسخ دهد.

### 30.3. Migration fixtures

حداقل fixtureها:

1. فقط `history`؛
2. فقط `reading_history`؛
3. هر دو با pairهای disjoint؛
4. هر دو با collision و timestamp متفاوت؛
5. duplicate داخل هر source؛
6. orphan user/article؛
7. null/invalid `last_read`؛
8. progress 0/100/out-of-range/scale نامعلوم؛
9. اجرای دوباره migration؛
10. interruption پس از 25/50/90٪ و resume؛
11. unique-index failure؛
12. rollback flag و reconciliation بعد از dual-write.

Assertions: source unchanged، target unique pair count برابر union، checksum deterministic، quarantine count دقیق، rerun zero diff.

### 30.4. Browser/E2E

- Chromium + WebKit: carousel horizontal viewport impression.
- tab background/foreground، window blur، scroll خارج article، idle ۳۰s.
- open در کمتر از ۱s interaction impression بسازد.
- new tab و direct URL attribution درست/نداشته باشد.
- pagehide/sendBeacon retry idempotent.
- logout/login anonymous data merge نشود.
- cursor pagination هیچ duplicate/gap در snapshot نداشته باشد.

### 30.5. Load و abuse

- event endpoint با burst default و duplicate retry.
- feed snapshot حداکثر ۲۰۰ item و page ۲۰.
- malformed 64KB+/nested JSON، replay token، event flood، article ID enumeration.
- target staging: p95 ingest زیر ۲۵۰ms و p95 snapshot read زیر ۳۵۰ms در load مورد توافق؛ پس از دریافت ظرفیت production بازتنظیم شود.

## 31. مرز MVP و مسیر آینده

### MVP

- PocketBase collections و indexهای همین RFC
- Next BFF server-authoritative
- event append-only با request retry/idempotency
- snapshot JSON تا ۲۰۰ item
- taxonomy/entity JSON versioned در repo
- profile JSON materialized در PocketBase
- candidate عمومی cacheable؛ feed شخصی no-store

### triggerهای بررسی معماری آینده

RFC جدید فقط اگر یکی از این thresholdها پایدار شود:

- بیش از ۵۰هزار مقاله‌ی eligible یا full-scan retrieval p95 > 200ms: بررسی ANN/vector store.
- بیش از ۵۰۰ event write/sec پایدار یا PocketBase lock/write p95 > 500ms: بررسی durable queue/event store.
- snapshot JSON/record > 256KB یا feed > ۲۰۰ item: جداکردن `feed_snapshot_items` collection/table.
- profile JSON > 256KB یا partial update contention: feature tables تخصصی.
- نیاز analytics چندساله/چندمیلیارد event: export به warehouse با retention مستقل.

مهاجرت با adapter interface انجام می‌شود؛ public event/feed contracts و versionها نباید به storage vendor وابسته باشند.

## 32. Acceptance Criteria پایان Phase 0

Phase 0 فقط وقتی complete است که همه‌ی موارد زیر قابل‌اندازه‌گیری باشند:

1. schema export و exact PocketBase production version ثبت و با RFC diff شده باشد.
2. migration staging روی clone production حداقل دو بار اجرا شود و rerun دوم **zero target diff** بدهد.
3. source rowها حذف/تغییر نکرده باشند؛ target unique pair count دقیقاً برابر union unique pairهای معتبر و quarantine count توضیح‌داده‌شده باشد.
4. restore backup در staging موفق و زمان restore ثبت شده باشد.
5. چهار collection اصلی + `personalization_preferences` با تمام field/index/ruleهای RFC در staging وجود داشته باشند.
6. generated types از schema staging ساخته شوند و application string `history` فقط در migration/compatibility code باقی بماند.
7. client anonymous و authenticated نتواند private collectionها را مستقیم read/write کند؛ integration test برای هر CRUD سبز باشد.
8. payload دارای `userId/actorKey/rank/requestId/algorithmVersion/reasonCode` client با 400/422 رد شود.
9. retry یک event فقط یک database row بسازد و duplicate response deterministic باشد.
10. card render یا visibility کمتر از 50%/1000ms صفر impression بسازد؛ threshold و interaction path test سبز باشد.
11. hidden/blur/off-viewport/idle در engaged seconds افزایش ایجاد نکند؛ milestone هر session حداکثر یک‌بار باشد.
12. attribution open/bookmark/comment/share/not-interested با fixtureهای valid/expired/direct درست باشد.
13. snapshot pageها rank ثابت، صفر duplicate و `hasMore` درست داشته باشند؛ tampered/expired/wrong-actor cursor رد شود.
14. mode `off` در integration test صفر behavioral event/profile consumption داشته باشد.
15. reset حداکثر یک دقیقه profile/snapshot را invalidate و حداکثر ۲۴ ساعت داده‌ی raw را purge کند؛ test job این SLA را اثبات کند.
16. retention cleanup روی indexed fields اجرا و count قبل/بعد گزارش شود.
17. baseline metric queryها با dataset مصنوعی جواب عددی expected بدهند و denominator فقط impression معتبر باشد.
18. structured logs هیچ cookie/token/email/comment body/actor key کامل نداشته باشند.
19. testهای unit/integration/migration/E2E تعیین‌شده سبز و error budget load staging ثبت شود.
20. هیچ embedding API، profile builder، ranker، MMR، exploration یا behavioral product switch در Phase 0 فعال نشده باشد.

## 33. ترتیب اجرای پیشنهادی Phase 0

1. **Phase 0A.1:** دریافت/export artifact production و ساخت audit script read-only.
2. **Phase 0A.2:** migration additive schema + history dry-run/backfill/reconciliation در staging.
3. **Phase 0B:** قرارداد actor/auth cookie/private writer/context/idempotency و tests.
4. **Phase 0C:** instrumentation baseline روی الگوریتم round-robin فعلی، بدون تغییر ranking.
5. **Phase 0D:** consent controls، privacy/export/reset/delete، observability و retention jobs.
6. Gate acceptance criteria و سپس شروع Phase 1 Content Intelligence.

## 34. دستور پیشنهادی برای مرحله‌ی بعد

```text
Phase 0A.1 را طبق docs/recommendation-engine/phase-0-rfc.md پیاده‌سازی کن: ابتدا artifact و نسخه‌ی واقعی PocketBase production را دریافت/بررسی کن؛ سپس فقط audit script read-only، schema diff، fixtureهای migration و dry-run/reconciliation history→reading_history را بساز. هیچ migration production، runtime behavior، event collection فعال، embedding یا ranker اجرا نکن. خروجی را با test و گزارش zero-write audit تحویل بده.
```

## 35. فایل‌های auditشده

### قرارداد و نسخه‌ها

- `AGENTS.md`
- `package.json`
- `next.config.ts`
- `README.md`
- `.gitignore`
- `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`
- `node_modules/next/dist/docs/01-app/01-getting-started/08-caching.md`
- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/cookies.md`
- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/unstable_cache.md`
- بخش‌های مرتبط `node_modules/next/dist/docs/01-app/02-guides/authentication.md`

### PocketBase/schema/ingest

- `scripts/setup-collections.mjs`
- `scripts/fix-auth-options.mjs`
- `scripts/migrate-sanity.mjs`
- `scripts/seed-articles.mjs`
- `src/lib/pb-types.ts`
- `src/lib/pocketbase.ts`
- `src/lib/articles-server.ts`
- `src/lib/articles.ts`

### auth/session/privacy

- `src/lib/auth-cookies.ts`
- `src/app/api/auth/login/route.ts`
- `src/app/api/auth/register/route.ts`
- `src/app/api/auth/logout/route.ts`
- `src/app/api/auth/set-cookie/route.ts`
- `src/app/api/auth/google/route.ts`
- `src/app/api/auth/google/callback/route.ts`
- `src/app/auth/callback/page.tsx`
- `src/components/GoogleLoginButton.tsx`
- `src/app/profile/page.tsx`
- `src/app/api/profile/interests/route.ts`
- `src/components/InterestsPicker.tsx`
- `src/app/privacy/page.tsx`

### history/signals/recommendation UI/API

- `src/app/api/history/route.ts`
- `src/components/ReadingTracker.tsx`
- `src/app/history/page.tsx`
- `src/components/HistoryRow.tsx`
- `src/app/api/views/route.ts`
- `src/components/ViewTracker.tsx`
- `src/app/api/bookmarks/route.ts`
- `src/components/BookmarkButton.tsx`
- `src/app/bookmarks/page.tsx`
- `src/components/BookmarkRow.tsx`
- `src/app/api/comments/route.ts`
- `src/components/CommentsSection.tsx`
- `src/components/ShareButton.tsx`
- `src/app/api/recommended/route.ts`
- `src/components/RecommendedCarousel.tsx`
- `src/components/ForYouClient.tsx`
- `src/components/SecondaryCard.tsx`
- `src/app/for-you/page.tsx`
- `src/app/page.tsx`
- `src/app/article/[slug]/page.tsx`
- `src/app/layout.tsx`

### tests/artifact scan

- `src/lib/articles.test.ts`
- `src/lib/categories.test.ts`
- scan همه‌ی فایل‌های tracked خارج از `node_modules/.next/.git` برای `n8n`, `Gemini`, workflow، migration، schema export، impression/snapshot/cursor contracts

### تغییرات untracked هم‌زمان — فقط read-only audit

- `pb_migrations/202608110001_bootstrap_core_schema.js`
- `pb_migrations/202608110002_migrate_legacy_history.js`
- `pb_migrations/202608110003_create_recommendation_events.js`
- `src/app/api/recommendation-events/route.ts`
- `src/lib/pocketbase-admin.ts`
- `src/lib/rate-limit.ts`
- `src/lib/recommender/contracts.ts`
- `src/lib/recommender/event-service.ts`
- `src/lib/recommender/pocketbase-repository.ts`
- `src/lib/recommender/validation.ts`
- `src/lib/history/history-service.ts`
- `src/lib/pocketbase-id.ts`
- `src/lib/views/view-service.ts`
- diff هم‌زمان `src/app/api/history/route.ts`
- diff هم‌زمان `src/app/history/page.tsx`
- diff هم‌زمان `src/app/api/views/route.ts`
- diff هم‌زمان `src/components/ViewTracker.tsx`
- `src/lib/recommendations/baseline.ts`
- diff هم‌زمان `src/app/api/recommended/route.ts`
- diff هم‌زمان `src/app/for-you/page.tsx`
- diff هم‌زمان `src/app/page.tsx`
- diff هم‌زمان `src/components/ForYouClient.tsx`
- diff هم‌زمان `src/components/RecommendedCarousel.tsx`
- diff هم‌زمان `src/lib/articles-server.ts`
- تغییر هم‌زمان `scripts/setup-collections.mjs` و `src/lib/pb-types.ts` فقط در status نهایی مشاهده شد و به‌عنوان قرارداد پذیرفته نشد
