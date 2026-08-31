import { describe, expect, it } from 'vitest';
import { aggregateDataQuality } from './aggregate.mjs';

const attributed = {
  userId: 'user-1',
  articleId: 'article-1',
  feedId: 'feed_12345678',
  rank: 1,
  surface: 'for_you',
  algorithmVersion: 'baseline:v1',
};

describe('local observability aggregation', () => {
  it('computes the funnel, segments and operational latency', () => {
    const events = ['served', 'impression', 'open', 'engaged'].map((eventType, index) => ({
      ...attributed,
      eventId: `event-${index}`,
      idempotencyKey: `key-${index}`,
      eventType,
    }));
    const logs = [100, 200, 300, 400, 500].map((durationMs, index) => ({
      eventName: 'http_request_completed',
      statusCode: index === 0 ? 429 : index === 1 ? 503 : 200,
      durationMs,
    }));
    logs.push({ eventName: 'recommended_feed_empty' });
    logs.push({ eventName: 'served_partial_failure' });

    const result = aggregateDataQuality(events, logs);
    expect(result.funnel.stages).toEqual({ served: 1, impression: 1, open: 1, engaged: 1 });
    expect(result.funnel.conversion).toEqual({
      servedToImpression: 1,
      impressionToOpen: 1,
      openToEngaged: 1,
    });
    expect(result.segments[0]).toMatchObject({
      surface: 'for_you',
      algorithmVersion: 'baseline:v1',
    });
    expect(result.operations).toMatchObject({
      responses429: 1,
      responses5xx: 1,
      emptyFeeds: 1,
      servedPartialFailures: 1,
      latency: { samples: 5, averageMs: 300, p95Ms: 500 },
    });
  });

  it('deduplicates retries and reports incomplete or conflicting attribution', () => {
    const duplicate = {
      ...attributed,
      eventType: 'served',
      eventId: 'event-1',
      idempotencyKey: 'same-key',
    };
    const result = aggregateDataQuality([
      duplicate,
      { ...duplicate, eventId: 'event-2' },
      {
        userId: 'user-1',
        eventId: 'event-3',
        idempotencyKey: 'missing-key',
        eventType: 'impression',
        surface: 'for_you',
      },
      {
        ...attributed,
        eventId: 'event-4',
        idempotencyKey: 'mixed-key',
        eventType: 'open',
        surface: 'direct',
      },
      {
        userId: 'user-1',
        eventId: 'event-5',
        idempotencyKey: 'direct-key',
        eventType: 'open',
        surface: 'direct',
      },
    ]);

    expect(result.quality).toEqual({
      duplicateEvents: 1,
      duplicateGroups: 1,
      incompleteEvents: 2,
      unattributedEvents: 2,
      invalidAttributionEvents: 2,
      eventTotals: { served: 1, impression: 1, open: 2, engaged: 0 },
    });
    expect(result.funnel.stages).toEqual({ served: 1, impression: 0, open: 0, engaged: 0 });
  });
});
