import { NextRequest } from 'next/server';
import { getServerPocketBase } from '@/lib/auth-cookies';
import { getAdminPocketBase } from '@/lib/pocketbase-admin';
import { ingestRecommendationEvent } from '@/lib/recommender/event-service';
import { PocketBaseRecommendationEventRepository } from '@/lib/recommender/pocketbase-repository';
import { readPersonalizationEnabled } from '@/lib/personalization/consent';
import {
  beginServerRequest,
  logRequestEvent,
  observedJson,
  type RequestLogFields,
  type ServerRequestContext,
} from '@/lib/observability/request-context';
import { acquireSharedRateLimit, sharedRateLimitResponse } from '@/lib/shared-rate-limit/core';

const sharedBackedLimiter = {
  consume: () => ({ allowed: true as const, retryAfterSeconds: 0, remaining: Number.MAX_SAFE_INTEGER }),
};

function rateLimited(context: ServerRequestContext, retryAfterSeconds: number) {
  logRequestEvent(context, 'warn', 'rate_limit_exceeded', 429, {
    errorCode: 'recommendation_event_rate_limited',
  });
  return observedJson(
    context,
    { error: 'rate_limited', retryAfterSeconds },
    { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } },
    { errorCode: 'recommendation_event_rate_limited' },
  );
}

export async function POST(req: NextRequest) {
  const observation = beginServerRequest(req, '/api/recommendation-events');

  try {
    const userPb = await getServerPocketBase(observation.requestId);
    const record = userPb.authStore.record as { id?: string; collectionName?: string } | null;
    if (!record?.id || record.collectionName !== 'users') {
      return observedJson(observation, { error: 'unauthorized' }, { status: 401 }, {
        errorCode: 'unauthorized',
      });
    }

    const sharedLimit = await acquireSharedRateLimit(
      req,
      observation,
      ['recommendation-events.visitor', 'recommendation-events.user'],
      { userId: record.id, visitorId: `authenticated:${record.id}` },
    );
    const sharedBlocked = sharedRateLimitResponse(observation, sharedLimit);
    if (sharedBlocked) return sharedBlocked;
    if (!sharedLimit.permit) throw new Error('shared_rate_limit_permit_missing');
    const permit = sharedLimit.permit;

    const body = await req.json().catch(() => null);
    const input = body && typeof body === 'object' && !Array.isArray(body)
      ? body as Record<string, unknown>
      : {};
    const logFields: RequestLogFields = {
      feedId: typeof input.feedId === 'string' ? input.feedId : undefined,
      algorithmVersion: typeof input.algorithmVersion === 'string'
        ? input.algorithmVersion
        : undefined,
    };
    const result = await ingestRecommendationEvent(body, record.id, {
      rateLimiter: sharedBackedLimiter,
      isPersonalizationEnabled: () => readPersonalizationEnabled(userPb, record.id as string),
      getRepository: async () => {
        const adminPb = await getAdminPocketBase(observation.requestId, permit);
        return new PocketBaseRecommendationEventRepository(adminPb);
      },
    });

    if (result.kind === 'invalid') {
      logRequestEvent(observation, 'warn', 'event_validation_failed', 400, {
        ...logFields,
        errorCode: 'invalid_event',
      });
      return observedJson(
        observation,
        { error: 'invalid_event', details: result.errors },
        { status: 400 },
        { ...logFields, errorCode: 'invalid_event' },
      );
    }
    if (result.kind === 'rate_limited') {
      return rateLimited(observation, result.retryAfterSeconds);
    }
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

    return observedJson(
      observation,
      { ok: true, eventId: result.eventId, duplicate: result.kind === 'duplicate' },
      { status: result.kind === 'created' ? 201 : 200 },
      logFields,
    );
  } catch {
    logRequestEvent(observation, 'error', 'pocketbase_failure', 500, {
      errorCode: 'event_ingestion_failed',
    });
    return observedJson(
      observation,
      { error: 'event_ingestion_failed' },
      { status: 500 },
      { errorCode: 'event_ingestion_failed' },
    );
  }
}
