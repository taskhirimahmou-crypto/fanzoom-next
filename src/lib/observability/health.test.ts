import { describe, expect, it, vi } from 'vitest';
import { checkFanzoomHealth, type HealthProbeClient } from './health';

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
