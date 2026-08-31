import { NextRequest, NextResponse } from 'next/server';
import { requireAppAdmin, type RequireAppAdminResult } from '@/lib/admin/access';
import {
  AdminAccessInputError,
  AdminAccessMutationError,
  auditRejectedAdminAccess,
  isManageableAdminRole,
  listAdminAccess,
  mutateAdminAccess,
  parseAdminAccessQuery,
} from '@/lib/admin/management';
import {
  createAdminCsrfToken,
  equalAdminCsrfToken,
  isSameOriginAdminMutation,
  readAdminTargetRef,
} from '@/lib/admin/management-security';
import {
  beginServerRequest,
  finishServerResponse,
  logRequestEvent,
  observedJson,
  type ServerRequestContext,
} from '@/lib/observability/request-context';

export const dynamic = 'force-dynamic';

const CSRF_COOKIE = 'fz_admin_csrf';
const PRIVATE_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0',
  Pragma: 'no-cache',
  Vary: 'Cookie',
};

type Dependencies = {
  authorize: (context: ServerRequestContext, mutation: boolean) => Promise<RequireAppAdminResult>;
  list: typeof listAdminAccess;
  mutate: typeof mutateAdminAccess;
  auditRejected: typeof auditRejectedAdminAccess;
  createCsrf: () => string;
  readTargetRef: typeof readAdminTargetRef;
};

const defaultDependencies: Dependencies = {
  authorize: (context, mutation) => requireAppAdmin(context, {
    minimumRole: 'owner',
    rateLimitPolicies: mutation
      ? ['admin-access-mutate.visitor', 'admin-access-mutate.user']
      : ['admin-access-read.visitor', 'admin-access-read.user'],
  }),
  list: listAdminAccess,
  mutate: mutateAdminAccess,
  auditRejected: auditRejectedAdminAccess,
  createCsrf: createAdminCsrfToken,
  readTargetRef: readAdminTargetRef,
};

function finishPrivate(context: ServerRequestContext, response: NextResponse, errorCode?: string) {
  for (const [name, value] of Object.entries(PRIVATE_HEADERS)) response.headers.set(name, value);
  return finishServerResponse(context, response, errorCode ? { errorCode } : {});
}

async function auditDenied(
  access: RequireAppAdminResult,
  context: ServerRequestContext,
  dependencies: Dependencies,
  input: { targetUserId?: string; action?: 'access_denied' | 'mutation_failed'; outcome?: 'denied' | 'failed' } = {},
) {
  const actor = access.ok ? access : access.auditContext;
  if (!actor) return;
  try {
    await dependencies.auditRejected({
      actorUserId: access.ok ? access.userId : actor.userId,
      targetUserId: input.targetUserId,
      action: input.action ?? 'access_denied',
      outcome: input.outcome ?? 'denied',
      requestId: context.requestId,
    }, { permit: access.ok ? access.permit : actor.permit });
  } catch {
    logRequestEvent(context, 'error', 'admin_access_audit_failed', 503, {
      errorCode: 'admin_access_audit_unavailable',
    });
  }
}

export async function handleAdminAccessGet(
  request: NextRequest,
  dependencies: Dependencies = defaultDependencies,
) {
  const context = beginServerRequest(request, '/api/admin/access');
  const access = await dependencies.authorize(context, false);
  if (!access.ok) {
    if (access.response.status === 403) await auditDenied(access, context, dependencies);
    return finishPrivate(context, access.response);
  }

  try {
    const query = parseAdminAccessQuery(request.nextUrl.searchParams);
    const result = await dependencies.list(query, {
      requestId: context.requestId,
      permit: access.permit,
    });
    const csrfToken = dependencies.createCsrf();
    const response = NextResponse.json({ ...result, csrfToken }, { headers: PRIVATE_HEADERS });
    response.cookies.set(CSRF_COOKIE, csrfToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/api/admin/access',
      maxAge: 15 * 60,
    });
    return finishServerResponse(context, response);
  } catch (error) {
    if (error instanceof AdminAccessInputError) {
      return observedJson(
        context,
        { error: 'invalid_request', errorCode: error.errorCode },
        { status: 400, headers: PRIVATE_HEADERS },
        { errorCode: error.errorCode },
      );
    }
    logRequestEvent(context, 'error', 'admin_access_list_failed', 503, {
      errorCode: 'admin_access_data_unavailable',
    });
    return observedJson(
      context,
      { error: 'admin_access_unavailable' },
      { status: 503, headers: PRIVATE_HEADERS },
      { errorCode: 'admin_access_data_unavailable' },
    );
  }
}

