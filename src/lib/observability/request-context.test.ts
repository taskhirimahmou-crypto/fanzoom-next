import { describe, expect, it, vi } from 'vitest';
import { beginServerRequest, observedJson, REQUEST_ID_HEADER } from './request-context';

describe('request observability context', () => {
  it('propagates a valid incoming request id into the response and log', async () => {
    const requestId = '0191f3a5-2e88-7c02-a8fd-f0dc0353d6f1';
    const request = new Request('http://localhost/api/health', {
      headers: { [REQUEST_ID_HEADER]: requestId },
    });
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const context = beginServerRequest(request, '/api/health', { now: () => 100 });
    const response = observedJson(context, { status: 'ok' });

    expect(response.headers.get(REQUEST_ID_HEADER)).toBe(requestId);
    expect(await response.json()).toEqual({ status: 'ok' });
    expect(JSON.parse(String(log.mock.calls[0]?.[0])).requestId).toBe(requestId);
    log.mockRestore();
  });

  it('replaces an unsafe caller-controlled request id', () => {
    const request = new Request('http://localhost/api/health', {
      headers: { [REQUEST_ID_HEADER]: 'not-a-uuid password=secret' },
    });
    const context = beginServerRequest(request, '/api/health');
    expect(context.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(context.requestId).not.toContain('secret');
  });
});
