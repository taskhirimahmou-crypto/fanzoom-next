const DEFAULT_POCKETBASE_URL = 'https://my-backend-fanzoom.liara.run';

/**
 * Returns the PocketBase origin without a trailing slash.
 *
 * The project default keeps production authentication operational even when the
 * deployment environment has not injected NEXT_PUBLIC_POCKETBASE_URL. The env
 * variable remains available for previews and local development overrides.
 */
export function getPocketBaseUrl() {
  const configured = process.env.NEXT_PUBLIC_POCKETBASE_URL?.trim();
  return new URL(configured || DEFAULT_POCKETBASE_URL).origin;
}
