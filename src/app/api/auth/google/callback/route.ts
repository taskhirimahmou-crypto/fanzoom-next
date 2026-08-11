import { NextRequest, NextResponse } from 'next/server';
import {
  OAUTH_STATE_COOKIE,
  OAUTH_VERIFIER_COOKIE,
  setAuthSessionCookie,
} from '@/lib/auth-cookies';
import { getPocketBase } from '@/lib/pocketbase';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const googleError = url.searchParams.get('error');

  const savedState = req.cookies.get(OAUTH_STATE_COOKIE)?.value;
  const codeVerifier = req.cookies.get(OAUTH_VERIFIER_COOKIE)?.value;
  const home = url.origin;

  const oauthFailureResponse = () => {
    const response = NextResponse.redirect(`${home}/login?error=oauth_failed`);
    response.cookies.delete(OAUTH_STATE_COOKIE);
    response.cookies.delete(OAUTH_VERIFIER_COOKIE);
    return response;
  };

  // گارد: بدون code یا state نامعتبر → هرگز به authWithOAuth2 نرسیم
  if (googleError || !code || !state || !savedState || !codeVerifier || state !== savedState) {
    return oauthFailureResponse();
  }

  try {
    const pb = getPocketBase();
    const redirectUrl = `${home}/api/auth/google/callback`;

    // تبادل code — فقط با code معتبر
    const auth = await pb.collection('users').authWithOAuth2Code(
      'google',
      code,
      codeVerifier,
      redirectUrl
    );

    // کوکی با همان قرارداد route لاگین (JSON شامل token+record)
    const res = NextResponse.redirect(`${home}/`);
    setAuthSessionCookie(res.cookies, auth);
    res.cookies.delete(OAUTH_STATE_COOKIE);
    res.cookies.delete(OAUTH_VERIFIER_COOKIE);
    return res;
  } catch (e) {
    console.error('🔴 Google OAuth error:', e);
    return oauthFailureResponse();
  }
}
