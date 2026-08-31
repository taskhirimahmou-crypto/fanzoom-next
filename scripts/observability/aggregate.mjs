const FUNNEL_STAGES = ['served', 'impression', 'open', 'engaged'];
const RECOMMENDATION_SURFACES = new Set(['home', 'for_you']);

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
  };
}

function hasCompleteRecommendationAttribution(event) {
  return (
    typeof event.feedId === 'string' && event.feedId.length > 0 &&
    Number.isInteger(Number(event.rank)) && Number(event.rank) > 0 &&
    typeof event.algorithmVersion === 'string' && event.algorithmVersion.length > 0 &&
    RECOMMENDATION_SURFACES.has(event.surface)
  );
}

function hasAnyAttribution(event) {
  return Boolean(event.feedId || event.algorithmVersion || Number(event.rank) > 0);
}

function percentile95(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)];
}

function validOperationalLog(log) {
  return log && typeof log === 'object' && typeof log.eventName === 'string';
}

export function aggregateDataQuality(rawEvents, rawLogs = []) {
  const duplicateKeys = new Set();
  const seen = new Set();
  const events = [];
  let duplicateEvents = 0;

  for (const event of rawEvents) {
    const key = event.userId && event.idempotencyKey
      ? `${event.userId}:${event.idempotencyKey}`
      : event.eventId
        ? `event:${event.eventId}`
        : null;
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
  let incompleteEvents = 0;
  let unattributedEvents = 0;
  let invalidAttributionEvents = 0;

  for (const event of events) {
    if (!FUNNEL_STAGES.includes(event.eventType)) continue;
    eventTotals[event.eventType] += 1;

    const completeAttribution = hasCompleteRecommendationAttribution(event);
    if (completeAttribution) stages[event.eventType] += 1;
    const recommendationSurface = RECOMMENDATION_SURFACES.has(event.surface);
    const anyAttribution = hasAnyAttribution(event);
    if (!anyAttribution) unattributedEvents += 1;
    if ((recommendationSurface && !completeAttribution) || (!recommendationSurface && anyAttribution)) {
      incompleteEvents += 1;
      invalidAttributionEvents += 1;
    }

    const segmentSurface = completeAttribution ? event.surface : event.surface || 'unknown';
    const algorithmVersion = completeAttribution ? event.algorithmVersion : 'unattributed';
    const segmentKey = `${segmentSurface}\u0000${algorithmVersion}`;
    if (!segments.has(segmentKey)) {
      segments.set(segmentKey, {
        surface: segmentSurface,
        algorithmVersion,
        stages: emptyStages(),
      });
    }
    segments.get(segmentKey).stages[event.eventType] += 1;
  }

  const logs = rawLogs.filter(validOperationalLog);
  const completions = logs.filter((log) => log.eventName === 'http_request_completed');
  const latencies = completions
    .map((log) => Number(log.durationMs))
    .filter((value) => Number.isFinite(value) && value >= 0);
  const averageLatencyMs = latencies.length > 0
    ? Number((latencies.reduce((sum, value) => sum + value, 0) / latencies.length).toFixed(2))
    : null;

  return {
    funnel: {
      stages,
      conversion: conversion(stages),
    },
    segments: [...segments.values()]
      .map((segment) => ({ ...segment, conversion: conversion(segment.stages) }))
      .sort((left, right) =>
        `${left.surface}:${left.algorithmVersion}`.localeCompare(`${right.surface}:${right.algorithmVersion}`),
      ),
    quality: {
      duplicateEvents,
      duplicateGroups: duplicateKeys.size,
      incompleteEvents,
      unattributedEvents,
      invalidAttributionEvents,
      eventTotals,
    },
    operations: {
      responses429: completions.filter((log) => log.statusCode === 429).length,
      responses5xx: completions.filter((log) => Number(log.statusCode) >= 500).length,
      emptyFeeds: logs.filter((log) => log.eventName === 'recommended_feed_empty').length,
      servedPartialFailures: logs.filter((log) => log.eventName === 'served_partial_failure').length,
      invalidAttributions: logs.filter((log) => log.eventName === 'invalid_attribution').length,
      pocketBaseFailures: logs.filter((log) => log.eventName === 'pocketbase_failure').length,
      latency: {
        samples: latencies.length,
        averageMs: averageLatencyMs,
        p95Ms: percentile95(latencies),
      },
    },
  };
}
