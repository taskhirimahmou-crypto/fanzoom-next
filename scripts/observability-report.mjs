import { open } from 'node:fs/promises';
import PocketBase from 'pocketbase';
import {
  aggregateObservability,
  parseObservabilityFilters,
} from '../src/lib/observability/metrics.mjs';

const EVENT_LIMIT = 10_000;
const EVENT_PAGE_SIZE = 200;
const LOG_BYTE_LIMIT = 5 * 1024 * 1024;

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

function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

async function readStructuredLogs(path) {
  if (!path) return { rows: [], truncated: false };
  let truncated = false;
  const content = path === '-'
    ? await new Promise((resolve, reject) => {
        let value = '';
        process.stdin.setEncoding('utf8');
        process.stdin.on('data', (chunk) => {
          value += chunk;
          if (Buffer.byteLength(value, 'utf8') > LOG_BYTE_LIMIT) {
            truncated = true;
            value = value.slice(-LOG_BYTE_LIMIT);
          }
        });
        process.stdin.on('end', () => resolve(value));
        process.stdin.on('error', reject);
      })
    : await (async () => {
        const handle = await open(path, 'r');
        try {
          const stats = await handle.stat();
          const byteLength = Math.min(stats.size, LOG_BYTE_LIMIT);
          const start = Math.max(0, stats.size - byteLength);
          const buffer = Buffer.alloc(byteLength);
          await handle.read(buffer, 0, byteLength, start);
          truncated = start > 0;
          const value = buffer.toString('utf8');
          if (start === 0) return value;
          const firstLineEnd = value.indexOf('\n');
          return firstLineEnd >= 0 ? value.slice(firstLineEnd + 1) : '';
        } finally {
          await handle.close();
        }
      })();
  const rows = content.split(/\r?\n/).flatMap((line) => {
    const jsonStart = line.indexOf('{');
    if (jsonStart < 0) return [];
    try {
      const value = JSON.parse(line.slice(jsonStart));
      return value && typeof value === 'object' ? [value] : [];
    } catch {
      return [];
    }
  });
  return { rows, truncated };
}

async function readEvents(pb, start, end) {
  const rows = [];
  let page = 1;
  let totalItems = 0;
  do {
    const pageSize = Math.min(EVENT_PAGE_SIZE, EVENT_LIMIT - rows.length);
    if (pageSize <= 0) break;
    const result = await pb.collection('recommendation_events').getList(page, pageSize, {
      filter: pb.filter('receivedAt >= {:start} && receivedAt <= {:end}', { start, end }),
      sort: '+receivedAt',
      fields: [
        'eventId', 'idempotencyKey', 'userId', 'articleId', 'eventType', 'surface',
        'feedId', 'rank', 'algorithmVersion', 'occurredAt', 'receivedAt',
      ].join(','),
      requestKey: null,
    });
    totalItems = result.totalItems;
    rows.push(...result.items);
    if (page >= result.totalPages) break;
    page += 1;
  } while (rows.length < EVENT_LIMIT);
  return { rows, truncated: totalItems > rows.length };
}

async function main() {
  const email = process.env.POCKETBASE_ADMIN_EMAIL || process.env.PB_SUPERUSER_EMAIL;
  const password = process.env.POCKETBASE_ADMIN_PASSWORD || process.env.PB_SUPERUSER_PASSWORD;
  if (!email || !password) throw new Error('local PocketBase credentials are missing');

  const pb = new PocketBase(localPocketBaseUrl());
  pb.autoCancellation(false);
  await pb.collection('_superusers').authWithPassword(email, password);
  const now = new Date();
  const parsed = parseObservabilityFilters({
    window: argument('--window', '24h'),
    surface: argument('--surface', 'all'),
    algorithmVersion: argument('--algorithm-version', 'all'),
  }, now);
  if (!parsed.ok) throw new Error(parsed.errorCode);
  const events = await readEvents(pb, parsed.filters.window.start, parsed.filters.window.end);
  const logs = await readStructuredLogs(logFileArgument());
  const dashboard = aggregateObservability(events.rows, logs.rows, {
    window: parsed.filters.window.key,
    surface: parsed.filters.surface,
    algorithmVersion: parsed.filters.algorithmVersion,
    now,
    health: 'unknown',
    datasetKind: 'test',
    eventsTruncated: events.truncated,
    logsTruncated: logs.truncated,
    logsAvailable: Boolean(logFileArgument()),
    eventLimit: EVENT_LIMIT,
    logByteLimit: LOG_BYTE_LIMIT,
  });
  if (
    parsed.filters.algorithmVersion !== 'all' &&
    !dashboard.availableFilters.algorithmVersions.includes(parsed.filters.algorithmVersion)
  ) throw new Error('unknown_algorithm_version');
  console.log(JSON.stringify(dashboard, null, 2));
}

main().catch(() => {
  console.error('Local observability report failed. Check local-only URL, Docker health, and local credentials.');
  process.exitCode = 1;
});
