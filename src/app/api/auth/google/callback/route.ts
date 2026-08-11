import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createHash, timingSafeEqual } from 'node:crypto';
import PocketBase, { ClientResponseError } from 'pocketbase';
import { AUTH_COOKIE } from '@/lib/auth-cookies';
import {
  getGoogleOAuthRedirectUrl,
  GOOGLE_OAUTH_CALLBACK_PATH,
  OAUTH_SESSION_COOKIE,
  parseOAuthSession,
} from '@/lib/oauth-session';

function safelyEqual(left: string, right: string) {
  const leftDigest = createHash('sha256').update(left).digest();
  const rightDigest = createHash('sha256').update(right).digest();
  return timingSafeEqual(leftDigest, rightDigest);
}

function redirectAndClear(origin: string, error?: string) {
  const destination = error ? `/login?error=${encodeURIComponent(error)}` : '/';
  const response = NextResponse.redirect(new URL(destination, origin));
  response.cookies.set(OAUTH_SESSION_COOKIE, '', {
    path: GOOGLE_OAUTH_CALLBACK_PATH,
    expires: new Date(0),
    maxAge: 0,
  });
  return response;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const providerError = url.searchParams.get('error');

  const store = await cookies();
  const session = parseOAuthSession(store.get(OAUTH_SESSION_COOKIE)?.value);
  const origin = url.origin;

  if (providerError === 'access_denied') return redirectAndClear(origin, 'oauth_cancelled');
  if (providerError) return redirectAndClear(origin, 'oauth_provider_error');
  if (!code) return redirectAndClear(origin, 'oauth_missing_code');
  if (!session) return redirectAndClear(origin, 'oauth_invalid_session');
  if (session.expiresAt <= Date.now()) return redirectAndClear(origin, 'oauth_session_expired');
  if (!state || !safelyEqual(state, session.state)) {
    return redirectAndClear(origin, 'oauth_invalid_state');
  }
  if (session.redirectUrl !== getGoogleOAuthRedirectUrl(origin)) {
    return redirectAndClear(origin, 'oauth_invalid_session');
  }

  try {
    const pb = new PocketBase(
      process.env.NEXT_PUBLIC_POCKETBASE_URL || 'http://127.0.0.1:8090'
    );

    // تبادل code — فقط با code معتبر
    const auth = await pb.collection('users').authWithOAuth2Code(
      session.provider,
      code,
      session.codeVerifier,
      session.redirectUrl
    );

    // کوکی با همان قرارداد route لاگین (JSON شامل token+record)
    const res = redirectAndClear(origin);
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
    return res;
  } catch (e) {
    console.error('🔴 Google OAuth error:', e);
    return redirectAndClear(
      origin,
      e instanceof ClientResponseError ? 'oauth_pocketbase_error' : 'oauth_callback_error'
    );
  }
}
