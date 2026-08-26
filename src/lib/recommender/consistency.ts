import type { RecommendationAttribution } from './attribution';
import type { ValidatedRecommendationEventInput } from './contracts';

export const CLIENT_EVENT_EVIDENCE_MAX_AGE_MS = 30 * 60_000;

export interface RecommendationEventConsistencyRepository {
  articleExists(articleId: string): Promise<boolean>;
  hasRecentServed(
    userId: string,
    articleId: string,
    attribution: RecommendationAttribution,
    receivedAfter: string,
  ): Promise<boolean>;
  hasRecentOpen(
    userId: string,
    articleId: string,
    attribution: RecommendationAttribution | undefined,
    receivedAfter: string,
  ): Promise<boolean>;
  findHighestProgressMilestone(
    userId: string,
    articleId: string,
    attribution: RecommendationAttribution | undefined,
    directSurface: string | undefined,
    receivedAfter: string,
  ): Promise<number | undefined>;
}

type ConsistencyResult =
  | { ok: true }
  | { ok: false; errors: string[] };

type EventChannel =
  | { kind: 'attributed'; attribution: RecommendationAttribution }
  | { kind: 'direct' }
  | { kind: 'invalid'; error: string };

function resolveEventChannel(event: ValidatedRecommendationEventInput): EventChannel {
  const hasFeedId = event.feedId !== undefined;
  const hasRank = event.rank !== undefined;
  const hasAlgorithmVersion = event.algorithmVersion !== undefined;
  const hasAnyAttribution = hasFeedId || hasRank || hasAlgorithmVersion;
  const hasCompleteAttribution = hasFeedId && hasRank && hasAlgorithmVersion;

  if (hasAnyAttribution && !hasCompleteAttribution) {
    return { kind: 'invalid', error: 'recommendation attribution must be complete' };
  }

  if (hasCompleteAttribution) {
    if (event.surface !== 'home' && event.surface !== 'for_you') {
      return { kind: 'invalid', error: 'recommendation attribution surface is invalid' };
    }
    return {
      kind: 'attributed',
      attribution: {
        feedId: event.feedId as string,
        rank: event.rank as number,
        surface: event.surface,
        algorithmVersion: event.algorithmVersion as string,
      },
    };
  }

  if (event.surface === 'home' || event.surface === 'for_you') {
    return { kind: 'invalid', error: 'recommendation surface requires attribution' };
  }
  if (event.eventType === 'impression' || event.eventType === 'not_interested') {
    return { kind: 'invalid', error: `${event.eventType} requires recommendation attribution` };
  }
  if (event.surface !== 'article') {
    return { kind: 'invalid', error: 'direct client event surface must be article' };
  }
  return { kind: 'direct' };
}

export async function validateClientRecommendationEventConsistency(
  event: ValidatedRecommendationEventInput,
  userId: string,
  repository: RecommendationEventConsistencyRepository,
  now = new Date(),
): Promise<ConsistencyResult> {
  const channel = resolveEventChannel(event);
  if (channel.kind === 'invalid') return { ok: false, errors: [channel.error] };

  if (!(await repository.articleExists(event.articleId))) {
    return { ok: false, errors: ['article does not exist'] };
  }

  const receivedAfter = new Date(now.getTime() - CLIENT_EVENT_EVIDENCE_MAX_AGE_MS)
    .toISOString()
    .replace('T', ' ');
  const attribution = channel.kind === 'attributed' ? channel.attribution : undefined;

  if (
    attribution &&
    !(await repository.hasRecentServed(userId, event.articleId, attribution, receivedAfter))
  ) {
    return { ok: false, errors: ['recent matching served event is required'] };
  }

  if (event.eventType === 'progress_milestone' || event.eventType === 'engaged') {
    if (!(await repository.hasRecentOpen(userId, event.articleId, attribution, receivedAfter))) {
      return { ok: false, errors: ['recent matching open event is required'] };
    }
  }

  if (event.eventType === 'progress_milestone') {
    const previous = await repository.findHighestProgressMilestone(
      userId,
      event.articleId,
      attribution,
      channel.kind === 'direct' ? event.surface : undefined,
      receivedAfter,
    );
    if (previous !== undefined && previous >= (event.maxProgress as number)) {
      return { ok: false, errors: ['progress milestone must advance'] };
    }
  }

  return { ok: true };
}
