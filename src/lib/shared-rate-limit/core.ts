import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import policies from '../../../pb_hooks/rate_limit_policies.json';
import { getPocketBaseServerUrl } from '../pocketbase-url';
import { writeStructuredServerLog } from '../observability/logger';
import type { ServerRequestContext } from '../observability/request-context';
import type {
  SharedRateLimitDecision,
  SharedRateLimitMode,
  SharedRateLimitPermit,
  SharedRateLimitPolicyName,
} from './types';

const CHECK_PATH = '/api/fanzoom/rate-limit/check';
const METRICS_PATH = '/api/fanzoom/rate-limit/metrics';
const MAX_BACKEND_ATTEMPTS = 2;
const DEFAULT_TIMEOUT_MS = 1_500;
const permits = new WeakSet<object>();

type RequestLike = {
  headers: { get(name: string): string | null };
};

type HookBody = {
  allowed: boolean;
  retryAfterSeconds: number;
  retryDeduplicated: boolean;
  writeCount: number;
  results: Array<{ policy: string; layer: string; allowed: boolean }>;
};

export const sharedRateLimitPolicies = policies as Readonly<Record<
  SharedRateLimitPolicyName,
  { capacity: number; windowSeconds: number; layer: 'visitor' | 'user' }
>>;

export function isSharedRateLimitPermit(value: unknown): value is SharedRateLimitPermit {
  return typeof value === 'object' && value !== null && permits.has(value as object);
}

function mode(): SharedRateLimitMode {
  if (
    process.env.SHARED_RATE_LIMIT_MODE === 'baseline' &&
    process.env.FANZOOM_LOCAL_DOCKER === 'true' &&
    process.env.NODE_ENV !== 'production'
  ) {
    return 'baseline';
  }
  return process.env.SHARED_RATE_LIMIT_MODE === 'shadow' ? 'shadow' : 'enforce';
}

function requiredSecret(name: 'SHARED_RATE_LIMIT_HOOK_SECRET' | 'RATE_LIMIT_KEY_SECRET'): string {
  const value = process.env[name];
  if (!value || value.length < 32) throw new Error(`${name.toLowerCase()}_missing`);
  return value;
}

function sign(method: string, path: string, timestamp: string, rawBody: string, secret: string): string {
  const bodyHash = createHash('sha256').update(rawBody).digest('hex');
  const canonical = `v1\n${method}\n${path}\n${timestamp}\n${bodyHash}`;
  return createHmac('sha256', secret).update(canonical).digest('hex');
}

export function constantTimeSignatureEqual(left: string, right: string): boolean {
  if (!/^[a-f0-9]{64}$/i.test(left) || !/^[a-f0-9]{64}$/i.test(right)) return false;
  return timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}

function keyHash(layer: 'visitor' | 'user', raw: string): string {
  return createHmac('sha256', requiredSecret('RATE_LIMIT_KEY_SECRET'))
    .update(`${layer}\0${raw}`)
    .digest('hex');
}

function visitorIdentity(explicitIdentity: string | undefined): string {
  // Never derive identity from attacker-controlled forwarding headers or an
  // unverified arbitrary cookie. Authenticated routes supply the refreshed user
  // identity; views supply their verified server-signed visitor identity.
  return explicitIdentity || 'anonymous-without-verified-identity';
}

function createPermit(decisionId: string, selectedMode: SharedRateLimitMode): SharedRateLimitPermit {
  const permit = Object.freeze({ decisionId, mode: selectedMode });
  permits.add(permit);
  return permit;
}

function emitDecisionLogs(
  context: ServerRequestContext,
  body: HookBody,
  durationMs: number,
  statusCode: number,
): void {
  writeStructuredServerLog({
    level: body.allowed ? 'info' : 'warn',
    eventName: 'shared_rate_limit_check_completed',
    requestId: context.requestId,
    route: context.route,
    statusCode,
    durationMs,
    rateLimitOutcome: body.allowed ? 'allowed' : 'denied',
  });
  for (const item of body.results) {
    writeStructuredServerLog({
      level: item.allowed ? 'info' : 'warn',
      eventName: 'shared_rate_limit_decision',
      requestId: context.requestId,
      route: context.route,
      statusCode,
      durationMs,
      rateLimitPolicy: item.policy,
      rateLimitLayer: item.layer,
      rateLimitOutcome: item.allowed ? 'allowed' : 'denied',
    });
  }
  if (body.retryDeduplicated) {
    writeStructuredServerLog({
      level: 'info',
      eventName: 'shared_rate_limit_retry_deduplicated',
      requestId: context.requestId,
      route: context.route,
      statusCode,
      durationMs,
    });
  }
}

