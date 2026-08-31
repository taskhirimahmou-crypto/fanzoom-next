import { describe, expect, it } from 'vitest';
import {
  BASELINE_RECOMMENDATION_ALGORITHM_VERSION,
  interleaveRecommendationLists,
  resolveBaselineFeedId,
} from './baseline';

describe('recommendation baseline contract', () => {
  it('preserves the current round-robin ordering', () => {
    expect(
      interleaveRecommendationLists([
        ['a1', 'a2'],
        ['b1'],
        ['c1', 'c2', 'c3'],
      ]),
    ).toEqual(['a1', 'b1', 'c1', 'a2', 'c2', 'c3']);
  });

  it('keeps an existing valid feed id and replaces an invalid one', () => {
    expect(resolveBaselineFeedId('feed_12345678')).toBe('feed_12345678');
    expect(resolveBaselineFeedId('bad')).not.toBe('bad');
  });

  it('has a stable explicit algorithm version', () => {
    expect(BASELINE_RECOMMENDATION_ALGORITHM_VERSION).toBe(
      'baseline-category-round-robin-v1',
    );
  });
});
