// src/app/api/auth/logout/route.ts
import { NextResponse } from 'next/server';
import { AUTH_COOKIE } from '@/lib/auth-cookies';

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
  return res;
}