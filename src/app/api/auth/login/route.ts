// src/app/api/auth/login/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getPocketBase } from '@/lib/pocketbase';
import { AUTH_COOKIE } from '@/lib/auth-cookies';

export async function POST(req: NextRequest) {
  const { email, password } = await req.json();
  if (!email || !password) {
    return NextResponse.json({ error: 'ایمیل و رمز عبور الزامی است' }, { status: 400 });
  }

  const pb = getPocketBase();
  try {
    const auth = await pb.collection('users').authWithPassword(email, password);
    const res = NextResponse.json({ ok: true });
    res.cookies.set(AUTH_COOKIE, JSON.stringify({
      token: auth.token,
      record: auth.record
    }), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });
    return res;
  } catch {
    return NextResponse.json({ error: 'ایمیل یا رمز عبور اشتباه است' }, { status: 401 });
  }
}