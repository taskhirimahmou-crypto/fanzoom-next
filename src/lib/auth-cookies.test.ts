import { describe, expect, it, vi } from 'vitest';
import {
  AUTH_COOKIE,
  clearAuthSessionCookie,
  parseAuthSession,
  serializeAuthSession,
  setAuthSessionCookie,
} from './auth-cookies';

const session = {
  token: 'signed-token',
  record: {
    id: 'user-id',
    collectionId: 'users',
    collectionName: 'users',
    email: 'reader@example.com',
  },
};

describe('auth cookie helpers', () => {
  it('round-trips the controlled JSON session format', () => {
    expect(parseAuthSession(serializeAuthSession(session))).toEqual(session);
  });

  it.each([undefined, '', 'signed-token', '{}', '{bad json']) (
    'rejects an invalid or legacy session value: %s',
    (value) => expect(parseAuthSession(value)).toBeNull()
  );

  it('sets the session with the shared security policy', () => {
    const writer = { set: vi.fn(), delete: vi.fn() };

    setAuthSessionCookie(writer, session);

    expect(writer.set).toHaveBeenCalledWith(
      AUTH_COOKIE,
      serializeAuthSession(session),
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 30,
      })
    );
  });

  it('clears the canonical cookie', () => {
    const writer = { set: vi.fn(), delete: vi.fn() };

    clearAuthSessionCookie(writer);

    expect(writer.delete).toHaveBeenCalledWith(AUTH_COOKIE);
  });
});
