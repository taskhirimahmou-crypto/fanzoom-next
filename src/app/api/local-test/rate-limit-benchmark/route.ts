import { NextRequest, NextResponse } from 'next/server';
import { beginServerRequest, observedJson } from '@/lib/observability/request-context';
import { acquireSharedRateLimit } from '@/lib/shared-rate-limit/core';

export const dynamic = 'force-dynamic';

const SAFE_BENCHMARK_KEY = /^[a-zA-Z0-9_-]{16,128}$/;

export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === 'production' || process.env.FANZOOM_LOCAL_DOCKER !== 'true') {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const observation = beginServerRequest(req, '/api/local-test/rate-limit-benchmark');
  const benchmarkKey = req.headers.get('x-fanzoom-benchmark-key') ?? '';
  const scenario = req.headers.get('x-fanzoom-benchmark-scenario');
  if (!SAFE_BENCHMARK_KEY.test(benchmarkKey) || (scenario !== 'allowed' && scenario !== 'saturated')) {
    return observedJson(observation, { error: 'invalid_benchmark_key' }, { status: 400 });
  }

  const decision = await acquireSharedRateLimit(
    req,
    observation,
    [scenario === 'allowed' ? '_internal.benchmark-allowed' : '_internal.benchmark-saturated'],
    { visitorId: `local-benchmark:${benchmarkKey}` },
  );
  const status = decision.kind === 'denied' ? 429 : decision.kind === 'unavailable' ? 503 : 200;
  const headers: Record<string, string> = { 'Cache-Control': 'no-store' };
  if (decision.kind === 'denied') {
    headers['Retry-After'] = String(Math.max(1, decision.retryAfterSeconds ?? 1));
  }

  return observedJson(observation, {
    mode: decision.permit?.mode ?? process.env.SHARED_RATE_LIMIT_MODE ?? 'enforce',
    backendAllowed: decision.backendAllowed ?? false,
    hookDurationMs: decision.hookDurationMs ?? 0,
    writeCount: decision.writeCount ?? 0,
    roundTrips: decision.roundTrips,
  }, { status, headers });
}
