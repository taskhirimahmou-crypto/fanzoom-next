import { NextRequest, NextResponse } from 'next/server';
import { getServerPocketBase } from '@/lib/auth-cookies';

const OAUTH_COOKIE = 'google_oauth';
const OAUTH_COOKIE_MAX_AGE = 60 * 5;

export async function GET(req: NextRequest) {
  try {
    const pb = await getServerPocketBase();
    const authMethods = await pb.collection('users').listAuthMethods();
    const google = authMethods.oauth2.providers.find(
      (provider) => provider.name === 'google'
    );

    if (!authMethods.oauth2.enabled || !google) {
      throw new Error('Google OAuth is not enabled for the users collection');
    }

    const appUrl = process.env.APP_URL || req.nextUrl.origin;
    const redirectUrl = new URL('/api/auth/google/callback', appUrl).toString();
    const authorizationUrl = new URL(google.authURL);
    authorizationUrl.searchParams.set('redirect_uri', redirectUrl);

    const response = NextResponse.redirect(authorizationUrl);
    response.cookies.set(
      OAUTH_COOKIE,
      JSON.stringify({ state: google.state, codeVerifier: google.codeVerifier }),
      {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: OAUTH_COOKIE_MAX_AGE,
      }
    );

    return response;
  } catch (error) {
    console.error('🔴 Google OAuth error:', error);
    return NextResponse.redirect(new URL('/login?error=oauth_failed', req.url));
  }
}
