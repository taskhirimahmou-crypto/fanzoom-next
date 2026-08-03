## 2025-02-18 - Prevent PocketBase Filter Injection
**Vulnerability:** PocketBase filter injection via unsanitized string interpolation in API queries. Example: `filter: \`user = "${userId}"\``.
**Learning:** Using string interpolation with user input in PocketBase filters is a security risk because attackers can inject logical expressions (e.g., `"` OR `1=1`) to bypass restrictions and access unauthorized data. This is analogous to SQL injection.
**Prevention:** Always use parameterized queries with the `pb.filter` method to safely escape user inputs. Example: `filter: pb.filter('user = {:uid}', { uid: userId })`.
