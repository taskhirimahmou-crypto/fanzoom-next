// src/lib/auth-cookies.ts
import { cookies } from 'next/headers';
import type PocketBase from 'pocketbase';
import { getPocketBase } from '@/lib/pocketbase';

export const AUTH_COOKIE = 'fanzoom_auth';

/**
 * PocketBase instance برای server componentها —
 * اگر کاربر لاگین باشد، توکن را از کوکی می‌خواند و
 * با authRefresh اطلاعات کاربر (record) را هم از سرور می‌گیرد.
 */
export async function getServerPocketBase(): Promise<PocketBase> {
  const pb = getPocketBase();
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE)?.value;
  if (token) {
    pb.authStore.save(token);
    try {
      // authRefresh هم توکن را اعتبارسنجی می‌کند و هم record کاربر را برمی‌گرداند
      await pb.collection('users').authRefresh();
    } catch {
      // توکن نامعتبر یا منقضی است
      pb.authStore.clear();
    }
  }
  return pb;
}