async function callHook(
  rawBody: string,
  signedBody: string,
  decisionId: string,
  context: ServerRequestContext,
  fetchImpl: typeof fetch,
): Promise<{ response: Response; durationMs: number; roundTrips: number }> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_BACKEND_ATTEMPTS; attempt += 1) {
    const started = performance.now();
    const timestamp = String(Date.now());
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Number(process.env.SHARED_RATE_LIMIT_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS);
    try {
      const response = await fetchImpl(`${getPocketBaseServerUrl()}${CHECK_PATH}`, {
        method: 'POST',
        body: rawBody,
        cache: 'no-store',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'X-Fanzoom-Timestamp': timestamp,
          'X-Fanzoom-Signature': sign('POST', CHECK_PATH, timestamp, signedBody, requiredSecret('SHARED_RATE_LIMIT_HOOK_SECRET')),
        },
      });
      clearTimeout(timeout);
      if (response.status >= 500 && attempt < MAX_BACKEND_ATTEMPTS) {
        lastError = new Error(`shared_rate_limit_backend_status_${response.status}`);
        continue;
      }
      return { response, durationMs: performance.now() - started, roundTrips: attempt };
    } catch (error) {
      clearTimeout(timeout);
      lastError = error;
      if (attempt === MAX_BACKEND_ATTEMPTS) break;
    }
  }
  throw Object.assign(new Error('shared_rate_limit_backend_unavailable'), { cause: lastError, decisionId });
}

