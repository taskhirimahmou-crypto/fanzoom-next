export type RateLimitDecision = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

type WindowState = {
  count: number;
  resetAt: number;
};

export class FixedWindowRateLimiter {
  private readonly states = new Map<string, WindowState>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly maxKeys = 10_000,
  ) {
    if (!Number.isInteger(limit) || limit < 1) throw new Error('limit must be a positive integer');
    if (!Number.isFinite(windowMs) || windowMs < 1) throw new Error('windowMs must be positive');
  }

  consume(key: string, nowMs = Date.now()): RateLimitDecision {
    this.pruneIfNeeded(nowMs);

    const current = this.states.get(key);
    if (!current || current.resetAt <= nowMs) {
      this.states.set(key, { count: 1, resetAt: nowMs + this.windowMs });
      return {
        allowed: true,
        remaining: this.limit - 1,
        retryAfterSeconds: 0,
      };
    }

    if (current.count >= this.limit) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - nowMs) / 1000)),
      };
    }

    current.count += 1;
    return {
      allowed: true,
      remaining: this.limit - current.count,
      retryAfterSeconds: 0,
    };
  }

  reset(key: string): void {
    this.states.delete(key);
  }

  private pruneIfNeeded(nowMs: number): void {
    if (this.states.size < this.maxKeys) return;
    for (const [key, state] of this.states) {
      if (state.resetAt <= nowMs) this.states.delete(key);
    }
    while (this.states.size >= this.maxKeys) {
      const oldestKey = this.states.keys().next().value as string | undefined;
      if (!oldestKey) break;
      this.states.delete(oldestKey);
    }
  }
}
