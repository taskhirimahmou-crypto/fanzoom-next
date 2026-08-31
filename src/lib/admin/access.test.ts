import { NextResponse } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RequireUserResult } from '../auth-cookies';
import type { ServerRequestContext } from '../observability/request-context';
import {
  requireAppAdmin,
  type RequireAppAdminDependencies,
} from './access';

const context: ServerRequestContext = {
  requestId: '63c8af84-a1d0-4b4d-92e3-5e20d688ce89',
  route: '/internal/admin-access-test',
  startedAtMs: 100,
  now: () => 125,
};

function authenticated(userId = 'sessionuser1234'): RequireUserResult {
  return {
    ok: true,
    pb: {} as never,
    user: {
      id: userId,
      email: 'private-admin@example.test',
      collectionName: 'users',
      collectionId: 'users_collection',
      created: '2026-08-31T00:00:00.000Z',
    },
  } as RequireUserResult;
}

function dependencies(
  membership: { role: unknown; enabled: unknown } | null,
  auth: RequireUserResult = authenticated(),
): RequireAppAdminDependencies {
  return {
    requireUser: vi.fn().mockResolvedValue(auth),
    findMembership: vi.fn().mockResolvedValue(
      membership ? { id: 'adminmember1234', ...membership } : null,
    ),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('requireAppAdmin', () => {
  it('returns 401 for an anonymous or expired session and preserves its cookie-clearing response', async () => {
    const response = NextResponse.json({ error: 'login required' }, { status: 401 });
    response.cookies.delete('pb_auth');
    const deps = dependencies(null, { ok: false, response });
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const result = await requireAppAdmin(context, {}, deps);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response).toBe(response);
      expect(result.response.status).toBe(401);
      expect(result.response.headers.get('set-cookie')).toContain('pb_auth=');
    }
    expect(deps.findMembership).not.toHaveBeenCalled();
    expect(warning.mock.calls.flat().join(' ')).toContain('admin_authentication_required');
  });

  it('returns 403 for an authenticated normal user', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const result = await requireAppAdmin(context, {}, dependencies(null));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
    expect(warning.mock.calls.flat().join(' ')).toContain('app_admin_missing');
  });

  it.each(['owner', 'admin', 'viewer'] as const)(
    'accepts a refreshed enabled %s membership and returns only its role',
    async (role) => {
      const deps = dependencies({ role, enabled: true }, authenticated('refreshed123456'));
      const result = await requireAppAdmin(context, {}, deps);

      expect(result).toEqual(expect.objectContaining({ ok: true, role }));
      expect(deps.requireUser).toHaveBeenCalledWith(context.requestId);
      expect(deps.findMembership).toHaveBeenCalledWith(
        'refreshed123456',
        context.requestId,
        expect.objectContaining({ mode: 'shadow' }),
      );
      expect(Object.keys(result)).toEqual(['ok', 'role', 'userId', 'membershipId', 'permit']);
    },
  );

  it('returns 403 for a disabled membership', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const result = await requireAppAdmin(
      context,
      {},
      dependencies({ role: 'admin', enabled: false }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
    expect(warning.mock.calls.flat().join(' ')).toContain('app_admin_disabled');
  });

  it('fails closed for a forged or unknown stored role', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const result = await requireAppAdmin(
      context,
      {},
      dependencies({ role: 'superuser', enabled: true }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
    expect(warning.mock.calls.flat().join(' ')).toContain('app_admin_role_invalid');
  });

  it('uses only the refreshed session user and never a caller-supplied identity', async () => {
    const findMembership = vi.fn(async (userId: string) => (
      userId === 'otheruser123456'
        ? { id: 'adminmember1234', role: 'owner', enabled: true }
        : null
    ));
    const deps: RequireAppAdminDependencies = {
      requireUser: vi.fn().mockResolvedValue(authenticated('normaluser12345')),
      findMembership,
    };
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const result = await requireAppAdmin(context, {}, deps);

    expect(result.ok).toBe(false);
    expect(findMembership).toHaveBeenCalledWith(
      'normaluser12345',
      context.requestId,
      expect.objectContaining({ mode: 'shadow' }),
    );
  });

  it('enforces role hierarchy without logging user identifiers or email', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const result = await requireAppAdmin(
      context,
      { minimumRole: 'admin' },
      dependencies({ role: 'viewer', enabled: true }, authenticated('sensitiveuserid')),
    );

    expect(result.ok).toBe(false);
    const output = warning.mock.calls.flat().join(' ');
    expect(output).toContain('app_admin_role_insufficient');
    expect(output).not.toContain('sensitiveuserid');
    expect(output).not.toContain('private-admin@example.test');
  });

  it('fails closed with 503 when the private membership lookup is unavailable', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const deps = dependencies(null);
    vi.mocked(deps.findMembership).mockRejectedValue(new Error('credential details'));

    const result = await requireAppAdmin(context, {}, deps);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(503);
    const output = error.mock.calls.flat().join(' ');
    expect(output).toContain('app_admin_lookup_failed');
    expect(output).not.toContain('credential details');
  });

  it('fails closed when future server code supplies an invalid minimum role', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const result = await requireAppAdmin(
      context,
      { minimumRole: 'superuser' as never },
      dependencies({ role: 'owner', enabled: true }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(503);
  });
});
