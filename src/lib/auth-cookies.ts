// src/lib/auth-cookies.ts
import { cookies } from 'next/headers';
import PocketBase from 'pocketbase';

export const AUTH_COOKIE = 'pb_auth';

/**
 * PocketBase instance برای server componentها —
 * اگر کاربر لاگین باشد، توکن را از کوکی می‌خواند و
 * با authRefresh اطلاعات کاربر (record) را هم از سرور می‌گیرد.
 */
export async function getServerPocketBase() {
  const url = process.env.NEXT_PUBLIC_POCKETBASE_URL || 'http://127.0.0.1:8090';
  const pb = new PocketBase(url);
  
  const cookieStore = await cookies();
  const authCookie = cookieStore.get(AUTH_COOKIE);
  
  if (authCookie?.value) {
    try {
      const { token, record } = JSON.parse(authCookie.value);
      if (token && record) {
        pb.authStore.save(token, record);
      }
    } catch (err) {
      console.warn('🔴 Failed to parse auth cookie:', err);
    }
  }
  
  return pb;
}