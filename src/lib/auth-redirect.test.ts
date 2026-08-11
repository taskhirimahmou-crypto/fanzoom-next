import { afterEach, describe, expect, it, vi } from 'vitest';
import { getAppUrl, safeRedirectPath } from './auth-redirect';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('safeRedirectPath', () => {
  it.each([
    [null, '/'],
    ['', '/'],
    ['https://evil.example/path', '/'],
    ['//evil.example/path', '/'],
    ['javascript:alert(1)', '/'],
    ['/bookmarks', '/bookmarks'],
    ['/search?q=next#results', '/search?q=next#results'],
  ])('normalizes %s to %s', (value, expected) => {
    expect(safeRedirectPath(value)).toBe(expected);
  });
});

describe('getAppUrl', () => {
  it('uses the configured canonical origin', () => {
    process.env.APP_URL = 'https://fanzoom.ir/some/path';
    expect(getAppUrl('https://untrusted.example')).toBe('https://fanzoom.ir');
  });

  it('uses the request origin outside production', () => {
    vi.stubEnv('APP_URL', '');
    vi.stubEnv('NODE_ENV', 'test');
    expect(getAppUrl('http://localhost:3000/path')).toBe('http://localhost:3000');
  });

  it('uses the Fanzoom origin by default in production', () => {
    vi.stubEnv('APP_URL', '');
    vi.stubEnv('NODE_ENV', 'production');
    expect(getAppUrl('https://untrusted.example')).toBe('https://fanzoom.ir');
  });
});
