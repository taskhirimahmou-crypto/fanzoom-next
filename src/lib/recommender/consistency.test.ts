import { describe, expect, it, vi } from 'vitest';
import type { ValidatedRecommendationEventInput } from './contracts';
import {
  validateClientRecommendationEventConsistency,
  type RecommendationEventConsistencyRepository,
} from './consistency';

const now = new Date('2026-08-26T12:00:00.000Z');
const attributedEvent: ValidatedRecommendationEventInput = {
  idempotencyKey: 'impression:feed_12345678:abc123def456ghi',
  articleId: 'abc123def456ghi',
  eventType: 'impression',
  surface: 'for_you',
  feedId: 'feed_12345678',
  rank: 1,
  algorithmVersion: 'baseline-category-round-robin-v1',
  occurredAt: now.toISOString(),
};

function createRepository(
  overrides: Partial<RecommendationEventConsistencyRepository> = {},
): RecommendationEventConsistencyRepository {
  return {
    articleExists: vi.fn(async () => true),
    hasRecentServed: vi.fn(async () => true),
    hasRecentOpen: vi.fn(async () => true),
    findHighestProgressMilestone: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe('client recommendation event consistency', () => {
  it('requires a real article and exact recent served evidence for attributed events', async () => {
    const missingArticle = await validateClientRecommendationEventConsistency(
      attributedEvent,
      'user-1',
      createRepository({ articleExists: vi.fn(async () => false) }),
      now,
    );
    expect(missingArticle).toEqual({ ok: false, errors: ['article does not exist'] });

    const missingServed = await validateClientRecommendationEventConsistency(
      attributedEvent,
      'user-1',
      createRepository({ hasRecentServed: vi.fn(async () => false) }),
      now,
    );
    expect(missingServed).toEqual({
      ok: false,
      errors: ['recent matching served event is required'],
    });
  });

  it('rejects incomplete attribution and recommendation surfaces without coordinates', async () => {
    const incomplete = await validateClientRecommendationEventConsistency(
      { ...attributedEvent, eventType: 'share', algorithmVersion: undefined },
      'user-1',
      createRepository(),
      now,
    );
    expect(incomplete.ok).toBe(false);

    const mixedDirect = await validateClientRecommendationEventConsistency(
      {
        ...attributedEvent,
        idempotencyKey: 'share:12345678',
        eventType: 'share',
        feedId: undefined,
        rank: undefined,
        algorithmVersion: undefined,
      },
      'user-1',
      createRepository(),
      now,
    );
    expect(mixedDirect).toEqual({
      ok: false,
      errors: ['recommendation surface requires attribution'],
    });
  });

  it('requires a recent open in the same channel for progress and engaged', async () => {
    const result = await validateClientRecommendationEventConsistency(
      {
        ...attributedEvent,
        idempotencyKey: 'progress:session123:abc123def456ghi:25',
        eventType: 'progress_milestone',
        engagedSeconds: 6,
        maxProgress: 25,
      },
      'user-1',
      createRepository({ hasRecentOpen: vi.fn(async () => false) }),
      now,
    );
    expect(result).toEqual({ ok: false, errors: ['recent matching open event is required'] });
  });

  it('rejects repeated and backwards milestones while accepting forward progress', async () => {
    const event = {
      ...attributedEvent,
      idempotencyKey: 'progress:session123:abc123def456ghi:50',
      eventType: 'progress_milestone' as const,
      engagedSeconds: 8,
      maxProgress: 50,
    };
    const backwards = await validateClientRecommendationEventConsistency(
      event,
      'user-1',
      createRepository({ findHighestProgressMilestone: vi.fn(async () => 50) }),
      now,
    );
    expect(backwards).toEqual({ ok: false, errors: ['progress milestone must advance'] });

    const forward = await validateClientRecommendationEventConsistency(
      event,
      'user-1',
      createRepository({ findHighestProgressMilestone: vi.fn(async () => 25) }),
      now,
    );
    expect(forward).toEqual({ ok: true });
  });

  it('keeps direct article reading separate and still requires a direct open', async () => {
    const directProgress: ValidatedRecommendationEventInput = {
      idempotencyKey: 'progress:session123:abc123def456ghi:25',
      articleId: 'abc123def456ghi',
      eventType: 'progress_milestone',
      surface: 'article',
      occurredAt: now.toISOString(),
      engagedSeconds: 6,
      maxProgress: 25,
    };
    const hasRecentOpen = vi.fn(async () => true);
    const repository = createRepository({ hasRecentOpen });
    expect(
      await validateClientRecommendationEventConsistency(directProgress, 'user-1', repository, now),
    ).toEqual({ ok: true });
    expect(repository.hasRecentServed).not.toHaveBeenCalled();
    expect(hasRecentOpen).toHaveBeenCalledWith(
      'user-1',
      directProgress.articleId,
      undefined,
      expect.any(String),
    );
  });
});
