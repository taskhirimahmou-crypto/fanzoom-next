import type { ServedBatchRequest } from './served-batch';

const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

const defaultSleep = (milliseconds: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));

function retryDelay(response: Response | undefined, attempt: number): number {
  const retryAfter = Number(response?.headers.get('retry-after'));
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return Math.min(5_000, Math.ceil(retryAfter * 1_000));
  }
  return attempt === 0 ? 250 : 1_000;
}

export async function sendServedBatchWithRetry(
  request: ServedBatchRequest,
  fetcher: typeof fetch = fetch,
  sleep: (milliseconds: number) => Promise<void> = defaultSleep,
): Promise<boolean> {
  const maxAttempts = 3;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    let response: Response | undefined;
    try {
      response = await fetcher('/api/recommendation-events/served', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        keepalive: true,
      });
      if (response.ok) return true;
      if (!RETRYABLE_STATUSES.has(response.status)) return false;
    } catch {
      response = undefined;
    }
    if (attempt < maxAttempts - 1) await sleep(retryDelay(response, attempt));
  }
  return false;
}
