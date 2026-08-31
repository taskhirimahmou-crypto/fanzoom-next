import type { RecommendationEventInput } from './contracts';

const PERSONALIZATION_STORAGE_KEY = 'fanzoom:personalization-enabled';
const completed = new Set<string>();
const inFlight = new Map<string, Promise<boolean>>();

export function setClientPersonalizationPreference(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(PERSONALIZATION_STORAGE_KEY, enabled ? '1' : '0');
}

export function clientPersonalizationAllowsEvents(serverEnabled: boolean): boolean {
  if (!serverEnabled) return false;
  if (typeof window === 'undefined') return serverEnabled;
  return window.localStorage.getItem(PERSONALIZATION_STORAGE_KEY) !== '0';
}

export async function sendRecommendationEvent(
  event: RecommendationEventInput,
  serverEnabled: boolean,
  fetcher: typeof fetch = fetch,
): Promise<boolean> {
  if (!clientPersonalizationAllowsEvents(serverEnabled)) return false;
  try {
    const response = await fetcher('/api/recommendation-events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
      keepalive: true,
    });
    return response.ok;
  } catch {
    return false;
  }
}

export function sendRecommendationEventOnce(
  dedupeKey: string,
  event: RecommendationEventInput,
  serverEnabled: boolean,
  sender: typeof sendRecommendationEvent = sendRecommendationEvent,
): Promise<boolean> {
  if (completed.has(dedupeKey)) return Promise.resolve(false);
  const pending = inFlight.get(dedupeKey);
  if (pending) return pending;

  const request = sender(event, serverEnabled)
    .then((succeeded) => {
      if (succeeded) completed.add(dedupeKey);
      return succeeded;
    })
    .finally(() => inFlight.delete(dedupeKey));
  inFlight.set(dedupeKey, request);
  return request;
}

export function resetClientEventDedupeForTests(): void {
  completed.clear();
  inFlight.clear();
}
