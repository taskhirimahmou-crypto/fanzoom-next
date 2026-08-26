import { describe, expect, it, vi } from 'vitest';
import { sendServedBatchWithRetry } from './served-client';

const request = {
  feedId: 'feed_12345678',
  surface: 'for_you' as const,
  algorithmVersion: 'baseline-category-round-robin-v1' as const,
  offset: 0,
  articleIds: ['abc123def456ghi'],
};

describe('served client retry', () => {
  it('retries a partial 503 and succeeds without changing the idempotent request', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ partial: true }), { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const sleep = vi.fn().mockResolvedValue(undefined);

    await expect(sendServedBatchWithRetry(request, fetcher, sleep)).resolves.toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[0][1]?.body).toBe(fetcher.mock.calls[1][1]?.body);
    expect(sleep).toHaveBeenCalledWith(250);
  });

  it('retries network failures but not permanent feed validation errors', async () => {
    const networkFetcher = vi.fn()
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    await expect(sendServedBatchWithRetry(
      request, networkFetcher, async () => {},
    )).resolves.toBe(true);

    const conflictFetcher = vi.fn().mockResolvedValue(new Response(null, { status: 409 }));
    await expect(sendServedBatchWithRetry(
      request, conflictFetcher, async () => {},
    )).resolves.toBe(false);
    expect(conflictFetcher).toHaveBeenCalledTimes(1);
  });
});
