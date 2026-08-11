const DEFAULT_REDIRECT = '/';

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
  const configured = process.env.APP_URL;
  if (!configured) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('APP_URL must be configured in production');
    }
    return new URL(requestOrigin).origin;
  }

  return new URL(configured).origin;
}
