import { randomUUID } from 'node:crypto';
import type {
  RecommendationEventRecord,
  ValidatedRecommendationEventInput,
} from './contracts';
import { validateRecommendationEventInput } from './validation';
import type { FixedWindowRateLimiter } from '../rate-limit';
import {
  validateClientRecommendationEventConsistency,
  type RecommendationEventConsistencyRepository,
} from './consistency';

export type StoredRecommendationEvent = {
  eventId: string;
};

export type StoredClientRecommendationEvent = StoredRecommendationEvent & Pick<
  RecommendationEventRecord,
  | 'articleId'
  | 'eventType'
  | 'surface'
  | 'feedId'
  | 'rank'
  | 'algorithmVersion'
  | 'maxProgress'
  | 'reasonCode'
>;

export interface RecommendationEventRepository {
  findByIdempotencyKey(userId: string, idempotencyKey: string): Promise<StoredRecommendationEvent | null>;
  create(event: RecommendationEventRecord): Promise<StoredRecommendationEvent>;
}

export interface RecommendationEventBatchRepository extends RecommendationEventRepository {
  findExistingIdempotencyKeys(userId: string, keys: readonly string[]): Promise<Set<string>>;
}

export interface ClientRecommendationEventRepository
  extends RecommendationEventRepository, RecommendationEventConsistencyRepository {
  findClientEventByIdempotencyKey(
    userId: string,
    idempotencyKey: string,
  ): Promise<StoredClientRecommendationEvent | null>;
}

type IngestionDependencies = {
  getRepository: () => Promise<ClientRecommendationEventRepository>;
  rateLimiter: Pick<FixedWindowRateLimiter, 'consume'>;
  isPersonalizationEnabled: () => Promise<boolean>;
  now?: Date;
  createEventId?: () => string;
};

type TrustedEventDependencies = {
  repository: RecommendationEventRepository;
  now?: Date;
  createEventId?: () => string;
};

type TrustedBatchDependencies = {
  repository: RecommendationEventBatchRepository;
  now?: Date;
  createEventId?: () => string;
};

export type RecommendationEventIngestionResult =
  | { kind: 'created'; eventId: string }
  | { kind: 'duplicate'; eventId: string }
  | { kind: 'invalid'; errors: string[] }
  | { kind: 'disabled' }
  | { kind: 'rate_limited'; retryAfterSeconds: number };

export function servedEventSemanticMarker(
  event: Pick<
    ValidatedRecommendationEventInput,
    'articleId' | 'feedId' | 'rank' | 'surface' | 'algorithmVersion'
  >,
): string {
  return [
    'served-semantic',
    event.feedId,
    event.articleId,
    event.rank,
    event.surface,
    event.algorithmVersion,
  ].join(':');
}

const clientEventQueues = new Map<string, Promise<void>>();

function clientEventConsistencyKey(
  userId: string,
  event: ValidatedRecommendationEventInput,
): string {
  return [
    userId,
    event.articleId,
    event.feedId ?? 'direct',
    event.rank ?? 0,
    event.surface,
    event.algorithmVersion ?? 'direct',
  ].join(':');
}

async function serializeClientEvent<T>(key: string, task: () => Promise<T>): Promise<T> {
  const previous = clientEventQueues.get(key) ?? Promise.resolve();
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = previous.then(() => gate);
  clientEventQueues.set(key, tail);
  await previous;
  try {
    return await task();
  } finally {
    release();
    if (clientEventQueues.get(key) === tail) clientEventQueues.delete(key);
  }
}

function matchesStoredClientEvent(
  existing: StoredClientRecommendationEvent,
  candidate: ValidatedRecommendationEventInput,
): boolean {
  return (
    existing.articleId === candidate.articleId &&
    existing.eventType === candidate.eventType &&
    existing.surface === candidate.surface &&
    existing.feedId === candidate.feedId &&
    existing.rank === candidate.rank &&
    existing.algorithmVersion === candidate.algorithmVersion &&
    (existing.maxProgress ?? 0) === (candidate.maxProgress ?? 0) &&
    existing.reasonCode === candidate.reasonCode
  );
}

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

async function persistClientRecommendationEvent(
  value: RecommendationEventRecord,
  repository: ClientRecommendationEventRepository,
): Promise<RecommendationEventIngestionResult> {
  try {
    const created = await repository.create(value);
    return { kind: 'created', eventId: created.eventId };
  } catch (error) {
    const duplicate = await repository.findClientEventByIdempotencyKey(
      value.userId,
      value.idempotencyKey,
    );
    if (!duplicate) throw error;
    if (!matchesStoredClientEvent(duplicate, value)) {
      return {
        kind: 'invalid',
        errors: ['idempotencyKey already belongs to a different event'],
      };
    }
    return { kind: 'duplicate', eventId: duplicate.eventId };
  }
}

export async function ingestRecommendationEvent(
  raw: unknown,
  userId: string,
  dependencies: IngestionDependencies,
): Promise<RecommendationEventIngestionResult> {
  const now = dependencies.now ?? new Date();
  const rateLimit = dependencies.rateLimiter.consume(userId, now.getTime());
  if (!rateLimit.allowed) {
    return { kind: 'rate_limited', retryAfterSeconds: rateLimit.retryAfterSeconds };
  }

  const validation = validateRecommendationEventInput(raw, { nowMs: now.getTime() });
  if (!validation.ok) return { kind: 'invalid', errors: validation.errors };

  if (!(await dependencies.isPersonalizationEnabled())) return { kind: 'disabled' };

  return serializeClientEvent(
    clientEventConsistencyKey(userId, validation.value),
    async () => {
      const repository = await dependencies.getRepository();
      const existing = await repository.findClientEventByIdempotencyKey(
        userId,
        validation.value.idempotencyKey,
      );
      if (existing) {
        if (!matchesStoredClientEvent(existing, validation.value)) {
          return {
            kind: 'invalid' as const,
            errors: ['idempotencyKey already belongs to a different event'],
          };
        }
        return { kind: 'duplicate' as const, eventId: existing.eventId };
      }

      const consistency = await validateClientRecommendationEventConsistency(
        validation.value,
        userId,
        repository,
        now,
      );
      if (!consistency.ok) {
        return { kind: 'invalid' as const, errors: consistency.errors };
      }

      const event: RecommendationEventRecord = {
        ...validation.value,
        eventId: (dependencies.createEventId ?? randomUUID)(),
        userId,
        receivedAt: now.toISOString(),
      };

      return persistClientRecommendationEvent(event, repository);
    },
  );
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
  const legacyKeys = new Map<string, { lookupKey: string; semanticMarker: string }>();
  for (const item of unique.values()) {
    if (item.result.ok && item.result.value.eventType === 'served') {
      const event = item.result.value;
      legacyKeys.set(
        event.idempotencyKey,
        {
          lookupKey: `served:${event.feedId}:${event.articleId}:${event.rank}`,
          semanticMarker: servedEventSemanticMarker(event),
        },
      );
    }
  }
  const existingLookupKeys = [
    ...keys,
    ...[...legacyKeys.values()].map((legacy) => legacy.lookupKey),
  ];
  const existingLookup = await dependencies.repository.findExistingIdempotencyKeys(
    userId,
    existingLookupKeys,
  );
  const existing = new Set(
    keys.filter((key) => {
      const legacy = legacyKeys.get(key);
      return existingLookup.has(key) || Boolean(legacy && existingLookup.has(legacy.semanticMarker));
    }),
  );
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
