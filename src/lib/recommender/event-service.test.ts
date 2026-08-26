import { describe, expect, it, vi } from 'vitest';
import { FixedWindowRateLimiter } from '../rate-limit';
import {
  ingestRecommendationEvent,
  recordTrustedRecommendationEvent,
  recordTrustedRecommendationEventBatch,
  type RecommendationEventBatchRepository,
  type RecommendationEventRepository,
} from './event-service';
import type { RecommendationEventRecord } from './contracts';

const now = new Date('2026-08-11T12:00:00.000Z');
const validEvent = {
  idempotencyKey: 'share:12345678',
  articleId: 'abc123def456ghi',
  eventType: 'share',
  surface: 'article',
  occurredAt: now.toISOString(),
};

function createRepository() {
  const records = new Map<string, RecommendationEventRecord>();
  const repository: RecommendationEventRepository = {
    async findByIdempotencyKey(userId, key) {
      const record = records.get(`${userId}:${key}`);
      return record ? { eventId: record.eventId } : null;
    },
    async create(event) {
      records.set(`${event.userId}:${event.idempotencyKey}`, event);
      return { eventId: event.eventId };
    },
  };
  return { records, repository };
}

describe('recommendation event ingestion', () => {
  it('injects the authenticated user and returns the same event for retries', async () => {
    const { records, repository } = createRepository();
    const createEventId = vi.fn(() => 'server-event-id');
    const rateLimiter = new FixedWindowRateLimiter(10, 60_000);

    const first = await ingestRecommendationEvent(validEvent, 'auth-user', {
      repository,
      rateLimiter,
      now,
      createEventId,
    });
    const retry = await ingestRecommendationEvent(validEvent, 'auth-user', {
      repository,
      rateLimiter,
      now,
      createEventId,
    });

    expect(first).toEqual({ kind: 'created', eventId: 'server-event-id' });
    expect(retry).toEqual({ kind: 'duplicate', eventId: 'server-event-id' });
    expect(createEventId).toHaveBeenCalledTimes(1);
    expect(records.values().next().value).toMatchObject({ userId: 'auth-user' });
  });

  it('rejects forged user data before writing', async () => {
    const { records, repository } = createRepository();
    const result = await ingestRecommendationEvent(
      { ...validEvent, userId: 'forged-user' },
      'auth-user',
      { repository, rateLimiter: new FixedWindowRateLimiter(10, 60_000), now },
    );
    expect(result.kind).toBe('invalid');
    expect(records.size).toBe(0);
  });

  it('rate limits new keys but still allows idempotent retries', async () => {
    const { repository } = createRepository();
    const rateLimiter = new FixedWindowRateLimiter(1, 60_000);
    const dependencies = { repository, rateLimiter, now, createEventId: () => 'event-1' };

    await ingestRecommendationEvent(validEvent, 'auth-user', dependencies);
    const retry = await ingestRecommendationEvent(validEvent, 'auth-user', dependencies);
    const limited = await ingestRecommendationEvent(
      { ...validEvent, idempotencyKey: 'share:87654321' },
      'auth-user',
      dependencies,
    );

    expect(retry.kind).toBe('duplicate');
    expect(limited.kind).toBe('rate_limited');
  });

  it('allows server-only event types through the trusted path', async () => {
    const { records, repository } = createRepository();
    const result = await recordTrustedRecommendationEvent(
      { ...validEvent, idempotencyKey: 'bookmark:123456', eventType: 'bookmark_add' },
      'auth-user',
      { repository, now, createEventId: () => 'trusted-event' },
    );

    expect(result).toEqual({ kind: 'created', eventId: 'trusted-event' });
    expect(records.values().next().value).toMatchObject({
      eventType: 'bookmark_add',
      userId: 'auth-user',
    });
  });

  it('writes served events in one idempotent batch and preserves trusted user attribution', async () => {
    const records = new Map<string, RecommendationEventRecord>();
    const create = vi.fn(async (event: RecommendationEventRecord) => {
      records.set(`${event.userId}:${event.idempotencyKey}`, event);
      return { eventId: event.eventId };
    });
    const repository: RecommendationEventBatchRepository = {
      async findByIdempotencyKey(userId, key) {
        const event = records.get(`${userId}:${key}`);
        return event ? { eventId: event.eventId } : null;
      },
      create,
      async findExistingIdempotencyKeys(userId, keys) {
        return new Set(keys.filter((key) => records.has(`${userId}:${key}`)));
      },
    };
    const served = [1, 2].map((rank) => ({
      idempotencyKey: `served:feed_12345678:article1234567${rank}:${rank}`,
      articleId: `article1234567${rank}`,
      eventType: 'served',
      surface: 'for_you',
      feedId: 'feed_12345678',
      rank,
      algorithmVersion: 'baseline-category-round-robin-v1',
      occurredAt: now.toISOString(),
    }));

    let eventSequence = 0;
    const first = await recordTrustedRecommendationEventBatch(served, 'auth-user', {
      repository,
      now,
      createEventId: () => `event-${++eventSequence}`,
    });
    const retry = await recordTrustedRecommendationEventBatch(served, 'auth-user', {
      repository,
      now,
    });

    expect(first).toEqual({
      kind: 'completed', total: 2, created: 2, duplicates: 0, failures: [],
    });
    expect(retry).toEqual({
      kind: 'completed', total: 2, created: 0, duplicates: 2, failures: [],
    });
    expect(create).toHaveBeenCalledTimes(2);
    expect([...records.values()]).toEqual([
      expect.objectContaining({ userId: 'auth-user', eventType: 'served', rank: 1 }),
      expect.objectContaining({ userId: 'auth-user', eventType: 'served', rank: 2 }),
    ]);
  });

  it('reports partial failures and fills only missing events on retry', async () => {
    const records = new Map<string, RecommendationEventRecord>();
    let failSecond = true;
    const repository: RecommendationEventBatchRepository = {
      async findByIdempotencyKey(userId, key) {
        const event = records.get(`${userId}:${key}`);
        return event ? { eventId: event.eventId } : null;
      },
      async findExistingIdempotencyKeys(userId, keys) {
        return new Set(keys.filter((key) => records.has(`${userId}:${key}`)));
      },
      async create(event) {
        if (failSecond && event.rank === 2) throw new Error('temporary');
        records.set(`${event.userId}:${event.idempotencyKey}`, event);
        return { eventId: event.eventId };
      },
    };
    const served = [1, 2, 3].map((rank) => ({
      idempotencyKey: `served:feed_12345678:article1234567${rank}:${rank}`,
      articleId: `article1234567${rank}`,
      eventType: 'served',
      surface: 'for_you',
      feedId: 'feed_12345678',
      rank,
      algorithmVersion: 'baseline-category-round-robin-v1',
      occurredAt: now.toISOString(),
    }));

    const first = await recordTrustedRecommendationEventBatch(served, 'auth-user', {
      repository, now,
    });
    expect(first).toMatchObject({
      kind: 'partial_failure', total: 3, created: 2, duplicates: 0,
      failures: [{ index: 1, articleId: 'article12345672', code: 'persist_failed' }],
    });

    failSecond = false;
    const retry = await recordTrustedRecommendationEventBatch(served, 'auth-user', {
      repository, now,
    });
    expect(retry).toEqual({
      kind: 'completed', total: 3, created: 1, duplicates: 2, failures: [],
    });
    expect(records.size).toBe(3);
  });
});
