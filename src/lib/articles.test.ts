import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { relativeTime } from './articles';

describe('relativeTime', () => {
  const mockNow = new Date('2024-01-15T12:00:00Z').getTime();

  beforeEach(() => {
    vi.spyOn(Date, 'now').mockReturnValue(mockNow);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns "همین حالا" for less than 1 minute', () => {
    // 30 seconds ago
    const date = new Date(mockNow - 30 * 1000).toISOString();
    expect(relativeTime(date)).toBe('همین حالا');
  });

  it('returns correctly for 1 to 59 minutes', () => {
    // 5 minutes ago
    const date = new Date(mockNow - 5 * 60 * 1000).toISOString();
    expect(relativeTime(date)).toBe('۵ دقیقه پیش');

    // 59 minutes ago
    const date59 = new Date(mockNow - 59 * 60 * 1000).toISOString();
    expect(relativeTime(date59)).toBe('۵۹ دقیقه پیش');
  });

  it('returns correctly for 1 to 23 hours', () => {
    // 1 hour ago (exactly 60 minutes)
    const date1 = new Date(mockNow - 60 * 60 * 1000).toISOString();
    expect(relativeTime(date1)).toBe('۱ ساعت پیش');

    // 12 hours ago
    const date12 = new Date(mockNow - 12 * 60 * 60 * 1000).toISOString();
    expect(relativeTime(date12)).toBe('۱۲ ساعت پیش');

    // 23 hours ago
    const date23 = new Date(mockNow - 23 * 60 * 60 * 1000).toISOString();
    expect(relativeTime(date23)).toBe('۲۳ ساعت پیش');
  });

  it('returns correctly for 1 to 29 days', () => {
    // 1 day ago
    const date1 = new Date(mockNow - 24 * 60 * 60 * 1000).toISOString();
    expect(relativeTime(date1)).toBe('۱ روز پیش');

    // 15 days ago
    const date15 = new Date(mockNow - 15 * 24 * 60 * 60 * 1000).toISOString();
    expect(relativeTime(date15)).toBe('۱۵ روز پیش');

    // 29 days ago
    const date29 = new Date(mockNow - 29 * 24 * 60 * 60 * 1000).toISOString();
    expect(relativeTime(date29)).toBe('۲۹ روز پیش');
  });

  it('returns localized date string for 30 days or more', () => {
    // 30 days ago
    const date30 = new Date(mockNow - 30 * 24 * 60 * 60 * 1000).toISOString();
    const expected30 = new Date(date30).toLocaleDateString('fa-IR');
    expect(relativeTime(date30)).toBe(expected30);

    // 1 year ago
    const dateYear = new Date(mockNow - 365 * 24 * 60 * 60 * 1000).toISOString();
    const expectedYear = new Date(dateYear).toLocaleDateString('fa-IR');
    expect(relativeTime(dateYear)).toBe(expectedYear);
  });
});
