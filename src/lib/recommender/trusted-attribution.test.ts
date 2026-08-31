import { describe, expect, it, vi } from 'vitest';
import { validateTrustedOpenAttribution } from './trusted-attribution';

const attribution = {
  feedId: 'feed_12345678',
  rank: 2,
  surface: 'for_you' as const,
  algorithmVersion: 'baseline-category-round-robin-v1',
};

describe('trusted open attribution', () => {
  it('accepts only coordinates backed by the authenticated user served event', async () => {
    const exists = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const repository = { exists };
    const now = new Date('2026-08-26T12:00:00.000Z');

    await expect(validateTrustedOpenAttribution(
      attribution, 'user12345678901', 'article1234567', repository, now,
    )).resolves.toEqual(attribution);
    await expect(validateTrustedOpenAttribution(
      { ...attribution, rank: 3 }, 'user12345678901', 'article1234567', repository, now,
    )).resolves.toBeUndefined();
    expect(exists).toHaveBeenNthCalledWith(
      1,
      'user12345678901',
      'article1234567',
      attribution,
      '2026-08-26 11:30:00.000Z',
    );
  });

  it('does not query storage for direct or structurally invalid traffic', async () => {
    const exists = vi.fn();
    await expect(validateTrustedOpenAttribution(
      undefined, 'user12345678901', 'article1234567', { exists },
    )).resolves.toBeUndefined();
    expect(exists).not.toHaveBeenCalled();
  });
});
