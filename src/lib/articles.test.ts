import { describe, it, expect } from 'vitest';
import { formatViews } from './articles';

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
