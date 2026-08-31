import { NextRequest } from 'next/server';
import { getAdminPocketBase } from '@/lib/pocketbase-admin';
import { checkFanzoomHealth } from '@/lib/observability/health';
import {
  beginServerRequest,
  logRequestEvent,
  observedJson,
} from '@/lib/observability/request-context';
import { acquireSharedRateLimit, sharedRateLimitResponse } from '@/lib/shared-rate-limit/core';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const observation = beginServerRequest(req, '/api/health');
  try {
    const localTestVisitor = process.env.FANZOOM_LOCAL_DOCKER === 'true'
      ? req.headers.get('x-fanzoom-test-visitor') ?? undefined
      : undefined;
    const limit = await acquireSharedRateLimit(req, observation, ['health.visitor'], {
      visitorId: localTestVisitor ? `local-test:${localTestVisitor}` : undefined,
    });
    const blocked = sharedRateLimitResponse(observation, limit);
    if (blocked) return blocked;
    if (!limit.permit) throw new Error('shared_rate_limit_permit_missing');
    const pb = await getAdminPocketBase(observation.requestId, limit.permit);
    const health = await checkFanzoomHealth(pb);
    if (!health.healthy) {
      logRequestEvent(
        observation,
        'error',
        health.errorCode === 'pocketbase_unavailable' ? 'pocketbase_failure' : 'schema_mismatch',
        503,
        { errorCode: health.errorCode },
      );
      return observedJson(
        observation,
        { status: 'unavailable' },
        { status: 503 },
        { errorCode: health.errorCode },
      );
    }
    return observedJson(observation, { status: 'ok' });
  } catch {
    logRequestEvent(observation, 'error', 'pocketbase_failure', 503, {
      errorCode: 'health_probe_failed',
    });
    return observedJson(
      observation,
      { status: 'unavailable' },
      { status: 503 },
      { errorCode: 'health_probe_failed' },
    );
  }
}
