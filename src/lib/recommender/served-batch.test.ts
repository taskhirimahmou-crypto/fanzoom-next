import { describe, expect, it } from 'vitest';
import { validateServedBatchRequest } from './served-batch';

const request = {
  feedId: 'feed_12345678',
  surface: 'for_you',
  algorithmVersion: 'baseline-category-round-robin-v1',
  offset: 0,
  articleIds: ['abc123def456ghi'],
};

describe('trusted served batch request', () => {
  it('accepts bounded feed coordinates and an exact article snapshot', () => {
    expect(validateServedBatchRequest(request)).toEqual({ ok: true, value: request });
  });

  it('rejects user/article forgery and unbounded batches', () => {
    expect(validateServedBatchRequest({ ...request, userId: 'forged' }).ok).toBe(false);
    expect(validateServedBatchRequest({ ...request, articleIds: ['bad'] }).ok).toBe(false);
    expect(validateServedBatchRequest({ ...request, articleIds: Array(51).fill('abc123def456ghi') }).ok).toBe(false);
    expect(validateServedBatchRequest({ ...request, algorithmVersion: 'attacker-v1' }).ok).toBe(false);
  });
});
