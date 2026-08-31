import { describe, expect, it } from 'vitest';
import {
  aggregateDataQuality,
  aggregateObservability,
  parseObservabilityFilters,
  resolveObservabilityWindow,
} from './metrics.mjs';

const NOW = new Date('2026-08-31T12:00:00.000Z');

function recommendationEvent(eventType, overrides = {}) {
  const rank = overrides.rank ?? 1;
  return {
    eventId: `event-${eventType}-${rank}-${overrides.suffix ?? 'a'}`,
    idempotencyKey: `idem-${eventType}-${rank}-${overrides.suffix ?? 'a'}`,
    userId: 'internal-user-a',
    articleId: 'article-a',
    eventType,
    surface: 'home',
    feedId: 'feed-a',
    rank,
    algorithmVersion: 'baseline-v1',
    receivedAt: '2026-08-31T11:00:00.000Z',
    ...overrides,
  };
}

describe('canonical observability metrics', () => {
  it('keeps the CLI compatibility alias on the exact dashboard definition', () => {
    const events = ['served', 'impression', 'open', 'engaged'].map((type) => recommendationEvent(type));
    const options = { now: NOW, window: '24h', datasetKind: 'test' };
    expect(aggregateDataQuality(events, [], options)).toEqual(aggregateObservability(events, [], options));
  });

  it('validates the filter allowlists', () => {
    expect(parseObservabilityFilters({ window: '24h', surface: 'home', algorithmVersion: 'baseline-v1' }, NOW).ok).toBe(true);
    expect(parseObservabilityFilters({ window: 'forever' }, NOW)).toEqual({ ok: false, errorCode: 'invalid_window' });
    expect(parseObservabilityFilters({ surface: 'admin' }, NOW)).toEqual({ ok: false, errorCode: 'invalid_surface' });
    expect(parseObservabilityFilters({ algorithmVersion: '<script>' }, NOW)).toEqual({ ok: false, errorCode: 'invalid_algorithm_version' });
  });

  it.each([
    ['24h', 24],
    ['7d', 168],
    ['30d', 720],
  ])('uses an exact rolling UTC %s window', (key, hours) => {
    const window = resolveObservabilityWindow(key, NOW);
    expect(window.timeZone).toBe('UTC');
    expect((Date.parse(window.end) - Date.parse(window.start)) / 3_600_000).toBe(hours);
  });

  it('includes both UTC window boundaries and excludes rows just outside them', () => {
    const events = [
      recommendationEvent('served', { receivedAt: '2026-08-30T12:00:00.000Z', suffix: 'start' }),
      recommendationEvent('served', { receivedAt: '2026-08-31T12:00:00.000Z', rank: 2, suffix: 'end' }),
      recommendationEvent('served', { receivedAt: '2026-08-30T11:59:59.999Z', rank: 3, suffix: 'outside' }),
    ];
    const result = aggregateObservability(events, [], { now: NOW, window: '24h' });
    expect(result.funnel.stages.served).toBe(2);
    expect(result.source.eventRowsRead).toBe(3);
  });

  it('applies recommendation filters without changing window-scoped operational metrics', () => {
    const events = [
      recommendationEvent('served'),
      recommendationEvent('served', { surface: 'for_you', algorithmVersion: 'baseline-v2', rank: 2, suffix: 'b' }),
    ];
    const logs = [{
      timestamp: '2026-08-31T11:30:00.000Z',
      level: 'error',
      eventName: 'http_request_completed',
      requestId: '550e8400-e29b-41d4-a716-446655440000',
      route: '/api/recommended',
      statusCode: 500,
      durationMs: 120,
    }];
    const filtered = aggregateObservability(events, logs, {
      now: NOW,
      window: '24h',
      surface: 'for_you',
      algorithmVersion: 'baseline-v2',
    });
    expect(filtered.funnel.stages.served).toBe(1);
    expect(filtered.overview.responses5xx).toBe(1);
    expect(filtered.filters.operationalScope).toBe('window-only');
  });

  it('uses only successful recommended responses as the empty-feed denominator', () => {
    const logs = [
      { timestamp: '2026-08-31T11:00:00.000Z', eventName: 'http_request_completed', route: '/api/recommended', statusCode: 200 },
      { timestamp: '2026-08-31T11:01:00.000Z', eventName: 'http_request_completed', route: '/api/recommended', statusCode: 503 },
      { timestamp: '2026-08-31T11:02:00.000Z', eventName: 'recommended_feed_empty', requestId: '550e8400-e29b-41d4-a716-446655440000' },
    ];
    const result = aggregateObservability([], logs, { now: NOW, window: '24h' });
    expect(result.overview.recommendedResponses).toBe(1);
    expect(result.overview.emptyFeedRate).toBe(1);
  });

  it('classifies duplicate, direct, incomplete, malformed and inconsistent data', () => {
    const duplicate = recommendationEvent('served');
    const result = aggregateObservability([
      duplicate,
      { ...duplicate, eventId: 'different-id' },
      recommendationEvent('open', { suffix: 'orphan', articleId: 'article-orphan', rank: 2 }),
      recommendationEvent('impression', { suffix: 'incomplete', feedId: '', rank: 3 }),
      recommendationEvent('open', {
        suffix: 'direct', surface: 'direct', feedId: '', rank: 0, algorithmVersion: '', articleId: 'article-direct',
      }),
      { eventType: 'served' },
    ], [], { now: NOW, window: '24h' });

    expect(result.quality.duplicateEvents).toBe(1);
    expect(result.quality.directEvents).toBe(1);
    expect(result.quality.incompleteEvents).toBe(1);
    expect(result.quality.inconsistentEvents).toBe(1);
    expect(result.quality.malformedEvents).toBe(1);
  });

  it('never includes raw identity or arbitrary payload fields in the aggregate DTO', () => {
    const result = aggregateObservability([
      recommendationEvent('served', { email: 'private@example.test', token: 'secret-token' }),
    ], [{
      timestamp: '2026-08-31T11:30:00.000Z',
      eventName: 'http_request_completed',
      route: '/api/recommended',
      statusCode: 200,
      durationMs: 10,
      email: 'private@example.test',
      cookie: 'private-cookie',
    }], { now: NOW, window: '24h' });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('internal-user-a');
    expect(serialized).not.toContain('private@example.test');
    expect(serialized).not.toContain('secret-token');
    expect(serialized).not.toContain('private-cookie');
  });
});
