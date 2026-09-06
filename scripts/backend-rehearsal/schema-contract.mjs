const RULE_KEYS = ['listRule', 'viewRule', 'createRule', 'updateRule', 'deleteRule'];
const AUTH_SETTING_KEYS = [
  'authRule', 'manageRule', 'authAlert', 'oauth2', 'passwordAuth', 'mfa', 'otp',
  'authToken', 'passwordResetToken', 'emailChangeToken', 'verificationToken', 'fileToken',
  'verificationTemplate', 'resetPasswordTemplate', 'confirmEmailChangeTemplate',
];

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}

function normalizeAuthSettings(collection) {
  const settings = structuredClone(Object.fromEntries(
    AUTH_SETTING_KEYS
      .filter((key) => collection[key] !== undefined)
      .map((key) => [key, collection[key]]),
  ));
  // PocketBase 0.40 materializes an omitted empty provider list on import.
  // It is semantically identical; every other OAuth/auth setting stays strict.
  if (Array.isArray(settings.oauth2?.providers) && settings.oauth2.providers.length === 0) {
    delete settings.oauth2.providers;
  }
  return stable(settings);
}

export function normalizeSchema(collections) {
  return [...collections]
    .map((collection) => ({
      id: collection.id,
      name: collection.name,
      type: collection.type,
      system: Boolean(collection.system),
      rules: Object.fromEntries(RULE_KEYS.map((key) => [key, collection[key] ?? null])),
      authSettings: normalizeAuthSettings(collection),
      indexes: [...(collection.indexes ?? [])].map(String).sort(),
      fields: [...(collection.fields ?? [])]
        .map((field) => stable({
          name: field.name,
          type: field.type,
          required: Boolean(field.required),
          collectionId: field.collectionId ?? null,
          maxSelect: field.maxSelect ?? null,
          min: field.min ?? null,
          max: field.max ?? null,
          values: field.values ?? null,
          onCreate: field.onCreate ?? null,
          onUpdate: field.onUpdate ?? null,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function compareSnapshotToImported(snapshot, imported) {
  const expected = normalizeSchema(snapshot);
  const actual = normalizeSchema(imported);
  const actualByName = new Map(actual.map((collection) => [collection.name, collection]));
  const mismatches = [];

  for (const collection of expected) {
    const live = actualByName.get(collection.name);
    if (!live) {
      mismatches.push({ type: 'missing_collection', collection: collection.name });
      continue;
    }
    if (collection.id !== live.id || collection.type !== live.type || collection.system !== live.system) {
      mismatches.push({ type: 'collection_identity', collection: collection.name });
    }
    if (JSON.stringify(collection.fields) !== JSON.stringify(live.fields)) {
      mismatches.push({ type: 'field_contract', collection: collection.name });
    }
    if (JSON.stringify(collection.rules) !== JSON.stringify(live.rules)) {
      mismatches.push({ type: 'api_rules', collection: collection.name });
    }
    if (JSON.stringify(collection.indexes) !== JSON.stringify(live.indexes)) {
      mismatches.push({ type: 'indexes', collection: collection.name });
    }
    if (JSON.stringify(collection.authSettings) !== JSON.stringify(live.authSettings)) {
      mismatches.push({
        type: 'auth_settings',
        collection: collection.name,
        snapshot: collection.authSettings,
        imported: live.authSettings,
      });
    }
  }

  return { matches: mismatches.length === 0, mismatches };
}

export function diffSchemas(beforeCollections, afterCollections) {
  const before = new Map(normalizeSchema(beforeCollections).map((value) => [value.name, value]));
  const after = new Map(normalizeSchema(afterCollections).map((value) => [value.name, value]));
  const addedCollections = [...after.keys()].filter((name) => !before.has(name)).sort();
  const removedCollections = [...before.keys()].filter((name) => !after.has(name)).sort();
  const changedCollections = [];

  for (const [name, oldCollection] of before) {
    const nextCollection = after.get(name);
    if (!nextCollection) continue;
    const oldFields = new Set(oldCollection.fields.map((field) => field.name));
    const nextFields = new Set(nextCollection.fields.map((field) => field.name));
    const addedFields = [...nextFields].filter((field) => !oldFields.has(field)).sort();
    const removedFields = [...oldFields].filter((field) => !nextFields.has(field)).sort();
    const rulesChanged = JSON.stringify(oldCollection.rules) !== JSON.stringify(nextCollection.rules);
    const indexesAdded = nextCollection.indexes.filter((index) => !oldCollection.indexes.includes(index));
    if (addedFields.length || removedFields.length || rulesChanged || indexesAdded.length) {
      changedCollections.push({ name, addedFields, removedFields, rulesChanged, indexesAdded });
    }
  }

  return { addedCollections, removedCollections, changedCollections };
}
