export type SharedRateLimitMode = 'shadow' | 'enforce';

export type SharedRateLimitPolicyName =
  | 'health.visitor'
  | 'recommendation-events.visitor'
  | 'recommendation-events.user'
  | 'served.visitor'
  | 'served.user'
  | 'recommended.visitor'
  | 'recommended.user'
  | 'history.visitor'
  | 'history.user'
  | 'comments.visitor'
  | 'comments.user'
  | 'bookmarks.visitor'
  | 'bookmarks.user'
  | 'views.visitor'
  | 'admin-observability.visitor'
  | 'admin-observability.user'
  | 'trusted-events.user';

export type SharedRateLimitPermit = {
  readonly decisionId: string;
  readonly mode: SharedRateLimitMode;
};

export type SharedRateLimitDecision = {
  kind: 'allowed' | 'denied' | 'unavailable';
  permit?: SharedRateLimitPermit;
  retryAfterSeconds?: number;
  errorCode?: string;
  retryDeduplicated?: boolean;
  writeCount?: number;
  roundTrips: number;
};
