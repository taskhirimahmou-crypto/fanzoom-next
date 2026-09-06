import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { inspectPocketBaseData } from './inspect-pocketbase-data.mjs';
import { RELEASE_FILES, assessMigrationCompatibility, buildManifest, validateReleaseSource } from './pocketbase-release-lib.mjs';

describe('PocketBase manual release bundle', () => {
  it('validates only the exact allowlisted migration and hook sources', async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), 'fanzoom-release-source-'));
    await mkdir(path.join(workspace, 'pb_migrations'));
    await mkdir(path.join(workspace, 'pb_hooks'));
    for (const [group, names] of Object.entries(RELEASE_FILES)) {
      for (const name of names) {
        const content = name.endsWith('.json')
          ? '{}\n'
          : group === 'pb_migrations'
            ? 'migrate(() => {}, () => {});\n'
            : 'void 0;\n';
        await writeFile(path.join(workspace, group, name), content);
      }
    }
    const entries = await validateReleaseSource(workspace);
    expect(entries).toHaveLength(14);
    expect(buildManifest(entries, '2026-09-06T00:00:00.000Z')).toMatchObject({
      targetPocketBaseVersion: '0.30.0',
      containsSecretsOrData: false,
      counts: { migrations: 10, hooks: 4 },
    });
  });

  it('rejects migration filename collision and inconsistent applied history', () => {
    const releaseName = RELEASE_FILES.pb_migrations[0];
    const production = Array.from({ length: 19 }, (_, index) => `${String(202401010001 + index).padStart(12, '0')}_old_${index}.js`);
    production[18] = releaseName;
    const result = assessMigrationCompatibility({
      productionDiskNames: production,
      appliedNames: production.slice(0, -1),
    });
    expect(result.compatible).toBe(false);
    expect(result.collisions).toContain(releaseName);
    expect(result.issues.some((issue) => issue.includes('absent from applied history'))).toBe(true);
  });

  it('accepts 19 consistent older production migrations', () => {
    const production = Array.from({ length: 19 }, (_, index) => `202401${String(index + 1).padStart(6, '0')}_old_${index}.js`);
    expect(assessMigrationCompatibility({ productionDiskNames: production, appliedNames: production })).toMatchObject({
      compatible: true,
      counts: { release: 10, productionDisk: 19, applied: 19 },
    });
  });
});

describe('read-only PocketBase duplicate inspection', () => {
  it('reports aggregate duplicates and migration filenames without record values', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'fanzoom-pb-data-'));
    const databasePath = path.join(directory, 'data.db');
    const database = new DatabaseSync(databasePath);
    database.exec(`
      CREATE TABLE articles (id TEXT, slug TEXT);
      CREATE TABLE bookmarks (id TEXT, user TEXT, article TEXT);
      CREATE TABLE _migrations (file TEXT PRIMARY KEY, applied INTEGER);
      INSERT INTO articles VALUES ('a1', 'same'), ('a2', 'same'), ('a3', 'unique'), ('a4', '');
      INSERT INTO bookmarks VALUES ('b1', 'u1', 'a1'), ('b2', 'u1', 'a1'), ('b3', 'u2', 'a1'), ('b4', '', '');
      INSERT INTO _migrations VALUES ('202401010001_old.js', 1);
    `);
    database.close();

    const before = await readFile(databasePath);
    const result = inspectPocketBaseData(databasePath);
    const after = await readFile(databasePath);
    expect(after.equals(before)).toBe(true);
    expect(result).toMatchObject({
      readOnly: true,
      duplicates: {
        articlesSlug: { groups: 1, extraRows: 1 },
        bookmarksUserArticle: { groups: 1, extraRows: 1 },
      },
      missingKeys: { articlesSlug: 1, bookmarksUserOrArticle: 1 },
      appliedMigrations: ['202401010001_old.js'],
    });
    expect(JSON.stringify(result)).not.toContain('u1');
    expect(JSON.stringify(result)).not.toContain('same');
  });
});
