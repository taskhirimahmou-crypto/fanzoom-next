export const OAUTH_COOKIE = 'oauth_state';
export const OAUTH_MAX_AGE_SECONDS = 10 * 60;

export type OAuthErrorCode =
  | 'oauth_denied'
  | 'oauth_state_invalid'
  | 'oauth_expired'
  | 'oauth_exchange_failed';

export type OAuthCookie = {
  state: string;
  codeVerifier: string;
  redirect: string;
  createdAt: number;
};

/** Return only a same-origin path, never an absolute or protocol-relative URL. */
export function safeInternalRedirect(value: string | null | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/';

  try {
    const base = new URL('https://fanzoom.invalid');
    const parsed = new URL(value, base);
    if (parsed.origin !== base.origin) return '/';
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return '/';
  }
}

export function loginErrorUrl(
  origin: string,
  error: OAuthErrorCode,
  redirect = '/'
) {
  const url = new URL('/login', origin);
  url.searchParams.set('error', error);
  if (redirect !== '/') url.searchParams.set('redirect', redirect);
  return url;
}
