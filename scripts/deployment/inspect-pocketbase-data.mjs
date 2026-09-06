import { open } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

export function inspectPocketBaseData(databasePath) {
  const resolved = path.resolve(databasePath);
  if (/^https?:/i.test(databasePath)) throw new Error('Only a local SQLite file is accepted.');
  const database = new DatabaseSync(resolved, { readOnly: true });
  try {
    database.exec('PRAGMA query_only = ON');
    const tableNames = new Set(database.prepare("SELECT name FROM sqlite_schema WHERE type = 'table'").all().map((row) => row.name));
    for (const required of ['articles', 'bookmarks', '_migrations']) {
      if (!tableNames.has(required)) throw new Error(`Required table is missing: ${required}`);
    }

    const articleDuplicates = database.prepare(`
      SELECT COUNT(*) AS groups, COALESCE(SUM(count - 1), 0) AS extraRows
      FROM (
        SELECT COUNT(*) AS count FROM articles
        WHERE slug IS NOT NULL AND TRIM(slug) <> ''
        GROUP BY slug HAVING COUNT(*) > 1
      )
    `).get();
    const bookmarkDuplicates = database.prepare(`
      SELECT COUNT(*) AS groups, COALESCE(SUM(count - 1), 0) AS extraRows
      FROM (
        SELECT COUNT(*) AS count FROM bookmarks
        WHERE user IS NOT NULL AND TRIM(user) <> ''
          AND article IS NOT NULL AND TRIM(article) <> ''
        GROUP BY user, article HAVING COUNT(*) > 1
      )
    `).get();
    const missingKeys = {
      articlesSlug: database.prepare("SELECT COUNT(*) AS count FROM articles WHERE slug IS NULL OR TRIM(slug) = ''").get().count,
      bookmarksUserOrArticle: database.prepare("SELECT COUNT(*) AS count FROM bookmarks WHERE user IS NULL OR TRIM(user) = '' OR article IS NULL OR TRIM(article) = ''").get().count,
    };
    const migrationColumns = database.prepare("PRAGMA table_info('_migrations')").all().map((row) => row.name);
    const migrationNameColumn = ['file', 'name'].find((name) => migrationColumns.includes(name));
    if (!migrationNameColumn) throw new Error('Cannot identify the migration filename column.');
    const appliedMigrations = database.prepare(`SELECT "${migrationNameColumn}" AS name FROM _migrations ORDER BY "${migrationNameColumn}"`).all().map((row) => row.name);

    return {
      readOnly: true,
      databaseFilename: path.basename(resolved),
      duplicates: {
        articlesSlug: articleDuplicates,
        bookmarksUserArticle: bookmarkDuplicates,
      },
      missingKeys,
      appliedMigrations,
    };
  } finally {
    database.close();
  }
}

async function main() {
  const index = process.argv.indexOf('--db');
  const databasePath = index >= 0 ? process.argv[index + 1] : null;
  if (!databasePath) throw new Error('Usage: node scripts/deployment/inspect-pocketbase-data.mjs --db <local-restored-pb_data/data.db>');
  const handle = await open(path.resolve(databasePath), 'r');
  const header = Buffer.alloc(16);
  try {
    await handle.read(header, 0, header.length, 0);
  } finally {
    await handle.close();
  }
  if (header.toString('ascii') !== 'SQLite format 3\0') throw new Error('Input is not a SQLite database.');
  process.stdout.write(`${JSON.stringify(inspectPocketBaseData(databasePath), null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  await main();
}
