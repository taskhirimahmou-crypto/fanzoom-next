type CollectionSnapshot = {
  name?: string;
  fields?: Array<{ name?: string; values?: string[] }>;
  indexes?: string[];
  listRule?: string | null;
  viewRule?: string | null;
  createRule?: string | null;
  updateRule?: string | null;
  deleteRule?: string | null;
};

export type HealthProbeClient = {
  health: { check: () => Promise<unknown> };
  collections: { getOne: (name: string) => Promise<CollectionSnapshot> };
};

export type FanzoomHealthResult =
  | { healthy: true }
  | { healthy: false; errorCode: 'pocketbase_unavailable' | 'schema_mismatch' };

export async function checkPocketBaseAvailability(
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 1_500,
): Promise<FanzoomHealthResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(`${getPocketBaseServerUrl()}/api/health`, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
    });
    return response.ok
      ? { healthy: true }
      : { healthy: false, errorCode: 'pocketbase_unavailable' };
  } catch {
    return { healthy: false, errorCode: 'pocketbase_unavailable' };
  } finally {
    clearTimeout(timeout);
  }
}

const EXPECTED_SCHEMA = {
  users: ['personalizationEnabled', 'personalizationConsentAt'],
  articles: ['slug', 'views'],
  reading_history: ['user', 'article', 'last_read'],
  recommendation_events: [
    'eventId',
    'idempotencyKey',
    'userId',
    'articleId',
    'eventType',
    'surface',
    'feedId',
    'rank',
    'algorithmVersion',
    'occurredAt',
    'receivedAt',
    'engagedSeconds',
    'maxProgress',
    'reasonCode',
  ],
  comments: ['user', 'article', 'content', 'status'],
  app_admins: ['user', 'role', 'enabled'],
} as const;

export async function checkFanzoomHealth(client: HealthProbeClient): Promise<FanzoomHealthResult> {
  try {
    await client.health.check();
  } catch {
    return { healthy: false, errorCode: 'pocketbase_unavailable' };
  }

  try {
    for (const [collectionName, expectedFields] of Object.entries(EXPECTED_SCHEMA)) {
      const collection = await client.collections.getOne(collectionName);
      const actualFields = new Set((collection.fields ?? []).map((field) => field.name));
      if (expectedFields.some((field) => !actualFields.has(field))) {
        return { healthy: false, errorCode: 'schema_mismatch' };
      }
      if (
        (collectionName === 'recommendation_events' || collectionName === 'comments') &&
        (collection.createRule !== null || collection.updateRule !== null)
      ) {
        return { healthy: false, errorCode: 'schema_mismatch' };
      }
      if (
        collectionName === 'app_admins' &&
        (
          collection.listRule !== null ||
          collection.viewRule !== null ||
          collection.createRule !== null ||
          collection.updateRule !== null ||
          collection.deleteRule !== null
        )
      ) {
        return { healthy: false, errorCode: 'schema_mismatch' };
      }
      if (collectionName === 'app_admins') {
        const role = collection.fields?.find((field) => field.name === 'role');
        if (JSON.stringify(role?.values) !== JSON.stringify(['owner', 'admin', 'viewer'])) {
          return { healthy: false, errorCode: 'schema_mismatch' };
        }
        if (!(collection.indexes ?? []).some((index) => index.includes('idx_app_admins_user_unique'))) {
          return { healthy: false, errorCode: 'schema_mismatch' };
        }
      }
    }
    return { healthy: true };
  } catch {
    return { healthy: false, errorCode: 'schema_mismatch' };
  }
}
import { getPocketBaseServerUrl } from '../pocketbase-url';
