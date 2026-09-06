import { createHash } from 'node:crypto';
import { readFile, lstat, readdir } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';

export const TARGET_POCKETBASE_VERSION = '0.30.0';

export const RELEASE_FILES = Object.freeze({
  pb_migrations: Object.freeze([
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
  ]),
  pb_hooks: Object.freeze([
    'admin_access.pb.js',
    'atomic_views.pb.js',
    'rate_limit_policies.json',
    'shared_rate_limit.pb.js',
  ]),
});

const MIGRATION_PATTERN = /^(\d{12})_[a-z0-9_]+\.js$/;
const FORBIDDEN_CONTENT = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\b(?:password|token|authorization|cookie)\s*[:=]\s*["'][^"'$\n]{8,}["']/i,
];

export function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

export async function validateReleaseSource(workspaceRoot) {
  const migrationFiles = (await readdir(path.join(workspaceRoot, 'pb_migrations')))
    .filter((name) => name.endsWith('.js')).sort();
  const hookFiles = (await readdir(path.join(workspaceRoot, 'pb_hooks'))).sort();
  if (JSON.stringify(migrationFiles) !== JSON.stringify([...RELEASE_FILES.pb_migrations].sort())) {
    throw new Error('Migration allowlist does not exactly match the repository JavaScript migrations.');
  }
  if (JSON.stringify(hookFiles) !== JSON.stringify([...RELEASE_FILES.pb_hooks].sort())) {
    throw new Error('Hook allowlist does not exactly match the repository hook directory.');
  }
  const entries = [];
  for (const [group, names] of Object.entries(RELEASE_FILES)) {
    for (const name of names) {
      const sourcePath = path.join(workspaceRoot, group, name);
      const stat = await lstat(sourcePath);
      if (!stat.isFile() || stat.isSymbolicLink()) {
        throw new Error(`Release source must be a regular file: ${group}/${name}`);
      }
      const content = await readFile(sourcePath);
      const text = content.toString('utf8');
      if (FORBIDDEN_CONTENT.some((pattern) => pattern.test(text))) {
        throw new Error(`Possible embedded credential in ${group}/${name}`);
      }
      if (name.endsWith('.json')) {
        JSON.parse(text);
      } else {
        new vm.Script(text, { filename: `${group}/${name}` });
      }
      if (group === 'pb_migrations' && (text.match(/\bmigrate\s*\(/g) ?? []).length !== 1) {
        throw new Error(`Migration must contain exactly one migrate(...) call: ${name}`);
      }
      entries.push({
        group,
        name,
        relativePath: `${group}/${name}`,
        bytes: content.length,
        sha256: sha256(content),
        content,
      });
    }
  }
  return entries;
}

export function parseMigrationNameList(text) {
  const names = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
  const invalid = names.filter((name) => !MIGRATION_PATTERN.test(name));
  const duplicates = [...new Set(names.filter((name, index) => names.indexOf(name) !== index))].sort();
  return { names, invalid, duplicates };
}

export function assessMigrationCompatibility({
  releaseNames = RELEASE_FILES.pb_migrations,
  productionDiskNames,
  appliedNames,
  expectedProductionCount = 19,
}) {
  const issues = [];
  const release = parseMigrationNameList(releaseNames.join('\n'));
  const disk = parseMigrationNameList((productionDiskNames ?? []).join('\n'));
  const applied = parseMigrationNameList((appliedNames ?? []).join('\n'));

  if (disk.names.length !== expectedProductionCount) {
    issues.push(`Expected ${expectedProductionCount} production migration files, received ${disk.names.length}.`);
  }
  for (const [label, parsed] of [['release', release], ['production disk', disk], ['applied history', applied]]) {
    if (parsed.invalid.length) issues.push(`${label} has invalid names: ${parsed.invalid.join(', ')}`);
    if (parsed.duplicates.length) issues.push(`${label} has duplicate names: ${parsed.duplicates.join(', ')}`);
  }

  const diskSet = new Set(disk.names);
  const appliedSet = new Set(applied.names);
  const collisions = release.names.filter((name) => diskSet.has(name) || appliedSet.has(name));
  if (collisions.length) issues.push(`Release filename collision: ${collisions.join(', ')}`);

  const missingFromDisk = applied.names.filter((name) => !diskSet.has(name));
  const notRecordedAsApplied = disk.names.filter((name) => !appliedSet.has(name));
  if (missingFromDisk.length) issues.push(`Applied migrations missing from disk: ${missingFromDisk.join(', ')}`);
  if (notRecordedAsApplied.length) issues.push(`Disk migrations absent from applied history: ${notRecordedAsApplied.join(', ')}`);

  const existingPrefixes = [...disk.names, ...applied.names]
    .map((name) => MIGRATION_PATTERN.exec(name)?.[1])
    .filter(Boolean);
  const releasePrefixes = release.names.map((name) => MIGRATION_PATTERN.exec(name)?.[1]).filter(Boolean);
  const maxExisting = existingPrefixes.sort().at(-1) ?? null;
  const minRelease = releasePrefixes.sort().at(0) ?? null;
  if (maxExisting && minRelease && minRelease <= maxExisting) {
    issues.push(`Release timestamp ${minRelease} is not newer than production maximum ${maxExisting}.`);
  }

  return {
    compatible: issues.length === 0,
    issues,
    counts: { release: release.names.length, productionDisk: disk.names.length, applied: applied.names.length },
    collisions,
    maxExisting,
    minRelease,
  };
}

export function buildManifest(entries, generatedAt) {
  return {
    schemaVersion: 1,
    bundleType: 'fanzoom-pocketbase-manual-release',
    targetPocketBaseVersion: TARGET_POCKETBASE_VERSION,
    generatedAt,
    containsSecretsOrData: false,
    deployment: {
      mode: 'manual',
      port: 8090,
      migrationsMount: '/pb_migrations',
      hooksMount: '/pb_hooks',
    },
    gates: {
      productionBackupDownloadedAndVerified: false,
      productionMigrationNamesCompared: false,
      exactImageRestartCommandVerified: false,
    },
    counts: {
      migrations: entries.filter((entry) => entry.group === 'pb_migrations').length,
      hooks: entries.filter((entry) => entry.group === 'pb_hooks').length,
    },
    files: entries.map(({ relativePath, bytes, sha256: digest }) => ({
      path: relativePath,
      bytes,
      sha256: digest,
    })),
  };
}
