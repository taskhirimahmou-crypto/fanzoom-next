import { NextRequest, NextResponse } from 'next/server';
import { randomBytes, createHash } from 'crypto';

export async function GET(req: NextRequest) {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: 'تنظیمات گوگل کامل نیست' }, { status: 500 });
  }

  // محافظت CSRF + PKCE
  const state = randomBytes(16).toString('hex');
  const codeVerifier = randomBytes(32).toString('base64url'); // ۴۳ کاراکتر، مطابق استاندارد PKCE
  const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');

  const redirectUri = `${req.nextUrl.origin}/api/auth/google/callback`;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });

  const res = NextResponse.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
  );
  res.cookies.set('oauth_state', JSON.stringify({ state, codeVerifier }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  });
  return res;
}