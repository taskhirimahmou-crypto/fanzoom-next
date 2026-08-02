import { describe, it, expect } from 'vitest';
import { safeRelativeTime } from './articles';

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
