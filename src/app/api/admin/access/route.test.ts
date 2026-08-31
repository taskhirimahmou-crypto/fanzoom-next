import { NextRequest, NextResponse } from 'next/server';
import { describe, expect, it, vi } from 'vitest';
import { handleAdminAccessGet, handleAdminAccessPost } from './route';

const permit = { decisionId: 'test-decision', mode: 'enforce' } as const;
const owner = {
  ok: true as const,
  role: 'owner' as const,
  userId: 'actoruser123456',
  membershipId: 'actormember1234',
  permit,
};

function deps(access: object = owner) {
  return {
    authorize: vi.fn().mockResolvedValue(access),
    list: vi.fn().mockResolvedValue({
      admins: [],
      adminPagination: { page: 1, perPage: 10, totalItems: 0, totalPages: 0 },
      users: [],
      searchPagination: null,
    }),
    mutate: vi.fn().mockResolvedValue({ role: 'viewer', enabled: true, action: 'grant' }),
    auditRejected: vi.fn().mockResolvedValue(undefined),
    createCsrf: vi.fn(() => 'csrf-test-value'),
    readTargetRef: vi.fn(() => ({ userId: 'targetuser12345', expiresAt: Date.now() + 1_000 })),
  };
}

function post(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost/api/admin/access', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'http://localhost',
      host: 'localhost',
      cookie: 'fz_admin_csrf=csrf-test-value',
      'x-fanzoom-csrf': 'csrf-test-value',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

describe('owner-managed admin access API', () => {
  it.each([
    ['anonymous', 401],
    ['viewer', 403],
    ['admin', 403],
  ])('preserves %s denial and never performs a mutation', async (_label, status) => {
    const access = status === 401
      ? { ok: false, response: NextResponse.json({ error: 'authentication_required' }, { status }) }
      : {
          ok: false,
          response: NextResponse.json({ error: 'forbidden' }, { status }),
          auditContext: { userId: 'denieduser12345', membershipId: 'memberdenied123', permit },
        };
    const dependencies = deps(access);
    const response = await handleAdminAccessPost(post({ targetRef: 'opaque', role: 'viewer', enabled: true }), dependencies);
    expect(response.status).toBe(status);
    expect(dependencies.mutate).not.toHaveBeenCalled();
    if (status === 403) expect(dependencies.auditRejected).toHaveBeenCalled();
  });

  it('returns only owner DTO data with a private CSRF boundary', async () => {
    const dependencies = deps();
    const response = await handleAdminAccessGet(new NextRequest('http://localhost/api/admin/access?q=ali'), dependencies);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(response.headers.get('set-cookie')).toMatch(/fz_admin_csrf=.*HttpOnly/i);
    expect(await response.json()).toMatchObject({ csrfToken: 'csrf-test-value', admins: [], users: [] });
  });

  it('derives actor and target server-side and ignores no arbitrary audit fields', async () => {
    const dependencies = deps();
    const response = await handleAdminAccessPost(post({ targetRef: 'opaque', role: 'admin', enabled: true }), dependencies);
    expect(response.status).toBe(200);
    expect(dependencies.mutate).toHaveBeenCalledWith({
      actorUserId: 'actoruser123456',
      targetUserId: 'targetuser12345',
      role: 'admin',
      enabled: true,
      requestId: expect.any(String),
    }, { permit });
  });

  it.each([
    [{ targetRef: 'opaque', role: 'owner', enabled: true }, 'invalid_mutation'],
    [{ targetRef: 'opaque', role: 'viewer', enabled: true, actor: 'forged' }, 'invalid_mutation'],
  ])('rejects forged mutation data', async (body, errorCode) => {
    const dependencies = deps();
    const response = await handleAdminAccessPost(post(body), dependencies);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ errorCode });
    expect(dependencies.mutate).not.toHaveBeenCalled();
  });

  it('rejects invalid Origin and CSRF independently', async () => {
    const originDeps = deps();
    const origin = await handleAdminAccessPost(post(
      { targetRef: 'opaque', role: 'viewer', enabled: true },
      { origin: 'https://evil.test' },
    ), originDeps);
    expect(origin.status).toBe(403);
    expect(await origin.json()).toMatchObject({ errorCode: 'invalid_origin' });
    expect(originDeps.mutate).not.toHaveBeenCalled();

    const csrfDeps = deps();
    const csrf = await handleAdminAccessPost(post(
      { targetRef: 'opaque', role: 'viewer', enabled: true },
      { 'x-fanzoom-csrf': 'wrong' },
    ), csrfDeps);
    expect(csrf.status).toBe(403);
    expect(await csrf.json()).toMatchObject({ errorCode: 'invalid_csrf' });
    expect(csrfDeps.mutate).not.toHaveBeenCalled();
  });

  it('preserves a shared limiter 429 and does not reach privileged work', async () => {
    const dependencies = deps({
      ok: false,
      response: NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: { 'Retry-After': '10' } }),
    });
    const response = await handleAdminAccessPost(post({ targetRef: 'opaque', role: 'viewer', enabled: true }), dependencies);
    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('10');
    expect(dependencies.mutate).not.toHaveBeenCalled();
  });
});
