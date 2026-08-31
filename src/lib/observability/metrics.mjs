export const OBSERVABILITY_WINDOW_KEYS = ['24h', '7d', '30d'];
export const OBSERVABILITY_SURFACES = ['all', 'home', 'for_you'];
export const OBSERVABILITY_TABS = ['overview', 'recommendations', 'quality', 'system'];

const FUNNEL_STAGES = ['served', 'impression', 'open', 'engaged'];
const RECOMMENDATION_SURFACES = new Set(['home', 'for_you']);
const SAFE_ALGORITHM = /^[a-z0-9][a-z0-9:._-]{0,95}$/i;
const SAFE_NAME = /^[a-z0-9][a-z0-9:._/-]{0,159}$/i;
const SAFE_ROUTE = /^\/?[a-z0-9][a-z0-9:._/-]{0,159}$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const OBSERVABILITY_METRIC_DEFINITIONS = [
  {
    id: 'errorRate',
    label: 'نرخ خطای سرور',
    definition: 'سهم پاسخ‌های 5xx از تمام پاسخ‌های ثبت‌شده در log ساختاریافته.',
    denominator: 'تمام http_request_completed در بازه',
    unit: 'percent',
  },
  {
    id: 'responses429',
    label: 'پاسخ‌های محدودشده',
    definition: 'تعداد پاسخ‌های HTTP با وضعیت 429.',
    denominator: 'تعداد درخواست‌های ثبت‌شده در بازه',
    unit: 'count',
  },
  {
    id: 'responses5xx',
    label: 'پاسخ‌های 5xx',
    definition: 'تعداد پاسخ‌های HTTP با وضعیت 500 تا 599.',
    denominator: 'تعداد درخواست‌های ثبت‌شده در بازه',
    unit: 'count',
  },
  {
    id: 'p95Latency',
    label: 'تاخیر p95',
    definition: 'صدک ۹۵ زمان پاسخ routeها با روش nearest-rank.',
    denominator: 'نمونه‌های معتبر durationMs',
    unit: 'milliseconds',
  },
  {
    id: 'engagedReadRate',
    label: 'نرخ مطالعه معتبر',
    definition: 'engagedهای دارای attribution کامل تقسیم بر openهای دارای attribution کامل.',
    denominator: 'openهای توصیه‌ای معتبر',
    unit: 'percent',
  },
  {
    id: 'emptyFeedRate',
    label: 'نرخ feed خالی',
    definition: 'feedهای خالی یکتا تقسیم بر پاسخ‌های route پیشنهادها.',
    denominator: 'پاسخ‌های /api/recommended',
    unit: 'percent',
  },
  {
    id: 'dataCoverage',
    label: 'پوشش attribution',
    definition: 'eventهای قیف با attribution کامل تقسیم بر تمام eventهای قیف یکتا.',
    denominator: 'served، impression، open و engaged یکتا',
    unit: 'percent',
  },
  {
    id: 'funnel',
    label: 'قیف پیشنهاد',
    definition: 'eventهای یکتای attributed در مراحل served، impression، open و engaged.',
    denominator: 'مرحله‌ی قبلی برای conversion و served برای نرخ کلی',
    unit: 'count-and-percent',
  },
];

function emptyStages() {
  return { served: 0, impression: 0, open: 0, engaged: 0 };
}

function ratio(numerator, denominator) {
  return denominator > 0 ? Number((numerator / denominator).toFixed(4)) : null;
}

function conversion(stages) {
  return {
    servedToImpression: ratio(stages.impression, stages.served),
    impressionToOpen: ratio(stages.open, stages.impression),
    openToEngaged: ratio(stages.engaged, stages.open),
    servedToEngaged: ratio(stages.engaged, stages.served),
  };
}

function percentile(values, percentileValue) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * percentileValue) - 1)];
}

function average(values) {
  if (values.length === 0) return null;
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2));
}

