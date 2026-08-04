## 2025-02-18 - Prevent PocketBase Filter Injection
**Vulnerability:** PocketBase filter injection via unsanitized string interpolation in API queries. Example: `filter: \`user = "${userId}"\``.
**Learning:** Using string interpolation with user input in PocketBase filters is a security risk because attackers can inject logical expressions (e.g., `"` OR `1=1`) to bypass restrictions and access unauthorized data. This is analogous to SQL injection.
**Prevention:** Always use parameterized queries with the `pb.filter` method to safely escape user inputs. Example: `filter: pb.filter('user = {:uid}', { uid: userId })`.
## 2025-02-18 - Hardcoded PocketBase Admin Credentials
**Vulnerability:** Hardcoded admin email and password in API route `src/app/api/views/route.ts` used to bypass API rules.
**Learning:** Hardcoding credentials, especially for admin or superuser roles, in source code exposes the system to complete compromise if the source code is read (e.g. via an open repository, accidental exposure, or path traversal).
**Prevention:** Always use environment variables for sensitive credentials (e.g., `process.env.POCKETBASE_ADMIN_PASSWORD`). Ensure proper fallback checks exist to fail securely without leaking information if environment variables are missing.
