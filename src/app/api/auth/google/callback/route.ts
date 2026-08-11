import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import PocketBase from 'pocketbase';
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
    const pb = new PocketBase(
      process.env.NEXT_PUBLIC_POCKETBASE_URL || 'http://127.0.0.1:8090'
    );

    const auth = await pb.collection('users').authWithOAuth2({
      provider: 'google',
      code,
      redirectUrl: `${home}/api/auth/google/callback`,
    });

    // کاربر جدید گوگل: اگر displayName خالی بود، نام گوگل را بگذار
    try {
      const rec = auth.record as { id: string; displayName?: string; name?: string };
      if (rec && !rec.displayName && rec.name) {
        await pb.collection('users').update(rec.id, { displayName: rec.name });
        (auth.record as { displayName?: string }).displayName = rec.name;
      }
    } catch {
      // غیرحیاتی — اگر نشد، بی‌خیال
    }

    // ست کردن کوکی با همان قرارداد route لاگین (JSON شامل token+record)
    const res = NextResponse.redirect(`${home}/`);
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
    return res;
  } catch (e) {
    console.error('🔴 Google OAuth error:', e);
    return NextResponse.redirect(`${home}/login`);
  }
}