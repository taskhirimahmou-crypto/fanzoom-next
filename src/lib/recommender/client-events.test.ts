import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  resetClientEventDedupeForTests,
  sendRecommendationEvent,
  sendRecommendationEventOnce,
} from './client-events';

const event = {
  idempotencyKey: 'impression:feed_12345678:abc123def456ghi',
  articleId: 'abc123def456ghi',
  eventType: 'impression' as const,
  surface: 'for_you' as const,
  feedId: 'feed_12345678',
  rank: 1,
  algorithmVersion: 'baseline-category-round-robin-v1',
};

afterEach(resetClientEventDedupeForTests);

describe('recommendation client event transport', () => {
  it('does not issue a request when personalization is disabled', async () => {
    const fetcher = vi.fn();
    await expect(sendRecommendationEvent(event, false, fetcher)).resolves.toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('coalesces Strict Mode remount attempts into one request', async () => {
    let resolve!: (value: boolean) => void;
    const sender = vi.fn(() => new Promise<boolean>((done) => { resolve = done; }));
    const first = sendRecommendationEventOnce('feed:article', event, true, sender);
    const remount = sendRecommendationEventOnce('feed:article', event, true, sender);

    expect(sender).toHaveBeenCalledTimes(1);
    resolve(true);
    await expect(Promise.all([first, remount])).resolves.toEqual([true, true]);
    await sendRecommendationEventOnce('feed:article', event, true, sender);
    expect(sender).toHaveBeenCalledTimes(1);
  });
});
