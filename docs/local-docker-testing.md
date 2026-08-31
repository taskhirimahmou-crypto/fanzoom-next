# محیط تست کاملاً محلی FanZoom با Docker

این Compose فقط روی `127.0.0.1` منتشر می‌شود و برای جلوگیری از اتصال تصادفی به Liara، کانتینر Next.js هر URL غیرمحلی PocketBase را رد می‌کند.

## راه‌اندازی

```powershell
docker compose --env-file .env.docker.local -f compose.local.yml up --build -d
```

این دستور imageهای Next.js و PocketBase 0.40.0 را می‌سازد، migrationها را فقط روی volume محلی اجرا می‌کند، داده‌ی نمونه و کاربر تست را می‌سازد و سپس سایت را بالا می‌آورد.

## مشاهده وضعیت و لاگ

```powershell
docker compose --env-file .env.docker.local -f compose.local.yml ps
docker compose --env-file .env.docker.local -f compose.local.yml logs --tail 100 pocketbase setup web
```

## آدرس‌های محلی

- سایت: <http://127.0.0.1:3000>
- پنل PocketBase: <http://127.0.0.1:8090/_/>
- health PocketBase: <http://127.0.0.1:8090/api/health>

Credentialهای local در فایل ignore‌شده‌ی `.env.docker.local` هستند. کاربر آماده‌ی تست `reader@fanzoom.local` است و در شروع، personalization او خاموش است.

## چک‌لیست دستی مرورگر

1. سایت را باز کنید و با کاربر local وارد شوید؛ صفحه باید بدون خطای شبکه نمایش داده شود.
2. وارد پروفایل شوید. personalization را روشن کنید و صفحه را refresh کنید؛ وضعیت باید روشن بماند.
3. صفحه‌ی اصلی یا `/for-you` را باز کنید. پس از بارگیری feed، در PocketBase باید eventهای `served` با یک `feedId` مشترک و rankهای متفاوت دیده شوند.
4. یک کارت را طوری نگه دارید که دست‌کم ۵۰٪ آن برای حداقل یک ثانیه دیده شود؛ فقط یک `impression` برای همان article و feed ثبت شود. عبور سریع کمتر از یک ثانیه نباید event بسازد.
5. همان کارت توصیه‌شده را باز کنید؛ `open` باید feedId، rank، surface و algorithmVersion همان feed را حفظ کند.
6. در مقاله، پنجره را فعال نگه دارید و آرام تا ۲۵، ۵۰، ۷۵ و ۹۰ درصد حرکت کنید؛ milestoneها هرکدام حداکثر یک بار ثبت شوند.
7. برای ثبت `engaged`، مقاله باید در viewport و tab باید visible/focused باشد: یا ۸ تا ۱۵ ثانیه مطالعه‌ی فعال، یا دست‌کم ۵ ثانیه همراه با ۵۰٪ پیشرفت.
8. personalization را خاموش کنید، یک feed دیگر باز کنید و کارت‌ها را ببینید؛ از آن لحظه event جدید recommendation نباید ثبت شود.

برای مشاهده‌ی eventها وارد پنل PocketBase شوید، collection `recommendation_events` را باز کنید و ستون‌های `eventType`, `feedId`, `articleId`, `rank`, `surface`, `algorithmVersion`, `engagedSeconds` و `maxProgress` را بررسی کنید. این collection برای client خصوصی است و فقط superuser محلی می‌تواند آن را مستقیم در dashboard ببیند.

## توقف بدون حذف داده

```powershell
docker compose --env-file .env.docker.local -f compose.local.yml down
```

این دستور کانتینرها و شبکه را متوقف می‌کند، اما volume دیتابیس و داده‌های local را نگه می‌دارد. برای این مرحله از `down -v` استفاده نکنید، چون volume محلی را حذف می‌کند.

## تنظیم deployment برای شمارنده‌ی views

- `VIEW_RATE_LIMIT_SECRET` باید فقط در environment سمت سرور و با حداقل ۳۲ بایت تصادفی تنظیم شود. این مقدار نباید نام `NEXT_PUBLIC_` داشته باشد.
- `VIEW_TRUSTED_PROXY_IP_HEADER` به‌طور پیش‌فرض خالی است؛ در این حالت `X-Forwarded-For`، `X-Real-IP` و headerهای مشابه در visitor identity استفاده نمی‌شوند.
- در حالت بدون IP مورد اعتماد، هویت ناشناس با cookie امضاشده و HttpOnly حفظ می‌شود. این کار جعل header را می‌بندد، اما کاربری که عمداً cookie را حذف می‌کند می‌تواند هویت تازه بگیرد؛ برای abuse protection کامل staging/production باید header واقعی و overwrite‌شده‌ی ingress تأیید شود.
- این متغیر را در Liara تا وقتی فعال نکنید که مستندات یا پشتیبانی Liara دقیقاً تأیید کند کدام header را روی ingress بازنویسی می‌کند و همان header ارسالی مستقیم client را حذف می‌کند. مقدار header نیز باید دقیقاً یک IP باشد؛ زنجیره‌های comma-separated عمداً رد می‌شوند.
- پیش از فعال‌سازی، روی staging بررسی کنید که دو درخواست با `X-Forwarded-For` دلخواه نتوانند IP مشاهده‌شده توسط برنامه را تغییر دهند. نام header را حدس نزنید.
- increment اتمیک به hook خصوصی `pb_hooks/atomic_views.pb.js` وابسته است. image یا deployment واقعی PocketBase باید این پوشه را کنار executable کپی و PocketBase را restart کند. route فقط superuser معتبر PocketBase را می‌پذیرد.
- API اختیاری `/api/batch` برای recommendation eventها لازم نیست و نباید صرفاً برای served فعال شود.

## اجرای بررسی‌های خودکار داخل Docker

```powershell
docker compose --env-file .env.docker.local -f compose.local.yml run --rm --no-deps -e FANZOOM_LOCAL_DOCKER=false -e NEXT_PUBLIC_POCKETBASE_URL=http://pocketbase:8090 web node scripts/verify-local-environment.mjs
docker compose --env-file .env.docker.local -f compose.local.yml run --rm --no-deps web npm test
docker compose --env-file .env.docker.local -f compose.local.yml run --rm --no-deps web npx tsc --noEmit
docker compose --env-file .env.docker.local -f compose.local.yml run --rm --no-deps web npm run lint
```
