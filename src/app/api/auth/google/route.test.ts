import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const listAuthMethods = vi.hoisted(() => vi.fn());
vi.mock('pocketbase', () => ({
  default: class PocketBase {
    collection() { return { listAuthMethods }; }
  },
}));

import { GET, OAUTH_COOKIE, OAUTH_COOKIE_MAX_AGE } from './route';

describe('Google authorization route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.NEXT_PUBLIC_APP_URL;
    listAuthMethods.mockResolvedValue({
      oauth2: {
        providers: [{
          name: 'google',
          authURL: 'https://accounts.google.com/o/oauth2/auth?redirect_uri=',
          state: 'random-state',
          codeVerifier: 'pkce-verifier',
        }],
      },
    });
  });

  it('redirects to provider and stores short-lived state, verifier, and return path', async () => {
    const response = await GET(new NextRequest('https://fanzoom.example/api/auth/google?returnTo=%2Fbookmarks'));
    expect(response.headers.get('location')).toBe(
      'https://accounts.google.com/o/oauth2/auth?redirect_uri=' +
      encodeURIComponent('https://fanzoom.example/api/auth/google/callback')
    );
    const cookie = response.cookies.get(OAUTH_COOKIE);
    expect(JSON.parse(cookie!.value)).toEqual({
      state: 'random-state', codeVerifier: 'pkce-verifier', returnTo: '/bookmarks',
    });
    expect(response.headers.get('set-cookie')).toContain(`Max-Age=${OAUTH_COOKIE_MAX_AGE}`);
    expect(response.headers.get('set-cookie')).toContain('HttpOnly');
  });

  it('uses the configured canonical origin for the callback URL', async () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://www.fanzoom.example/some/path';
    const response = await GET(new NextRequest('https://internal.local/api/auth/google'));
    expect(decodeURIComponent(response.headers.get('location')!)).toContain(
      'https://www.fanzoom.example/api/auth/google/callback'
    );
  });

  it.each(['https://evil.example', '//evil.example'])('rejects open redirect destination %s', async (returnTo) => {
    const response = await GET(new NextRequest(`https://fanzoom.example/api/auth/google?returnTo=${encodeURIComponent(returnTo)}`));
    expect(JSON.parse(response.cookies.get(OAUTH_COOKIE)!.value).returnTo).toBe('/');
  });
});
