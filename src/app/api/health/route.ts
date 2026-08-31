import { NextRequest } from 'next/server';
import { checkPocketBaseAvailability } from '@/lib/observability/health';
import {
  beginServerRequest,
  logRequestEvent,
  observedJson,
} from '@/lib/observability/request-context';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const observation = beginServerRequest(req, '/api/health');
  try {
    // Public uptime probes are intentionally read-only and never acquire a
    // database-backed limiter bucket or a PocketBase superuser session.
    const health = await checkPocketBaseAvailability();
    if (!health.healthy) {
      logRequestEvent(
        observation,
        'error',
        'pocketbase_failure',
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
    return observedJson(observation, { status: 'ok' }, {
      headers: { 'Cache-Control': 'no-store' },
    });
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
