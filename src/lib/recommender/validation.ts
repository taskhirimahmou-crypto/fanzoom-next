import {
  CLIENT_RECOMMENDATION_EVENT_TYPES,
  NOT_INTERESTED_REASON_CODES,
  RECOMMENDATION_EVENT_TYPES,
  RECOMMENDATION_SURFACES,
  type RecommendationEventType,
  type RecommendationSurface,
  type ValidatedRecommendationEventInput,
} from './contracts';

type ValidationResult =
  | { ok: true; value: ValidatedRecommendationEventInput }
  | { ok: false; errors: string[] };

type ValidationOptions = {
  nowMs?: number;
  allowServerOnlyEvents?: boolean;
};

const ALLOWED_KEYS = new Set([
  'idempotencyKey',
  'articleId',
  'eventType',
  'surface',
  'feedId',
  'rank',
  'algorithmVersion',
  'occurredAt',
  'engagedSeconds',
  'maxProgress',
  'reasonCode',
]);

const PUBLIC_EVENT_TYPES = new Set<string>(CLIENT_RECOMMENDATION_EVENT_TYPES);
const EVENT_TYPES = new Set<string>(RECOMMENDATION_EVENT_TYPES);
const SURFACES = new Set<string>(RECOMMENDATION_SURFACES);
const REASON_CODES = new Set<string>(NOT_INTERESTED_REASON_CODES);
const PROGRESS_MILESTONES = new Set([25, 50, 75, 90]);
const IDEMPOTENCY_PREFIXES: Record<RecommendationEventType, string> = {
  served: 'served:',
  impression: 'impression:',
  open: 'open:',
  engaged: 'engaged:',
  progress_milestone: 'progress:',
  bookmark_add: 'bookmark_add:',
  bookmark_remove: 'bookmark_remove:',
  share: 'share:',
  comment: 'comment:',
  not_interested: 'not_interested:',
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isString = (value: unknown): value is string => typeof value === 'string';

export function validateRecommendationEventInput(
  raw: unknown,
  options: ValidationOptions = {},
): ValidationResult {
  if (!isObject(raw)) return { ok: false, errors: ['body must be an object'] };

  const errors: string[] = [];
  for (const key of Object.keys(raw)) {
    if (!ALLOWED_KEYS.has(key)) errors.push(`unexpected field: ${key}`);
  }

  const idempotencyKey = isString(raw.idempotencyKey) ? raw.idempotencyKey.trim() : '';
  if (!/^[a-z0-9][a-z0-9:._-]{7,127}$/i.test(idempotencyKey)) {
    errors.push('idempotencyKey must be 8-128 safe characters');
  }

  const articleId = isString(raw.articleId) ? raw.articleId.trim() : '';
  if (!/^[a-z0-9]{15}$/i.test(articleId)) {
    errors.push('articleId must be a valid PocketBase record id');
  }

  const eventType = isString(raw.eventType) ? raw.eventType : '';
  if (!EVENT_TYPES.has(eventType)) {
    errors.push('eventType is invalid');
  } else if (!options.allowServerOnlyEvents && !PUBLIC_EVENT_TYPES.has(eventType)) {
    errors.push(`${eventType} is recorded only by trusted server flows`);
  } else if (!idempotencyKey.startsWith(IDEMPOTENCY_PREFIXES[eventType as RecommendationEventType])) {
    errors.push('idempotencyKey does not match eventType');
  }

  const surface = isString(raw.surface) ? raw.surface : '';
  if (!SURFACES.has(surface)) errors.push('surface is invalid');

  const feedId = raw.feedId === undefined ? undefined : isString(raw.feedId) ? raw.feedId.trim() : '';
  if (feedId !== undefined && !/^[a-z0-9][a-z0-9_-]{7,63}$/i.test(feedId)) {
    errors.push('feedId is invalid');
  }

  const rank = raw.rank === undefined ? undefined : raw.rank;
  if (rank !== undefined && (!Number.isInteger(rank) || (rank as number) < 1 || (rank as number) > 1000)) {
    errors.push('rank must be an integer between 1 and 1000');
  }

  const algorithmVersion = raw.algorithmVersion === undefined
    ? undefined
    : isString(raw.algorithmVersion)
      ? raw.algorithmVersion.trim()
      : '';
  if (algorithmVersion !== undefined && !/^[a-z0-9][a-z0-9:._-]{0,95}$/i.test(algorithmVersion)) {
    errors.push('algorithmVersion is invalid');
  }

  const nowMs = options.nowMs ?? Date.now();
  const occurredAt = raw.occurredAt === undefined
    ? new Date(nowMs).toISOString()
    : isString(raw.occurredAt)
      ? raw.occurredAt
      : '';
  const occurredAtMs = Date.parse(occurredAt);
  if (!Number.isFinite(occurredAtMs)) {
    errors.push('occurredAt must be a valid ISO date');
  } else if (occurredAtMs > nowMs + 5 * 60_000) {
    errors.push('occurredAt is too far in the future');
  } else if (occurredAtMs < nowMs - 7 * 24 * 60 * 60_000) {
    errors.push('occurredAt is too old');
  }

  const engagedSeconds = raw.engagedSeconds === undefined ? undefined : raw.engagedSeconds;
  if (
    engagedSeconds !== undefined &&
    (typeof engagedSeconds !== 'number' || !Number.isFinite(engagedSeconds) || engagedSeconds < 0 || engagedSeconds > 86_400)
  ) {
    errors.push('engagedSeconds must be between 0 and 86400');
  }

  const maxProgress = raw.maxProgress === undefined ? undefined : raw.maxProgress;
  if (
    maxProgress !== undefined &&
    (typeof maxProgress !== 'number' || !Number.isFinite(maxProgress) || maxProgress < 0 || maxProgress > 100)
  ) {
    errors.push('maxProgress must be between 0 and 100');
  }

  const reasonCode = raw.reasonCode === undefined ? undefined : isString(raw.reasonCode) ? raw.reasonCode.trim() : '';
  if (reasonCode !== undefined && !/^[a-z0-9][a-z0-9_-]{0,63}$/i.test(reasonCode)) {
    errors.push('reasonCode is invalid');
  }

  if ((eventType === 'served' || eventType === 'impression') && (!feedId || !rank || !algorithmVersion)) {
    errors.push('served and impression require feedId, rank and algorithmVersion');
  }
  if (eventType === 'engaged' && (typeof engagedSeconds !== 'number' || engagedSeconds <= 0)) {
    errors.push('engaged requires a positive engagedSeconds value');
  }
  if (eventType === 'progress_milestone' && !PROGRESS_MILESTONES.has(maxProgress as number)) {
    errors.push('progress_milestone requires maxProgress of 25, 50, 75 or 90');
  }
  if (eventType === 'not_interested' && (!reasonCode || !REASON_CODES.has(reasonCode))) {
    errors.push('not_interested requires a supported reasonCode');
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      idempotencyKey,
      articleId,
      eventType: eventType as RecommendationEventType,
      surface: surface as RecommendationSurface,
      feedId,
      rank: rank as number | undefined,
      algorithmVersion,
      occurredAt: new Date(occurredAtMs).toISOString(),
      engagedSeconds: engagedSeconds as number | undefined,
      maxProgress: maxProgress as number | undefined,
      reasonCode,
    },
  };
}
