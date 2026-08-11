import { afterEach, describe, expect, it, vi } from 'vitest';
import { getPocketBaseUrl } from './pocketbase-url';

afterEach(() => {
  vi.unstubAllEnvs();
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
