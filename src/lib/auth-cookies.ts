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
  const authCookie = cookieStore.get('pb_auth');
  
  if (authCookie?.value) {
    // load auth state از cookie
    pb.authStore.loadFromCookie(`pb_auth=${authCookie.value}`);
    
    // اگر token معتبر به نظر می‌رسد، refresh کن
    if (pb.authStore.isValid) {
      try {
        await pb.collection('users').authRefresh();
      } catch (err) {
        // token منقضی شده → پاک کن
        console.warn('🔴 Auth token expired/invalid, clearing');
        pb.authStore.clear();
      }
    }
  }
  
  return pb;
}