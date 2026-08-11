import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import PocketBase from 'pocketbase';
import { AUTH_COOKIE, authCookieOptions, serializeAuthSession } from '@/lib/auth-cookies';
import { canonicalOrigin, OAUTH_COOKIE, safeReturnTo } from '../route';

type OAuthContext = { state?: string; codeVerifier?: string; returnTo?: string };

function readOAuthContext(value?: string): OAuthContext | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? (parsed as OAuthContext) : null;
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = canonicalOrigin(req.url);
  const context = readOAuthContext((await cookies()).get(OAUTH_COOKIE)?.value);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  if (url.searchParams.has('error') || !code) {
    return NextResponse.redirect(`${origin}/login`);
  }
  if (!state || !context?.state || state !== context.state || !context.codeVerifier) {
    return NextResponse.redirect(`${origin}/login`);
  }

  try {
    const pb = new PocketBase(
      process.env.NEXT_PUBLIC_POCKETBASE_URL || 'http://127.0.0.1:8090'
    );
    const auth = await pb.collection('users').authWithOAuth2Code(
      'google',
      code,
      context.codeVerifier,
      `${origin}/api/auth/google/callback`
    );

    const response = NextResponse.redirect(`${origin}${safeReturnTo(context.returnTo || null)}`);
    response.cookies.set(AUTH_COOKIE, serializeAuthSession(auth.token, auth.record), authCookieOptions);
    response.cookies.delete(OAUTH_COOKIE);
    return response;
  } catch (error) {
    console.error('🔴 Google OAuth error:', error);
    return NextResponse.redirect(`${origin}/login`);
  }
}
