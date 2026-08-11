import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  cookieValue: undefined as string | undefined,
  save: vi.fn(),
  clear: vi.fn(),
  refresh: vi.fn(),
  valid: true,
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    get: () => (mocks.cookieValue === undefined ? undefined : { value: mocks.cookieValue }),
  })),
}));

vi.mock('pocketbase', () => ({
  default: class PocketBase {
    authStore = {
      save: mocks.save,
      clear: mocks.clear,
      get isValid() { return mocks.valid; },
    };
    collection() { return { authRefresh: mocks.refresh }; }
  },
}));

import { getServerPocketBase, parseAuthSession, serializeAuthSession } from './auth-cookies';

describe('auth cookie helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cookieValue = undefined;
    mocks.valid = true;
    mocks.refresh.mockResolvedValue({});
  });

  it('round-trips the canonical token and record format', () => {
    const record = { id: 'user-1', email: 'fan@example.com' };
    expect(parseAuthSession(serializeAuthSession('token', record))).toEqual({ token: 'token', record });
  });

  it('rejects malformed JSON and a missing record', () => {
    expect(parseAuthSession('{broken')).toBeNull();
    expect(parseAuthSession(JSON.stringify({ token: 'token' }))).toBeNull();
  });

  it('clears an expired token without refreshing it', async () => {
    mocks.cookieValue = serializeAuthSession('expired', { id: 'user-1' });
    mocks.valid = false;
    await getServerPocketBase();
    expect(mocks.save).toHaveBeenCalledWith('expired', { id: 'user-1' });
    expect(mocks.clear).toHaveBeenCalledOnce();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it('clears a session when server refresh fails', async () => {
    mocks.cookieValue = serializeAuthSession('valid', { id: 'user-1' });
    mocks.refresh.mockRejectedValue(new Error('unauthorized'));
    await getServerPocketBase();
    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(mocks.clear).toHaveBeenCalledOnce();
  });
});