function validDate(value) {
  if (typeof value !== 'string' || value.length < 10) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function eventTimestamp(event) {
  return validDate(event.receivedAt) ?? validDate(event.occurredAt) ?? validDate(event.created);
}

function logTimestamp(log) {
  return validDate(log.timestamp);
}

function hasCompleteRecommendationAttribution(event) {
  return (
    typeof event.feedId === 'string' && event.feedId.length > 0 &&
    Number.isInteger(Number(event.rank)) && Number(event.rank) > 0 &&
    typeof event.algorithmVersion === 'string' && SAFE_ALGORITHM.test(event.algorithmVersion) &&
    RECOMMENDATION_SURFACES.has(event.surface)
  );
}

function hasAnyAttribution(event) {
  return Boolean(event.feedId || event.algorithmVersion || Number(event.rank) > 0);
}

function uniqueOperationalCount(logs, eventName) {
  const keys = new Set();
  for (const [index, log] of logs.entries()) {
    if (log.eventName !== eventName) continue;
    keys.add(typeof log.requestId === 'string' ? `${eventName}:${log.requestId}` : `${eventName}:${index}`);
  }
  return keys.size;
}

function safeIssue(log) {
  const requestId = typeof log.requestId === 'string' && (UUID.test(log.requestId) || log.requestId === 'pocketbase-startup')
    ? log.requestId
    : null;
  const eventName = typeof log.eventName === 'string' && SAFE_NAME.test(log.eventName)
    ? log.eventName
    : 'invalid_event_name';
  const route = typeof log.route === 'string' && SAFE_ROUTE.test(log.route)
    ? log.route
    : 'unknown_route';
  const errorCode = typeof log.errorCode === 'string' && SAFE_NAME.test(log.errorCode)
    ? log.errorCode
    : null;
  return {
    timestamp: typeof log.timestamp === 'string' ? log.timestamp : null,
    eventName,
    route,
    statusCode: Number.isInteger(Number(log.statusCode)) ? Number(log.statusCode) : 500,
    errorCode,
    requestId,
  };
}

export function resolveObservabilityWindow(windowKey, nowInput = new Date()) {
  const key = OBSERVABILITY_WINDOW_KEYS.includes(windowKey) ? windowKey : '24h';
  const now = nowInput instanceof Date ? nowInput : new Date(nowInput);
  const durationMs = key === '24h' ? 24 * 60 * 60 * 1000 : key === '7d'
    ? 7 * 24 * 60 * 60 * 1000
    : 30 * 24 * 60 * 60 * 1000;
  return {
    key,
    start: new Date(now.getTime() - durationMs).toISOString(),
    end: now.toISOString(),
    timeZone: 'UTC',
    durationHours: durationMs / (60 * 60 * 1000),
  };
}

export function parseObservabilityFilters(input = {}, nowInput = new Date()) {
  const windowKey = typeof input.window === 'string' ? input.window : '24h';
  const surface = typeof input.surface === 'string' ? input.surface : 'all';
  const algorithmVersion = typeof input.algorithmVersion === 'string'
    ? input.algorithmVersion
    : 'all';
  if (!OBSERVABILITY_WINDOW_KEYS.includes(windowKey)) {
    return { ok: false, errorCode: 'invalid_window' };
  }
  if (!OBSERVABILITY_SURFACES.includes(surface)) {
    return { ok: false, errorCode: 'invalid_surface' };
  }
  if (algorithmVersion !== 'all' && !SAFE_ALGORITHM.test(algorithmVersion)) {
    return { ok: false, errorCode: 'invalid_algorithm_version' };
  }
  return {
    ok: true,
    filters: {
      window: resolveObservabilityWindow(windowKey, nowInput),
      surface,
      algorithmVersion,
    },
  };
}

function bucketKey(timestamp, windowKey) {
  const iso = new Date(timestamp).toISOString();
  return windowKey === '24h' ? `${iso.slice(0, 13)}:00:00.000Z` : `${iso.slice(0, 10)}T00:00:00.000Z`;
}

function createTrendBuckets(window) {
  const intervalMs = window.key === '24h' ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  const start = new Date(bucketKey(Date.parse(window.start), window.key)).getTime();
  const end = Date.parse(window.end);
  const buckets = [];
  for (let cursor = start; cursor <= end && buckets.length <= 32; cursor += intervalMs) {
    buckets.push({ timestamp: new Date(cursor).toISOString(), stages: emptyStages() });
  }
  return buckets;
}

function stagePrerequisite(eventType) {
  if (eventType === 'impression' || eventType === 'open') return ['served'];
  if (eventType === 'engaged') return ['served', 'open'];
  return [];
}

function eventTuple(event) {
  return [
    event.userId,
    event.articleId,
    event.feedId,
    event.rank,
    event.surface,
    event.algorithmVersion,
  ].join('\u0000');
}

function latestIso(values) {
  const timestamps = values.map(validDate).filter((value) => value !== null);
  return timestamps.length > 0 ? new Date(Math.max(...timestamps)).toISOString() : null;
}

export function aggregateObservability(rawEvents, rawLogs = [], options = {}) {
  const parsed = parseObservabilityFilters({
    window: options.window ?? '24h',
    surface: options.surface ?? 'all',
    algorithmVersion: options.algorithmVersion ?? 'all',
  }, options.now ?? new Date());
  if (!parsed.ok) throw new Error(parsed.errorCode);
  const filters = parsed.filters;
  const startMs = Date.parse(filters.window.start);
  const endMs = Date.parse(filters.window.end);

  const allEventsInWindow = [];
  let malformedEvents = 0;
  for (const event of rawEvents) {
    if (!event || typeof event !== 'object' || Array.isArray(event)) {
      malformedEvents += 1;
      continue;
    }
    const timestamp = eventTimestamp(event);
    if (timestamp === null) {
      malformedEvents += 1;
      continue;
    }
    if (timestamp >= startMs && timestamp <= endMs) allEventsInWindow.push(event);
  }

  const availableAlgorithms = [...new Set(allEventsInWindow
    .filter(hasCompleteRecommendationAttribution)
    .map((event) => event.algorithmVersion))].sort();
  const availableSurfaces = [...new Set(allEventsInWindow
    .filter(hasCompleteRecommendationAttribution)
    .map((event) => event.surface))].sort();

  const filteredEvents = allEventsInWindow.filter((event) => {
    if (filters.surface !== 'all' && event.surface !== filters.surface) return false;
    if (filters.algorithmVersion !== 'all' && event.algorithmVersion !== filters.algorithmVersion) return false;
    return true;
  });

  const duplicateKeys = new Set();
  const seen = new Set();
  const events = [];
  let duplicateEvents = 0;
  for (const event of filteredEvents) {
    const key = event.userId && event.idempotencyKey
      ? `${event.userId}:${event.idempotencyKey}`
      : event.eventId
        ? `event:${event.eventId}`
        : null;
    if (!key) malformedEvents += 1;
    if (key && seen.has(key)) {
      duplicateEvents += 1;
      duplicateKeys.add(key);
      continue;
    }
    if (key) seen.add(key);
    events.push(event);
  }

  const stages = emptyStages();
  const eventTotals = emptyStages();
  const segments = new Map();
  const stageEvidence = new Map();
  const recommendationEvents = [];
  let incompleteEvents = 0;
  let unattributedEvents = 0;
  let directEvents = 0;
  let invalidAttributionEvents = 0;

  for (const event of events) {
    if (!FUNNEL_STAGES.includes(event.eventType)) continue;
    eventTotals[event.eventType] += 1;
    const completeAttribution = hasCompleteRecommendationAttribution(event);
    const recommendationSurface = RECOMMENDATION_SURFACES.has(event.surface);
    const anyAttribution = hasAnyAttribution(event);
    if (!anyAttribution) unattributedEvents += 1;
    if (event.surface === 'direct' && !anyAttribution) directEvents += 1;
    if ((recommendationSurface && !completeAttribution) || (!recommendationSurface && anyAttribution)) {
      incompleteEvents += 1;
      invalidAttributionEvents += 1;
    }
    if (!completeAttribution) continue;

    stages[event.eventType] += 1;
    recommendationEvents.push(event);
    const tuple = eventTuple(event);
    if (!stageEvidence.has(tuple)) stageEvidence.set(tuple, new Set());
    stageEvidence.get(tuple).add(event.eventType);

    const segmentKey = `${event.surface}\u0000${event.algorithmVersion}`;
    if (!segments.has(segmentKey)) {
      segments.set(segmentKey, {
        surface: event.surface,
        algorithmVersion: event.algorithmVersion,
        stages: emptyStages(),
      });
    }
    segments.get(segmentKey).stages[event.eventType] += 1;
  }

  let inconsistentEvents = 0;
  for (const event of recommendationEvents) {
    const evidence = stageEvidence.get(eventTuple(event));
    if (stagePrerequisite(event.eventType).some((stage) => !evidence?.has(stage))) {
      inconsistentEvents += 1;
    }
  }

  const trend = createTrendBuckets(filters.window);
  const trendByKey = new Map(trend.map((bucket) => [bucket.timestamp, bucket]));
  for (const event of recommendationEvents) {
    const timestamp = eventTimestamp(event);
    if (timestamp === null) continue;
    const bucket = trendByKey.get(bucketKey(timestamp, filters.window.key));
    if (bucket) bucket.stages[event.eventType] += 1;
  }

  const logs = [];
  let malformedLogs = 0;
  for (const log of rawLogs) {
    if (!log || typeof log !== 'object' || Array.isArray(log) || typeof log.eventName !== 'string') {
      malformedLogs += 1;
      continue;
    }
    const timestamp = logTimestamp(log);
    if (timestamp === null) {
      malformedLogs += 1;
      continue;
    }
    if (timestamp >= startMs && timestamp <= endMs) logs.push(log);
  }

  const completions = logs.filter((log) => log.eventName === 'http_request_completed');
  const latencies = completions
    .map((log) => Number(log.durationMs))
    .filter((value) => Number.isFinite(value) && value >= 0);
  const responses429 = completions.filter((log) => Number(log.statusCode) === 429).length;
  const responses5xx = completions.filter((log) => Number(log.statusCode) >= 500).length;
  const recommendedResponses = completions.filter((log) => (
    log.route === '/api/recommended' &&
    Number(log.statusCode) >= 200 &&
    Number(log.statusCode) < 300
  )).length;
  const emptyFeeds = uniqueOperationalCount(logs, 'recommended_feed_empty');
  const rateLimitDecisionLogs = logs.filter((log) => log.eventName === 'shared_rate_limit_decision');
  const rateLimitChecks = logs.filter((log) => log.eventName === 'shared_rate_limit_check_completed');
  const rateLimitLatency = rateLimitChecks
    .map((log) => Number(log.durationMs))
    .filter((value) => Number.isFinite(value) && value >= 0);
  const rateLimitByPolicyMap = new Map();
  for (const log of rateLimitDecisionLogs) {
    const policy = typeof log.rateLimitPolicy === 'string' ? log.rateLimitPolicy : 'unknown_policy';
    const layer = typeof log.rateLimitLayer === 'string' ? log.rateLimitLayer : 'unknown_layer';
    const key = `${policy}:${layer}`;
    if (!rateLimitByPolicyMap.has(key)) rateLimitByPolicyMap.set(key, { policy, layer, allowed: 0, denied: 0 });
    const row = rateLimitByPolicyMap.get(key);
    if (log.rateLimitOutcome === 'allowed') row.allowed += 1;
    else if (log.rateLimitOutcome === 'denied') row.denied += 1;
  }
  const limiterState = options.sharedRateLimitState ?? {};

  const routeMap = new Map();
  for (const log of completions) {
    const route = typeof log.route === 'string' && SAFE_ROUTE.test(log.route) ? log.route : 'unknown_route';
    if (!routeMap.has(route)) routeMap.set(route, { route, responses: 0, errors5xx: 0, latencies: [] });
    const routeEntry = routeMap.get(route);
    routeEntry.responses += 1;
    if (Number(log.statusCode) >= 500) routeEntry.errors5xx += 1;
    const duration = Number(log.durationMs);
    if (Number.isFinite(duration) && duration >= 0) routeEntry.latencies.push(duration);
  }
  const routeStats = [...routeMap.values()]
    .map((route) => ({
      route: route.route,
      responses: route.responses,
      errors5xx: route.errors5xx,
      errorRate: ratio(route.errors5xx, route.responses),
      averageLatencyMs: average(route.latencies),
      p95LatencyMs: percentile(route.latencies, 0.95),
    }))
    .sort((left, right) => right.errors5xx - left.errors5xx || right.responses - left.responses)
    .slice(0, 20);

  const recentIssues = logs
    .filter((log) => Number(log.statusCode) >= 400 || log.level === 'warn' || log.level === 'error')
    .sort((left, right) => (logTimestamp(right) ?? 0) - (logTimestamp(left) ?? 0))
    .slice(0, 20)
    .map(safeIssue);

  const attributedTotal = Object.values(stages).reduce((sum, value) => sum + value, 0);
  const funnelTotal = Object.values(eventTotals).reduce((sum, value) => sum + value, 0);
  const lastEventAt = latestIso(allEventsInWindow.map((event) => (
    event.receivedAt ?? event.occurredAt ?? event.created
  )));
  const lastLogAt = latestIso(logs.map((log) => log.timestamp));

  return {
    schemaVersion: 'observability-dashboard-v1',
    generatedAt: (options.now instanceof Date ? options.now : new Date(options.now ?? Date.now())).toISOString(),
    datasetKind: options.datasetKind ?? 'unverified',
    window: filters.window,
    filters: {
      surface: filters.surface,
      algorithmVersion: filters.algorithmVersion,
      operationalScope: 'window-only',
    },
    definitions: OBSERVABILITY_METRIC_DEFINITIONS,
    availableFilters: {
      surfaces: availableSurfaces,
      algorithmVersions: availableAlgorithms,
    },
    freshness: {
      lastEventAt,
      lastLogAt,
      lastObservedAt: latestIso([lastEventAt, lastLogAt].filter(Boolean)),
    },
    overview: {
      health: options.health ?? 'unknown',
      totalResponses: completions.length,
      responses429,
      responses5xx,
      errorRate: ratio(responses5xx, completions.length),
      p95LatencyMs: percentile(latencies, 0.95),
      averageLatencyMs: average(latencies),
      latencySamples: latencies.length,
      engagedReadRate: ratio(stages.engaged, stages.open),
      emptyFeedRate: ratio(emptyFeeds, recommendedResponses),
      emptyFeeds,
      recommendedResponses,
    },
    funnel: {
      stages,
      conversion: conversion(stages),
    },
    trend,
    breakdowns: [...segments.values()]
      .map((segment) => ({ ...segment, conversion: conversion(segment.stages) }))
      .sort((left, right) => (
        `${left.surface}:${left.algorithmVersion}`.localeCompare(`${right.surface}:${right.algorithmVersion}`)
      )),
    quality: {
      duplicateEvents,
      duplicateGroups: duplicateKeys.size,
      incompleteEvents,
      directEvents,
      unattributedEvents,
      invalidAttributionEvents,
      rejectedInvalidAttributions: uniqueOperationalCount(logs, 'invalid_attribution'),
      inconsistentEvents,
      malformedEvents,
      malformedLogs,
      coverageRate: ratio(attributedTotal, funnelTotal),
      attributedEvents: attributedTotal,
      funnelEvents: funnelTotal,
      eventTotals,
      servedPartialFailures: uniqueOperationalCount(logs, 'served_partial_failure'),
      recentIssues,
    },
    system: {
      pocketBaseFailures: uniqueOperationalCount(logs, 'pocketbase_failure'),
      atomicViewFailures: uniqueOperationalCount(logs, 'atomic_view_failure'),
      eventValidationFailures: uniqueOperationalCount(logs, 'event_validation_failed'),
      consentRejections: uniqueOperationalCount(logs, 'consent_rejection'),
      sharedRateLimit: {
        allowed: rateLimitDecisionLogs.filter((log) => log.rateLimitOutcome === 'allowed').length,
        denied: rateLimitDecisionLogs.filter((log) => log.rateLimitOutcome === 'denied').length,
        byPolicy: [...rateLimitByPolicyMap.values()].sort((a, b) => a.policy.localeCompare(b.policy)),
        backendErrors: uniqueOperationalCount(logs, 'shared_rate_limit_backend_error'),
        failClosed: uniqueOperationalCount(logs, 'shared_rate_limit_fail_closed'),
        sqliteBusy: uniqueOperationalCount(logs, 'shared_rate_limit_sqlite_busy'),
        retryDeduplicated: uniqueOperationalCount(logs, 'shared_rate_limit_retry_deduplicated'),
        privilegedWithoutSharedLimiter: uniqueOperationalCount(logs, 'privileged_operation_without_shared_limiter'),
        averageHookLatencyMs: average(rateLimitLatency),
        p95HookLatencyMs: percentile(rateLimitLatency, 0.95),
        hookLatencySamples: rateLimitLatency.length,
        activeBuckets: Number.isFinite(limiterState.activeBuckets) ? limiterState.activeBuckets : null,
        cleanupBacklog: Number.isFinite(limiterState.cleanupBacklog) ? limiterState.cleanupBacklog : null,
        cleanupDeleted: Number.isFinite(limiterState.cleanupDeleted) ? limiterState.cleanupDeleted : null,
        oldestExpiredAgeMs: Number.isFinite(limiterState.oldestExpiredAgeMs) ? limiterState.oldestExpiredAgeMs : null,
      },
      routeStats,
      recentIncidents: recentIssues,
    },
    source: {
      eventRowsRead: rawEvents.length,
      logRowsRead: rawLogs.length,
      eventsTruncated: options.eventsTruncated === true,
      logsTruncated: options.logsTruncated === true,
      logsAvailable: options.logsAvailable !== false,
      eventLimit: options.eventLimit ?? null,
      logByteLimit: options.logByteLimit ?? null,
    },
  };
}

// Compatibility alias used by the v1 CLI tests and any local scripts.
export const aggregateDataQuality = aggregateObservability;
