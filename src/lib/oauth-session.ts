export const OAUTH_SESSION_COOKIE = 'oauth_state';
export const OAUTH_SESSION_MAX_AGE_SECONDS = 10 * 60;
export const GOOGLE_OAUTH_PROVIDER = 'google';
export const GOOGLE_OAUTH_CALLBACK_PATH = '/api/auth/google/callback';

export type OAuthSession = {
  version: 1;
  provider: typeof GOOGLE_OAUTH_PROVIDER;
  state: string;
  codeVerifier: string;
  redirectUrl: string;
  expiresAt: number;
};

export function getGoogleOAuthRedirectUrl(origin: string) {
  return new URL(GOOGLE_OAUTH_CALLBACK_PATH, origin).toString();
}

export function parseOAuthSession(value: string | undefined): OAuthSession | null {
  if (!value) return null;

  try {
    const session: unknown = JSON.parse(value);

    if (
      typeof session !== 'object' ||
      session === null ||
      Array.isArray(session)
    ) {
      return null;
    }

    const candidate = session as Record<string, unknown>;
    if (
      candidate.version !== 1 ||
      candidate.provider !== GOOGLE_OAUTH_PROVIDER ||
      typeof candidate.state !== 'string' ||
      candidate.state.length < 16 ||
      candidate.state.length > 512 ||
      typeof candidate.codeVerifier !== 'string' ||
      candidate.codeVerifier.length < 43 ||
      candidate.codeVerifier.length > 128 ||
      typeof candidate.redirectUrl !== 'string' ||
      candidate.redirectUrl.length > 2048 ||
      typeof candidate.expiresAt !== 'number' ||
      !Number.isSafeInteger(candidate.expiresAt)
    ) {
      return null;
    }

    const redirectUrl = new URL(candidate.redirectUrl);
    if (redirectUrl.pathname !== GOOGLE_OAUTH_CALLBACK_PATH) return null;

    return candidate as OAuthSession;
  } catch {
    return null;
  }
}
