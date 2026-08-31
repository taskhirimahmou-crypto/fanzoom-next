import { describe, expect, it, vi } from 'vitest';
import type PocketBase from 'pocketbase';
import {
  OBSERVABILITY_EVENT_PAGE_SIZE,
  assertLocalObservabilityRuntime,
  parseStructuredLogLines,
  readBoundedRecommendationEvents,
} from './dashboard-data';

describe('observability dashboard data source', () => {
  it('refuses to read an external PocketBase or run outside local Docker', () => {
    const previousMarker = process.env.FANZOOM_LOCAL_DOCKER;
    const previousInternalUrl = process.env.POCKETBASE_INTERNAL_URL;
    try {
      process.env.FANZOOM_LOCAL_DOCKER = 'false';
      process.env.POCKETBASE_INTERNAL_URL = 'http://pocketbase:8090';
      expect(() => assertLocalObservabilityRuntime()).toThrow('observability_dashboard_requires_local_docker');
      process.env.FANZOOM_LOCAL_DOCKER = 'true';
      process.env.POCKETBASE_INTERNAL_URL = 'https://database.example.test';
      expect(() => assertLocalObservabilityRuntime()).toThrow('observability_dashboard_requires_local_docker');
      process.env.POCKETBASE_INTERNAL_URL = 'http://pocketbase:8090';
      expect(() => assertLocalObservabilityRuntime()).not.toThrow();
    } finally {
      if (previousMarker === undefined) delete process.env.FANZOOM_LOCAL_DOCKER;
      else process.env.FANZOOM_LOCAL_DOCKER = previousMarker;
      if (previousInternalUrl === undefined) delete process.env.POCKETBASE_INTERNAL_URL;
      else process.env.POCKETBASE_INTERNAL_URL = previousInternalUrl;
    }
  });

  it('uses a bounded time filter and paginates without an unbounded list', async () => {
    const getList = vi.fn()
      .mockResolvedValueOnce({
        page: 1,
        perPage: OBSERVABILITY_EVENT_PAGE_SIZE,
        totalItems: 3,
        totalPages: 2,
        items: [{ eventId: 'a' }, { eventId: 'b' }],
      })
      .mockResolvedValueOnce({
        page: 2,
        perPage: OBSERVABILITY_EVENT_PAGE_SIZE,
        totalItems: 3,
        totalPages: 2,
        items: [{ eventId: 'c' }],
      });
    const filter = vi.fn(() => 'receivedAt >= start && receivedAt <= end');
    const pb = {
      filter,
      collection: vi.fn(() => ({ getList })),
    } as unknown as PocketBase;

    const result = await readBoundedRecommendationEvents(
      pb,
      '2026-08-30T12:00:00.000Z',
      '2026-08-31T12:00:00.000Z',
      10,
    );

    expect(result).toEqual({ rows: [{ eventId: 'a' }, { eventId: 'b' }, { eventId: 'c' }], truncated: false });
    expect(filter).toHaveBeenCalledWith(
      'receivedAt >= {:start} && receivedAt <= {:end}',
      { start: '2026-08-30T12:00:00.000Z', end: '2026-08-31T12:00:00.000Z' },
    );
    expect(getList).toHaveBeenCalledTimes(2);
    expect(getList.mock.calls[0][2]).toMatchObject({
      sort: '+receivedAt',
      requestKey: null,
    });
  });

  it('marks a result truncated when the configured row cap is reached', async () => {
    const pb = {
      filter: vi.fn(() => 'bounded'),
      collection: vi.fn(() => ({
        getList: vi.fn().mockResolvedValue({
          totalItems: 2,
          totalPages: 1,
          items: [{ eventId: 'a' }],
        }),
      })),
    } as unknown as PocketBase;
    expect(await readBoundedRecommendationEvents(pb, 'start', 'end', 1)).toMatchObject({ truncated: true });
  });

  it('accepts Docker log prefixes and ignores malformed or non-object lines', () => {
    const rows = parseStructuredLogLines([
      'web-1 | {"timestamp":"2026-08-31T12:00:00.000Z","eventName":"http_request_completed"}',
      '{not-json}',
      '[]',
      '{"timestamp":"2026-08-31T12:01:00.000Z","eventName":"pocketbase_failure"}',
    ].join('\n'));
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.eventName)).toEqual(['http_request_completed', 'pocketbase_failure']);
  });
});
