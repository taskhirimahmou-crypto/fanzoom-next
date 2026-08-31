import type { RecommendationSurface } from './contracts';

export type RecommendationAttribution = {
  feedId: string;
  rank: number;
  surface: Extract<RecommendationSurface, 'home' | 'for_you'>;
  algorithmVersion: string;
};

type SearchValue = string | string[] | undefined;
type AttributionSource = Record<string, unknown> | URLSearchParams;

export const RECOMMENDATION_ATTRIBUTION_FIELDS = {
  feedId: 'feedId',
  rank: 'rank',
  surface: 'surface',
  algorithmVersion: 'algorithmVersion',
} as const;

export const RECOMMENDATION_ATTRIBUTION_QUERY = {
  feedId: 'recFeedId',
  rank: 'recRank',
  surface: 'recSurface',
  algorithmVersion: 'recAlgorithm',
} as const;

function getValue(source: AttributionSource, key: string): SearchValue | number {
  if (source instanceof URLSearchParams) return source.get(key) ?? undefined;
  const value = source[key];
  if (typeof value === 'string' || typeof value === 'number' || value === undefined) return value;
  if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
    return value as string[];
  }
  return undefined;
}

function single(value: SearchValue | number): string | number | undefined {
  return Array.isArray(value) ? undefined : value;
}

export function parseRecommendationAttribution(
  rawSource: unknown,
): RecommendationAttribution | undefined {
  if (!rawSource || (typeof rawSource !== 'object' && !(rawSource instanceof URLSearchParams))) {
    return undefined;
  }
  const source = rawSource as AttributionSource;
  const fieldKeys = Object.values(RECOMMENDATION_ATTRIBUTION_FIELDS);
  const queryKeys = Object.values(RECOMMENDATION_ATTRIBUTION_QUERY);
  const hasFields = !(source instanceof URLSearchParams) && fieldKeys.some((key) => key in source);
  const hasQuery = source instanceof URLSearchParams || queryKeys.some((key) => key in source);
  if (hasFields === hasQuery) return undefined;
  const keys = hasQuery ? RECOMMENDATION_ATTRIBUTION_QUERY : RECOMMENDATION_ATTRIBUTION_FIELDS;
  const feedId = single(getValue(source, keys.feedId));
  const rankValue = single(getValue(source, keys.rank));
  const surface = single(getValue(source, keys.surface));
  const algorithmVersion = single(getValue(source, keys.algorithmVersion));
  const rank = Number(rankValue);

  if (typeof feedId !== 'string' || !/^[a-z0-9][a-z0-9_-]{7,63}$/i.test(feedId)) return undefined;
  if (!Number.isInteger(rank) || rank < 1 || rank > 1000) return undefined;
  if (surface !== 'home' && surface !== 'for_you') return undefined;
  if (
    typeof algorithmVersion !== 'string' ||
    !/^[a-z0-9][a-z0-9:._-]{0,95}$/i.test(algorithmVersion)
  ) {
    return undefined;
  }
  return { feedId, rank, surface, algorithmVersion };
}

export function recommendationArticleHref(
  slug: string,
  attribution?: RecommendationAttribution,
): string {
  const pathname = `/article/${encodeURIComponent(slug)}`;
  if (!attribution) return pathname;
  const query = new URLSearchParams({
    [RECOMMENDATION_ATTRIBUTION_QUERY.feedId]: attribution.feedId,
    [RECOMMENDATION_ATTRIBUTION_QUERY.rank]: String(attribution.rank),
    [RECOMMENDATION_ATTRIBUTION_QUERY.surface]: attribution.surface,
    [RECOMMENDATION_ATTRIBUTION_QUERY.algorithmVersion]: attribution.algorithmVersion,
  });
  return `${pathname}?${query.toString()}`;
}
