# Fanzoom app admin access

`app_admins` is the application authorization list for the local private observability dashboard. It is not a
PocketBase auth collection, and an application admin does not receive PocketBase superuser access.
All collection API rules are locked. The Next.js server reads a membership only after `requireUser`
has refreshed and validated the normal user session.
Migration `202608310004_add_app_admin_timestamps.js` adds PocketBase `autodate` fields for `created`
and `updated`; PocketBase 0.40 does not add them implicitly to base collections.

## Roles

- `viewer`: read-only observability dashboard access.
- `admin`: future operational actions explicitly protected for this role.
- `owner`: مشاهده و مدیریت دسترسی `viewer/admin`.

داشبورد در `/admin/observability` برای هر سه نقش قابل مشاهده است. صفحه‌ی مدیریت دسترسی در
`/admin/access` و API متناظر آن مستقلاً نقش فعال `owner` را بررسی می‌کنند. Browser هیچ‌وقت token یا
credential سوپریوزر PocketBase دریافت نمی‌کند. جست‌وجو، lookup عضویت و mutation داخل server انجام
می‌شوند و Browser به‌جای userId یک reference رمز‌شده، کوتاه‌عمر و غیرقابل‌دست‌کاری می‌گیرد.

Owner در صفحه‌ی مدیریت می‌تواند کاربر را با حداقل سه نویسه‌ی email یا نام جست‌وجو کند، نقش
`viewer/admin` بدهد، بین این دو نقش تغییر دهد و دسترسی را فعال یا غیرفعال کند. اعطای `owner`، تغییر
owner موجود و انتقال مالکیت در فرم عادی وجود ندارد. هر revoke تأیید صریح دارد.

Mutation فقط پس از session refresh، shared rate limit، بررسی same-origin و CSRF اجرا می‌شود. actor،
requestId، زمان و audit data از Browser پذیرفته نمی‌شوند. hook خصوصی PocketBase membership و audit را
در یک transaction می‌نویسد. API Rules برای `app_admins` و `app_admin_audit` همگی بسته‌اند و audit از
Record API قابل update/delete نیست.

## Provision the first owner in the local Docker stack

1. Start the isolated local stack and let PocketBase apply its migrations.
2. In the local PocketBase admin UI, open the `users` collection and copy the 15-character record ID
   for the local test user. Do not use a production user ID.
3. فقط برای bootstrap اولین owner این دستور را داخل container محلی اجرا کنید:

```powershell
docker compose --env-file .env.docker.local -f compose.local.yml exec -T web npm run admin:provision:local -- --user-id <LOCAL_USER_ID> --role owner
```

The script requires the local Docker safety marker and uses the container's existing local-only
PocketBase URL and superuser environment variables. It refuses HTTPS and any host other than
`pocketbase`, `localhost`, or `127.0.0.1`.
پس از وجود اولین owner، script بدون `--recovery` هر تغییر دیگری را رد می‌کند. مدیریت روزمره‌ی
`viewer/admin` فقط از `/admin/access` انجام می‌شود.

After provisioning, sign in as that same local test user and open:

```text
http://127.0.0.1:3000/admin/observability
```

The label «داده‌ی آزمایشی» confirms that the dashboard is reading the isolated local Docker stack.

## Recovery and owner transfer

آخرین owner فعال هرگز از پنل قابل حذف، غیرفعال یا تنزل نیست و owner حتی در حضور owner دیگر نیز
نمی‌تواند خودش را با فرم عادی تغییر دهد. دو درخواست هم‌زمان نیز داخل transaction همان invariant را
می‌بینند. افزودن یا انتقال owner flow عادی نیست.

script محلی فقط برای recovery آزمایشگاهی باقی مانده است:

```powershell
docker compose --env-file .env.docker.local -f compose.local.yml exec -T web npm run admin:provision:local -- --user-id <LOCAL_USER_ID> --role owner --recovery
```

این مسیر به marker محلی و host allowlistشده محدود است. برای production باید flow عملیاتی جدا، تأیید
هویت دوباره، approval دو نفره، backup و audit اتمیک اختصاصی طراحی شود؛ script محلی راهنمای deploy نیست.

## Audit بدون PII

`app_admin_audit` خصوصی و append-only است. رکورد شامل relationهای actor/target، action، before/after،
requestId، زمان و outcome است؛ email، IP، token، cookie یا payload کاربر ذخیره نمی‌شود. Browser فقط
aggregate نقش‌ها و تغییرات اخیر بدون شناسه را در dashboard می‌بیند.

## Production provisioning policy (not implemented or run)

Production membership changes must use a separately approved, one-time server-side operational job
with an audited user record ID. Superuser credentials must be supplied through the deployment's
secret store, never a browser, URL, source file, or command history. Back up PocketBase first,
record who approved the role and expiry/review date, verify the target user independently, then
remove the job and rotate temporary credentials. Flow انتقال owner باید جدا از فرم روزمره و با
احراز هویت قوی‌تر طراحی شود.
