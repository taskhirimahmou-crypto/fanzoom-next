// src/lib/pocketbase.ts
import PocketBase from 'pocketbase';

const POCKETBASE_URL =
  process.env.NEXT_PUBLIC_POCKETBASE_URL || 'http://127.0.0.1:8090';

/**
 * یک instance تازه‌ی PocketBase برای هر درخواست (server-side).
 * در server componentها هر بار صدا زده می‌شود تا stateless بماند
 * و auth token یا cache بین درخواست‌ها نشت نکند.
 */
export function getPocketBase(): PocketBase {
  return new PocketBase(POCKETBASE_URL);
}