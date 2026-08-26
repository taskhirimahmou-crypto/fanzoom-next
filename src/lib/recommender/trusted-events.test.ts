import { describe, expect, it } from 'vitest';
import {
  openEventIdempotencyKey,
  servedEventIdempotencyKey,
  trustedEventMatchesStored,
} from './trusted-events';

describe('trusted served event identity', () => {
  it('binds surface and algorithm version without exceeding the event key limit', () => {
    const common = ['feed_12345678', 'article12345678', 1] as const;
    const first = servedEventIdempotencyKey(common[0], 'for_you', 'baseline-v1', common[1], common[2]);
    const otherSurface = servedEventIdempotencyKey(common[0], 'home', 'baseline-v1', common[1], common[2]);
    const otherAlgorithm = servedEventIdempotencyKey(common[0], 'for_you', 'baseline-v2', common[1], common[2]);

    expect(first).not.toBe(otherSurface);
    expect(first).not.toBe(otherAlgorithm);
    expect(first.length).toBeLessThanOrEqual(128);
  });

  it('binds the complete accepted open attribution to its idempotency key', () => {
    const attribution = {
      feedId: 'feed_12345678',
      rank: 1,
      surface: 'for_you' as const,
      algorithmVersion: 'baseline-category-round-robin-v1',
    };
    const first = openEventIdempotencyKey('article12345678', attribution, 123456);
    const otherRank = openEventIdempotencyKey(
      'article12345678',
      { ...attribution, rank: 2 },
      123456,
    );
    const direct = openEventIdempotencyKey('article12345678', undefined, 123456);

    expect(first).not.toBe(otherRank);
    expect(first).not.toBe(direct);
    expect(first.length).toBeLessThanOrEqual(128);
  });

  it('accepts a legacy duplicate only when all event coordinates match', () => {
    const stored = {
      eventId: 'event_legacy',
      articleId: 'article12345678',
      eventType: 'open' as const,
      surface: 'for_you' as const,
      feedId: 'feed_12345678',
      rank: 1,
      algorithmVersion: 'baseline-v1',
      maxProgress: undefined,
      reasonCode: undefined,
    };
    const candidate = {
      idempotencyKey: 'open:new-key',
      articleId: stored.articleId,
      eventType: stored.eventType,
      surface: stored.surface,
      feedId: stored.feedId,
      rank: stored.rank,
      algorithmVersion: stored.algorithmVersion,
    };

    expect(trustedEventMatchesStored(stored, candidate)).toBe(true);
    expect(trustedEventMatchesStored(stored, { ...candidate, rank: 2 })).toBe(false);
    expect(trustedEventMatchesStored(stored, { ...candidate, surface: 'home' })).toBe(false);
  });
});
