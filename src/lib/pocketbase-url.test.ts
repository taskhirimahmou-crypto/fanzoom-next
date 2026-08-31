import { afterEach, describe, expect, it, vi } from 'vitest';
import { getPocketBaseServerUrl, getPocketBaseUrl } from './pocketbase-url';

describe('getPocketBaseServerUrl', () => {
  it('prefers the Docker-internal URL over the browser URL', () => {
    vi.stubEnv('POCKETBASE_INTERNAL_URL', 'http://pocketbase:8090/path/');
    vi.stubEnv('NEXT_PUBLIC_POCKETBASE_URL', 'http://127.0.0.1:8090');

    expect(getPocketBaseServerUrl()).toBe('http://pocketbase:8090');
  });

  it('keeps the existing public URL fallback outside Docker', () => {
    vi.stubEnv('POCKETBASE_INTERNAL_URL', '');
    vi.stubEnv('NEXT_PUBLIC_POCKETBASE_URL', 'https://example.invalid/path/');

    expect(getPocketBaseServerUrl()).toBe('https://example.invalid');
  });

  it('defaults to local PocketBase in development when neither variable is set', () => {
    vi.stubEnv('POCKETBASE_INTERNAL_URL', '');
    vi.stubEnv('NEXT_PUBLIC_POCKETBASE_URL', '');
    vi.stubEnv('NODE_ENV', 'development');

    expect(getPocketBaseServerUrl()).toBe('http://127.0.0.1:8090');
  });
});

describe('getPocketBaseUrl', () => {
  it('uses the Fanzoom PocketBase deployment by default', () => {
    vi.stubEnv('NEXT_PUBLIC_POCKETBASE_URL', '');
    expect(getPocketBaseUrl()).toBe('https://my-backend-fanzoom.liara.run');
  });

  it('normalizes an explicitly configured URL to its origin', () => {
    vi.stubEnv('NEXT_PUBLIC_POCKETBASE_URL', 'https://pb.example.com/path/');
    expect(getPocketBaseUrl()).toBe('https://pb.example.com');
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});
