import { describe, expect, it, vi } from 'vitest';
import { FixedWindowRateLimiter } from '../rate-limit';
import {
  ingestRecommendationEvent,
  recordTrustedRecommendationEvent,
  recordTrustedRecommendationEventBatch,
  servedEventSemanticMarker,
  type ClientRecommendationEventRepository,
  type RecommendationEventBatchRepository,
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
  const repository: ClientRecommendationEventRepository = {
    async findByIdempotencyKey(userId, key) {
      const record = records.get(`${userId}:${key}`);
      return record ? { eventId: record.eventId } : null;
    },
    async findClientEventByIdempotencyKey(userId, key) {
      const record = records.get(`${userId}:${key}`);
      if (!record) return null;
      return {
        eventId: record.eventId,
        articleId: record.articleId,
        eventType: record.eventType,
        surface: record.surface,
        feedId: record.feedId,
        rank: record.rank,
        algorithmVersion: record.algorithmVersion,
        maxProgress: record.maxProgress,
        reasonCode: record.reasonCode,
      };
    },
    async create(event) {
      records.set(`${event.userId}:${event.idempotencyKey}`, event);
      return { eventId: event.eventId };
    },
    async articleExists() {
      return true;
    },
    async hasRecentServed() {
      return true;
    },
    async hasRecentOpen() {
      return true;
    },
    async findHighestProgressMilestone() {
      return undefined;
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
      getRepository: async () => repository,
      rateLimiter,
      isPersonalizationEnabled: async () => true,
      now,
      createEventId,
    });
    const retry = await ingestRecommendationEvent(validEvent, 'auth-user', {
      getRepository: async () => repository,
      rateLimiter,
      isPersonalizationEnabled: async () => true,
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
      {
        getRepository: async () => repository,
        rateLimiter: new FixedWindowRateLimiter(10, 60_000),
        isPersonalizationEnabled: async () => true,
        now,
      },
    );
    expect(result.kind).toBe('invalid');
    expect(records.size).toBe(0);
  });

  it('charges normal idempotent retries and rate limits before repository access', async () => {
    const { repository } = createRepository();
    const findByIdempotencyKey = vi.spyOn(repository, 'findClientEventByIdempotencyKey');
    const rateLimiter = new FixedWindowRateLimiter(2, 60_000);
    const dependencies = {
      getRepository: async () => repository,
      rateLimiter,
      isPersonalizationEnabled: async () => true,
      now,
      createEventId: () => 'event-1',
    };

    await ingestRecommendationEvent(validEvent, 'auth-user', dependencies);
    const retry = await ingestRecommendationEvent(validEvent, 'auth-user', dependencies);
    const limited = await ingestRecommendationEvent(
      { ...validEvent, idempotencyKey: 'share:87654321' },
      'auth-user',
      dependencies,
    );

    expect(retry.kind).toBe('duplicate');
    expect(limited.kind).toBe('rate_limited');
    expect(findByIdempotencyKey).toHaveBeenCalledTimes(2);
  });

  it('rejects reuse of a client idempotency key for different event coordinates', async () => {
    const { records, repository } = createRepository();
    const dependencies = {
      getRepository: async () => repository,
      rateLimiter: new FixedWindowRateLimiter(10, 60_000),
      isPersonalizationEnabled: async () => true,
      now,
      createEventId: () => 'event-1',
    };
    await ingestRecommendationEvent(validEvent, 'auth-user', dependencies);
    const poisonedRetry = await ingestRecommendationEvent(
      { ...validEvent, articleId: 'xyz123def456ghi' },
      'auth-user',
      dependencies,
    );

    expect(poisonedRetry).toEqual({
      kind: 'invalid',
      errors: ['idempotencyKey already belongs to a different event'],
    });
    expect(records.size).toBe(1);
  });

  it('serializes concurrent milestones for one user and recommendation channel', async () => {
    const { records, repository } = createRepository();
    repository.findHighestProgressMilestone = async () => {
      const milestones = [...records.values()]
        .filter((record) => record.eventType === 'progress_milestone')
        .map((record) => Number(record.maxProgress));
      return milestones.length > 0 ? Math.max(...milestones) : undefined;
    };
    let sequence = 0;
    const dependencies = {
      getRepository: async () => repository,
      rateLimiter: new FixedWindowRateLimiter(10, 60_000),
      isPersonalizationEnabled: async () => true,
      now,
      createEventId: () => `event-${++sequence}`,
    };
    const event = {
      articleId: 'abc123def456ghi',
      eventType: 'progress_milestone',
      surface: 'for_you',
      feedId: 'feed_12345678',
      rank: 1,
      algorithmVersion: 'baseline-category-round-robin-v1',
      occurredAt: now.toISOString(),
      engagedSeconds: 8,
    } as const;

    const [fifty, twentyFive] = await Promise.all([
      ingestRecommendationEvent(
        { ...event, idempotencyKey: 'progress:session123:article123:50', maxProgress: 50 },
        'auth-user',
        dependencies,
      ),
      ingestRecommendationEvent(
        { ...event, idempotencyKey: 'progress:session123:article123:25', maxProgress: 25 },
        'auth-user',
        dependencies,
      ),
    ]);

    expect(fifty.kind).toBe('created');
    expect(twentyFive).toEqual({ kind: 'invalid', errors: ['progress milestone must advance'] });
    expect(records.size).toBe(1);
  });

  it('charges invalid payloads without acquiring a privileged repository', async () => {
    const { repository } = createRepository();
    const getRepository = vi.fn(async () => repository);
    const dependencies = {
      getRepository,
      rateLimiter: new FixedWindowRateLimiter(1, 60_000),
      isPersonalizationEnabled: vi.fn(async () => true),
      now,
    };

    const invalid = await ingestRecommendationEvent({}, 'auth-user', dependencies);
    const flooded = await ingestRecommendationEvent({}, 'auth-user', dependencies);

    expect(invalid.kind).toBe('invalid');
    expect(flooded.kind).toBe('rate_limited');
    expect(getRepository).not.toHaveBeenCalled();
    expect(dependencies.isPersonalizationEnabled).not.toHaveBeenCalled();
  });

  it('allows server-only event types through the trusted path', async () => {
    const { records, repository } = createRepository();
    const result = await recordTrustedRecommendationEvent(
      { ...validEvent, idempotencyKey: 'bookmark_add:123456', eventType: 'bookmark_add' },
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
        const found = new Set(keys.filter((key) => records.has(`${userId}:${key}`)));
        for (const event of records.values()) {
          if (event.userId === userId && event.eventType === 'served' && keys.includes(event.idempotencyKey)) {
            found.add(servedEventSemanticMarker(event));
          }
        }
        return found;
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
        const found = new Set(keys.filter((key) => records.has(`${userId}:${key}`)));
        for (const event of records.values()) {
          if (event.userId === userId && event.eventType === 'served' && keys.includes(event.idempotencyKey)) {
            found.add(servedEventSemanticMarker(event));
          }
        }
        return found;
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

  it('treats legacy served keys as duplicates during a rolling rollout', async () => {
    const records = new Map<string, RecommendationEventRecord>();
    const served = {
      idempotencyKey: 'served:feed_12345678:for_you:abc123hash45678:article12345671:1',
      articleId: 'article12345671',
      eventType: 'served',
      surface: 'for_you',
      feedId: 'feed_12345678',
      rank: 1,
      algorithmVersion: 'baseline-category-round-robin-v1',
      occurredAt: now.toISOString(),
    } as const;
    const legacyKey = `served:${served.feedId}:${served.articleId}:${served.rank}`;
    records.set(`auth-user:${legacyKey}`, {
      ...served,
      idempotencyKey: legacyKey,
      eventId: 'legacy-event',
      userId: 'auth-user',
      receivedAt: now.toISOString(),
    });
    const repository: RecommendationEventBatchRepository = {
      async findByIdempotencyKey(userId, key) {
        const event = records.get(`${userId}:${key}`);
        return event ? { eventId: event.eventId } : null;
      },
      async findExistingIdempotencyKeys(userId, keys) {
        const found = new Set(keys.filter((key) => records.has(`${userId}:${key}`)));
        const legacy = records.get(`${userId}:${legacyKey}`);
        if (legacy && keys.includes(legacyKey)) found.add(servedEventSemanticMarker(legacy));
        return found;
      },
      async create(event) {
        records.set(`${event.userId}:${event.idempotencyKey}`, event);
        return { eventId: event.eventId };
      },
    };

    const result = await recordTrustedRecommendationEventBatch([served], 'auth-user', {
      repository,
      now,
    });
    expect(result).toEqual({
      kind: 'completed', total: 1, created: 0, duplicates: 1, failures: [],
    });
    expect(records.size).toBe(1);
  });
});
