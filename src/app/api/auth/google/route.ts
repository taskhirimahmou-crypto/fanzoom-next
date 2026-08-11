import { NextRequest, NextResponse } from 'next/server';
import PocketBase from 'pocketbase';

export const OAUTH_COOKIE = 'pb_oauth';
export const OAUTH_COOKIE_MAX_AGE = 10 * 60;

export function canonicalOrigin(requestUrl: string): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  return new URL(configured || requestUrl).origin;
}

export function safeReturnTo(value: string | null): string {
  return value?.startsWith('/') && !value.startsWith('//') ? value : '/';
}

export async function GET(req: NextRequest) {
  const origin = canonicalOrigin(req.url);
  try {
    const pb = new PocketBase(
      process.env.NEXT_PUBLIC_POCKETBASE_URL || 'http://127.0.0.1:8090'
    );
    const methods = await pb.collection('users').listAuthMethods();
    const google = methods.oauth2.providers.find((provider) => provider.name === 'google');
    if (!google) throw new Error('Google OAuth is not configured');

    const callbackUrl = `${origin}/api/auth/google/callback`;
    const response = NextResponse.redirect(`${google.authURL}${encodeURIComponent(callbackUrl)}`);
    response.cookies.set(
      OAUTH_COOKIE,
      JSON.stringify({
        state: google.state,
        codeVerifier: google.codeVerifier,
        returnTo: safeReturnTo(req.nextUrl.searchParams.get('returnTo')),
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
    return NextResponse.redirect(`${origin}/login?error=oauth_failed`);
  }
}
