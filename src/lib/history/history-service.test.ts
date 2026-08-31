import { describe, expect, it, vi } from 'vitest';
import type PocketBase from 'pocketbase';
import {
  mergeReadingHistoryRecords,
  upsertReadingHistory,
  type ReadingHistoryItem,
} from './history-service';

const baseRecord = {
  id: 'record123456789',
  user: 'user1234567890',
  article: 'article12345678',
  created: '2026-08-01T00:00:00.000Z',
  updated: '2026-08-01T00:00:00.000Z',
};

describe('reading history compatibility', () => {
  it('merges legacy and canonical data without duplicates and keeps the newest read', () => {
    const legacy: ReadingHistoryItem[] = [
      { ...baseRecord, last_read: '2026-08-10T00:00:00.000Z' },
    ];
    const canonical: ReadingHistoryItem[] = [
      { ...baseRecord, id: 'canonical12345', last_read: '2026-08-11T00:00:00.000Z' },
    ];

    expect(mergeReadingHistoryRecords(canonical, legacy)).toEqual([canonical[0]]);
  });

  it('writes to legacy only when the canonical collection is not ready', async () => {
    const legacyCreate = vi.fn().mockResolvedValue({});
    const pb = {
      filter: vi.fn(() => 'filter'),
      collection(name: string) {
        if (name === 'reading_history') {
          return { getList: vi.fn().mockRejectedValue(new Error('missing collection')) };
        }
        return {
          getList: vi.fn().mockResolvedValue({ items: [] }),
          create: legacyCreate,
        };
      },
    } as unknown as PocketBase;

    await expect(
      upsertReadingHistory(
        pb,
        'user1234567890',
        'article12345678',
        '2026-08-11T00:00:00.000Z',
      ),
    ).resolves.toBe('legacy');
    expect(legacyCreate).toHaveBeenCalledWith(
      expect.objectContaining({ article: 'article12345678', user: 'user1234567890' }),
    );
  });
});
