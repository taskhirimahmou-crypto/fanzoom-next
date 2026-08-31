import type PocketBase from 'pocketbase';
import { ClientResponseError, type RecordModel } from 'pocketbase';
import { getAdminPocketBase } from '../pocketbase-admin';
import type { SharedRateLimitPermit } from '../shared-rate-limit/types';
import { createAdminTargetRef } from './management-security';

export const MANAGEABLE_ADMIN_ROLES = ['viewer', 'admin'] as const;
export type ManageableAdminRole = (typeof MANAGEABLE_ADMIN_ROLES)[number];

export type AdminAccessMemberDto = {
  targetRef: string;
  email: string;
  displayName: string;
  role: 'owner' | ManageableAdminRole;
  enabled: boolean;
  updated: string;
  mutable: boolean;
};

export type AdminAccessUserDto = {
  targetRef: string;
  email: string;
  displayName: string;
  access: null | { role: 'owner' | ManageableAdminRole; enabled: boolean };
};

export type AdminAccessListResult = {
  admins: AdminAccessMemberDto[];
  adminPagination: { page: number; perPage: number; totalItems: number; totalPages: number };
  users: AdminAccessUserDto[];
  searchPagination: { page: number; perPage: number; totalItems: number; totalPages: number } | null;
};

export class AdminAccessInputError extends Error {
  constructor(readonly errorCode: string) {
    super(errorCode);
    this.name = 'AdminAccessInputError';
  }
}

export class AdminAccessMutationError extends Error {
  constructor(readonly status: number, readonly errorCode: string) {
    super(errorCode);
    this.name = 'AdminAccessMutationError';
  }
}

function integer(value: string | null, fallback: number, min: number, max: number): number {
  if (value === null) return fallback;
  if (!/^\d+$/.test(value)) throw new AdminAccessInputError('invalid_pagination');
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new AdminAccessInputError('invalid_pagination');
  }
  return parsed;
}

export function parseAdminAccessQuery(searchParams: URLSearchParams) {
  const allowed = new Set(['q', 'page', 'perPage', 'adminPage']);
  for (const key of searchParams.keys()) {
    if (!allowed.has(key)) throw new AdminAccessInputError('unknown_query_parameter');
  }
  const rawQuery = searchParams.get('q');
  const query = rawQuery?.trim() ?? '';
  if (query && (query.length < 3 || query.length > 100)) {
    throw new AdminAccessInputError('invalid_search_query');
  }
  return {
    query,
    page: integer(searchParams.get('page'), 1, 1, 10_000),
    perPage: integer(searchParams.get('perPage'), 10, 5, 25),
    adminPage: integer(searchParams.get('adminPage'), 1, 1, 10_000),
  };
}

function safeUser(record: RecordModel | null | undefined) {
  return {
    id: typeof record?.id === 'string' ? record.id : '',
    email: typeof record?.email === 'string' ? record.email : '',
    displayName: typeof record?.displayName === 'string' ? record.displayName : '',
  };
}

function expandedUser(record: RecordModel): RecordModel | null {
  const value = record.expand?.user;
  return value && !Array.isArray(value) ? value : null;
}

