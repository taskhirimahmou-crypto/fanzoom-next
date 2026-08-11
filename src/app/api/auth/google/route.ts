import { NextResponse } from 'next/server';
import { getAppUrl, getGoogleCallbackUrl } from '@/lib/app-env';
import { getPocketBase } from '@/lib/pocketbase';

export async function GET() {
  try {
    const pb = getPocketBase();
    const methods = await pb.collection('users').listAuthMethods();
    const provider = methods.oauth2.providers.find(({ name }) => name === 'google');

    if (!provider) {
      throw new Error('[configuration] Google OAuth is not enabled for the PocketBase users collection.');
    }

    const state = crypto.randomUUID();
    const callbackUrl = getGoogleCallbackUrl();
    const response = NextResponse.redirect(
      `${provider.authURL}${encodeURIComponent(callbackUrl)}&state=${encodeURIComponent(state)}`,
    );
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
      path: '/',
      maxAge: 10 * 60,
    };
    response.cookies.set('oauth_state', state, cookieOptions);
    response.cookies.set('oauth_code_verifier', provider.codeVerifier, cookieOptions);
    return response;
  } catch (error) {
    console.error('🔴 Google OAuth error:', error);
    return NextResponse.redirect(new URL('/login?error=oauth_failed', getAppUrl()));
  }
}
