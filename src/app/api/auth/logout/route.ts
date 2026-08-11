// src/app/api/auth/logout/route.ts
import { NextResponse } from 'next/server';
import { clearAuthSessionCookie } from '@/lib/auth-cookies';

export async function POST() {
  const res = NextResponse.json({ ok: true });
  clearAuthSessionCookie(res.cookies);
  return res;
}
