import { readFile } from 'node:fs/promises';
import PocketBase from 'pocketbase';
import { aggregateDataQuality } from './observability/aggregate.mjs';

function localPocketBaseUrl() {
  const value = process.env.POCKETBASE_INTERNAL_URL || process.env.NEXT_PUBLIC_POCKETBASE_URL;
  if (!value) throw new Error('local PocketBase URL is missing');
  const parsed = new URL(value);
  const allowedHosts = new Set(['127.0.0.1', 'localhost', 'pocketbase']);
  if (parsed.protocol !== 'http:' || !allowedHosts.has(parsed.hostname)) {
    throw new Error('observability report refuses non-local PocketBase URLs');
  }
  return parsed.toString().replace(/\/$/, '');
}

function logFileArgument() {
  const index = process.argv.indexOf('--log-file');
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function readStructuredLogs(path) {
  if (!path) return [];
  const content = path === '-'
    ? await new Promise((resolve, reject) => {
        let value = '';
        process.stdin.setEncoding('utf8');
        process.stdin.on('data', (chunk) => { value += chunk; });
        process.stdin.on('end', () => resolve(value));
        process.stdin.on('error', reject);
      })
    : await readFile(path, 'utf8');
  return content.split(/\r?\n/).flatMap((line) => {
    const jsonStart = line.indexOf('{');
    if (jsonStart < 0) return [];
    try {
      const value = JSON.parse(line.slice(jsonStart));
      return value && typeof value === 'object' ? [value] : [];
    } catch {
      return [];
    }
  });
}

async function main() {
  const email = process.env.POCKETBASE_ADMIN_EMAIL || process.env.PB_SUPERUSER_EMAIL;
  const password = process.env.POCKETBASE_ADMIN_PASSWORD || process.env.PB_SUPERUSER_PASSWORD;
  if (!email || !password) throw new Error('local PocketBase credentials are missing');

  const pb = new PocketBase(localPocketBaseUrl());
  pb.autoCancellation(false);
  await pb.collection('_superusers').authWithPassword(email, password);
  const events = await pb.collection('recommendation_events').getFullList({
    fields: [
      'eventId', 'idempotencyKey', 'userId', 'articleId', 'eventType', 'surface',
      'feedId', 'rank', 'algorithmVersion',
    ].join(','),
  });
  const logs = await readStructuredLogs(logFileArgument());
  console.log(JSON.stringify({
    generatedAt: new Date().toISOString(),
    source: 'local-pocketbase',
    ...aggregateDataQuality(events, logs),
  }, null, 2));
}

main().catch(() => {
  console.error('Local observability report failed. Check local-only URL, Docker health, and local credentials.');
  process.exitCode = 1;
});
