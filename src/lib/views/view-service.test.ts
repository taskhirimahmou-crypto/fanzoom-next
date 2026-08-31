import { beforeEach, describe, expect, it, vi } from 'vitest';
import type PocketBase from 'pocketbase';
import { FixedWindowRateLimiter } from '../rate-limit';
import {
  countArticleView,
  PocketBaseAtomicViewCounter,
  requireViewRateLimitSecret,
  resetViewVisitorBootstrapForTests,
  resolveViewVisitorIdentity,
} from './view-service';

const secret = 'test-only-view-rate-limit-secret-32-bytes-minimum';

beforeEach(() => resetViewVisitorBootstrapForTests());

describe('view counter foundation', () => {
  it('counts once per visitor/article window without a second backend write', async () => {
    const increment = vi.fn().mockResolvedValue(11);
    const dependencies = {
      counter: { increment },
      burstLimiter: new FixedWindowRateLimiter(10, 60_000),
      dedupeLimiter: new FixedWindowRateLimiter(1, 600_000),
      nowMs: 0,
    };

    await expect(countArticleView('abc123def456ghi', 'visitor', dependencies)).resolves.toEqual({
      kind: 'counted',
      views: 11,
    });
    await expect(countArticleView('abc123def456ghi', 'visitor', dependencies)).resolves.toEqual({
      kind: 'duplicate',
    });
    expect(increment).toHaveBeenCalledTimes(1);
  });

  it('uses the superuser-only PocketBase atomic increment route', async () => {
    const send = vi.fn().mockResolvedValue({ views: 12 });
    const pb = {
      send,
    } as unknown as PocketBase;

    await expect(new PocketBaseAtomicViewCounter(pb).increment('abc123def456ghi')).resolves.toBe(12);
    expect(send).toHaveBeenCalledWith(
      '/api/fanzoom/articles/abc123def456ghi/increment-view',
      { method: 'POST' },
    );
  });

  it('rolls back deduplication when the backend write fails', async () => {
    const increment = vi
      .fn()
      .mockRejectedValueOnce(new Error('temporary'))
      .mockResolvedValueOnce(3);
    const dependencies = {
      counter: { increment },
      burstLimiter: new FixedWindowRateLimiter(1, 60_000),
      dedupeLimiter: new FixedWindowRateLimiter(1, 600_000),
      nowMs: 0,
    };

    await expect(countArticleView('abc123def456ghi', 'visitor', dependencies)).rejects.toThrow();
    await expect(countArticleView('abc123def456ghi', 'visitor', dependencies)).resolves.toEqual({
      kind: 'counted',
      views: 3,
    });
  });

  it('ignores client proxy headers by default and keeps identity in a signed cookie', () => {
    const first = resolveViewVisitorIdentity({
      headers: new Headers({ 'x-forwarded-for': '203.0.113.5', 'user-agent': 'test-agent' }),
      secret,
      nowMs: 0,
    });
    const retry = resolveViewVisitorIdentity({
      headers: new Headers({ 'x-forwarded-for': '198.51.100.9', 'user-agent': 'changed-agent' }),
      cookieValue: first.setCookieValue,
      secret,
      nowMs: 1,
    });
    expect(first.setCookieValue).toMatch(/^v1\./);
    expect(retry.visitorKey).toBe(first.visitorKey);
    expect(retry.setCookieValue).toBeUndefined();
    expect(retry.trustedProxyUsed).toBe(false);
  });

  it('uses only an explicitly configured single-IP proxy header', () => {
    const first = resolveViewVisitorIdentity({
      headers: new Headers({ 'x-platform-client-ip': '203.0.113.5' }),
      secret,
      trustedProxyHeader: 'x-platform-client-ip',
      nowMs: 0,
    });
    const second = resolveViewVisitorIdentity({
      headers: new Headers({ 'x-platform-client-ip': '198.51.100.9' }),
      secret,
      trustedProxyHeader: 'x-platform-client-ip',
      nowMs: 0,
    });
    const ambiguous = resolveViewVisitorIdentity({
      headers: new Headers({ 'x-platform-client-ip': '203.0.113.5, 10.0.0.1' }),
      secret,
      trustedProxyHeader: 'x-platform-client-ip',
      nowMs: 0,
    });
    expect(first.trustedProxyUsed).toBe(true);
    expect(second.trustedProxyUsed).toBe(true);
    expect(second.visitorKey).not.toBe(first.visitorKey);
    expect(ambiguous.trustedProxyUsed).toBe(false);
  });

  it('fails closed when the signing secret is missing or short', () => {
    expect(() => requireViewRateLimitSecret(undefined)).toThrow('at least 32 bytes');
    expect(() => requireViewRateLimitSecret('short')).toThrow('at least 32 bytes');
  });
});
