import { describe, expect, it } from 'vitest';
import { aggregateDataQuality } from './aggregate.mjs';

const attributed = {
  userId: 'user-1',
  articleId: 'article-1',
  feedId: 'feed_12345678',
  rank: 1,
  surface: 'for_you',
  algorithmVersion: 'baseline:v1',
  receivedAt: '2026-08-31T10:00:00.000Z',
};
const now = new Date('2026-08-31T12:00:00.000Z');

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
      timestamp: `2026-08-31T10:0${index}:00.000Z`,
      route: index === 0 ? '/api/recommended' : '/api/health',
    }));
    logs.push({ eventName: 'recommended_feed_empty', timestamp: '2026-08-31T10:10:00.000Z', requestId: 'feed-empty' });
    logs.push({ eventName: 'served_partial_failure', timestamp: '2026-08-31T10:11:00.000Z', requestId: 'partial' });

    const result = aggregateDataQuality(events, logs, { now });
    expect(result.funnel.stages).toEqual({ served: 1, impression: 1, open: 1, engaged: 1 });
    expect(result.funnel.conversion).toEqual({
      servedToImpression: 1,
      impressionToOpen: 1,
      openToEngaged: 1,
      servedToEngaged: 1,
    });
    expect(result.breakdowns[0]).toMatchObject({
      surface: 'for_you',
      algorithmVersion: 'baseline:v1',
    });
    expect(result.overview).toMatchObject({
      responses429: 1,
      responses5xx: 1,
      emptyFeeds: 1,
      averageLatencyMs: 300,
      p95LatencyMs: 500,
      latencySamples: 5,
    });
    expect(result.quality.servedPartialFailures).toBe(1);
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
        receivedAt: attributed.receivedAt,
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
        receivedAt: attributed.receivedAt,
      },
    ], [], { now });

    expect(result.quality).toMatchObject({
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
