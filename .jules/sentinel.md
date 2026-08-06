## 2025-02-18 - Prevent PocketBase Filter Injection
**Vulnerability:** PocketBase filter injection via unsanitized string interpolation in API queries. Example: `filter: \`user = "${userId}"\``.
**Learning:** Using string interpolation with user input in PocketBase filters is a security risk because attackers can inject logical expressions (e.g., `"` OR `1=1`) to bypass restrictions and access unauthorized data. This is analogous to SQL injection.
**Prevention:** Always use parameterized queries with the `pb.filter` method to safely escape user inputs. Example: `filter: pb.filter('user = {:uid}', { uid: userId })`.

## 2025-02-28 - Prevent XSS in React Applications using dangerouslySetInnerHTML
**Vulnerability:** Cross-Site Scripting (XSS) via `dangerouslySetInnerHTML`. Example: `dangerouslySetInnerHTML={{ __html: article.content }}` without sanitizing `article.content`.
**Learning:** Using `dangerouslySetInnerHTML` in React with unsanitized data (even if fetched from a database) leaves the application highly vulnerable to XSS. Attackers can inject malicious scripts which are then executed by the victims' browsers, leading to data breaches or unauthorized actions.
**Prevention:** Always sanitize dynamically generated HTML content on the server or client side before passing it to `dangerouslySetInnerHTML`. We should use libraries like `isomorphic-dompurify` in Next.js to apply server-side or isomorphic sanitization: `dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(article.content) }}`.
