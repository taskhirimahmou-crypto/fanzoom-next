import { BASELINE_RECOMMENDATION_ALGORITHM_VERSION } from '../recommendations/baseline';

export type ServedBatchRequest = {
  feedId: string;
  surface: 'home' | 'for_you';
  algorithmVersion: typeof BASELINE_RECOMMENDATION_ALGORITHM_VERSION;
  offset: number;
  articleIds: string[];
};

export function validateServedBatchRequest(raw: unknown):
  | { ok: true; value: ServedBatchRequest }
  | { ok: false } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false };
  const value = raw as Record<string, unknown>;
  const allowed = new Set(['feedId', 'surface', 'algorithmVersion', 'offset', 'articleIds']);
  if (Object.keys(value).some((key) => !allowed.has(key))) return { ok: false };
  if (typeof value.feedId !== 'string' || !/^[a-z0-9][a-z0-9_-]{7,63}$/i.test(value.feedId)) {
    return { ok: false };
  }
  if (value.surface !== 'home' && value.surface !== 'for_you') return { ok: false };
  if (value.algorithmVersion !== BASELINE_RECOMMENDATION_ALGORITHM_VERSION) return { ok: false };
  if (!Number.isInteger(value.offset) || (value.offset as number) < 0 || (value.offset as number) > 1000) {
    return { ok: false };
  }
  if (
    !Array.isArray(value.articleIds) ||
    value.articleIds.length < 1 ||
    value.articleIds.length > 50 ||
    value.articleIds.some((id) => typeof id !== 'string' || !/^[a-z0-9]{15}$/i.test(id)) ||
    new Set(value.articleIds).size !== value.articleIds.length
  ) {
    return { ok: false };
  }
  return { ok: true, value: value as ServedBatchRequest };
}