async function parseMutationBody(request: NextRequest) {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    throw new AdminAccessInputError('json_required');
  }
  const raw = await request.text();
  if (!raw || raw.length > 4096) throw new AdminAccessInputError('invalid_body_size');
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    throw new AdminAccessInputError('invalid_json');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new AdminAccessInputError('invalid_body');
  }
  const record = body as Record<string, unknown>;
  const keys = Object.keys(record);
  if (
    keys.length !== 3 ||
    !keys.every((key) => ['targetRef', 'role', 'enabled'].includes(key)) ||
    !isManageableAdminRole(record.role) ||
    typeof record.enabled !== 'boolean'
  ) throw new AdminAccessInputError('invalid_mutation');
  return { targetRef: record.targetRef, role: record.role, enabled: record.enabled };
}

export async function handleAdminAccessPost(
  request: NextRequest,
  dependencies: Dependencies = defaultDependencies,
) {
  const context = beginServerRequest(request, '/api/admin/access');
  const access = await dependencies.authorize(context, true);
  if (!access.ok) {
    if (access.response.status === 403) await auditDenied(access, context, dependencies);
    return finishPrivate(context, access.response);
  }

  if (!isSameOriginAdminMutation(request)) {
    await auditDenied(access, context, dependencies, { action: 'mutation_failed' });
    return observedJson(
      context,
      { error: 'forbidden', errorCode: 'invalid_origin' },
      { status: 403, headers: PRIVATE_HEADERS },
      { errorCode: 'invalid_origin' },
    );
  }
  if (!equalAdminCsrfToken(
    request.headers.get('x-fanzoom-csrf'),
    request.cookies.get(CSRF_COOKIE)?.value,
  )) {
    await auditDenied(access, context, dependencies, { action: 'mutation_failed' });
    return observedJson(
      context,
      { error: 'forbidden', errorCode: 'invalid_csrf' },
      { status: 403, headers: PRIVATE_HEADERS },
      { errorCode: 'invalid_csrf' },
    );
  }

  let targetUserId: string | undefined;
  try {
    const body = await parseMutationBody(request);
    const target = dependencies.readTargetRef(body.targetRef);
    if (!target) throw new AdminAccessInputError('invalid_target_ref');
    targetUserId = target.userId;
    const result = await dependencies.mutate({
      actorUserId: access.userId,
      targetUserId,
      role: body.role,
      enabled: body.enabled,
      requestId: context.requestId,
    }, { permit: access.permit });
    return observedJson(context, { success: true, result }, { headers: PRIVATE_HEADERS });
  } catch (error) {
    if (error instanceof AdminAccessInputError) {
      await auditDenied(access, context, dependencies, {
        targetUserId,
        action: 'mutation_failed',
      });
      return observedJson(
        context,
        { error: 'invalid_request', errorCode: error.errorCode },
        { status: 400, headers: PRIVATE_HEADERS },
        { errorCode: error.errorCode },
      );
    }
    if (error instanceof AdminAccessMutationError) {
      return observedJson(
        context,
        { error: 'mutation_rejected', errorCode: error.errorCode },
        { status: error.status, headers: PRIVATE_HEADERS },
        { errorCode: error.errorCode },
      );
    }
    await auditDenied(access, context, dependencies, {
      targetUserId,
      action: 'mutation_failed',
      outcome: 'failed',
    });
    logRequestEvent(context, 'error', 'admin_access_mutation_failed', 503, {
      errorCode: 'admin_access_mutation_unavailable',
    });
    return observedJson(
      context,
      { error: 'admin_access_unavailable' },
      { status: 503, headers: PRIVATE_HEADERS },
      { errorCode: 'admin_access_mutation_unavailable' },
    );
  }
}

export async function GET(request: NextRequest) {
  return handleAdminAccessGet(request);
}

export async function POST(request: NextRequest) {
  return handleAdminAccessPost(request);
}
