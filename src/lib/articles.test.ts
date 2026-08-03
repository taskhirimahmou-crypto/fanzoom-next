import { vi, afterEach, beforeEach } from "vitest";
import { describe, it, expect } from 'vitest';
import { safeRelativeTime, formatViews, getImageUrl, relativeTime } from "./articles";

describe('safeRelativeTime', () => {
  it('should return null for null input', () => {
    expect(safeRelativeTime(null)).toBeNull();
  });

  it('should return null for undefined input', () => {
    expect(safeRelativeTime(undefined)).toBeNull();
  });

  it('should return null for empty string input', () => {
    expect(safeRelativeTime('')).toBeNull();
  });

  it('should return a string for a valid ISO date string with T', () => {
    const validIso = new Date().toISOString();
    const result = safeRelativeTime(validIso);
    expect(typeof result).toBe('string');
  });

  it('should return a string for a valid ISO date string with space instead of T', () => {
    const validIsoSpace = new Date().toISOString().replace('T', ' ');
    const result = safeRelativeTime(validIsoSpace);
    expect(typeof result).toBe('string');
  });
});

describe('formatViews', () => {
  it('formats numbers under 1000 with Persian locale', () => {
    expect(formatViews(0)).toBe('۰');
    expect(formatViews(5)).toBe('۵');
    expect(formatViews(999)).toBe('۹۹۹');
  });

  it('formats exactly 1000 as ۱ هزار', () => {
    expect(formatViews(1000)).toBe('۱ هزار');
  });

  it('formats numbers over 1000 with one decimal place', () => {
    expect(formatViews(1500)).toBe('۱٫۵ هزار');
    expect(formatViews(1200)).toBe('۱٫۲ هزار');
  });

  it('rounds numbers correctly according to maximumFractionDigits', () => {
    expect(formatViews(1550)).toBe('۱٫۶ هزار');
    expect(formatViews(1549)).toBe('۱٫۵ هزار');
    expect(formatViews(1050)).toBe('۱٫۱ هزار');
  });
});



describe('getImageUrl', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should return empty string if image is not provided', () => {
    expect(getImageUrl({ id: '123' })).toBe('');
    expect(getImageUrl({ id: '123', image: null })).toBe('');
    expect(getImageUrl({ id: '123', image: '' })).toBe('');
  });

  it('should return the image URL directly if it starts with http', () => {
    const url = 'https://example.com/image.jpg';
    expect(getImageUrl({ id: '123', image: url })).toBe(url);
  });

  it('should construct URL with NEXT_PUBLIC_POCKETBASE_URL when env is set', () => {
    process.env.NEXT_PUBLIC_POCKETBASE_URL = 'https://pb.example.com';
    expect(getImageUrl({ id: '123', image: 'test.jpg' })).toBe('https://pb.example.com/api/files/articles/123/test.jpg');
  });

  it('should construct URL with default localhost when env is not set', () => {
    delete process.env.NEXT_PUBLIC_POCKETBASE_URL;
    expect(getImageUrl({ id: '123', image: 'test.jpg' })).toBe('http://127.0.0.1:8090/api/files/articles/123/test.jpg');
  });
});



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
