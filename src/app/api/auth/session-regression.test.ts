import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  incomingCookie: undefined as string | undefined,
  oauthCookie: JSON.stringify({ state: 'state', codeVerifier: 'verifier' }),
  save: vi.fn(),
  clear: vi.fn(),
  refresh: vi.fn(async () => ({})),
  passwordAuth: vi.fn(),
  create: vi.fn(async () => ({})),
  oauthAuth: vi.fn(),
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) => {
      const value = name === 'pb_auth' ? mocks.incomingCookie : mocks.oauthCookie;
      return value ? { value } : undefined;
    },
  })),
}));

const pb = {
  authStore: { save: mocks.save, clear: mocks.clear, get isValid() { return true; } },
  collection: (name: string) => ({
    create: mocks.create,
    authWithPassword: mocks.passwordAuth,
    authWithOAuth2Code: mocks.oauthAuth,
    authRefresh: mocks.refresh,
    name,
  }),
};
vi.mock('@/lib/pocketbase', () => ({ getPocketBase: () => pb }));
vi.mock('pocketbase', () => ({ default: class PocketBase { authStore = pb.authStore; collection = pb.collection; } }));

import { POST as login } from './login/route';
import { POST as register } from './register/route';
import { GET as callback } from './google/callback/route';
import { AUTH_COOKIE, getServerPocketBase, parseAuthSession } from '@/lib/auth-cookies';

describe('authentication session format regression', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.incomingCookie = undefined;
    const auth = { token: 'same-token', record: { id: 'user-1', email: 'fan@example.com' } };
    mocks.passwordAuth.mockResolvedValue(auth);
    mocks.oauthAuth.mockResolvedValue(auth);
  });

  it('login, register, and Google callback produce the exact same readable session', async () => {
    const loginResponse = await login(new Request('https://fanzoom.example/api/auth/login', {
      method: 'POST', body: JSON.stringify({ email: 'fan@example.com', password: 'password1' }),
    }) as never);
    const registerResponse = await register(new Request('https://fanzoom.example/api/auth/register', {
      method: 'POST', body: JSON.stringify({ email: 'fan@example.com', password: 'password1' }),
    }) as never);
    const callbackResponse = await callback(
      new Request('https://fanzoom.example/api/auth/google/callback?code=code&state=state')
    );

    const values = [loginResponse, registerResponse, callbackResponse]
      .map((response) => response.cookies.get(AUTH_COOKIE)!.value);
    expect(new Set(values).size).toBe(1);
    expect(parseAuthSession(values[0])).toEqual({
      token: 'same-token', record: { id: 'user-1', email: 'fan@example.com' },
    });

    mocks.incomingCookie = values[0];
    await getServerPocketBase();
    expect(mocks.save).toHaveBeenCalledWith('same-token', {
      id: 'user-1', email: 'fan@example.com',
    });
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });
});
