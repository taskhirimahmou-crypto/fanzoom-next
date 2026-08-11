import 'server-only';

const DEVELOPMENT_APP_URL = 'http://localhost:3000';

export function getAppUrl(): string {
  const value = process.env.APP_URL?.trim();

  if (!value) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('[configuration] APP_URL is required in production. See .env.example.');
    }

    return DEVELOPMENT_APP_URL;
  }

  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.pathname !== '/' || url.search || url.hash) {
      throw new Error('expected an HTTP(S) origin without a path, query, or hash');
    }

    return url.origin;
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'invalid URL';
    throw new Error(`[configuration] APP_URL must be a valid origin: ${reason}`);
  }
}

export function getGoogleCallbackUrl(): string {
  return new URL('/api/auth/google/callback', getAppUrl()).toString();
}
