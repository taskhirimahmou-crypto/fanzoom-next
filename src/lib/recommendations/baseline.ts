export const BASELINE_RECOMMENDATION_ALGORITHM_VERSION = 'baseline-category-round-robin-v1';

export function createBaselineFeedId(): string {
  return crypto.randomUUID();
}

export function resolveBaselineFeedId(candidate: string | null | undefined): string {
  if (candidate && /^[a-z0-9][a-z0-9_-]{7,63}$/i.test(candidate)) return candidate;
  return createBaselineFeedId();
}

export function interleaveRecommendationLists<T>(lists: readonly (readonly T[])[]): T[] {
  const result: T[] = [];
  let index = 0;
  for (;;) {
    let added = false;
    for (const list of lists) {
      if (list[index] !== undefined) {
        result.push(list[index]);
        added = true;
      }
    }
    if (!added) return result;
    index += 1;
  }
}
