import { describe, expect, it } from 'vitest';
import { validateRecommendationEventInput } from './validation';

const nowMs = Date.parse('2026-08-11T12:00:00.000Z');

const validImpression = {
  idempotencyKey: 'event:12345678',
  articleId: 'abc123def456ghi',
  eventType: 'impression',
  surface: 'for_you',
  feedId: 'feed_12345678',
  rank: 1,
  algorithmVersion: 'baseline-category-round-robin-v1',
  occurredAt: '2026-08-11T11:59:00.000Z',
};

describe('recommendation event validation', () => {
  it('accepts a valid client-observed impression', () => {
    const result = validateRecommendationEventInput(validImpression, { nowMs });
    expect(result.ok).toBe(true);
  });

  it('rejects an attempted user identity override', () => {
    const result = validateRecommendationEventInput(
      { ...validImpression, userId: 'other1234567890' },
      { nowMs },
    );
    expect(result).toEqual({
      ok: false,
      errors: expect.arrayContaining(['unexpected field: userId']),
    });
  });

  it('keeps trusted server events out of the public ingestion contract', () => {
    const result = validateRecommendationEventInput(
      { ...validImpression, eventType: 'bookmark_add' },
      { nowMs },
    );
    expect(result).toEqual({
      ok: false,
      errors: expect.arrayContaining(['bookmark_add is recorded only by trusted server flows']),
    });
  });

  it('requires exact progress milestones', () => {
    const invalid = validateRecommendationEventInput(
      { ...validImpression, eventType: 'progress_milestone', maxProgress: 42 },
      { nowMs },
    );
    expect(invalid.ok).toBe(false);

    const valid = validateRecommendationEventInput(
      { ...validImpression, eventType: 'progress_milestone', maxProgress: 50 },
      { nowMs },
    );
    expect(valid.ok).toBe(true);
  });

  it('requires a controlled reason for not_interested', () => {
    expect(
      validateRecommendationEventInput(
        { ...validImpression, eventType: 'not_interested' },
        { nowMs },
      ).ok,
    ).toBe(false);
    expect(
      validateRecommendationEventInput(
        { ...validImpression, eventType: 'not_interested', reasonCode: 'topic' },
        { nowMs },
      ).ok,
    ).toBe(true);
  });
});
