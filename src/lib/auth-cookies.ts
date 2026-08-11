import { cookies } from 'next/headers';
import PocketBase, { type AuthRecord } from 'pocketbase';

export const AUTH_COOKIE = 'pb_auth';
export const AUTH_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

export type AuthSession = { token: string; record: Record<string, unknown> };

export const authCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: AUTH_COOKIE_MAX_AGE,
};

/** The single session representation written by every authentication route. */
export function serializeAuthSession(token: string, record: Record<string, unknown>): string {
  return JSON.stringify({ token, record });
}

export function parseAuthSession(value: string): AuthSession | null {
  try {
    const session: unknown = JSON.parse(value);
    if (
      !session ||
      typeof session !== 'object' ||
      typeof (session as AuthSession).token !== 'string' ||
      !(session as AuthSession).token ||
      !(session as AuthSession).record ||
      typeof (session as AuthSession).record !== 'object'
    ) {
      return null;
    }
    return session as AuthSession;
  } catch {
    return null;
  }
}

/** Load and server-verify a session before exposing it to server components. */
export async function getServerPocketBase() {
  const url = process.env.NEXT_PUBLIC_POCKETBASE_URL || 'http://127.0.0.1:8090';
  const pb = new PocketBase(url);
  const authCookie = (await cookies()).get(AUTH_COOKIE);
  const session = authCookie?.value ? parseAuthSession(authCookie.value) : null;

  if (!session) return pb;

  pb.authStore.save(session.token, session.record as AuthRecord);
  if (!pb.authStore.isValid) {
    pb.authStore.clear();
    return pb;
  }

  try {
    await pb.collection('users').authRefresh();
  } catch {
    pb.authStore.clear();
  }

  return pb;
}
