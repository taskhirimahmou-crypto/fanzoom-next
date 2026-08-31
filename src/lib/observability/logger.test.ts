import { describe, expect, it, vi } from 'vitest';
import { createStructuredServerLog, writeStructuredServerLog } from './logger';

describe('structured server logger', () => {
  it('produces the stable JSON schema', () => {
    expect(createStructuredServerLog({
      level: 'info',
      eventName: 'http_request_completed',
      requestId: '0191f3a5-2e88-7c02-a8fd-f0dc0353d6f1',
      route: '/api/recommended',
      statusCode: 200,
      durationMs: 12.6,
      feedId: 'feed_12345678',
      algorithmVersion: 'baseline:v1',
    }, new Date('2026-08-31T10:00:00.000Z'))).toEqual({
      timestamp: '2026-08-31T10:00:00.000Z',
      level: 'info',
      eventName: 'http_request_completed',
      requestId: '0191f3a5-2e88-7c02-a8fd-f0dc0353d6f1',
      route: '/api/recommended',
      statusCode: 200,
      durationMs: 13,
      feedId: 'feed_12345678',
      algorithmVersion: 'baseline:v1',
      errorCode: null,
    });
  });

  it('cannot copy sensitive or arbitrary input into the log line', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    writeStructuredServerLog({
      level: 'error',
      eventName: 'pocketbase_failure',
      requestId: '0191f3a5-2e88-7c02-a8fd-f0dc0353d6f1',
      route: '/api/comments',
      statusCode: 500,
      durationMs: 4,
      errorCode: 'comment_create_failed',
      password: 'secret-password',
      email: 'reader@example.com',
      payload: { body: 'private comment text' },
    } as never);

    const line = String(spy.mock.calls[0]?.[0]);
    expect(() => JSON.parse(line)).not.toThrow();
    expect(line).not.toContain('secret-password');
    expect(line).not.toContain('reader@example.com');
    expect(line).not.toContain('private comment text');
    spy.mockRestore();
  });
});
