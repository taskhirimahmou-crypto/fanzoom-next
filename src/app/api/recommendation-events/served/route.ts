import { NextRequest } from 'next/server';
import { getServerPocketBase } from '@/lib/auth-cookies';
import { getRecommendedArticles } from '@/lib/articles-server';
import { readPersonalizationEnabled } from '@/lib/personalization/consent';
import { validateServedBatchRequest } from '@/lib/recommender/served-batch';
import { recordServedRecommendationBatch } from '@/lib/recommender/trusted-events';
import {
  beginServerRequest,
  logRequestEvent,
  observedJson,
  type RequestLogFields,
} from '@/lib/observability/request-context';
import { acquireSharedRateLimit, sharedRateLimitResponse } from '@/lib/shared-rate-limit/core';

export async function POST(req: NextRequest) {
  const observation = beginServerRequest(req, '/api/recommendation-events/served');

  try {
    const pb = await getServerPocketBase(observation.requestId);
    const record = pb.authStore.record as { id?: string; collectionName?: string } | null;
    if (!record?.id || record.collectionName !== 'users') {
      return observedJson(observation, { error: 'unauthorized' }, { status: 401 }, {
        errorCode: 'unauthorized',
      });
    }
    const sharedLimit = await acquireSharedRateLimit(
      req,
      observation,
      ['served.visitor', 'served.user'],
      { userId: record.id, visitorId: `authenticated:${record.id}` },
    );
    const sharedBlocked = sharedRateLimitResponse(observation, sharedLimit);
    if (sharedBlocked) return sharedBlocked;
    if (!sharedLimit.permit) throw new Error('shared_rate_limit_permit_missing');
    const permit = sharedLimit.permit;

    if (!(await readPersonalizationEnabled(pb, record.id))) {
      logRequestEvent(observation, 'warn', 'consent_rejection', 403, {
        errorCode: 'personalization_disabled',
      });
      return observedJson(
        observation,
        { error: 'personalization_disabled' },
        { status: 403 },
        { errorCode: 'personalization_disabled' },
      );
    }

    const parsed = validateServedBatchRequest(await req.json().catch(() => null));
    if (!parsed.ok) {
      logRequestEvent(observation, 'warn', 'event_validation_failed', 400, {
        errorCode: 'invalid_served_batch',
      });
      return observedJson(
        observation,
        { error: 'invalid_batch' },
        { status: 400 },
        { errorCode: 'invalid_served_batch' },
      );
    }
    const logFields: RequestLogFields = {
      feedId: parsed.value.feedId,
      algorithmVersion: parsed.value.algorithmVersion,
    };

    const user = (await pb.collection('users').getOne(record.id, {
      fields: 'interests',
    })) as { interests?: string[] };
    if (!user.interests?.length) {
      return observedJson(observation, {
        ok: true,
        total: 0,
        created: 0,
        duplicates: 0,
        failures: [],
      }, {}, logFields);
    }

    // Client submits only feed coordinates. The authenticated server reconstructs
    // the canonical baseline articles, article IDs, and ranks.
    const articles = await getRecommendedArticles(
      user.interests,
      parsed.value.articleIds.length,
      parsed.value.offset,
    );
    if (
      articles.length !== parsed.value.articleIds.length ||
      !articles.every((article, index) => article.id === parsed.value.articleIds[index])
    ) {
      logRequestEvent(observation, 'warn', 'invalid_attribution', 409, {
        ...logFields,
        errorCode: 'served_feed_changed',
      });
      return observedJson(
        observation,
        { error: 'feed_changed' },
        { status: 409 },
        { ...logFields, errorCode: 'served_feed_changed' },
      );
    }
    const result = await recordServedRecommendationBatch({
      articles,
      userId: record.id,
      feedId: parsed.value.feedId,
      surface: parsed.value.surface,
      algorithmVersion: parsed.value.algorithmVersion,
      offset: parsed.value.offset,
      observability: {
        requestId: observation.requestId,
        route: observation.route,
        permit,
      },
    });
    if (result.kind === 'disabled') {
      logRequestEvent(observation, 'warn', 'consent_rejection', 403, {
        ...logFields,
        errorCode: 'personalization_disabled',
      });
      return observedJson(
        observation,
        { error: 'personalization_disabled' },
        { status: 403 },
        { ...logFields, errorCode: 'personalization_disabled' },
      );
    }
    if (result.kind === 'partial_failure') {
      logRequestEvent(observation, 'error', 'served_partial_failure', 503, {
        ...logFields,
        errorCode: 'served_partial_failure',
      });
      return observedJson(
        observation,
        {
          ok: false,
          partial: result.created + result.duplicates > 0,
          total: result.total,
          created: result.created,
          duplicates: result.duplicates,
          failures: result.failures,
        },
        { status: 503 },
        { ...logFields, errorCode: 'served_partial_failure' },
      );
    }
    return observedJson(observation, {
      ok: true,
      total: result.total,
      created: result.created,
      duplicates: result.duplicates,
      failures: [],
    }, {}, {
      feedId: parsed.value.feedId,
      algorithmVersion: parsed.value.algorithmVersion,
    });
  } catch {
    logRequestEvent(observation, 'error', 'pocketbase_failure', 500, {
      errorCode: 'served_batch_failed',
    });
    return observedJson(
      observation,
      { error: 'served_batch_failed' },
      { status: 500 },
      { errorCode: 'served_batch_failed' },
    );
  }
}
