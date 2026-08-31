import { open } from 'node:fs/promises';
import { isAbsolute, normalize } from 'node:path';
import type PocketBase from 'pocketbase';
import type { SharedRateLimitPermit } from '../shared-rate-limit/types';
import { readSharedRateLimitMetrics } from '../shared-rate-limit/core';
import { getAdminPocketBase } from '../pocketbase-admin';
import { getPocketBaseServerUrl } from '../pocketbase-url';
import { checkFanzoomHealth } from './health';
import { aggregateObservability } from './metrics.mjs';
import type {
  ObservabilityDashboardData,
  ObservabilityFilters,
} from './dashboard-types';

export const OBSERVABILITY_EVENT_LIMIT = 10_000;
export const OBSERVABILITY_EVENT_PAGE_SIZE = 200;
export const OBSERVABILITY_LOG_BYTE_LIMIT = 5 * 1024 * 1024;
export const OBSERVABILITY_LOG_ROW_LIMIT = 20_000;
const LOCAL_LOG_ROOT = '/app/.local-observability/';
const LOCAL_POCKETBASE_HOSTS = new Set(['pocketbase', 'localhost', '127.0.0.1']);

type EventReadResult = { rows: Record<string, unknown>[]; truncated: boolean };
type LogReadResult = {
  rows: Record<string, unknown>[];
  available: boolean;
  truncated: boolean;
};

export class ObservabilityFilterError extends Error {
  constructor(readonly errorCode: string) {
    super(errorCode);
    this.name = 'ObservabilityFilterError';
  }
}

export function assertLocalObservabilityRuntime(): void {
  const pocketBaseUrl = new URL(getPocketBaseServerUrl());
  if (
    process.env.FANZOOM_LOCAL_DOCKER !== 'true' ||
    pocketBaseUrl.protocol !== 'http:' ||
    !LOCAL_POCKETBASE_HOSTS.has(pocketBaseUrl.hostname)
  ) {
    throw new Error('observability_dashboard_requires_local_docker');
  }
}

export async function readBoundedRecommendationEvents(
  pb: PocketBase,
  start: string,
  end: string,
  limit = OBSERVABILITY_EVENT_LIMIT,
): Promise<EventReadResult> {
  const rows: Record<string, unknown>[] = [];
  let page = 1;
  let totalItems = 0;
  do {
    const pageSize = Math.min(OBSERVABILITY_EVENT_PAGE_SIZE, limit - rows.length);
    if (pageSize <= 0) break;
    const result = await pb.collection('recommendation_events').getList(page, pageSize, {
      filter: pb.filter('receivedAt >= {:start} && receivedAt <= {:end}', { start, end }),
      sort: '+receivedAt',
      fields: [
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
      ].join(','),
      requestKey: null,
    });
    totalItems = result.totalItems;
    rows.push(...result.items);
    if (page >= result.totalPages) break;
    page += 1;
  } while (rows.length < limit);

  return { rows, truncated: totalItems > rows.length };
}

export function parseStructuredLogLines(content: string): Record<string, unknown>[] {
  return content.split(/\r?\n/).flatMap((line) => {
    const jsonStart = line.indexOf('{');
    if (jsonStart < 0) return [];
    try {
      const parsed = JSON.parse(line.slice(jsonStart));
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? [parsed] : [];
    } catch {
      return [];
    }
  });
}

function allowedLocalLogPath(path: string | undefined): path is string {
  if (
    process.env.FANZOOM_LOCAL_DOCKER !== 'true' ||
    !path ||
    !isAbsolute(path)
  ) return false;
  return normalize(path).replaceAll('\\', '/').startsWith(LOCAL_LOG_ROOT);
}

export async function readBoundedLocalStructuredLogs(
  path = process.env.OBSERVABILITY_LOG_FILE,
): Promise<LogReadResult> {
  if (!allowedLocalLogPath(path)) {
    return { rows: [], available: false, truncated: false };
  }

  let handle;
  try {
    handle = await open(path, 'r');
    const stats = await handle.stat();
    const byteLength = Math.min(stats.size, OBSERVABILITY_LOG_BYTE_LIMIT);
    const start = Math.max(0, stats.size - byteLength);
    const buffer = Buffer.alloc(byteLength);
    await handle.read(buffer, 0, byteLength, start);
    let content = buffer.toString('utf8');
    if (start > 0) {
      const firstLineEnd = content.indexOf('\n');
      content = firstLineEnd >= 0 ? content.slice(firstLineEnd + 1) : '';
    }
    const parsed = parseStructuredLogLines(content);
    const rows = parsed.slice(-OBSERVABILITY_LOG_ROW_LIMIT);
    return {
      rows,
      available: true,
      truncated: stats.size > OBSERVABILITY_LOG_BYTE_LIMIT || parsed.length > rows.length,
    };
  } catch {
    return { rows: [], available: false, truncated: false };
  } finally {
    await handle?.close();
  }
}

export async function loadObservabilityDashboardData(
  filters: ObservabilityFilters,
  options: { requestId?: string; now?: Date; pb?: PocketBase; permit?: SharedRateLimitPermit } = {},
): Promise<ObservabilityDashboardData> {
  assertLocalObservabilityRuntime();
  const now = options.now ?? new Date();
  const pb = options.pb ?? await getAdminPocketBase(options.requestId, options.permit as SharedRateLimitPermit);
  const windowDuration = filters.window === '24h' ? 24 : filters.window === '7d' ? 168 : 720;
  const start = new Date(now.getTime() - windowDuration * 60 * 60 * 1000).toISOString();
  const end = now.toISOString();
  const [events, logs, health, sharedRateLimitState] = await Promise.all([
    readBoundedRecommendationEvents(pb, start, end),
    readBoundedLocalStructuredLogs(),
    checkFanzoomHealth(pb),
    readSharedRateLimitMetrics().catch(() => null),
  ]);

  const base = aggregateObservability(events.rows, logs.rows, {
    window: filters.window,
    surface: filters.surface,
    algorithmVersion: 'all',
    now,
    health: health.healthy ? 'healthy' : 'unhealthy',
    datasetKind: process.env.FANZOOM_LOCAL_DOCKER === 'true' ? 'test' : 'unverified',
    eventsTruncated: events.truncated,
    logsTruncated: logs.truncated,
    logsAvailable: logs.available,
    eventLimit: OBSERVABILITY_EVENT_LIMIT,
    logByteLimit: OBSERVABILITY_LOG_BYTE_LIMIT,
    sharedRateLimitState,
  }) as ObservabilityDashboardData;

  if (
    filters.algorithmVersion !== 'all' &&
    !base.availableFilters.algorithmVersions.includes(filters.algorithmVersion)
  ) {
    throw new ObservabilityFilterError('unknown_algorithm_version');
  }
  if (filters.algorithmVersion === 'all') return base;

  return aggregateObservability(events.rows, logs.rows, {
    window: filters.window,
    surface: filters.surface,
    algorithmVersion: filters.algorithmVersion,
    now,
    health: health.healthy ? 'healthy' : 'unhealthy',
    datasetKind: process.env.FANZOOM_LOCAL_DOCKER === 'true' ? 'test' : 'unverified',
    eventsTruncated: events.truncated,
    logsTruncated: logs.truncated,
    logsAvailable: logs.available,
    eventLimit: OBSERVABILITY_EVENT_LIMIT,
    logByteLimit: OBSERVABILITY_LOG_BYTE_LIMIT,
    sharedRateLimitState,
  }) as ObservabilityDashboardData;
}
