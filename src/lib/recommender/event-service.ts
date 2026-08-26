import { randomUUID } from 'node:crypto';
import type { RecommendationEventRecord } from './contracts';
import { validateRecommendationEventInput } from './validation';
import type { FixedWindowRateLimiter } from '../rate-limit';

export type StoredRecommendationEvent = {
  eventId: string;
};

export interface RecommendationEventRepository {
  findByIdempotencyKey(userId: string, idempotencyKey: string): Promise<StoredRecommendationEvent | null>;
  create(event: RecommendationEventRecord): Promise<StoredRecommendationEvent>;
}

export interface RecommendationEventBatchRepository extends RecommendationEventRepository {
  findExistingIdempotencyKeys(userId: string, keys: readonly string[]): Promise<Set<string>>;
}

type IngestionDependencies = {
  repository: RecommendationEventRepository;
  rateLimiter: Pick<FixedWindowRateLimiter, 'consume'>;
  now?: Date;
  createEventId?: () => string;
};

type TrustedEventDependencies = Omit<IngestionDependencies, 'rateLimiter'>;

type TrustedBatchDependencies = {
  repository: RecommendationEventBatchRepository;
  now?: Date;
  createEventId?: () => string;
};

export type RecommendationEventIngestionResult =
  | { kind: 'created'; eventId: string }
  | { kind: 'duplicate'; eventId: string }
  | { kind: 'invalid'; errors: string[] }
  | { kind: 'rate_limited'; retryAfterSeconds: number };

async function persistRecommendationEvent(
  value: RecommendationEventRecord,
  repository: RecommendationEventRepository,
): Promise<RecommendationEventIngestionResult> {
  const existing = await repository.findByIdempotencyKey(value.userId, value.idempotencyKey);
  if (existing) return { kind: 'duplicate', eventId: existing.eventId };

  try {
    const created = await repository.create(value);
    return { kind: 'created', eventId: created.eventId };
  } catch (error) {
    // The database unique index is the final guard for concurrent retries.
    const duplicate = await repository.findByIdempotencyKey(value.userId, value.idempotencyKey);
    if (duplicate) return { kind: 'duplicate', eventId: duplicate.eventId };
    throw error;
  }
}

export async function ingestRecommendationEvent(
  raw: unknown,
  userId: string,
  dependencies: IngestionDependencies,
): Promise<RecommendationEventIngestionResult> {
  const now = dependencies.now ?? new Date();
  const validation = validateRecommendationEventInput(raw, { nowMs: now.getTime() });
  if (!validation.ok) return { kind: 'invalid', errors: validation.errors };

  const existing = await dependencies.repository.findByIdempotencyKey(
    userId,
    validation.value.idempotencyKey,
  );
  if (existing) return { kind: 'duplicate', eventId: existing.eventId };

  const rateLimit = dependencies.rateLimiter.consume(userId, now.getTime());
  if (!rateLimit.allowed) {
    return { kind: 'rate_limited', retryAfterSeconds: rateLimit.retryAfterSeconds };
  }

  const event: RecommendationEventRecord = {
    ...validation.value,
    eventId: (dependencies.createEventId ?? randomUUID)(),
    userId,
    receivedAt: now.toISOString(),
  };

  return persistRecommendationEvent(event, dependencies.repository);
}

export async function recordTrustedRecommendationEvent(
  raw: unknown,
  userId: string,
  dependencies: TrustedEventDependencies,
): Promise<RecommendationEventIngestionResult> {
  const now = dependencies.now ?? new Date();
  const validation = validateRecommendationEventInput(raw, {
    nowMs: now.getTime(),
    allowServerOnlyEvents: true,
  });
  if (!validation.ok) return { kind: 'invalid', errors: validation.errors };

  return persistRecommendationEvent(
    {
      ...validation.value,
      eventId: (dependencies.createEventId ?? randomUUID)(),
      userId,
      receivedAt: now.toISOString(),
    },
    dependencies.repository,
  );
}

export async function recordTrustedRecommendationEventBatch(
  rawEvents: readonly unknown[],
  userId: string,
  dependencies: TrustedBatchDependencies,
): Promise<
  | {
      kind: 'completed' | 'partial_failure';
      total: number;
      created: number;
      duplicates: number;
      failures: Array<{
        index: number;
        articleId: string;
        idempotencyKey: string;
        code: 'persist_failed';
      }>;
    }
  | { kind: 'invalid'; errors: string[] }
> {
  const now = dependencies.now ?? new Date();
  const validated = rawEvents.map((raw, index) => {
    const result = validateRecommendationEventInput(raw, {
      nowMs: now.getTime(),
      allowServerOnlyEvents: true,
    });
    return { index, result };
  });
  const errors = validated.flatMap(({ index, result }) =>
    result.ok ? [] : result.errors.map((error) => `events[${index}]: ${error}`),
  );
  if (errors.length > 0) return { kind: 'invalid', errors };

  const unique = new Map<string, (typeof validated)[number]>();
  for (const item of validated) {
    if (item.result.ok && !unique.has(item.result.value.idempotencyKey)) {
      unique.set(item.result.value.idempotencyKey, item);
    }
  }
  const keys = [...unique.keys()];
  const existing = await dependencies.repository.findExistingIdempotencyKeys(userId, keys);
  const pending = [...unique.values()]
    .filter((item) => item.result.ok && !existing.has(item.result.value.idempotencyKey))
    .map((item) => {
      if (!item.result.ok) throw new Error('unreachable validation state');
      return {
        index: item.index,
        event: {
          ...item.result.value,
          eventId: (dependencies.createEventId ?? randomUUID)(),
          userId,
          receivedAt: now.toISOString(),
        } satisfies RecommendationEventRecord,
      };
    });

  let cursor = 0;
  let created = 0;
  let duplicates = rawEvents.length - unique.size + existing.size;
  const failures: Array<{
    index: number;
    articleId: string;
    idempotencyKey: string;
    code: 'persist_failed';
  }> = [];

  // PocketBase's /api/batch endpoint is optional and disabled by default. A small
  // bounded worker pool keeps this path deployment-independent while the unique
  // database index remains the final idempotency guard for concurrent retries.
  const workers = Array.from({ length: Math.min(5, pending.length) }, async () => {
    while (cursor < pending.length) {
      const item = pending[cursor++];
      try {
        await dependencies.repository.create(item.event);
        created += 1;
      } catch {
        let duplicate: StoredRecommendationEvent | null = null;
        try {
          duplicate = await dependencies.repository.findByIdempotencyKey(
            userId,
            item.event.idempotencyKey,
          );
        } catch {
          duplicate = null;
        }
        if (duplicate) {
          duplicates += 1;
        } else {
          failures.push({
            index: item.index,
            articleId: item.event.articleId,
            idempotencyKey: item.event.idempotencyKey,
            code: 'persist_failed',
          });
        }
      }
    }
  });
  await Promise.all(workers);

  return {
    kind: failures.length > 0 ? 'partial_failure' : 'completed',
    total: rawEvents.length,
    created,
    duplicates,
    failures: failures.sort((left, right) => left.index - right.index),
  };
}
