// src/app/api/comments/route.ts
import { NextRequest } from 'next/server';
import { requireUser } from '@/lib/auth-cookies';
import { getAdminPocketBase } from '@/lib/pocketbase-admin';
import { isPocketBaseRecordId } from '@/lib/pocketbase-id';
import { recordTrustedRecommendationEventBestEffort } from '@/lib/recommender/trusted-events';
import {
  beginServerRequest,
  finishServerResponse,
  logRequestEvent,
  observedJson,
} from '@/lib/observability/request-context';
import { acquireSharedRateLimit, sharedRateLimitResponse } from '@/lib/shared-rate-limit/core';

export async function POST(req: NextRequest) {
  const observation = beginServerRequest(req, '/api/comments');

  const auth = await requireUser(observation.requestId);
  if (!auth.ok) return finishServerResponse(observation, auth.response, { errorCode: 'unauthorized' });
  const sharedLimit = await acquireSharedRateLimit(
    req,
    observation,
    ['comments.visitor', 'comments.user'],
    { userId: auth.user.id, visitorId: `authenticated:${auth.user.id}` },
  );
  const sharedBlocked = sharedRateLimitResponse(observation, sharedLimit);
  if (sharedBlocked) return sharedBlocked;
  if (!sharedLimit.permit) throw new Error('shared_rate_limit_permit_missing');
  const permit = sharedLimit.permit;

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
    const adminPb = await getAdminPocketBase(observation.requestId, permit);
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
      { requestId: observation.requestId, route: observation.route, permit },
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
