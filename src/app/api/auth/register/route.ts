// src/app/api/auth/register/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getPocketBase } from '@/lib/pocketbase';
import { AUTH_COOKIE } from '@/lib/auth-cookies';

export async function POST(req: NextRequest) {
  const { email, password, displayName } = await req.json();
  if (!email || !password) {
    return NextResponse.json({ error: 'ایمیل و رمز عبور الزامی است' }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'رمز عبور باید حداقل ۸ کاراکتر باشد' }, { status: 400 });
  }

  const pb = getPocketBase();
  try {
    await pb.collection('users').create({
      email,
      password,
      passwordConfirm: password,
      displayName: displayName || email.split('@')[0],
    });
    const auth = await pb.collection('users').authWithPassword(email, password);
    const res = NextResponse.json({ ok: true });
    res.cookies.set(AUTH_COOKIE, auth.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });
    return res;
  } catch (e) {
    const data = (e as any)?.response?.data?.data;
    const msg = data?.email?.message
      ? 'این ایمیل قبلاً ثبت شده است'
      : 'ثبت‌نام انجام نشد؛ دوباره تلاش کنید';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}