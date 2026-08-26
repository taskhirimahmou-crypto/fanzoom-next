import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import type PocketBase from 'pocketbase';
import type { FixedWindowRateLimiter } from '../rate-limit';
import { isPocketBaseRecordId } from '../pocketbase-id';

type Limiter = Pick<FixedWindowRateLimiter, 'consume' | 'reset'>;

export interface AtomicViewCounter {
  increment(articleId: string): Promise<number>;
}

export type ViewCountResult =
  | { kind: 'counted'; views: number }
  | { kind: 'duplicate' }
  | { kind: 'rate_limited'; retryAfterSeconds: number }
  | { kind: 'invalid' };

type ViewCountDependencies = {
  counter: AtomicViewCounter;
  burstLimiter: Limiter;
  dedupeLimiter: Limiter;
  nowMs?: number;
};

export const VIEW_VISITOR_COOKIE = 'fz_view_visitor';
const VIEW_VISITOR_TOKEN_VERSION = 'v1';
const BOOTSTRAP_REUSE_MS = 10_000;
const bootstrapVisitors = new Map<string, { id: string; expiresAt: number }>();

export class ViewConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ViewConfigurationError';
  }
}

export type ViewVisitorIdentity = {
  visitorKey: string;
  setCookieValue?: string;
  trustedProxyUsed: boolean;
};

export async function countArticleView(
  articleId: unknown,
  visitorKey: string,
  dependencies: ViewCountDependencies,
): Promise<ViewCountResult> {
  if (!isPocketBaseRecordId(articleId)) return { kind: 'invalid' };

  const nowMs = dependencies.nowMs ?? Date.now();
  const burst = dependencies.burstLimiter.consume(visitorKey, nowMs);
  if (!burst.allowed) {
    return { kind: 'rate_limited', retryAfterSeconds: burst.retryAfterSeconds };
  }

  const dedupeKey = `${visitorKey}:${articleId}`;
  const dedupe = dependencies.dedupeLimiter.consume(dedupeKey, nowMs);
  if (!dedupe.allowed) return { kind: 'duplicate' };

  try {
    const views = await dependencies.counter.increment(articleId);
    return { kind: 'counted', views };
  } catch (error) {
    // A transient backend error should not suppress a later legitimate retry.
    dependencies.burstLimiter.reset(visitorKey);
    dependencies.dedupeLimiter.reset(dedupeKey);
    throw error;
  }
}

export function requireViewRateLimitSecret(value: string | undefined): string {
  if (!value || Buffer.byteLength(value, 'utf8') < 32) {
    throw new ViewConfigurationError('VIEW_RATE_LIMIT_SECRET must contain at least 32 bytes');
  }
  return value;
}

function hmac(secret: string, value: string): Buffer {
  return createHmac('sha256', secret).update(value).digest();
}

function signVisitorId(id: string, secret: string): string {
  return `${VIEW_VISITOR_TOKEN_VERSION}.${id}.${hmac(secret, `${VIEW_VISITOR_TOKEN_VERSION}.${id}`).toString('base64url')}`;
}

function verifyVisitorToken(value: string | undefined, secret: string): string | undefined {
  if (!value) return undefined;
  const [version, id, signature, extra] = value.split('.');
  if (extra || version !== VIEW_VISITOR_TOKEN_VERSION || !/^[a-z0-9_-]{16,64}$/i.test(id || '')) {
    return undefined;
  }
  try {
    const supplied = Buffer.from(signature || '', 'base64url');
    const expected = hmac(secret, `${version}.${id}`);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return undefined;
    return id;
  } catch {
    return undefined;
  }
}

function trustedProxyAddress(headers: Headers, configuredHeader: string | undefined): string | undefined {
  const name = configuredHeader?.trim().toLowerCase();
  if (!name || !/^[a-z0-9-]{1,64}$/.test(name)) return undefined;
  const raw = headers.get(name)?.trim();
  // A comma-separated chain has topology-dependent semantics. Fail closed until
  // the deployment confirms a single, overwritten client-IP header.
  if (!raw || raw.includes(',') || isIP(raw) === 0) return undefined;
  return raw;
}

function freshVisitorId(): string {
  return randomBytes(18).toString('base64url');
}

function bootstrapVisitorId(headers: Headers, secret: string, nowMs: number): string {
  const userAgent = (headers.get('user-agent') || 'unknown').slice(0, 256);
  const key = hmac(secret, `bootstrap:${userAgent}`).toString('hex');
  const existing = bootstrapVisitors.get(key);
  if (existing && existing.expiresAt > nowMs) return existing.id;
  const id = freshVisitorId();
  bootstrapVisitors.set(key, { id, expiresAt: nowMs + BOOTSTRAP_REUSE_MS });
  if (bootstrapVisitors.size > 1_000) {
    for (const [entryKey, entry] of bootstrapVisitors) {
      if (entry.expiresAt <= nowMs) bootstrapVisitors.delete(entryKey);
    }
  }
  return id;
}

export function resolveViewVisitorIdentity({
  headers,
  cookieValue,
  secret,
  trustedProxyHeader,
  nowMs = Date.now(),
}: {
  headers: Headers;
  cookieValue?: string;
  secret: string;
  trustedProxyHeader?: string;
  nowMs?: number;
}): ViewVisitorIdentity {
  const validSecret = requireViewRateLimitSecret(secret);
  const cookieId = verifyVisitorToken(cookieValue, validSecret);
  if (cookieId) {
    return {
      visitorKey: hmac(validSecret, `visitor:${cookieId}`).toString('hex'),
      trustedProxyUsed: false,
    };
  }

  const address = trustedProxyAddress(headers, trustedProxyHeader);
  const id = address
    ? `p_${hmac(validSecret, `proxy:${address}`).toString('base64url').slice(0, 40)}`
    : bootstrapVisitorId(headers, validSecret, nowMs);
  return {
    visitorKey: hmac(validSecret, `visitor:${id}`).toString('hex'),
    setCookieValue: signVisitorId(id, validSecret),
    trustedProxyUsed: Boolean(address),
  };
}

export class PocketBaseAtomicViewCounter implements AtomicViewCounter {
  constructor(private readonly pb: PocketBase) {}

  async increment(articleId: string): Promise<number> {
    const updated = await this.pb.send<{ views: number }>(
      `/api/fanzoom/articles/${encodeURIComponent(articleId)}/increment-view`,
      { method: 'POST' },
    );
    const views = Number(updated.views);
    if (!Number.isFinite(views)) {
      throw new Error('PocketBase atomic view endpoint returned an invalid count');
    }
    return views;
  }
}

export function resetViewVisitorBootstrapForTests(): void {
  bootstrapVisitors.clear();
}
