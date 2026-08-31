export type ObservabilityWindowKey = '24h' | '7d' | '30d';
export type ObservabilitySurface = 'all' | 'home' | 'for_you';
export type ObservabilityTab = 'overview' | 'recommendations' | 'quality' | 'system';

export type ObservabilityFilters = {
  window: ObservabilityWindowKey;
  surface: ObservabilitySurface;
  algorithmVersion: string;
};

export type FunnelStages = {
  served: number;
  impression: number;
  open: number;
  engaged: number;
};

export type FunnelConversion = {
  servedToImpression: number | null;
  impressionToOpen: number | null;
  openToEngaged: number | null;
  servedToEngaged: number | null;
};

export type SafeOperationalIssue = {
  timestamp: string | null;
  eventName: string;
  route: string;
  statusCode: number;
  errorCode: string | null;
  requestId: string | null;
};

export type ObservabilityDashboardData = {
  schemaVersion: 'observability-dashboard-v1';
  generatedAt: string;
  datasetKind: 'test' | 'unverified';
  window: {
    key: ObservabilityWindowKey;
    start: string;
    end: string;
    timeZone: 'UTC';
    durationHours: number;
  };
  filters: {
    surface: ObservabilitySurface;
    algorithmVersion: string;
    operationalScope: 'window-only';
  };
  definitions: Array<{
    id: string;
    label: string;
    definition: string;
    denominator: string;
    unit: string;
  }>;
  availableFilters: { surfaces: string[]; algorithmVersions: string[] };
  freshness: {
    lastEventAt: string | null;
    lastLogAt: string | null;
    lastObservedAt: string | null;
  };
  overview: {
    health: 'healthy' | 'unhealthy' | 'unknown';
    totalResponses: number;
    responses429: number;
    responses5xx: number;
    errorRate: number | null;
    p95LatencyMs: number | null;
    averageLatencyMs: number | null;
    latencySamples: number;
    engagedReadRate: number | null;
    emptyFeedRate: number | null;
    emptyFeeds: number;
    recommendedResponses: number;
  };
  funnel: { stages: FunnelStages; conversion: FunnelConversion };
  trend: Array<{ timestamp: string; stages: FunnelStages }>;
  breakdowns: Array<{
    surface: string;
    algorithmVersion: string;
    stages: FunnelStages;
    conversion: FunnelConversion;
  }>;
  quality: {
    duplicateEvents: number;
    duplicateGroups: number;
    incompleteEvents: number;
    directEvents: number;
    unattributedEvents: number;
    invalidAttributionEvents: number;
    rejectedInvalidAttributions: number;
    inconsistentEvents: number;
    malformedEvents: number;
    malformedLogs: number;
    coverageRate: number | null;
    attributedEvents: number;
    funnelEvents: number;
    eventTotals: FunnelStages;
    servedPartialFailures: number;
    recentIssues: SafeOperationalIssue[];
  };
  system: {
    pocketBaseFailures: number;
    atomicViewFailures: number;
    eventValidationFailures: number;
    consentRejections: number;
    sharedRateLimit: {
      allowed: number;
      denied: number;
      byPolicy: Array<{ policy: string; layer: string; allowed: number; denied: number }>;
      backendErrors: number;
      failClosed: number;
      sqliteBusy: number;
      retryDeduplicated: number;
      privilegedWithoutSharedLimiter: number;
      averageHookLatencyMs: number | null;
      p95HookLatencyMs: number | null;
      hookLatencySamples: number;
      activeBuckets: number | null;
      cleanupBacklog: number | null;
      cleanupDeleted: number | null;
      oldestExpiredAgeMs: number | null;
    };
    routeStats: Array<{
      route: string;
      responses: number;
      errors5xx: number;
      errorRate: number | null;
      averageLatencyMs: number | null;
      p95LatencyMs: number | null;
    }>;
    recentIncidents: SafeOperationalIssue[];
  };
  source: {
    eventRowsRead: number;
    logRowsRead: number;
    eventsTruncated: boolean;
    logsTruncated: boolean;
    logsAvailable: boolean;
    eventLimit: number | null;
    logByteLimit: number | null;
  };
};
