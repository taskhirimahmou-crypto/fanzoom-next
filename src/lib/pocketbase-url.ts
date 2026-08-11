const DEVELOPMENT_POCKETBASE_URL = 'http://127.0.0.1:8090';

export function getPocketBaseUrl(): string {
  const value = process.env.NEXT_PUBLIC_POCKETBASE_URL?.trim();

  if (!value) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        '[configuration] NEXT_PUBLIC_POCKETBASE_URL is required in production. See .env.example.',
      );
    }

    return DEVELOPMENT_POCKETBASE_URL;
  }

  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.pathname !== '/' || url.search || url.hash) {
      throw new Error('expected an HTTP(S) origin without a path, query, or hash');
    }

    return url.origin;
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'invalid URL';
    throw new Error(
      `[configuration] NEXT_PUBLIC_POCKETBASE_URL must be a valid origin: ${reason}`,
    );
  }
}
