import { describe, expect, it } from 'vitest';
import { FixedWindowRateLimiter } from './rate-limit';

describe('FixedWindowRateLimiter', () => {
  it('limits a key and resets after the configured window', () => {
    const limiter = new FixedWindowRateLimiter(2, 1_000);

    expect(limiter.consume('user', 0).allowed).toBe(true);
    expect(limiter.consume('user', 1).allowed).toBe(true);
    expect(limiter.consume('user', 2)).toMatchObject({
      allowed: false,
      retryAfterSeconds: 1,
    });
    expect(limiter.consume('user', 1_000).allowed).toBe(true);
  });

  it('keeps counters isolated and supports explicit rollback', () => {
    const limiter = new FixedWindowRateLimiter(1, 1_000);
    expect(limiter.consume('a', 0).allowed).toBe(true);
    expect(limiter.consume('b', 0).allowed).toBe(true);
    limiter.reset('a');
    expect(limiter.consume('a', 1).allowed).toBe(true);
  });
});
