import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { AUTH_COOKIE } from '@/lib/auth-cookies';
import { getAppUrl, getGoogleCallbackUrl } from '@/lib/app-env';
import { getPocketBase } from '@/lib/pocketbase';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const googleError = url.searchParams.get('error');

  const store = await cookies();
  const savedState = store.get('oauth_state')?.value;
  const codeVerifier = store.get('oauth_code_verifier')?.value;
  const appUrl = getAppUrl();
  const callbackUrl = getGoogleCallbackUrl();

  // گارد: بدون code یا state نامعتبر → هرگز به authWithOAuth2 نرسیم
  if (googleError || !code || !state || !savedState || !codeVerifier || state !== savedState) {
    return NextResponse.redirect(new URL('/login', appUrl));
  }

  try {
    const pb = getPocketBase();

    // تبادل code — فقط با code معتبر
    const auth = await pb.collection('users').authWithOAuth2Code(
      'google',
      code,
      codeVerifier,
      callbackUrl,
    );

    // کوکی با همان قرارداد route لاگین (JSON شامل token+record)
    const res = NextResponse.redirect(new URL('/', appUrl));
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
    res.cookies.delete('oauth_state');
    res.cookies.delete('oauth_code_verifier');
    return res;
  } catch (e) {
    console.error('🔴 Google OAuth error:', e);
    return NextResponse.redirect(new URL('/login', appUrl));
  }
}
