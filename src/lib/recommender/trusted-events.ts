import { createHash, randomUUID } from 'node:crypto';
import type { RecommendationEventInput } from './contracts';
import type { RecommendationAttribution } from './attribution';
import {
  recordTrustedRecommendationEvent,
  recordTrustedRecommendationEventBatch,
  type StoredClientRecommendationEvent,
} from './event-service';
import { PocketBaseRecommendationEventRepository } from './pocketbase-repository';
import { getAdminPocketBase } from '../pocketbase-admin';
import { readPersonalizationEnabled } from '../personalization/consent';
import { writeStructuredServerLog } from '../observability/logger';

type TrustedEventObservability = {
  requestId?: string;
  route?: string;
};

function logTrustedEventFailure(
  observability: TrustedEventObservability | undefined,
  eventName: 'event_validation_failed' | 'pocketbase_failure' | 'served_partial_failure',
  errorCode: string,
): void {
  writeStructuredServerLog({
    level: eventName === 'event_validation_failed' ? 'warn' : 'error',
    eventName,
    requestId: observability?.requestId ?? randomUUID(),
    route: observability?.route ?? '/internal/recommendation-events',
    statusCode: eventName === 'event_validation_failed' ? 400 : 500,
    durationMs: 0,
    errorCode,
  });
}

export async function recordTrustedRecommendationEventBestEffort(
  event: RecommendationEventInput,
  userId: string,
  options: { legacyIdempotencyKeys?: readonly string[] } & TrustedEventObservability = {},
): Promise<boolean> {
  try {
    const pb = await getAdminPocketBase(options.requestId);
    if (!(await readPersonalizationEnabled(pb, userId))) return false;
    const repository = new PocketBaseRecommendationEventRepository(pb);
    for (const legacyKey of options.legacyIdempotencyKeys ?? []) {
      const existing = await repository.findClientEventByIdempotencyKey(userId, legacyKey);
      if (existing && trustedEventMatchesStored(existing, event)) return true;
    }
    const result = await recordTrustedRecommendationEvent(event, userId, {
      repository,
    });
    if (result.kind === 'invalid') {
      logTrustedEventFailure(options, 'event_validation_failed', 'trusted_event_invalid');
      return false;
    }
    return result.kind === 'created' || result.kind === 'duplicate';
  } catch {
    // Analytics must never make the primary user action fail.
    logTrustedEventFailure(options, 'pocketbase_failure', 'trusted_event_write_failed');
    return false;
  }
}

export function trustedEventMatchesStored(
  existing: StoredClientRecommendationEvent,
  event: RecommendationEventInput,
): boolean {
  return (
    existing.articleId === event.articleId &&
    existing.eventType === event.eventType &&
    existing.surface === event.surface &&
    existing.feedId === event.feedId &&
    existing.rank === event.rank &&
    existing.algorithmVersion === event.algorithmVersion &&
    (existing.maxProgress ?? 0) === (event.maxProgress ?? 0) &&
    existing.reasonCode === event.reasonCode
  );
}

export async function recordTrustedRecommendationEventBatchBestEffort(
  events: readonly RecommendationEventInput[],
  userId: string,
  observability: TrustedEventObservability = {},
): Promise<void> {
  if (events.length === 0) return;
  try {
    const pb = await getAdminPocketBase(observability.requestId);
    if (!(await readPersonalizationEnabled(pb, userId))) return;
    const result = await recordTrustedRecommendationEventBatch(events, userId, {
      repository: new PocketBaseRecommendationEventRepository(pb),
    });
    if (result.kind === 'invalid') {
      logTrustedEventFailure(observability, 'event_validation_failed', 'trusted_event_batch_invalid');
    } else if (result.kind === 'partial_failure') {
      logTrustedEventFailure(observability, 'served_partial_failure', 'trusted_event_batch_partial');
    }
  } catch {
    logTrustedEventFailure(observability, 'pocketbase_failure', 'trusted_event_batch_write_failed');
  }
}

type ServedRecommendationBatch = {
  articles: readonly { id: string }[];
  userId: string;
  feedId: string;
  surface: 'home' | 'for_you';
  algorithmVersion: string;
  offset?: number;
  observability?: TrustedEventObservability;
};

export function servedEventIdempotencyKey(
  feedId: string,
  surface: 'home' | 'for_you',
  algorithmVersion: string,
  articleId: string,
  rank: number,
): string {
  const algorithmHash = createHash('sha256').update(algorithmVersion).digest('hex').slice(0, 16);
  return `served:${feedId}:${surface}:${algorithmHash}:${articleId}:${rank}`;
}

export function openEventIdempotencyKey(
  articleId: string,
  attribution: RecommendationAttribution | undefined,
  bucket: number,
): string {
  if (!attribution) return `open:direct:${articleId}:${bucket}`;
  const algorithmHash = createHash('sha256')
    .update(attribution.algorithmVersion)
    .digest('hex')
    .slice(0, 16);
  return [
    'open',
    attribution.feedId,
    attribution.surface,
    algorithmHash,
    articleId,
    attribution.rank,
    bucket,
  ].join(':');
}

function buildServedEvents({
  articles,
  feedId,
  surface,
  algorithmVersion,
  offset = 0,
}: Omit<ServedRecommendationBatch, 'userId'>): RecommendationEventInput[] {
  const occurredAt = new Date().toISOString();
  return articles.map((article, index) => {
    const rank = offset + index + 1;
    return {
      idempotencyKey: servedEventIdempotencyKey(
        feedId,
        surface,
        algorithmVersion,
        article.id,
        rank,
      ),
      articleId: article.id,
      eventType: 'served',
      surface,
      feedId,
      rank,
      algorithmVersion,
      occurredAt,
    };
  });
}

export async function recordServedRecommendationBatch(
  input: ServedRecommendationBatch,
) {
  if (input.articles.length === 0) {
    return { kind: 'completed' as const, total: 0, created: 0, duplicates: 0, failures: [] };
  }
  const pb = await getAdminPocketBase(input.observability?.requestId);
  if (!(await readPersonalizationEnabled(pb, input.userId))) {
    return { kind: 'disabled' as const };
  }
  const result = await recordTrustedRecommendationEventBatch(
    buildServedEvents(input),
    input.userId,
    { repository: new PocketBaseRecommendationEventRepository(pb) },
  );
  if (result.kind === 'invalid') {
    throw new Error(`trusted served batch rejected: ${result.errors.join('; ')}`);
  }
  return result;
}

export async function recordServedRecommendationBatchBestEffort(
  input: ServedRecommendationBatch,
): Promise<
  | { kind: 'completed' | 'disabled'; failures: 0 }
  | { kind: 'partial_failure'; failures: number }
  | { kind: 'failed'; failures: 0 }
> {
  try {
    const result = await recordServedRecommendationBatch(input);
    if (result.kind === 'partial_failure') {
      return { kind: 'partial_failure', failures: result.failures.length };
    }
    return { kind: result.kind, failures: 0 };
  } catch {
    return { kind: 'failed', failures: 0 };
  }
}
