# Fanzoom app admin access

`app_admins` is the application authorization list for the local private observability dashboard. It is not a
PocketBase auth collection, and an application admin does not receive PocketBase superuser access.
All collection API rules are locked. The Next.js server reads a membership only after `requireUser`
has refreshed and validated the normal user session.
PocketBase supplies the standard `created` and `updated` timestamps for every membership record.

## Roles

- `viewer`: read-only observability dashboard access.
- `admin`: future operational actions explicitly protected for this role.
- `owner`: future role-management actions explicitly protected for this role.

The dashboard is available locally at `/admin/observability`. Its page and aggregate API independently
call `requireAppAdmin` with minimum role `viewer`. No role-management endpoint exists. The helper
returns only the validated role and never returns an auth token, a user profile, or a superuser client.

## Provision an admin in the local Docker stack

1. Start the isolated local stack and let PocketBase apply its migrations.
2. In the local PocketBase admin UI, open the `users` collection and copy the 15-character record ID
   for the local test user. Do not use a production user ID.
3. Run this inside the local web container:

```powershell
docker compose --env-file .env.docker.local -f compose.local.yml exec -T web npm run admin:provision:local -- --user-id <LOCAL_USER_ID> --role viewer
```

The script requires the local Docker safety marker and uses the container's existing local-only
PocketBase URL and superuser environment variables. It refuses HTTPS and any host other than
`pocketbase`, `localhost`, or `127.0.0.1`.
Running the same command again updates the one membership instead of creating a duplicate.

After provisioning, sign in as that same local test user and open:

```text
http://127.0.0.1:3000/admin/observability
```

The label «داده‌ی آزمایشی» confirms that the dashboard is reading the isolated local Docker stack.

To disable the local membership without deleting its audit-friendly record:

```powershell
docker compose --env-file .env.docker.local -f compose.local.yml exec -T web npm run admin:provision:local -- --user-id <LOCAL_USER_ID> --role viewer --disabled
```

## Production provisioning policy (not implemented or run)

Production membership changes must use a separately approved, one-time server-side operational job
with an audited user record ID. Superuser credentials must be supplied through the deployment's
secret store, never a browser, URL, source file, or command history. Back up PocketBase first,
record who approved the role and expiry/review date, verify the target user independently, then
remove the job and rotate temporary credentials. A dashboard must not include provisioning controls
until owner-only authorization and an audit trail are designed.
