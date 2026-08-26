import { afterEach, describe, expect, it } from 'vitest';
import { getPocketBaseServerUrl } from './pocketbase-url';

const originalInternalUrl = process.env.POCKETBASE_INTERNAL_URL;
const originalPublicUrl = process.env.NEXT_PUBLIC_POCKETBASE_URL;

afterEach(() => {
  if (originalInternalUrl === undefined) delete process.env.POCKETBASE_INTERNAL_URL;
  else process.env.POCKETBASE_INTERNAL_URL = originalInternalUrl;

  if (originalPublicUrl === undefined) delete process.env.NEXT_PUBLIC_POCKETBASE_URL;
  else process.env.NEXT_PUBLIC_POCKETBASE_URL = originalPublicUrl;
});

describe('getPocketBaseServerUrl', () => {
  it('prefers the Docker-internal URL over the browser URL', () => {
    process.env.POCKETBASE_INTERNAL_URL = 'http://pocketbase:8090';
    process.env.NEXT_PUBLIC_POCKETBASE_URL = 'http://127.0.0.1:8090';

    expect(getPocketBaseServerUrl()).toBe('http://pocketbase:8090');
  });

  it('keeps the existing public URL fallback outside Docker', () => {
    delete process.env.POCKETBASE_INTERNAL_URL;
    process.env.NEXT_PUBLIC_POCKETBASE_URL = 'https://example.invalid';

    expect(getPocketBaseServerUrl()).toBe('https://example.invalid');
  });

  it('defaults to local PocketBase when neither variable is set', () => {
    delete process.env.POCKETBASE_INTERNAL_URL;
    delete process.env.NEXT_PUBLIC_POCKETBASE_URL;

    expect(getPocketBaseServerUrl()).toBe('http://127.0.0.1:8090');
  });
});
