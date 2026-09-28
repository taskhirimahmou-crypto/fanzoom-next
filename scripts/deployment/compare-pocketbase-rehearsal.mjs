import Database from 'better-sqlite3';

const [beforePath, afterPath, mode = 'upgrade'] = process.argv.slice(2);
if (!beforePath || !afterPath) {
  throw new Error('Usage: node compare-pocketbase-rehearsal.mjs <before.db> <after.db> [upgrade|repeat|rollback]');
}
if (!['upgrade', 'repeat', 'rollback'].includes(mode)) throw new Error('Unknown comparison mode');

function inspect(filename) {
  const db = new Database(filename, { readonly: true, fileMustExist: true });
  try {
    db.pragma('query_only = ON');
    const integrity = db.pragma('quick_check', { simple: true });
    const collections = db.prepare('SELECT name, fields, listRule, viewRule, createRule, updateRule, deleteRule FROM _collections').all();
    const result = new Map();
    for (const collection of collections) {
      const quoted = `"${collection.name.replaceAll('"', '""')}"`;
      result.set(collection.name, {
        count: db.prepare(`SELECT count(*) AS count FROM ${quoted}`).get().count,
        columns: db.pragma(`table_info(${quoted})`).map((column) => ({ name: column.name, type: column.type })),
        indexes: db.pragma(`index_list(${quoted})`).map((index) => index.name),
        rules: [collection.listRule, collection.viewRule, collection.createRule, collection.updateRule, collection.deleteRule],
      });
    }
    const migrations = db.prepare('SELECT file FROM _migrations').all().map((row) => row.file);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row.name);
    return { integrity, collections: result, migrations, tables };
  } finally {
    db.close();
  }
}

const before = inspect(beforePath);
const after = inspect(afterPath);
const removedCollections = [...before.collections.keys()].filter((name) => !after.collections.has(name));
const removedColumns = [];
const addedColumns = [];
const changedColumnTypes = [];
const removedIndexes = [];
const addedIndexes = [];
const changedRules = [];
const reducedCounts = [];
for (const [name, previous] of before.collections) {
  const current = after.collections.get(name);
  if (!current) continue;
  for (const column of previous.columns) {
    const match = current.columns.find((candidate) => candidate.name === column.name);
    if (!match) removedColumns.push(`${name}.${column.name}`);
    else if (match.type !== column.type) changedColumnTypes.push(`${name}.${column.name}`);
  }
  for (const column of current.columns) {
    if (!previous.columns.some((candidate) => candidate.name === column.name)) addedColumns.push(`${name}.${column.name}`);
  }
  for (const index of previous.indexes) {
    if (!current.indexes.includes(index)) removedIndexes.push(`${name}.${index}`);
  }
  for (const index of current.indexes) {
    if (!previous.indexes.includes(index)) addedIndexes.push(`${name}.${index}`);
  }
  if (JSON.stringify(previous.rules) !== JSON.stringify(current.rules)) changedRules.push(name);
  if (current.count < previous.count) reducedCounts.push({ collection: name, before: previous.count, after: current.count });
}

const addedMigrations = after.migrations.filter((name) => !before.migrations.includes(name));
const expected = [
  '202608110001_bootstrap_core_schema.js',
  '202608110002_migrate_legacy_history.js',
  '202608110003_create_recommendation_events.js',
  '202608110004_add_personalization_consent.js',
  '202608260001_add_direct_recommendation_surface.js',
  '202608260002_harden_comment_moderation.js',
  '202608310001_create_app_admins.js',
  '202608310002_create_shared_rate_limiter.js',
  '202608310003_create_app_admin_audit.js',
  '202608310004_add_app_admin_timestamps.js',
];
const missingMigrations = expected.filter((name) => !addedMigrations.includes(name));
const lostMigrations = before.migrations.filter((name) => !after.migrations.includes(name));
const addedCollections = [...after.collections.keys()].filter((name) => !before.collections.has(name));
const addedTables = after.tables.filter((name) => !before.tables.includes(name));
const internalTables = ['fanzoom_rate_limit_buckets', 'fanzoom_rate_limit_decisions'];
const missingInternalTables = internalTables.filter((name) => !after.tables.includes(name));
const consentColumns = ['personalizationEnabled', 'personalizationConsentAt'];
const missingConsentColumns = consentColumns.filter((name) => !after.collections.get('users')?.columns.some((column) => column.name === name));
const commentRules = after.collections.get('comments')?.rules;
const commentsServerOnly = commentRules?.[2] === null && commentRules?.[3] === null;
const migrationMatch = mode === 'upgrade'
  ? missingMigrations.length === 0 && lostMigrations.length === 0
  : addedMigrations.length === 0 && lostMigrations.length === 0;
const structuralMatch = mode === 'upgrade'
  ? missingInternalTables.length === 0 && missingConsentColumns.length === 0 && commentsServerOnly
  : addedCollections.length === 0 && addedTables.length === 0 &&
    addedColumns.length === 0 && addedIndexes.length === 0 && changedRules.length === 0;
const countMatch = mode === 'upgrade'
  ? reducedCounts.length === 0
  : [...before.collections].every(([name, prior]) => after.collections.get(name)?.count === prior.count);

const report = {
  pass: before.integrity === 'ok' && after.integrity === 'ok' &&
    removedCollections.length === 0 && removedColumns.length === 0 &&
    changedColumnTypes.length === 0 && removedIndexes.length === 0 && countMatch &&
    migrationMatch && structuralMatch,
  mode,
  integrity: { before: before.integrity, after: after.integrity },
  migrationCounts: { before: before.migrations.length, after: after.migrations.length, added: addedMigrations.length },
  collectionCounts: Object.fromEntries([...before.collections].map(([name, prior]) => [name, { before: prior.count, after: after.collections.get(name)?.count ?? null }])),
  addedCollections,
  addedTables,
  removedCollections,
  removedColumns,
  addedColumns,
  changedColumnTypes,
  removedIndexes,
  addedIndexes,
  changedRules,
  reducedCounts,
  missingMigrations: mode === 'upgrade' ? missingMigrations : [],
  lostMigrations,
  missingInternalTables: mode === 'upgrade' ? missingInternalTables : [],
  missingConsentColumns: mode === 'upgrade' ? missingConsentColumns : [],
  commentsServerOnly: mode === 'upgrade' ? commentsServerOnly : null,
};
console.log(JSON.stringify(report, null, 2));
if (!report.pass) process.exitCode = 1;
