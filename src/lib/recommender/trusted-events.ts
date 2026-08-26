import type { RecommendationEventInput } from './contracts';
import {
  recordTrustedRecommendationEvent,
  recordTrustedRecommendationEventBatch,
} from './event-service';
import { PocketBaseRecommendationEventRepository } from './pocketbase-repository';
import { getAdminPocketBase } from '../pocketbase-admin';
import { readPersonalizationEnabled } from '../personalization/consent';

export async function recordTrustedRecommendationEventBestEffort(
  event: RecommendationEventInput,
  userId: string,
): Promise<void> {
  try {
    const pb = await getAdminPocketBase();
    if (!(await readPersonalizationEnabled(pb, userId))) return;
    const result = await recordTrustedRecommendationEvent(event, userId, {
      repository: new PocketBaseRecommendationEventRepository(pb),
    });
    if (result.kind === 'invalid') {
      console.warn('trusted recommendation event rejected', result.errors);
    }
  } catch (error) {
    // Analytics must never make the primary user action fail.
    console.error('trusted recommendation event write failed', error);
  }
}

export async function recordTrustedRecommendationEventBatchBestEffort(
  events: readonly RecommendationEventInput[],
  userId: string,
): Promise<void> {
  if (events.length === 0) return;
  try {
    const pb = await getAdminPocketBase();
    if (!(await readPersonalizationEnabled(pb, userId))) return;
    const result = await recordTrustedRecommendationEventBatch(events, userId, {
      repository: new PocketBaseRecommendationEventRepository(pb),
    });
    if (result.kind === 'invalid') {
      console.warn('trusted recommendation event batch rejected', result.errors);
    } else if (result.kind === 'partial_failure') {
      console.error('trusted recommendation event batch partially failed', result.failures);
    }
  } catch (error) {
    console.error('trusted recommendation event batch write failed', error);
  }
}

type ServedRecommendationBatch = {
  articles: readonly { id: string }[];
  userId: string;
  feedId: string;
  surface: 'home' | 'for_you';
  algorithmVersion: string;
  offset?: number;
};

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
      idempotencyKey: `served:${feedId}:${article.id}:${rank}`,
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
    return { kind: 'completed', total: 0, created: 0, duplicates: 0, failures: [] };
  }
  const pb = await getAdminPocketBase();
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
): Promise<void> {
  try {
    const result = await recordServedRecommendationBatch(input);
    if (result.kind === 'partial_failure') {
      console.error('trusted served recommendation batch partially failed', result.failures);
    }
  } catch (error) {
    console.error('trusted served recommendation batch write failed', error);
  }
}
