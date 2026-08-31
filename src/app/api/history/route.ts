// src/app/api/history/route.ts
import { NextRequest } from 'next/server';
import { AUTH_COOKIE, requireUser } from '@/lib/auth-cookies';
import { deleteReadingHistory, upsertReadingHistory } from '@/lib/history/history-service';
import { isPocketBaseRecordId } from '@/lib/pocketbase-id';
import {
  openEventIdempotencyKey,
  recordTrustedRecommendationEventBestEffort,
} from '@/lib/recommender/trusted-events';
import { parseRecommendationAttribution } from '@/lib/recommender/attribution';
import { getAdminPocketBase } from '@/lib/pocketbase-admin';
import {
  PocketBaseServedAttributionRepository,
  validateTrustedOpenAttribution,
} from '@/lib/recommender/trusted-attribution';
import { FixedWindowRateLimiter } from '@/lib/rate-limit';
import { preAuthRateLimitKey } from '@/lib/request-rate-limit';
import {
  beginServerRequest,
  finishServerResponse,
  logRequestEvent,
  observedJson,
  type RequestLogFields,
  type ServerRequestContext,
} from '@/lib/observability/request-context';

const historyRequestRateLimiter = new FixedWindowRateLimiter(120, 60_000);
const globalHistoryRequestRateLimiter = new FixedWindowRateLimiter(10_000, 60_000, 1);
const historyUserRateLimiter = new FixedWindowRateLimiter(60, 60_000);

function rateLimited(context: ServerRequestContext, retryAfterSeconds: number) {
  logRequestEvent(context, 'warn', 'rate_limit_exceeded', 429, {
    errorCode: 'history_rate_limited',
  });
  return observedJson(
    context,
    { error: 'rate_limited', retryAfterSeconds },
    { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } },
    { errorCode: 'history_rate_limited' },
  );
}

// ثبت یا به‌روزرسانی «آخرین مطالعه» (upsert دستی)
export async function POST(req: NextRequest) {
  const observation = beginServerRequest(req, '/api/history');
  const globalLimit = globalHistoryRequestRateLimiter.consume('history-post-global');
  if (!globalLimit.allowed) return rateLimited(observation, globalLimit.retryAfterSeconds);
  const requestLimit = historyRequestRateLimiter.consume(
    preAuthRateLimitKey('history-post', req.cookies.get(AUTH_COOKIE)?.value),
  );
  if (!requestLimit.allowed) return rateLimited(observation, requestLimit.retryAfterSeconds);

  const auth = await requireUser(observation.requestId);
  if (!auth.ok) return finishServerResponse(observation, auth.response, { errorCode: 'unauthorized' });
  const { pb } = auth;
  const uid = auth.user.id;
  const userLimit = historyUserRateLimiter.consume(uid);
  if (!userLimit.allowed) return rateLimited(observation, userLimit.retryAfterSeconds);

  const body = (await req.json().catch(() => null)) as {
    articleId?: unknown;
    attribution?: unknown;
  } | null;
  const articleId = body?.articleId;
  if (!isPocketBaseRecordId(articleId)) {
    return observedJson(observation, { error: 'invalid article' }, { status: 400 }, {
      errorCode: 'invalid_article',
    });
  }
  const candidateAttribution = parseRecommendationAttribution(body?.attribution);
  const attributionWasProvided = body?.attribution !== undefined && body.attribution !== null;
  if (attributionWasProvided && !candidateAttribution) {
    logRequestEvent(observation, 'warn', 'invalid_attribution', 200, {
      errorCode: 'malformed_attribution',
    });
  }

  const now = new Date().toISOString();
  try {
    await upsertReadingHistory(pb, uid, articleId, now);
    let attribution;
    if (candidateAttribution) {
      try {
        const adminPb = await getAdminPocketBase(observation.requestId);
        attribution = await validateTrustedOpenAttribution(
          candidateAttribution,
          uid,
          articleId,
          new PocketBaseServedAttributionRepository(adminPb),
        );
        if (!attribution) {
          logRequestEvent(observation, 'warn', 'invalid_attribution', 200, {
            feedId: candidateAttribution.feedId,
            algorithmVersion: candidateAttribution.algorithmVersion,
            errorCode: 'served_evidence_missing_or_expired',
          });
        }
      } catch {
        // Attribution is analytics metadata: fail closed to direct traffic if its
        // trusted served evidence cannot be checked, without breaking history.
        logRequestEvent(observation, 'error', 'pocketbase_failure', 200, {
          feedId: candidateAttribution.feedId,
          algorithmVersion: candidateAttribution.algorithmVersion,
          errorCode: 'attribution_validation_failed',
        });
      }
    }
    const openBucket = Math.floor(Date.now() / 300_000);
    const openRecorded = await recordTrustedRecommendationEventBestEffort(
      {
        idempotencyKey: openEventIdempotencyKey(articleId, attribution, openBucket),
        articleId,
        eventType: 'open',
        surface: attribution?.surface ?? 'direct',
        ...attribution,
        occurredAt: now,
      },
      uid,
      {
        legacyIdempotencyKeys: attribution
          ? [`open:${attribution.feedId}:${articleId}:${openBucket}`]
          : [],
        requestId: observation.requestId,
        route: observation.route,
      },
    );
    const logFields: RequestLogFields = attribution
      ? { feedId: attribution.feedId, algorithmVersion: attribution.algorithmVersion }
      : {};
    return observedJson(observation, {
      ok: true,
      openRecorded,
      attribution: openRecorded ? (attribution ?? null) : null,
    }, {}, logFields);
  } catch {
    logRequestEvent(observation, 'error', 'pocketbase_failure', 400, {
      errorCode: 'history_upsert_failed',
    });
    return observedJson(observation, { error: 'failed' }, { status: 400 }, {
      errorCode: 'history_upsert_failed',
    });
  }
}

// حذف یک مقاله از تاریخچه
export async function DELETE(req: NextRequest) {
  const observation = beginServerRequest(req, '/api/history');
  const auth = await requireUser(observation.requestId);
  if (!auth.ok) return finishServerResponse(observation, auth.response, { errorCode: 'unauthorized' });
  const { pb } = auth;
  const uid = auth.user.id;

  const body = (await req.json().catch(() => null)) as { articleId?: unknown } | null;
  const articleId = body?.articleId;
  if (!isPocketBaseRecordId(articleId)) {
    return observedJson(observation, { error: 'invalid article' }, { status: 400 }, {
      errorCode: 'invalid_article',
    });
  }

  try {
    await deleteReadingHistory(pb, uid, articleId);
    return observedJson(observation, { ok: true });
  } catch {
    logRequestEvent(observation, 'error', 'pocketbase_failure', 400, {
      errorCode: 'history_delete_failed',
    });
    return observedJson(observation, { error: 'failed' }, { status: 400 }, {
      errorCode: 'history_delete_failed',
    });
  }
}
