import { NextRequest, NextResponse } from 'next/server';
import { createHash, randomBytes } from 'crypto';
import {
  loginErrorUrl,
  OAUTH_COOKIE,
  OAUTH_MAX_AGE_SECONDS,
  safeInternalRedirect,
  type OAuthCookie,
} from '@/lib/oauth';

export async function GET(req: NextRequest) {
  const redirect = safeInternalRedirect(req.nextUrl.searchParams.get('redirect'));

  try {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId) throw new Error('Google OAuth client ID is not configured');

    const state = randomBytes(32).toString('base64url');
    const codeVerifier = randomBytes(32).toString('base64url');
    const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');
    const redirectUri = new URL('/api/auth/google/callback', req.nextUrl.origin).toString();
    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.search = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      prompt: 'select_account',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    }).toString();

    const oauthCookie: OAuthCookie = {
      state,
      codeVerifier,
      redirect,
      createdAt: Date.now(),
    };
    const response = NextResponse.redirect(authUrl);
    response.cookies.set(OAUTH_COOKIE, JSON.stringify(oauthCookie), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: OAUTH_MAX_AGE_SECONDS,
    });
    return response;
  } catch (error) {
    console.error('🔴 Google OAuth error:', error);
    return NextResponse.redirect(loginErrorUrl(req.nextUrl.origin, 'oauth_exchange_failed', redirect));
  }
}
