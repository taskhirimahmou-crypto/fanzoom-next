import { describe, expect, it } from 'vitest';
import { preAuthRateLimitKey } from './request-rate-limit';

describe('pre-auth request rate-limit keys', () => {
  it('groups anonymous traffic without exposing cookie material', () => {
    expect(preAuthRateLimitKey('events', undefined)).toBe('events:anonymous');
    const first = preAuthRateLimitKey('events', 'secret-cookie-value');
    expect(first).toBe(preAuthRateLimitKey('events', 'secret-cookie-value'));
    expect(first).not.toContain('secret-cookie-value');
    expect(first).not.toBe(preAuthRateLimitKey('events', 'different-cookie-value'));
  });
});
