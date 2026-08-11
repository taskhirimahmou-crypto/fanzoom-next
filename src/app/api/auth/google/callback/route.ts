import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import PocketBase from 'pocketbase';
import {
  AUTH_COOKIE,
  AUTH_COOKIE_OPTIONS,
  serializeAuthCookie,
} from '@/lib/auth-cookies';
import { getAppUrl, safeRedirectPath } from '@/lib/auth-redirect';
import { getPocketBaseUrl } from '@/lib/pocketbase-url';

const OAUTH_COOKIE = 'google_oauth';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const googleError = url.searchParams.get('error');

  const store = await cookies();
  const oauthCookie = store.get(OAUTH_COOKIE)?.value;
  let appUrl: string;
  try {
    appUrl = getAppUrl(url.origin);
  } catch (error) {
    console.error('🔴 Google OAuth configuration error:', error);
    const response = NextResponse.json(
      { error: 'Google OAuth is not configured' },
      { status: 500 },
    );
    response.cookies.delete(OAUTH_COOKIE);
    return response;
  }
  const redirectUrl = new URL('/api/auth/google/callback', appUrl).toString();

  let oauth:
    | { state: string; codeVerifier: string; returnTo?: string }
    | undefined;
  try {
    oauth = oauthCookie ? JSON.parse(oauthCookie) : undefined;
  } catch {
    oauth = undefined;
  }

  // گارد: بدون code یا state نامعتبر → هرگز به authWithOAuth2 نرسیم
  if (
    googleError ||
    !code ||
    !state ||
    !oauth?.state ||
    !oauth.codeVerifier ||
    state !== oauth.state
  ) {
    const loginUrl = new URL('/login', appUrl);
    loginUrl.searchParams.set(
      'error',
      googleError === 'access_denied' ? 'oauth_denied' : 'oauth_expired',
    );
    const response = NextResponse.redirect(loginUrl);
    response.cookies.delete(OAUTH_COOKIE);
    return response;
  }

  try {
    const pb = new PocketBase(getPocketBaseUrl());

    // تبادل code — فقط با code معتبر
    const auth = await pb
      .collection('users')
      .authWithOAuth2Code('google', code, oauth.codeVerifier, redirectUrl);

    // کوکی با همان قرارداد route لاگین (JSON شامل token+record)
    const destination = new URL(safeRedirectPath(oauth.returnTo), appUrl);
    const res = NextResponse.redirect(destination);
    res.cookies.set(
      AUTH_COOKIE,
      serializeAuthCookie(auth.token, auth.record),
      AUTH_COOKIE_OPTIONS,
    );
    res.cookies.delete(OAUTH_COOKIE);
    return res;
  } catch (e) {
    console.error('🔴 Google OAuth error:', e);
    const loginUrl = new URL('/login', appUrl);
    loginUrl.searchParams.set('error', 'oauth_exchange_failed');
    const response = NextResponse.redirect(loginUrl);
    response.cookies.delete(OAUTH_COOKIE);
    return response;
  }
}
