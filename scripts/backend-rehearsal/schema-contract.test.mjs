import { describe, expect, it } from 'vitest';
import { compareSnapshotToImported, diffSchemas } from './schema-contract.mjs';

const base = [{
  id: 'articles-id', name: 'articles', type: 'base', listRule: '', fields: [
    { name: 'id', type: 'text', required: true },
    { name: 'title', type: 'text', required: true },
  ], indexes: [],
}];

describe('production schema rehearsal contract', () => {
  it('accepts an imported snapshot with the same material field and rule contract', () => {
    expect(compareSnapshotToImported(base, structuredClone(base))).toEqual({ matches: true, mismatches: [] });
  });

  it('reports additive and destructive schema changes separately', () => {
    const after = structuredClone(base);
    after[0].fields.push({ name: 'views', type: 'number' });
    after.push({ id: 'events-id', name: 'recommendation_events', type: 'base', fields: [], indexes: [] });
    const diff = diffSchemas(base, after);
    expect(diff.addedCollections).toEqual(['recommendation_events']);
    expect(diff.removedCollections).toEqual([]);
    expect(diff.changedCollections[0].addedFields).toEqual(['views']);
    expect(diff.changedCollections[0].removedFields).toEqual([]);
  });

  it('accepts only the PocketBase empty OAuth provider normalization', () => {
    const snapshot = [{ ...base[0], oauth2: { enabled: true, mappedFields: {} } }];
    const imported = [{ ...base[0], oauth2: { enabled: true, mappedFields: {}, providers: [] } }];
    expect(compareSnapshotToImported(snapshot, imported).matches).toBe(true);
    imported[0].oauth2.providers.push({ name: 'unexpected' });
    expect(compareSnapshotToImported(snapshot, imported).matches).toBe(false);
  });
});
