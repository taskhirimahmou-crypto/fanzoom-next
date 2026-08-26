import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import PocketBase, { ClientResponseError, type RecordModel } from 'pocketbase';
import { getPocketBaseServerUrl } from './pocketbase-url';

export const AUTH_COOKIE = 'pb_auth';
export const AUTH_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;
export const AUTH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: AUTH_COOKIE_MAX_AGE,
};
const USER_COLLECTION = 'users';

export function serializeAuthCookie(token: string, record: RecordModel) {
  return JSON.stringify({ token, record });
}

export type AuthUser = RecordModel & {
  id: string;
  email: string;
  displayName?: string;
  bio?: string;
  interests?: string[];
  created: string;
};

export type AuthContext = {
  pb: PocketBase;
  user: AuthUser;
};

export type RequireUserResult =
  | ({ ok: true } & AuthContext)
  | { ok: false; response: NextResponse };

function isUserRecord(record: RecordModel | null): record is AuthUser {
  return (
    record?.collectionName === USER_COLLECTION &&
    typeof record.id === 'string' &&
    record.id.length > 0
  );
}

function isRejectedSession(error: unknown) {
  return (
    error instanceof ClientResponseError &&
    (error.status === 401 || error.status === 403)
  );
}

/**
 * Imports the request session, rejects locally expired/wrong-collection sessions,
 * and refreshes otherwise. Connectivity and other PocketBase failures propagate so
 * callers don't mistake an unavailable backend for a logged-out user.
 */
export async function getServerPocketBase() {
  const pb = new PocketBase(getPocketBaseServerUrl());
  const authCookie = (await cookies()).get(AUTH_COOKIE)?.value;

  if (!authCookie) return pb;

  try {
    pb.authStore.loadFromCookie(`${AUTH_COOKIE}=${authCookie}`, AUTH_COOKIE);
  } catch {
    pb.authStore.clear();
    return pb;
  }

  // Never send an already expired token (or a token for another auth collection)
  // to the refresh endpoint.
  if (!pb.authStore.isValid || !isUserRecord(pb.authStore.record)) {
    pb.authStore.clear();
    return pb;
  }

  try {
    await pb.collection(USER_COLLECTION).authRefresh();
  } catch (error) {
    if (!isRejectedSession(error)) throw error;
    pb.authStore.clear();
    return pb;
  }

  if (!pb.authStore.isValid || !isUserRecord(pb.authStore.record)) {
    pb.authStore.clear();
  }

  return pb;
}

/** Reads a validated, freshly refreshed user for Server Components. */
export async function getCurrentUser(): Promise<AuthContext | null> {
  const pb = await getServerPocketBase();
  const user = pb.authStore.record;

  if (!pb.authStore.isValid || !isUserRecord(user)) return null;
  return { pb, user };
}

/**
 * Auth guard for Route Handlers. Its unauthorized response owns the Set-Cookie
 * header, allowing stale or malformed sessions to be removed by the browser.
 */
export async function requireUser(): Promise<RequireUserResult> {
  const auth = await getCurrentUser();
  if (auth) return { ok: true, ...auth };

  const response = NextResponse.json(
    { error: 'ابتدا با حساب کاربری وارد شوید' },
    { status: 401 },
  );
  response.cookies.delete(AUTH_COOKIE);
  return { ok: false, response };
}
