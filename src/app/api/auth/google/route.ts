import { NextRequest, NextResponse } from 'next/server';
import { getPocketBase } from '@/lib/pocketbase';
import { OAUTH_STATE_COOKIE, OAUTH_VERIFIER_COOKIE } from '@/lib/auth-cookies';

const oauthCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 60 * 10,
};

export async function GET(req: NextRequest) {
  try {
    const pb = getPocketBase();
    const methods = await pb.collection('users').listAuthMethods();
    const provider = methods.oauth2.providers.find(({ name }) => name === 'google');

    if (!provider) throw new Error('Google OAuth is not configured in PocketBase');

    const callbackUrl = new URL('/api/auth/google/callback', req.url).toString();
    const authUrl = new URL(`${provider.authURL}${encodeURIComponent(callbackUrl)}`);
    authUrl.searchParams.set('state', provider.state);

    const response = NextResponse.redirect(authUrl);
    response.cookies.set(OAUTH_STATE_COOKIE, provider.state, oauthCookieOptions);
    response.cookies.set(OAUTH_VERIFIER_COOKIE, provider.codeVerifier, oauthCookieOptions);
    return response;
  } catch (error) {
    console.error('🔴 Google OAuth error:', error);
    return NextResponse.redirect(new URL('/login?error=oauth_failed', req.url));
  }
}
