import { describe, expect, it } from 'vitest';
import { safeInternalRedirect } from './oauth';

describe('safeInternalRedirect', () => {
  it('accepts internal paths with query strings and fragments', () => {
    expect(safeInternalRedirect('/bookmarks?page=2#saved')).toBe(
      '/bookmarks?page=2#saved'
    );
  });

  it.each([
    'https://attacker.example/path',
    '//attacker.example/path',
    '/\\attacker.example/path',
    'javascript:alert(1)',
    'bookmarks',
  ])('rejects an unsafe redirect: %s', (redirect) => {
    expect(safeInternalRedirect(redirect)).toBe('/');
  });

  it('falls back to home when no redirect was supplied', () => {
    expect(safeInternalRedirect(undefined)).toBe('/');
  });
});
