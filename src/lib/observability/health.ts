type CollectionSnapshot = {
  name?: string;
  fields?: Array<{ name?: string }>;
  createRule?: string | null;
  updateRule?: string | null;
};

export type HealthProbeClient = {
  health: { check: () => Promise<unknown> };
  collections: { getOne: (name: string) => Promise<CollectionSnapshot> };
};

export type FanzoomHealthResult =
  | { healthy: true }
  | { healthy: false; errorCode: 'pocketbase_unavailable' | 'schema_mismatch' };

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
    }
    return { healthy: true };
  } catch {
    return { healthy: false, errorCode: 'schema_mismatch' };
  }
}
