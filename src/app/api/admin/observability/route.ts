import { NextRequest, NextResponse } from 'next/server';
import { requireAppAdmin, type RequireAppAdminResult } from '@/lib/admin/access';
import {
  loadObservabilityDashboardData,
  ObservabilityFilterError,
} from '@/lib/observability/dashboard-data';
import { parseObservabilityFilters } from '@/lib/observability/metrics.mjs';
import type { ObservabilityFilters } from '@/lib/observability/dashboard-types';
import {
  beginServerRequest,
  finishServerResponse,
  logRequestEvent,
  observedJson,
  type ServerRequestContext,
} from '@/lib/observability/request-context';

export const dynamic = 'force-dynamic';

const PRIVATE_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0',
  Pragma: 'no-cache',
  Vary: 'Cookie',
};

type ObservabilityRouteDependencies = {
  authorize: (context: ServerRequestContext) => Promise<RequireAppAdminResult>;
  load: (
    filters: ObservabilityFilters,
    options: { requestId: string; permit: Extract<RequireAppAdminResult, { ok: true }>['permit'] },
  ) => ReturnType<typeof loadObservabilityDashboardData>;
  now: () => Date;
};

const defaultDependencies: ObservabilityRouteDependencies = {
  authorize: (context) => requireAppAdmin(context, { minimumRole: 'viewer' }),
  load: loadObservabilityDashboardData,
  now: () => new Date(),
};

function finishPrivate(
  context: ServerRequestContext,
  response: NextResponse,
  errorCode?: string,
) {
  for (const [name, value] of Object.entries(PRIVATE_HEADERS)) response.headers.set(name, value);
  return finishServerResponse(context, response, errorCode ? { errorCode } : {});
}

export async function handleObservabilityGet(
  request: NextRequest,
  dependencies: ObservabilityRouteDependencies = defaultDependencies,
) {
  const context = beginServerRequest(request, '/api/admin/observability');
  const access = await dependencies.authorize(context);
  if (!access.ok) return finishPrivate(context, access.response);

  const parsed = parseObservabilityFilters({
    window: request.nextUrl.searchParams.get('window') ?? '24h',
    surface: request.nextUrl.searchParams.get('surface') ?? 'all',
    algorithmVersion: request.nextUrl.searchParams.get('algorithm') ?? 'all',
  }, dependencies.now());
  if (!parsed.ok || !parsed.filters) {
    logRequestEvent(context, 'warn', 'admin_observability_filter_rejected', 400, {
      errorCode: parsed.errorCode,
    });
    return observedJson(
      context,
      { error: 'invalid_filter', errorCode: parsed.errorCode },
      { status: 400, headers: PRIVATE_HEADERS },
      { errorCode: parsed.errorCode },
    );
  }

  try {
    const data = await dependencies.load({
      window: parsed.filters.window.key as ObservabilityFilters['window'],
      surface: parsed.filters.surface as ObservabilityFilters['surface'],
      algorithmVersion: parsed.filters.algorithmVersion,
    }, {
      requestId: context.requestId,
      permit: access.permit,
    });
    return observedJson(context, data, { headers: PRIVATE_HEADERS });
  } catch (error) {
    if (error instanceof ObservabilityFilterError) {
      return observedJson(
        context,
        { error: 'invalid_filter', errorCode: error.errorCode },
        { status: 400, headers: PRIVATE_HEADERS },
        { errorCode: error.errorCode },
      );
    }
    logRequestEvent(context, 'error', 'admin_observability_load_failed', 503, {
      errorCode: 'observability_data_unavailable',
    });
    return observedJson(
      context,
      { error: 'observability_data_unavailable' },
      { status: 503, headers: PRIVATE_HEADERS },
      { errorCode: 'observability_data_unavailable' },
    );
  }
}

export async function GET(request: NextRequest) {
  return handleObservabilityGet(request);
}
