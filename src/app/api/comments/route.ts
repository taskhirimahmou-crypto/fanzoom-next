// src/app/api/comments/route.ts
import { NextRequest } from 'next/server';
import { AUTH_COOKIE, requireUser } from '@/lib/auth-cookies';
import { getAdminPocketBase } from '@/lib/pocketbase-admin';
import { isPocketBaseRecordId } from '@/lib/pocketbase-id';
import { FixedWindowRateLimiter } from '@/lib/rate-limit';
import { preAuthRateLimitKey } from '@/lib/request-rate-limit';
import { recordTrustedRecommendationEventBestEffort } from '@/lib/recommender/trusted-events';
import {
  beginServerRequest,
  finishServerResponse,
  logRequestEvent,
  observedJson,
  type ServerRequestContext,
} from '@/lib/observability/request-context';

const commentRequestRateLimiter = new FixedWindowRateLimiter(20, 60_000);
const globalCommentRequestRateLimiter = new FixedWindowRateLimiter(10_000, 60_000, 1);
const commentUserRateLimiter = new FixedWindowRateLimiter(10, 60_000);

function rateLimited(context: ServerRequestContext, retryAfterSeconds: number) {
  logRequestEvent(context, 'warn', 'rate_limit_exceeded', 429, {
    errorCode: 'comment_rate_limited',
  });
  return observedJson(
    context,
    { error: 'rate_limited', retryAfterSeconds },
    { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } },
    { errorCode: 'comment_rate_limited' },
  );
}

export async function POST(req: NextRequest) {
  const observation = beginServerRequest(req, '/api/comments');
  const globalLimit = globalCommentRequestRateLimiter.consume('comments-global');
  if (!globalLimit.allowed) return rateLimited(observation, globalLimit.retryAfterSeconds);
  const requestLimit = commentRequestRateLimiter.consume(
    preAuthRateLimitKey('comments', req.cookies.get(AUTH_COOKIE)?.value),
  );
  if (!requestLimit.allowed) return rateLimited(observation, requestLimit.retryAfterSeconds);

  const auth = await requireUser(observation.requestId);
  if (!auth.ok) return finishServerResponse(observation, auth.response, { errorCode: 'unauthorized' });
  const userLimit = commentUserRateLimiter.consume(auth.user.id);
  if (!userLimit.allowed) return rateLimited(observation, userLimit.retryAfterSeconds);

  const payload = await req.json().catch(() => null);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return observedJson(observation, { error: 'درخواست نامعتبر است' }, { status: 400 }, {
      errorCode: 'invalid_comment_request',
    });
  }
  const input = payload as Record<string, unknown>;
  const unexpected = Object.keys(input).filter((key) => key !== 'articleId' && key !== 'body');
  if (unexpected.length > 0) {
    return observedJson(observation, { error: 'فیلد غیرمجاز در درخواست نظر' }, { status: 400 }, {
      errorCode: 'unexpected_comment_field',
    });
  }
  const articleId = input.articleId;
  const text = typeof input.body === 'string' ? input.body.trim() : '';

  if (!isPocketBaseRecordId(articleId)) {
    return observedJson(observation, { error: 'مقاله مشخص نشده' }, { status: 400 }, {
      errorCode: 'invalid_article',
    });
  }
  if (!text) return observedJson(observation, { error: 'متن نظر خالی است' }, { status: 400 }, {
    errorCode: 'empty_comment',
  });
  if (text.length > 1000)
    return observedJson(observation, { error: 'نظر حداکثر ۱۰۰۰ کاراکتر باشد' }, { status: 400 }, {
      errorCode: 'comment_too_long',
    });

  const now = new Date().toISOString();

  try {
    const adminPb = await getAdminPocketBase(observation.requestId);
    const comment = await adminPb.collection('comments').create({
      user: auth.user.id,
      article: articleId,
      content: text,
      status: 'pending',
      autodate: now, // فیلد تاریخِ واقعیِ این collection
    });
    await recordTrustedRecommendationEventBestEffort(
      {
        idempotencyKey: `comment:${comment.id}`,
        articleId,
        eventType: 'comment',
        surface: 'article',
        occurredAt: now,
      },
      auth.user.id,
      { requestId: observation.requestId, route: observation.route },
    );
    return observedJson(observation, { ok: true });
  } catch {
    logRequestEvent(observation, 'error', 'pocketbase_failure', 400, {
      errorCode: 'comment_create_failed',
    });
    return observedJson(observation, { error: 'ثبت نظر انجام نشد' }, { status: 400 }, {
      errorCode: 'comment_create_failed',
    });
  }
}
