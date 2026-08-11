// src/app/api/auth/login/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getPocketBase } from '@/lib/pocketbase';
import { AUTH_COOKIE, authCookieOptions, serializeAuthSession } from '@/lib/auth-cookies';

export async function POST(req: NextRequest) {
  const { email, password } = await req.json();
  if (!email || !password) {
    return NextResponse.json({ error: 'ایمیل و رمز عبور الزامی است' }, { status: 400 });
  }

  const pb = getPocketBase();
  try {
    const auth = await pb.collection('users').authWithPassword(email, password);
    const res = NextResponse.json({ ok: true });
    res.cookies.set(AUTH_COOKIE, serializeAuthSession(auth.token, auth.record), authCookieOptions);
    return res;
  } catch {
    return NextResponse.json({ error: 'ایمیل یا رمز عبور اشتباه است' }, { status: 401 });
  }
}
