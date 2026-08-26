import { describe, expect, it } from 'vitest';
import { parseRecommendationAttribution, recommendationArticleHref } from './attribution';

const attribution = {
  feedId: '123e4567-e89b-12d3-a456-426614174000',
  rank: 3,
  surface: 'for_you' as const,
  algorithmVersion: 'baseline-category-round-robin-v1',
};

describe('recommendation attribution', () => {
  it('round-trips only complete recommendation links', () => {
    const href = recommendationArticleHref('sample-article', attribution);
    const query = new URL(href, 'https://fanzoom.test').searchParams;
    expect(parseRecommendationAttribution(query)).toEqual(attribution);
    expect(parseRecommendationAttribution(attribution)).toEqual(attribution);
  });

  it('does not attribute direct, partial, or non-recommendation traffic', () => {
    expect(parseRecommendationAttribution({})).toBeUndefined();
    expect(parseRecommendationAttribution({ recFeedId: attribution.feedId })).toBeUndefined();
    expect(
      parseRecommendationAttribution({
        recFeedId: attribution.feedId,
        recRank: '1',
        recSurface: 'search',
        recAlgorithm: attribution.algorithmVersion,
      }),
    ).toBeUndefined();
  });

  it('rejects mixed query and payload field representations', () => {
    expect(parseRecommendationAttribution({
      ...attribution,
      recFeedId: attribution.feedId,
      recRank: String(attribution.rank),
      recSurface: attribution.surface,
      recAlgorithm: attribution.algorithmVersion,
    })).toBeUndefined();
  });
});