export async function acquireSharedRateLimit(
  _request: RequestLike,
  context: ServerRequestContext,
  policyNames: readonly SharedRateLimitPolicyName[],
  options: { userId?: string; visitorId?: string; fetchImpl?: typeof fetch; decisionId?: string } = {},
): Promise<SharedRateLimitDecision> {
  const selectedMode = mode();
  const decisionId = options.decisionId ?? randomUUID();
  const unique = new Set(policyNames);
  if (unique.size !== policyNames.length || policyNames.length < 1 || policyNames.length > 4) {
    return { kind: 'unavailable', errorCode: 'invalid_policy_set', roundTrips: 0 };
  }
  if (selectedMode === 'baseline') {
    return {
      kind: 'allowed',
      permit: createPermit(decisionId, selectedMode),
      backendAllowed: true,
      hookDurationMs: 0,
      writeCount: 0,
      roundTrips: 0,
    };
  }
  try {
    const buckets = policyNames.map((policy) => {
      const definition = sharedRateLimitPolicies[policy];
      if (!definition) throw new Error('unknown_rate_limit_policy');
      const raw = definition.layer === 'user' ? options.userId : visitorIdentity(options.visitorId);
      if (!raw) throw new Error('rate_limit_user_missing');
      return { policy, keyHash: keyHash(definition.layer, raw) };
    });
    const rawBody = JSON.stringify({ decisionId, buckets });
    const signedBody = [decisionId, ...buckets.flatMap((bucket) => [bucket.policy, bucket.keyHash])].join('\n');
    const called = await callHook(rawBody, signedBody, decisionId, context, options.fetchImpl ?? fetch);
    let body: HookBody;
    try {
      body = await called.response.json() as HookBody;
    } catch {
      throw new Error('invalid_rate_limit_response');
    }
    if ((called.response.status !== 200 && called.response.status !== 429) || !Array.isArray(body.results)) {
      const errorCode = called.response.status === 503 && (body as unknown as { error?: string }).error === 'sqlite_busy'
        ? 'sqlite_busy'
        : `rate_limit_backend_status_${called.response.status}`;
      throw new Error(errorCode);
    }
    emitDecisionLogs(context, body, called.durationMs, called.response.status);
    if (body.allowed || selectedMode === 'shadow') {
      if (!body.allowed) {
        writeStructuredServerLog({
          level: 'warn', eventName: 'shared_rate_limit_shadow_denied', requestId: context.requestId,
          route: context.route, statusCode: 200, durationMs: called.durationMs,
        });
      }
      return {
        kind: 'allowed', permit: createPermit(decisionId, selectedMode),
        backendAllowed: body.allowed, hookDurationMs: called.durationMs,
        retryDeduplicated: body.retryDeduplicated, writeCount: body.writeCount,
        retryAfterSeconds: body.retryAfterSeconds, roundTrips: called.roundTrips,
      };
    }
    return {
      kind: 'denied', retryAfterSeconds: Math.max(1, body.retryAfterSeconds || 1),
      backendAllowed: false, hookDurationMs: called.durationMs,
      retryDeduplicated: body.retryDeduplicated, writeCount: body.writeCount,
      roundTrips: called.roundTrips,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const nestedCause = error && typeof error === 'object' && 'cause' in error
      ? (error as { cause?: unknown }).cause
      : undefined;
    const deepCause = nestedCause && typeof nestedCause === 'object' && 'cause' in nestedCause
      ? (nestedCause as { cause?: unknown }).cause
      : nestedCause;
    const nestedCode = deepCause && typeof deepCause === 'object' && 'code' in deepCause
      ? String((deepCause as { code?: unknown }).code)
      : '';
    const errorCode = message === 'sqlite_busy'
      ? 'sqlite_busy'
      : message === 'invalid_rate_limit_response'
        ? message
      : /^rate_limit_backend_status_\d{3}$/.test(message)
        ? message
        : /^[A-Z0-9_]{2,40}$/.test(nestedCode)
          ? `shared_rate_limit_network_${nestedCode.toLowerCase()}`
          : 'shared_rate_limit_backend_error';
    writeStructuredServerLog({
      level: 'error', eventName: errorCode === 'sqlite_busy' ? 'shared_rate_limit_sqlite_busy' : 'shared_rate_limit_backend_error',
      requestId: context.requestId, route: context.route, statusCode: 503,
      durationMs: Math.max(0, context.now() - context.startedAtMs), errorCode,
    });
    if (selectedMode === 'shadow') {
      return { kind: 'allowed', permit: createPermit(decisionId, selectedMode), errorCode, roundTrips: MAX_BACKEND_ATTEMPTS };
    }
    writeStructuredServerLog({
      level: 'error', eventName: 'shared_rate_limit_fail_closed', requestId: context.requestId,
      route: context.route, statusCode: 503, durationMs: Math.max(0, context.now() - context.startedAtMs), errorCode,
    });
    return { kind: 'unavailable', errorCode, roundTrips: MAX_BACKEND_ATTEMPTS };
  }
}

export function sharedRateLimitResponse(context: ServerRequestContext, decision: SharedRateLimitDecision): NextResponse | null {
  if (decision.kind === 'allowed') return null;
  const status = decision.kind === 'denied' ? 429 : 503;
  const retryAfter = decision.kind === 'denied' ? Math.max(1, decision.retryAfterSeconds || 1) : 1;
  const headers = new Headers({ 'Retry-After': String(retryAfter), 'x-request-id': context.requestId });
  return NextResponse.json(
    { error: decision.kind === 'denied' ? 'rate_limited' : 'service_unavailable', retryAfterSeconds: retryAfter },
    { status, headers },
  );
}

export async function readSharedRateLimitMetrics(fetchImpl: typeof fetch = fetch) {
  const timestamp = String(Date.now());
  const response = await fetchImpl(`${getPocketBaseServerUrl()}${METRICS_PATH}`, {
    cache: 'no-store',
    headers: {
      'X-Fanzoom-Timestamp': timestamp,
      'X-Fanzoom-Signature': sign('GET', METRICS_PATH, timestamp, '', requiredSecret('SHARED_RATE_LIMIT_HOOK_SECRET')),
    },
  });
  if (!response.ok) throw new Error('shared_rate_limit_metrics_unavailable');
  return response.json() as Promise<{
    activeBuckets: number; cleanupBacklog: number; oldestExpiredAgeMs: number;
    cleanupDeleted: number; lastCleanupDeleted: number; lastCleanupAt: number;
  }>;
}
