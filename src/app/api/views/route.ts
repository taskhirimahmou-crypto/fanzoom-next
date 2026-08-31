// src/app/api/views/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getAdminPocketBase } from '@/lib/pocketbase-admin';
import { FixedWindowRateLimiter } from '@/lib/rate-limit';
import { isPocketBaseRecordId } from '@/lib/pocketbase-id';
import {
  countArticleView,
  PocketBaseAtomicViewCounter,
  requireViewRateLimitSecret,
  resolveViewVisitorIdentity,
  VIEW_VISITOR_COOKIE,
} from '@/lib/views/view-service';
import {
  beginServerRequest,
  logRequestEvent,
  observedJson,
} from '@/lib/observability/request-context';

const burstLimiter = new FixedWindowRateLimiter(60, 60_000);
// These windows are per Next.js process. Move them to shared storage when horizontal
// enforcement is required; the atomic PocketBase increment remains correct either way.
const viewDedupeLimiter = new FixedWindowRateLimiter(1, 10 * 60_000);

type PocketBaseError = { status?: number };

function withVisitorCookie(response: NextResponse, value: string | undefined): NextResponse {
  if (!value) return response;
  response.cookies.set(VIEW_VISITOR_COOKIE, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 365 * 24 * 60 * 60,
  });
  return response;
}

export async function POST(req: NextRequest) {
  const observation = beginServerRequest(req, '/api/views');
  try {
    const body = (await req.json().catch(() => null)) as { id?: unknown } | null;
    const id = body?.id;
    if (!isPocketBaseRecordId(id)) {
      return observedJson(observation, { ok: false, error: 'invalid id' }, { status: 400 }, {
        errorCode: 'invalid_article',
      });
    }
    const secret = requireViewRateLimitSecret(process.env.VIEW_RATE_LIMIT_SECRET);
    const visitor = resolveViewVisitorIdentity({
      headers: req.headers,
      cookieValue: req.cookies.get(VIEW_VISITOR_COOKIE)?.value,
      secret,
      trustedProxyHeader: process.env.VIEW_TRUSTED_PROXY_IP_HEADER,
    });

    const result = await countArticleView(id, visitor.visitorKey, {
      burstLimiter,
      dedupeLimiter: viewDedupeLimiter,
      counter: {
        async increment(articleId) {
          const pb = await getAdminPocketBase(observation.requestId);
          return new PocketBaseAtomicViewCounter(pb).increment(articleId);
        },
      },
    });

    if (result.kind === 'invalid') {
      return observedJson(observation, { ok: false, error: 'invalid id' }, { status: 400 }, {
        errorCode: 'invalid_article',
      });
    }
    if (result.kind === 'rate_limited') {
      logRequestEvent(observation, 'warn', 'rate_limit_exceeded', 429, {
        errorCode: 'view_rate_limited',
      });
      return withVisitorCookie(observedJson(
        observation,
        { ok: false, error: 'rate limited', retryAfterSeconds: result.retryAfterSeconds },
        {
          status: 429,
          headers: { 'Retry-After': String(result.retryAfterSeconds) },
        },
        { errorCode: 'view_rate_limited' },
      ), visitor.setCookieValue);
    }
    if (result.kind === 'duplicate') {
      return withVisitorCookie(
        observedJson(observation, { ok: true, counted: false }),
        visitor.setCookieValue,
      );
    }

    return withVisitorCookie(
      observedJson(observation, { ok: true, counted: true, views: result.views }),
      visitor.setCookieValue,
    );
  } catch (error) {
    const status = (error as PocketBaseError).status === 404 ? 404 : 500;
    const errorCode = status === 404 ? 'article_not_found' : 'atomic_view_failed';
    logRequestEvent(observation, 'error', 'atomic_view_failure', status, { errorCode });
    return observedJson(
      observation,
      { ok: false, error: status === 404 ? 'article not found' : 'view update failed' },
      { status },
      { errorCode },
    );
  }
}
