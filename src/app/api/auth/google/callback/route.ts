import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import PocketBase from 'pocketbase';
import { AUTH_COOKIE } from '@/lib/auth-cookies';
import {
  loginErrorUrl,
  OAUTH_COOKIE,
  OAUTH_MAX_AGE_SECONDS,
  safeInternalRedirect,
  type OAuthCookie,
  type OAuthErrorCode,
} from '@/lib/oauth';

function errorResponse(origin: string, error: OAuthErrorCode, redirect = '/') {
  const response = NextResponse.redirect(loginErrorUrl(origin, error, redirect));
  response.cookies.delete(OAUTH_COOKIE);
  return response;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const googleError = url.searchParams.get('error');

  const store = await cookies();
  const savedCookie = store.get(OAUTH_COOKIE)?.value;
  const home = url.origin;

  let oauth: OAuthCookie | undefined;
  try {
    oauth = savedCookie ? (JSON.parse(savedCookie) as OAuthCookie) : undefined;
  } catch {
    // A malformed cookie is handled as an invalid state below.
  }
  const destination = safeInternalRedirect(oauth?.redirect);

  if (googleError) return errorResponse(home, 'oauth_denied', destination);
  if (
    !oauth ||
    !code ||
    !state ||
    typeof oauth.state !== 'string' ||
    state !== oauth.state ||
    typeof oauth.codeVerifier !== 'string' ||
    typeof oauth.createdAt !== 'number' ||
    !Number.isFinite(oauth.createdAt)
  ) {
    return errorResponse(home, 'oauth_state_invalid', destination);
  }
  if (Date.now() - oauth.createdAt > OAUTH_MAX_AGE_SECONDS * 1000) {
    return errorResponse(home, 'oauth_expired', destination);
  }

  try {
    const pb = new PocketBase(
      process.env.NEXT_PUBLIC_POCKETBASE_URL || 'http://127.0.0.1:8090'
    );

    // تبادل code — فقط با code معتبر
    const auth = await pb.collection('users').authWithOAuth2Code(
      'google',
      code,
      oauth.codeVerifier,
      `${home}/api/auth/google/callback`
    );

    // کوکی با همان قرارداد route لاگین (JSON شامل token+record)
    const res = NextResponse.redirect(new URL(destination, home));
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
    return errorResponse(home, 'oauth_exchange_failed', destination);
  }
}
