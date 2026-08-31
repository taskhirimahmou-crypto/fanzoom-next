import { NextRequest, NextResponse } from 'next/server';
import { describe, expect, it, vi } from 'vitest';
import { aggregateObservability } from '@/lib/observability/metrics.mjs';
import { handleObservabilityGet } from './route';

const NOW = new Date('2026-08-31T12:00:00.000Z');
const DATA = aggregateObservability([], [], {
  now: NOW,
  window: '24h',
  datasetKind: 'test',
  health: 'healthy',
});

function request(query = '') {
  return new NextRequest(`http://localhost/api/admin/observability${query}`);
}

function dependencies(access: { ok: true; role: 'viewer' | 'admin' | 'owner' } | { ok: false; response: NextResponse }) {
  return {
    authorize: vi.fn().mockResolvedValue(access),
    load: vi.fn().mockResolvedValue(DATA),
    now: () => NOW,
  };
}

describe('private observability dashboard API', () => {
  it.each([
    ['anonymous', 401],
    ['normal user', 403],
  ])('preserves the denied response for %s', async (_label, status) => {
    const deps = dependencies({
      ok: false,
      response: NextResponse.json({ error: status === 401 ? 'authentication_required' : 'forbidden' }, { status }),
    });
    const response = await handleObservabilityGet(request(), deps);
    expect(response.status).toBe(status);
    expect(response.headers.get('cache-control')).toContain('private');
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(deps.load).not.toHaveBeenCalled();
  });

  it.each(['viewer', 'admin', 'owner'] as const)('allows the %s role to read aggregate data', async (role) => {
    const deps = dependencies({ ok: true, role });
    const response = await handleObservabilityGet(
      request('?window=7d&surface=home&algorithm=baseline-v1'),
      deps,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('vary')).toBe('Cookie');
    expect(deps.load).toHaveBeenCalledWith({
      window: '7d',
      surface: 'home',
      algorithmVersion: 'baseline-v1',
    }, expect.objectContaining({ requestId: expect.any(String) }));
  });

  it.each([
    ['?window=forever', 'invalid_window'],
    ['?surface=profile', 'invalid_surface'],
    ['?algorithm=%3Cscript%3E', 'invalid_algorithm_version'],
  ])('rejects a non-allowlisted query: %s', async (query, errorCode) => {
    const deps = dependencies({ ok: true, role: 'viewer' });
    const response = await handleObservabilityGet(request(query), deps);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: 'invalid_filter', errorCode });
    expect(deps.load).not.toHaveBeenCalled();
  });

  it('returns only the aggregate DTO and never raw PII or event rows', async () => {
    const deps = dependencies({ ok: true, role: 'viewer' });
    deps.load.mockResolvedValue({
      ...DATA,
      // Runtime sources may contain these values; the route contract must not expose a raw source field.
      source: { ...DATA.source, eventRowsRead: 4 },
    });
    const response = await handleObservabilityGet(request(), deps);
    const body = await response.text();
    expect(body).not.toMatch(/userId|email|authorization|cookie|rawEvents|token/i);
    expect(JSON.parse(body)).toMatchObject({ schemaVersion: 'observability-dashboard-v1' });
  });

  it('returns a private 503 without internal error details when the source fails', async () => {
    const deps = dependencies({ ok: true, role: 'admin' });
    deps.load.mockRejectedValue(new Error('credential and internal host detail'));
    const response = await handleObservabilityGet(request(), deps);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'observability_data_unavailable' });
    expect(response.headers.get('cache-control')).toContain('no-store');
  });
});
