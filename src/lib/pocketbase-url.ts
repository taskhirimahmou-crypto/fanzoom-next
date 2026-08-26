const LOCAL_POCKETBASE_URL = 'http://127.0.0.1:8090';

/**
 * Server-side PocketBase URL.
 *
 * In Docker the browser must use localhost, while Next.js must use the
 * PocketBase service name on the Compose network. Outside Docker this keeps
 * the existing NEXT_PUBLIC_POCKETBASE_URL behavior.
 */
export function getPocketBaseServerUrl(): string {
  return (
    process.env.POCKETBASE_INTERNAL_URL ||
    process.env.NEXT_PUBLIC_POCKETBASE_URL ||
    LOCAL_POCKETBASE_URL
  );
}
