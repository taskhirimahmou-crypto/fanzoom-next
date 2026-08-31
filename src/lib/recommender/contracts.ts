export const RECOMMENDATION_EVENT_TYPES = [
  'served',
  'impression',
  'open',
  'engaged',
  'progress_milestone',
  'bookmark_add',
  'bookmark_remove',
  'share',
  'comment',
  'not_interested',
] as const;

export type RecommendationEventType = (typeof RECOMMENDATION_EVENT_TYPES)[number];

export const CLIENT_RECOMMENDATION_EVENT_TYPES = [
  'impression',
  'engaged',
  'progress_milestone',
  'share',
  'not_interested',
] as const satisfies readonly RecommendationEventType[];

export const RECOMMENDATION_SURFACES = [
  'home',
  'for_you',
  'direct',
  'article',
  'bookmarks',
  'history',
  'search',
  'category',
  'unknown',
] as const;

export type RecommendationSurface = (typeof RECOMMENDATION_SURFACES)[number];

export const NOT_INTERESTED_REASON_CODES = [
  'generic',
  'topic',
  'source',
  'duplicate',
  'already_seen',
  'temporary',
  'similar_content',
] as const;

export type NotInterestedReasonCode = (typeof NOT_INTERESTED_REASON_CODES)[number];

export type RecommendationEventInput = {
  idempotencyKey: string;
  articleId: string;
  eventType: RecommendationEventType;
  surface: RecommendationSurface;
  feedId?: string;
  rank?: number;
  algorithmVersion?: string;
  occurredAt?: string;
  engagedSeconds?: number;
  maxProgress?: number;
  reasonCode?: string;
};

export type ValidatedRecommendationEventInput = Omit<RecommendationEventInput, 'occurredAt'> & {
  occurredAt: string;
};

export type RecommendationEventRecord = ValidatedRecommendationEventInput & {
  eventId: string;
  userId: string;
  receivedAt: string;
};
