import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import PocketBase from 'pocketbase';
import { AUTH_COOKIE } from '@/lib/auth-cookies';

const OAUTH_COOKIE = 'google_oauth';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const googleError = url.searchParams.get('error');

  const store = await cookies();
  const oauthCookie = store.get(OAUTH_COOKIE)?.value;
  const appUrl = process.env.APP_URL || url.origin;
  const redirectUrl = new URL('/api/auth/google/callback', appUrl).toString();
  const home = new URL('/', appUrl).toString();

  let oauth: { state: string; codeVerifier: string } | undefined;
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
    const response = NextResponse.redirect(new URL('/login', home));
    response.cookies.delete(OAUTH_COOKIE);
    return response;
  }

  try {
    const pb = new PocketBase(
      process.env.NEXT_PUBLIC_POCKETBASE_URL || 'http://127.0.0.1:8090'
    );

    // تبادل code — فقط با code معتبر
    const auth = await pb
      .collection('users')
      .authWithOAuth2Code('google', code, oauth.codeVerifier, redirectUrl);

    // کوکی با همان قرارداد route لاگین (JSON شامل token+record)
    const res = NextResponse.redirect(home);
    res.cookies.set(
      AUTH_COOKIE,
      JSON.stringify({ token: auth.token, record: auth.record }),
      {
        path: '/',
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 60 * 60 * 24 * 30,
      }
    );
    res.cookies.delete(OAUTH_COOKIE);
    return res;
  } catch (e) {
    console.error('🔴 Google OAuth error:', e);
    const response = NextResponse.redirect(new URL('/login', home));
    response.cookies.delete(OAUTH_COOKIE);
    return response;
  }
}
