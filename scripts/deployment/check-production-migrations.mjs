import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { RELEASE_FILES, assessMigrationCompatibility, parseMigrationNameList } from './pocketbase-release-lib.mjs';

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

const diskPath = option('--disk-list');
const appliedPath = option('--applied-list');
if (!diskPath || !appliedPath) {
  throw new Error('Usage: node scripts/deployment/check-production-migrations.mjs --disk-list <filenames.txt> --applied-list <filenames.txt>');
}

const [diskText, appliedText] = await Promise.all([
  readFile(path.resolve(diskPath), 'utf8'),
  readFile(path.resolve(appliedPath), 'utf8'),
]);
const result = assessMigrationCompatibility({
  releaseNames: RELEASE_FILES.pb_migrations,
  productionDiskNames: parseMigrationNameList(diskText).names,
  appliedNames: parseMigrationNameList(appliedText).names,
});

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (!result.compatible) process.exitCode = 2;
