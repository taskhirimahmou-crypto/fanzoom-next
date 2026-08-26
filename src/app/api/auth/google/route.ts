import { NextRequest, NextResponse } from 'next/server';
import { getServerPocketBase } from '@/lib/auth-cookies';
import { getAppUrl, safeRedirectPath } from '@/lib/auth-redirect';

const OAUTH_COOKIE = 'google_oauth';
const OAUTH_COOKIE_MAX_AGE = 60 * 5;

export async function GET(req: NextRequest) {
  let appUrl: string;
  try {
    appUrl = getAppUrl(req.nextUrl.origin);
  } catch (error) {
    console.error('🔴 Google OAuth configuration error:', error);
    return NextResponse.json(
      { error: 'Google OAuth is not configured' },
      { status: 500 },
    );
  }

  try {
    const pb = await getServerPocketBase();
    const authMethods = await pb.collection('users').listAuthMethods();
    const google = authMethods.oauth2.providers.find(
      (provider) => provider.name === 'google'
    );

    if (!authMethods.oauth2.enabled || !google) {
      throw new Error('Google OAuth is not enabled for the users collection');
    }

    const returnTo = safeRedirectPath(req.nextUrl.searchParams.get('redirect'));
    const redirectUrl = new URL('/api/auth/google/callback', appUrl).toString();
    const authorizationUrl = new URL(google.authURL);
    authorizationUrl.searchParams.set('redirect_uri', redirectUrl);

    const response = NextResponse.redirect(authorizationUrl);
    response.cookies.set(
      OAUTH_COOKIE,
      JSON.stringify({
        state: google.state,
        codeVerifier: google.codeVerifier,
        returnTo,
      }),
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
    const loginUrl = new URL('/login', appUrl);
    loginUrl.searchParams.set('error', 'oauth_configuration');
    return NextResponse.redirect(loginUrl);
  }
}
