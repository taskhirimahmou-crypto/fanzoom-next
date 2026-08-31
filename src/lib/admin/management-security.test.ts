import { describe, expect, it } from 'vitest';
import {
  createAdminTargetRef,
  equalAdminCsrfToken,
  isSameOriginAdminMutation,
  readAdminTargetRef,
} from './management-security';

describe('admin management security', () => {
  it('encrypts a short-lived target reference and rejects tampering or expiry', () => {
    const previous = process.env.RATE_LIMIT_KEY_SECRET;
    process.env.RATE_LIMIT_KEY_SECRET = 'local-test-secret-with-at-least-32-bytes';
    try {
      const targetRef = createAdminTargetRef('targetuser12345', { now: 1_000, ttlMs: 5_000 });
      expect(targetRef).not.toContain('targetuser12345');
      expect(readAdminTargetRef(targetRef, { now: 2_000 })).toEqual({
        userId: 'targetuser12345',
        expiresAt: 6_000,
      });
      expect(readAdminTargetRef(`${targetRef.slice(0, -1)}x`, { now: 2_000 })).toBeNull();
      expect(readAdminTargetRef(targetRef, { now: 6_000 })).toBeNull();
    } finally {
      if (previous === undefined) delete process.env.RATE_LIMIT_KEY_SECRET;
      else process.env.RATE_LIMIT_KEY_SECRET = previous;
    }
  });

  it('compares CSRF values exactly and requires the request Origin to match Host and scheme', () => {
    expect(equalAdminCsrfToken('same-value', 'same-value')).toBe(true);
    expect(equalAdminCsrfToken('same-value', 'other-value')).toBe(false);
    expect(equalAdminCsrfToken(null, 'same-value')).toBe(false);
    const valid = {
      nextUrl: new URL('http://localhost/api/admin/access'),
      headers: new Headers({ origin: 'http://localhost', host: 'localhost' }),
    };
    expect(isSameOriginAdminMutation(valid)).toBe(true);
    expect(isSameOriginAdminMutation({ ...valid, headers: new Headers({ origin: 'https://evil.test', host: 'localhost' }) })).toBe(false);
    expect(isSameOriginAdminMutation({ ...valid, headers: new Headers({ host: 'localhost' }) })).toBe(false);
  });
});
