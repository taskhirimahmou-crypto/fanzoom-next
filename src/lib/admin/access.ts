import { NextResponse } from 'next/server';
import { ClientResponseError } from 'pocketbase';
import { requireUser, type RequireUserResult } from '../auth-cookies';
import { logRequestEvent, type ServerRequestContext } from '../observability/request-context';
import { getAdminPocketBase } from '../pocketbase-admin';
import { acquireSharedRateLimit, sharedRateLimitResponse } from '../shared-rate-limit/core';
import type { SharedRateLimitPermit, SharedRateLimitPolicyName } from '../shared-rate-limit/types';

export const APP_ADMIN_ROLES = ['owner', 'admin', 'viewer'] as const;
export type AppAdminRole = (typeof APP_ADMIN_ROLES)[number];

type AppAdminMembership = {
  id: unknown;
  role: unknown;
  enabled: unknown;
};

export type AppAdminAuditContext = {
  userId: string;
  membershipId?: string;
  permit: SharedRateLimitPermit;
};

export type RequireAppAdminResult =
  | {
      ok: true;
      role: AppAdminRole;
      userId: string;
      membershipId: string;
      permit: SharedRateLimitPermit;
    }
  | { ok: false; response: NextResponse; auditContext?: AppAdminAuditContext };

export type RequireAppAdminDependencies = {
  requireUser: (requestId?: string) => Promise<RequireUserResult>;
  findMembership: (
    userId: string,
    requestId?: string,
    permit?: SharedRateLimitPermit,
  ) => Promise<AppAdminMembership | null>;
};

const ROLE_LEVEL: Record<AppAdminRole, number> = {
  viewer: 0,
  admin: 1,
  owner: 2,
};

export function isAppAdminRole(value: unknown): value is AppAdminRole {
  return typeof value === 'string' && APP_ADMIN_ROLES.includes(value as AppAdminRole);
}

async function findMembership(userId: string, requestId?: string, permit?: SharedRateLimitPermit): Promise<AppAdminMembership | null> {
  if (!permit) throw new Error('shared_rate_limit_permit_missing');
  const pb = await getAdminPocketBase(requestId, permit);
  try {
    return await pb.collection('app_admins').getFirstListItem(
      pb.filter('user = {:userId}', { userId }),
      { fields: 'id,role,enabled' },
    );
  } catch (error) {
    if (error instanceof ClientResponseError && error.status === 404) return null;
    throw error;
  }
}

const defaultDependencies: RequireAppAdminDependencies = {
  requireUser,
  findMembership,
};

function denied(
  context: ServerRequestContext,
  status: 403 | 503,
  errorCode: string,
  auditContext?: AppAdminAuditContext,
): RequireAppAdminResult {
  logRequestEvent(
    context,
    status === 503 ? 'error' : 'warn',
    status === 503 ? 'admin_access_check_failed' : 'admin_access_denied',
    status,
    { errorCode },
  );
  return {
    ok: false,
    response: NextResponse.json(
      { error: status === 503 ? 'admin_access_unavailable' : 'forbidden' },
      { status },
    ),
    ...(auditContext ? { auditContext } : {}),
  };
}

/**
 * Server-only application authorization gate. The imported requireUser helper
 * depends on next/headers, so this module cannot be included in a Client
 * Component. Only the minimum role is returned; neither the auth token nor the
 * PocketBase superuser client crosses this boundary.
 */
export async function requireAppAdmin(
  context: ServerRequestContext,
  options: {
    minimumRole?: AppAdminRole;
    rateLimitPolicies?: readonly [SharedRateLimitPolicyName, SharedRateLimitPolicyName];
  } = {},
  dependencies: RequireAppAdminDependencies = defaultDependencies,
): Promise<RequireAppAdminResult> {
  const auth = await dependencies.requireUser(context.requestId);
  if (!auth.ok) {
    logRequestEvent(context, 'warn', 'admin_access_denied', 401, {
      errorCode: 'admin_authentication_required',
    });
    return auth;
  }

  let permit: SharedRateLimitPermit;
  if (dependencies === defaultDependencies) {
    const shared = await acquireSharedRateLimit(
      { headers: context.requestHeaders ?? { get: () => null } },
      context,
      options.rateLimitPolicies ?? ['admin-observability.visitor', 'admin-observability.user'],
      { userId: auth.user.id, visitorId: `authenticated:${auth.user.id}` },
    );
    const blocked = sharedRateLimitResponse(context, shared);
    if (blocked || !shared.permit) return {
      ok: false,
      response: NextResponse.json(
        { error: shared.kind === 'denied' ? 'rate_limited' : 'admin_access_unavailable' },
        { status: shared.kind === 'denied' ? 429 : 503, headers: blocked?.headers },
      ),
    };
    permit = shared.permit;
  } else {
    // Tests inject the complete membership boundary and never obtain a
    // PocketBase superuser client. This marker remains valid only in that path.
    permit = { decisionId: 'injected-test-boundary', mode: 'shadow' } as SharedRateLimitPermit;
  }

  let membership: AppAdminMembership | null;
  try {
    // The identity comes only from the refreshed server session. No user or role
    // supplied by the request is accepted by this API.
    membership = await dependencies.findMembership(auth.user.id, context.requestId, permit);
  } catch {
    return denied(context, 503, 'app_admin_lookup_failed');
  }

  const membershipId = typeof membership?.id === 'string' ? membership.id : undefined;
  const auditContext = { userId: auth.user.id, membershipId, permit };
  if (!membership) return denied(context, 403, 'app_admin_missing', auditContext);
  if (!isAppAdminRole(membership.role)) return denied(context, 403, 'app_admin_role_invalid', auditContext);
  if (membership.enabled !== true) return denied(context, 403, 'app_admin_disabled', auditContext);

  const minimumRole = options.minimumRole ?? 'viewer';
  if (!isAppAdminRole(minimumRole)) {
    return denied(context, 503, 'app_admin_minimum_role_invalid');
  }
  if (ROLE_LEVEL[membership.role] < ROLE_LEVEL[minimumRole]) {
    return denied(context, 403, 'app_admin_role_insufficient', auditContext);
  }

  if (!membershipId) return denied(context, 503, 'app_admin_membership_id_missing');
  return {
    ok: true,
    role: membership.role,
    userId: auth.user.id,
    membershipId,
    permit,
  };
}
