import { describe, expect, it, vi } from 'vitest';
import { isPersonalizationEnabled, readPersonalizationEnabled } from './consent';

describe('personalization consent', () => {
  it('defaults to disabled for missing and legacy user records', () => {
    expect(isPersonalizationEnabled(undefined)).toBe(false);
    expect(isPersonalizationEnabled({})).toBe(false);
    expect(isPersonalizationEnabled({ personalizationEnabled: 'true' })).toBe(false);
  });

  it('accepts only an explicit boolean opt-in and reads a fresh server record', async () => {
    const getOne = vi.fn().mockResolvedValue({ personalizationEnabled: true });
    const pb = { collection: vi.fn(() => ({ getOne })) };

    await expect(readPersonalizationEnabled(pb, 'user12345678901')).resolves.toBe(true);
    expect(getOne).toHaveBeenCalledWith('user12345678901', {
      fields: 'personalizationEnabled',
    });
  });
});
