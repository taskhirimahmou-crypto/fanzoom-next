import { NextResponse } from 'next/server';
import { ClientResponseError } from 'pocketbase';
import { requireUser, type RequireUserResult } from '../auth-cookies';
import { logRequestEvent, type ServerRequestContext } from '../observability/request-context';
import { getAdminPocketBase } from '../pocketbase-admin';

export const APP_ADMIN_ROLES = ['owner', 'admin', 'viewer'] as const;
export type AppAdminRole = (typeof APP_ADMIN_ROLES)[number];

type AppAdminMembership = {
  role: unknown;
  enabled: unknown;
};

export type RequireAppAdminResult =
  | { ok: true; role: AppAdminRole }
  | { ok: false; response: NextResponse };

export type RequireAppAdminDependencies = {
  requireUser: (requestId?: string) => Promise<RequireUserResult>;
  findMembership: (
    userId: string,
    requestId?: string,
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

async function findMembership(userId: string, requestId?: string): Promise<AppAdminMembership | null> {
  const pb = await getAdminPocketBase(requestId);
  try {
    return await pb.collection('app_admins').getFirstListItem(
      pb.filter('user = {:userId}', { userId }),
      { fields: 'role,enabled' },
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
  options: { minimumRole?: AppAdminRole } = {},
  dependencies: RequireAppAdminDependencies = defaultDependencies,
): Promise<RequireAppAdminResult> {
  const auth = await dependencies.requireUser(context.requestId);
  if (!auth.ok) {
    logRequestEvent(context, 'warn', 'admin_access_denied', 401, {
      errorCode: 'admin_authentication_required',
    });
    return auth;
  }

  let membership: AppAdminMembership | null;
  try {
    // The identity comes only from the refreshed server session. No user or role
    // supplied by the request is accepted by this API.
    membership = await dependencies.findMembership(auth.user.id, context.requestId);
  } catch {
    return denied(context, 503, 'app_admin_lookup_failed');
  }

  if (!membership) return denied(context, 403, 'app_admin_missing');
  if (!isAppAdminRole(membership.role)) return denied(context, 403, 'app_admin_role_invalid');
  if (membership.enabled !== true) return denied(context, 403, 'app_admin_disabled');

  const minimumRole = options.minimumRole ?? 'viewer';
  if (!isAppAdminRole(minimumRole)) {
    return denied(context, 503, 'app_admin_minimum_role_invalid');
  }
  if (ROLE_LEVEL[membership.role] < ROLE_LEVEL[minimumRole]) {
    return denied(context, 403, 'app_admin_role_insufficient');
  }

  return { ok: true, role: membership.role };
}
