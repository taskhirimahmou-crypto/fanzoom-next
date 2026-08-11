import { cookies } from 'next/headers';
import PocketBase, { type RecordModel } from 'pocketbase';

export const AUTH_COOKIE = 'pb_auth';
export const OAUTH_STATE_COOKIE = 'google_oauth_state';
export const OAUTH_VERIFIER_COOKIE = 'google_oauth_verifier';
const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

export type AuthSession = {
  token: string;
  record: RecordModel;
};

type CookieWriter = {
  set(name: string, value: string, options: {
    httpOnly: boolean;
    secure: boolean;
    sameSite: 'lax';
    path: string;
    maxAge: number;
  }): unknown;
  delete(name: string): unknown;
};

const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: SESSION_MAX_AGE,
};

/** The app's single session format: controlled JSON containing token + record. */
export function serializeAuthSession(session: AuthSession): string {
  return JSON.stringify({ token: session.token, record: session.record });
}

export function parseAuthSession(value: string | undefined): AuthSession | null {
  if (!value) return null;

  try {
    const session: unknown = JSON.parse(value);
    if (
      typeof session === 'object' &&
      session !== null &&
      typeof (session as AuthSession).token === 'string' &&
      (session as AuthSession).token.length > 0 &&
      typeof (session as AuthSession).record === 'object' &&
      (session as AuthSession).record !== null
    ) {
      return session as AuthSession;
    }
  } catch {
    // Invalid or legacy cookie values are treated as signed out.
  }

  return null;
}

export function setAuthSessionCookie(writer: CookieWriter, session: AuthSession) {
  writer.set(AUTH_COOKIE, serializeAuthSession(session), sessionCookieOptions);
}

export function clearAuthSessionCookie(writer: CookieWriter) {
  writer.delete(AUTH_COOKIE);
}

/**
 * PocketBase instance برای server componentها —
 * اگر کاربر لاگین باشد، توکن را از کوکی می‌خواند و
 * با authRefresh اطلاعات کاربر (record) را هم از سرور می‌گیرد.
 */
export async function getServerPocketBase() {
  const url = process.env.NEXT_PUBLIC_POCKETBASE_URL || 'http://127.0.0.1:8090';
  const pb = new PocketBase(url);
  
  const cookieStore = await cookies();
  const session = parseAuthSession(cookieStore.get(AUTH_COOKIE)?.value);

  if (session) {
    pb.authStore.save(session.token, session.record);
  }
  
  return pb;
}
