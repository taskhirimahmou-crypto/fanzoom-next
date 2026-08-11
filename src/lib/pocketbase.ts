// src/lib/pocketbase.ts
import PocketBase from 'pocketbase';
import { getPocketBaseUrl } from '@/lib/pocketbase-url';

/**
 * یک instance تازه‌ی PocketBase برای هر درخواست (server-side).
 * در server componentها هر بار صدا زده می‌شود تا stateless بماند
 * و auth token یا cache بین درخواست‌ها نشت نکند.
 */
export function getPocketBase(): PocketBase {
  const pb = new PocketBase(getPocketBaseUrl());
  
  // افزایش timeout از 10s به 30s
  pb.autoCancellation(false);
  
  return pb;
}
