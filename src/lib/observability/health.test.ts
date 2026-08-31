import { describe, expect, it, vi } from 'vitest';
import { checkFanzoomHealth, checkPocketBaseAvailability, type HealthProbeClient } from './health';

const fields = {
  users: ['personalizationEnabled', 'personalizationConsentAt'],
  articles: ['slug', 'views'],
  reading_history: ['user', 'article', 'last_read'],
  recommendation_events: [
    'eventId', 'idempotencyKey', 'userId', 'articleId', 'eventType', 'surface',
    'feedId', 'rank', 'algorithmVersion', 'occurredAt', 'receivedAt',
    'engagedSeconds', 'maxProgress', 'reasonCode',
  ],
  comments: ['user', 'article', 'content', 'status'],
  app_admins: ['user', 'role', 'enabled'],
};

function client(overrides: Partial<HealthProbeClient> = {}): HealthProbeClient {
  return {
    health: { check: vi.fn().mockResolvedValue({ code: 200 }) },
    collections: {
      getOne: vi.fn(async (name: string) => ({
        name,
        fields: (fields[name as keyof typeof fields] ?? []).map((field) => ({
          name: field,
          ...(name === 'app_admins' && field === 'role'
            ? { values: ['owner', 'admin', 'viewer'] }
            : {}),
        })),
        indexes: name === 'app_admins'
          ? ['CREATE UNIQUE INDEX idx_app_admins_user_unique ON app_admins (user)']
          : [],
        listRule: name === 'app_admins' ? null : '',
        viewRule: name === 'app_admins' ? null : '',
        createRule: name === 'recommendation_events' || name === 'comments' || name === 'app_admins'
          ? null
          : '',
        updateRule: name === 'recommendation_events' || name === 'comments' || name === 'app_admins'
          ? null
          : '',
        deleteRule: name === 'app_admins' ? null : '',
      })),
    },
    ...overrides,
  };
}

describe('Fanzoom health probe', () => {
  it('uses the public PocketBase health API without credentials or writes', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{"code":200}', { status: 200 }));
    expect(await checkPocketBaseAvailability(fetchImpl)).toEqual({ healthy: true });
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, options] = fetchImpl.mock.calls[0];
    expect(String(url)).toMatch(/\/api\/health$/);
    expect(options).toMatchObject({ method: 'GET', cache: 'no-store' });
    expect(options.headers).toBeUndefined();
    expect(options.body).toBeUndefined();
  });

  it('reports an unavailable PocketBase from the public read-only probe', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('private transport details'));
    expect(await checkPocketBaseAvailability(fetchImpl)).toEqual({
      healthy: false,
      errorCode: 'pocketbase_unavailable',
    });
  });

  it('accepts a reachable PocketBase with the expected schema contract', async () => {
    expect(await checkFanzoomHealth(client())).toEqual({ healthy: true });
  });

  it('reports PocketBase unavailability without exposing the underlying error', async () => {
    const result = await checkFanzoomHealth(client({
      health: { check: vi.fn().mockRejectedValue(new Error('secret internal URL')) },
    }));
    expect(result).toEqual({ healthy: false, errorCode: 'pocketbase_unavailable' });
    expect(JSON.stringify(result)).not.toContain('secret internal URL');
  });

  it('detects a missing migration field and unsafe comment rules', async () => {
    const getOne = vi.fn(async (name: string) => ({
      fields: (fields[name as keyof typeof fields] ?? [])
        .filter((field) => !(name === 'recommendation_events' && field === 'algorithmVersion'))
        .map((field) => ({ name: field })),
      createRule: name === 'comments' ? '@request.auth.id != ""' : null,
      updateRule: null,
    }));
    expect(await checkFanzoomHealth(client({ collections: { getOne } }))).toEqual({
      healthy: false,
      errorCode: 'schema_mismatch',
    });
  });
});
