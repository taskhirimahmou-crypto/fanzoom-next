import { NextRequest, NextResponse } from 'next/server';
import { getServerPocketBase } from '@/lib/auth-cookies';
import {
  getGoogleOAuthRedirectUrl,
  GOOGLE_OAUTH_PROVIDER,
  OAUTH_SESSION_COOKIE,
  OAUTH_SESSION_MAX_AGE_SECONDS,
  type OAuthSession,
} from '@/lib/oauth-session';

export async function GET(req: NextRequest) {
  try {
    const pb = await getServerPocketBase();
    const methods = await pb.collection('users').listAuthMethods();
    const provider = methods.oauth2.providers.find(
      (candidate) => candidate.name === GOOGLE_OAUTH_PROVIDER
    );

    if (!provider) throw new Error('Google OAuth is not enabled in PocketBase');

    const redirectUrl = getGoogleOAuthRedirectUrl(req.nextUrl.origin);
    const session: OAuthSession = {
      version: 1,
      provider: GOOGLE_OAUTH_PROVIDER,
      state: provider.state,
      codeVerifier: provider.codeVerifier,
      redirectUrl,
      expiresAt: Date.now() + OAUTH_SESSION_MAX_AGE_SECONDS * 1000,
    };
    const res = NextResponse.redirect(`${provider.authURL}${redirectUrl}`);
    res.cookies.set(OAUTH_SESSION_COOKIE, JSON.stringify(session), {
      path: '/api/auth/google/callback',
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: OAUTH_SESSION_MAX_AGE_SECONDS,
    });
    return res;
  } catch (error) {
    console.error('🔴 Google OAuth error:', error);
    return NextResponse.redirect(new URL('/login?error=oauth_failed', req.url));
  }
}
