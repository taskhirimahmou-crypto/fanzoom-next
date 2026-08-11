import { describe, expect, it } from 'vitest';
import PocketBase from 'pocketbase';
import { AUTH_COOKIE, serializeAuthCookie } from './auth-cookies';

describe('auth cookie contract', () => {
  it('round-trips through the PocketBase auth store', () => {
    const record = {
      id: 'user-id',
      collectionId: 'users-id',
      collectionName: 'users',
      email: 'reader@example.com',
    };
    const value = serializeAuthCookie('signed-token', record);
    const pb = new PocketBase('http://127.0.0.1:8090');

    pb.authStore.loadFromCookie(`${AUTH_COOKIE}=${value}`);

    expect(pb.authStore.token).toBe('signed-token');
    expect(pb.authStore.record?.id).toBe('user-id');
    expect(pb.authStore.record?.collectionName).toBe('users');
  });
});
