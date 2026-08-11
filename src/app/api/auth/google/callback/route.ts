import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getPocketBase } from '@/lib/pocketbase';
import { AUTH_COOKIE } from '@/lib/auth-cookies';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const googleError = url.searchParams.get('error');

  const store = await cookies();
  const savedState = store.get('oauth_state')?.value;
  const home = url.origin;

  if (googleError || !code || !state || !savedState || state !== savedState) {
    return NextResponse.redirect(`${home}/login`);
  }

  try {
    const pb = getPocketBase();
    const auth = await pb.collection('users').authWithOAuth2({
      provider: 'google',
      code,
      redirectUrl: `${url.origin}/api/auth/google/callback`,
    });

    // کاربر جدید گوگل: اگر displayName خالی بود، نام گوگل را بگذار
    try {
      const rec = auth.record as { id: string; displayName?: string; name?: string };
      if (rec && !rec.displayName && rec.name) {
        await pb.collection('users').update(rec.id, { displayName: rec.name });
      }
    } catch {
      // غیرحیاتی — اگر نشد، بی‌خیال
    }

    // ست کردن کوکی دقیقاً مثل route لاگین معمولی
    const res = NextResponse.redirect(`${home}/`);
    res.cookies.set(AUTH_COOKIE, auth.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });
    store.delete('oauth_state');
    return res;
  } catch (e) {
    console.error('🔴 Google OAuth error:', e);
    return NextResponse.redirect(`${home}/login`);
  }
}