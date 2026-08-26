const LOCAL_POCKETBASE_URL = 'http://127.0.0.1:8090';
const DEFAULT_POCKETBASE_URL = 'https://my-backend-fanzoom.liara.run';

/**
 * Returns the public PocketBase origin without a trailing slash.
 */
export function getPocketBaseUrl() {
  const configured = process.env.NEXT_PUBLIC_POCKETBASE_URL?.trim();
  return new URL(configured || DEFAULT_POCKETBASE_URL).origin;
}

/** Uses the Docker-internal origin server-side, then falls back to the public URL. */
export function getPocketBaseServerUrl(): string {
  const internal = process.env.POCKETBASE_INTERNAL_URL?.trim();
  if (internal) return new URL(internal).origin;
  if (process.env.NEXT_PUBLIC_POCKETBASE_URL?.trim()) return getPocketBaseUrl();
  return process.env.NODE_ENV === 'production' ? DEFAULT_POCKETBASE_URL : LOCAL_POCKETBASE_URL;
}
