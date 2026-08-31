import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getAdminPocketBase } from '../pocketbase-admin';
import type { SharedRateLimitPermit } from './types';

describe('privileged route inventory guard', () => {
  it('rejects a forged permit before reading admin credentials or logging in', async () => {
    delete process.env.POCKETBASE_ADMIN_EMAIL;
    delete process.env.POCKETBASE_ADMIN_PASSWORD;
    await expect(getAdminPocketBase(
      '550e8400-e29b-41d4-a716-446655440000',
      {} as SharedRateLimitPermit,
    )).rejects.toThrow('shared_rate_limit_permit_missing');
  });

  it('keeps public health free of the shared limiter and superuser helper', () => {
    const source = readFileSync('src/app/api/health/route.ts', 'utf8');
    expect(source).not.toContain('acquireSharedRateLimit');
    expect(source).not.toContain('getAdminPocketBase');
    expect(source).toContain('checkPocketBaseAvailability');
  });

  it('centralizes every runtime superuser login in the permit-guarded helper', () => {
    const source = readFileSync('src/lib/pocketbase-admin.ts', 'utf8');
    expect(source.indexOf('isSharedRateLimitPermit(permit)')).toBeGreaterThan(-1);
    expect(source.indexOf('isSharedRateLimitPermit(permit)')).toBeLessThan(source.indexOf("collection('_superusers')"));
  });
});
