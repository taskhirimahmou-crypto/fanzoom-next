const DEFAULT_REDIRECT = '/';
const DEFAULT_APP_URL = 'https://fanzoom.ir';

export function safeRedirectPath(value: string | null | undefined) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) {
    return DEFAULT_REDIRECT;
  }

  try {
    const parsed = new URL(value, 'https://fanzoom.invalid');
    return parsed.origin === 'https://fanzoom.invalid'
      ? `${parsed.pathname}${parsed.search}${parsed.hash}`
      : DEFAULT_REDIRECT;
  } catch {
    return DEFAULT_REDIRECT;
  }
}

export function getAppUrl(requestOrigin: string) {
  const configured = process.env.APP_URL?.trim();
  if (!configured)
    return process.env.NODE_ENV === 'production'
      ? DEFAULT_APP_URL
      : new URL(requestOrigin).origin;

  return new URL(configured).origin;
}
