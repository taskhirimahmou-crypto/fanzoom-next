import { NextRequest } from 'next/server';
import { getAdminPocketBase } from '@/lib/pocketbase-admin';
import { checkFanzoomHealth } from '@/lib/observability/health';
import {
  beginServerRequest,
  logRequestEvent,
  observedJson,
} from '@/lib/observability/request-context';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const observation = beginServerRequest(req, '/api/health');
  try {
    const pb = await getAdminPocketBase(observation.requestId);
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
