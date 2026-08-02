import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { getImageUrl } from './articles';

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
