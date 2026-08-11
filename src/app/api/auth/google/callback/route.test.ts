import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  oauthCookie: undefined as string | undefined,
  exchange: vi.fn(),
}));
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ get: () => mocks.oauthCookie ? { value: mocks.oauthCookie } : undefined })),
}));
vi.mock('pocketbase', () => ({
  default: class PocketBase {
    collection() { return { authWithOAuth2Code: mocks.exchange }; }
  },
}));

import { AUTH_COOKIE, parseAuthSession } from '@/lib/auth-cookies';
import { OAUTH_COOKIE } from '../route';
import { GET } from './route';

describe('Google callback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.NEXT_PUBLIC_APP_URL;
    mocks.oauthCookie = JSON.stringify({ state: 'state', codeVerifier: 'verifier', returnTo: '/bookmarks' });
    mocks.exchange.mockResolvedValue({ token: 'token', record: { id: 'user-1' } });
  });

  it('exchanges the code, writes a session, clears OAuth context, and redirects safely', async () => {
    const response = await GET(new Request('https://fanzoom.example/api/auth/google/callback?code=code&state=state'));
    expect(mocks.exchange).toHaveBeenCalledWith(
      'google', 'code', 'verifier', 'https://fanzoom.example/api/auth/google/callback'
    );
    expect(parseAuthSession(response.cookies.get(AUTH_COOKIE)!.value)).toEqual({ token: 'token', record: { id: 'user-1' } });
    expect(response.cookies.get(OAUTH_COOKIE)!.value).toBe('');
    expect(response.headers.get('location')).toBe('https://fanzoom.example/bookmarks');
  });

  it.each([
    ['missing code', '?state=state'],
    ['provider error', '?error=access_denied&state=state'],
    ['invalid state', '?code=code&state=wrong'],
  ])('rejects %s before exchange', async (_name, query) => {
    const response = await GET(new Request(`https://fanzoom.example/api/auth/google/callback${query}`));
    expect(response.headers.get('location')).toBe('https://fanzoom.example/login');
    expect(mocks.exchange).not.toHaveBeenCalled();
  });

  it('rejects a missing verifier before exchange', async () => {
    mocks.oauthCookie = JSON.stringify({ state: 'state' });
    await GET(new Request('https://fanzoom.example/api/auth/google/callback?code=code&state=state'));
    expect(mocks.exchange).not.toHaveBeenCalled();
  });

  it('redirects to login when code exchange fails', async () => {
    mocks.exchange.mockRejectedValue(new Error('provider unavailable'));
    const response = await GET(new Request('https://fanzoom.example/api/auth/google/callback?code=code&state=state'));
    expect(response.headers.get('location')).toBe('https://fanzoom.example/login');
  });

  it.each(['https://evil.example', '//evil.example'])('never follows invalid return destination %s', async (returnTo) => {
    mocks.oauthCookie = JSON.stringify({ state: 'state', codeVerifier: 'verifier', returnTo });
    const response = await GET(new Request('https://fanzoom.example/api/auth/google/callback?code=code&state=state'));
    expect(response.headers.get('location')).toBe('https://fanzoom.example/');
  });
});