export async function listAdminAccess(
  query: ReturnType<typeof parseAdminAccessQuery>,
  options: { requestId: string; permit: SharedRateLimitPermit; pb?: PocketBase },
): Promise<AdminAccessListResult> {
  const pb = options.pb ?? await getAdminPocketBase(options.requestId, options.permit);
  const adminsPage = await pb.collection('app_admins').getList(query.adminPage, query.perPage, {
    sort: '-updated',
    expand: 'user',
    fields: 'id,role,enabled,updated,user,expand.user.id,expand.user.email,expand.user.displayName',
    requestKey: null,
  });
  const admins = adminsPage.items.flatMap((membership) => {
    const user = safeUser(expandedUser(membership));
    if (!user.id || !user.email) return [];
    const role = membership.role;
    if (role !== 'owner' && role !== 'admin' && role !== 'viewer') return [];
    return [{
      targetRef: createAdminTargetRef(user.id),
      email: user.email,
      displayName: user.displayName,
      role,
      enabled: membership.enabled === true,
      updated: typeof membership.updated === 'string' ? membership.updated : '',
      mutable: role !== 'owner',
    } satisfies AdminAccessMemberDto];
  });

  if (!query.query) {
    return {
      admins,
      adminPagination: {
        page: adminsPage.page,
        perPage: adminsPage.perPage,
        totalItems: adminsPage.totalItems,
        totalPages: adminsPage.totalPages,
      },
      users: [],
      searchPagination: null,
    };
  }

  const usersPage = await pb.collection('users').getList(query.page, query.perPage, {
    filter: pb.filter('email ~ {:query} || displayName ~ {:query}', { query: query.query }),
    sort: '+email',
    fields: 'id,email,displayName',
    requestKey: null,
  });
  const userIds = usersPage.items.map((user) => user.id).filter(Boolean);
  const membershipByUser = new Map<string, RecordModel>();
  if (userIds.length > 0) {
    const params: Record<string, string> = {};
    const clauses = userIds.map((userId, index) => {
      params[`user${index}`] = userId;
      return `user = {:user${index}}`;
    });
    const memberships = await pb.collection('app_admins').getList(1, userIds.length, {
      filter: pb.filter(clauses.join(' || '), params),
      fields: 'user,role,enabled',
      requestKey: null,
    });
    for (const membership of memberships.items) {
      if (typeof membership.user === 'string') membershipByUser.set(membership.user, membership);
    }
  }

  return {
    admins,
    adminPagination: {
      page: adminsPage.page,
      perPage: adminsPage.perPage,
      totalItems: adminsPage.totalItems,
      totalPages: adminsPage.totalPages,
    },
    users: usersPage.items.flatMap((record) => {
      const user = safeUser(record);
      if (!user.id || !user.email) return [];
      const membership = membershipByUser.get(user.id);
      const role = membership?.role;
      return [{
        targetRef: createAdminTargetRef(user.id),
        email: user.email,
        displayName: user.displayName,
        access: role === 'owner' || role === 'admin' || role === 'viewer'
          ? { role, enabled: membership?.enabled === true }
          : null,
      } satisfies AdminAccessUserDto];
    }),
    searchPagination: {
      page: usersPage.page,
      perPage: usersPage.perPage,
      totalItems: usersPage.totalItems,
      totalPages: usersPage.totalPages,
    },
  };
}

export async function mutateAdminAccess(
  input: {
    actorUserId: string;
    targetUserId: string;
    role: ManageableAdminRole;
    enabled: boolean;
    requestId: string;
  },
  options: { permit: SharedRateLimitPermit; pb?: PocketBase },
): Promise<{ role: ManageableAdminRole; enabled: boolean; action: string }> {
  const pb = options.pb ?? await getAdminPocketBase(input.requestId, options.permit);
  try {
    return await pb.send('/api/fanzoom/admin-access/mutate', {
      method: 'POST',
      body: input,
      requestKey: null,
    });
  } catch (error) {
    if (error instanceof ClientResponseError && [400, 403, 404, 409].includes(error.status)) {
      const data = error.response?.data as { error?: unknown } | undefined;
      const errorCode = typeof data?.error === 'string' ? data.error : 'admin_access_mutation_rejected';
      throw new AdminAccessMutationError(error.status, errorCode);
    }
    throw error;
  }
}

export async function auditRejectedAdminAccess(
  input: {
    actorUserId: string;
    targetUserId?: string;
    action: 'access_denied' | 'mutation_failed';
    outcome: 'denied' | 'failed';
    requestId: string;
  },
  options: { permit: SharedRateLimitPermit; pb?: PocketBase },
): Promise<void> {
  const pb = options.pb ?? await getAdminPocketBase(input.requestId, options.permit);
  await pb.send('/api/fanzoom/admin-access/audit-denied', {
    method: 'POST',
    body: input,
    requestKey: null,
  });
}

export function isManageableAdminRole(value: unknown): value is ManageableAdminRole {
  return typeof value === 'string' && MANAGEABLE_ADMIN_ROLES.includes(value as ManageableAdminRole);
}
