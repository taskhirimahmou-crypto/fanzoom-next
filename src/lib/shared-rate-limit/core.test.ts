import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  acquireSharedRateLimit,
  constantTimeSignatureEqual,
  isSharedRateLimitPermit,
  sharedRateLimitResponse,
} from './core';
import type { ServerRequestContext } from '../observability/request-context';

const context: ServerRequestContext = {
  requestId: '0191f3a5-2e88-7c02-a8fd-f0dc0353d6f1',
  route: '/api/local-test/rate-limit-benchmark',
  startedAtMs: 100,
  now: () => 120,
};
const request = { headers: { get: (name: string) => name === 'cookie' ? 'private-session-value' : null } };

function hookResponse(status = 200, overrides: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({
    allowed: status === 200,
    retryAfterSeconds: status === 429 ? 7 : 0,
    retryDeduplicated: false,
    writeCount: 2,
    results: [{ policy: '_internal.benchmark-saturated', layer: 'visitor', allowed: status === 200 }],
    ...overrides,
  }), { status, headers: status === 429 ? { 'Retry-After': '7' } : undefined });
}

describe('shared rate limiter core', () => {
  beforeEach(() => {
    process.env.SHARED_RATE_LIMIT_HOOK_SECRET = 'h'.repeat(48);
    process.env.RATE_LIMIT_KEY_SECRET = 'k'.repeat(48);
    process.env.SHARED_RATE_LIMIT_MODE = 'enforce';
    vi.stubEnv('NODE_ENV', 'test');
    delete process.env.FANZOOM_LOCAL_DOCKER;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('HMACs identities and creates an internal decision id unrelated to requestId', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const parsed = JSON.parse(String(init?.body));
      expect(parsed.decisionId).not.toBe(context.requestId);
      expect(parsed.buckets[0].keyHash).toMatch(/^[a-f0-9]{64}$/);
      expect(String(init?.body)).not.toContain('private-session-value');
      expect(String(init?.body)).not.toContain(context.requestId);
      return hookResponse();
    }) as unknown as typeof fetch;
    const result = await acquireSharedRateLimit(request, context, ['_internal.benchmark-saturated'], { fetchImpl });
    expect(result.kind).toBe('allowed');
    expect(isSharedRateLimitPermit(result.permit)).toBe(true);
  });

  it('retries the backend with exactly the same decision id', async () => {
    const bodies: string[] = [];
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      bodies.push(String(init?.body));
      if (bodies.length === 1) throw new Error('temporary network failure');
      return hookResponse(200, { retryDeduplicated: true, writeCount: 0 });
    }) as unknown as typeof fetch;
    const result = await acquireSharedRateLimit(request, context, ['_internal.benchmark-saturated'], { fetchImpl });
    expect(result.kind).toBe('allowed');
    expect(result.roundTrips).toBe(2);
    expect(bodies[0]).toBe(bodies[1]);
  });

  it('enforces deny with 429 and Retry-After', async () => {
    const fetchImpl = vi.fn(async () => hookResponse(429)) as unknown as typeof fetch;
    const result = await acquireSharedRateLimit(request, context, ['_internal.benchmark-saturated'], { fetchImpl });
    const response = sharedRateLimitResponse(context, result);
    expect(result.kind).toBe('denied');
    expect(response?.status).toBe(429);
    expect(response?.headers.get('Retry-After')).toBe('7');
  });

  it('fails closed in enforce and allows backend failure only in shadow', async () => {
    const fetchImpl = vi.fn(async () => { throw new Error('offline'); }) as unknown as typeof fetch;
    const enforced = await acquireSharedRateLimit(request, context, ['_internal.benchmark-saturated'], { fetchImpl });
    expect(enforced.kind).toBe('unavailable');
    expect(sharedRateLimitResponse(context, enforced)?.status).toBe(503);
    process.env.SHARED_RATE_LIMIT_MODE = 'shadow';
    const shadow = await acquireSharedRateLimit(request, context, ['_internal.benchmark-saturated'], { fetchImpl });
    expect(shadow.kind).toBe('allowed');
    expect(shadow.permit?.mode).toBe('shadow');
  });

  it('permits a no-hook baseline only in local non-production Docker', async () => {
    process.env.SHARED_RATE_LIMIT_MODE = 'baseline';
    process.env.FANZOOM_LOCAL_DOCKER = 'true';
    const fetchImpl = vi.fn();
    const result = await acquireSharedRateLimit(request, context, ['_internal.benchmark-saturated'], { fetchImpl });
    expect(result).toMatchObject({
      kind: 'allowed',
      backendAllowed: true,
      hookDurationMs: 0,
      writeCount: 0,
      roundTrips: 0,
    });
    expect(fetchImpl).not.toHaveBeenCalled();

    vi.stubEnv('NODE_ENV', 'production');
    await acquireSharedRateLimit(request, context, ['_internal.benchmark-saturated'], { fetchImpl });
    expect(fetchImpl).toHaveBeenCalled();
  });

  it('uses constant-time comparison only for fixed-length hex signatures', () => {
    expect(constantTimeSignatureEqual('a'.repeat(64), 'a'.repeat(64))).toBe(true);
    expect(constantTimeSignatureEqual('a'.repeat(64), 'b'.repeat(64))).toBe(false);
    expect(constantTimeSignatureEqual('short', 'short')).toBe(false);
  });
});
