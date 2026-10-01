import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';

// Same approach as api-auth.checkIsAdminOrEquipoDirectivo.test.ts: stub the
// dependencies of getApiUser / createServiceRoleClient, not the module itself.
vi.mock('@supabase/auth-helpers-nextjs', () => ({
  createServerSupabaseClient: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
}));

import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { requireVerifiedRole, requireVerifiedSuperadmin } from '../api-auth';

const mockedCreateServerSupabaseClient = vi.mocked(createServerSupabaseClient);
const mockedCreateClient = vi.mocked(createClient);

const req = { headers: {} } as unknown as NextApiRequest;
const res = {} as NextApiResponse;

function user(id: string, metadataRoles: string[] = []) {
  return {
    id,
    email: `${id}@example.com`,
    app_metadata: {},
    user_metadata: { roles: metadataRoles },
    aud: 'authenticated',
    created_at: '2026-10-01T00:00:00.000Z',
  } as any;
}

/** The cookie claims `cookieUser`; the auth server verifies the token as `verifiedUser`. */
function setSession(cookieUser: any | null, verifiedUser: any | null = cookieUser) {
  mockedCreateServerSupabaseClient.mockReturnValue({
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: cookieUser ? { user: cookieUser, access_token: 'token' } : null },
        error: null,
      }),
      getUser: vi.fn().mockResolvedValue({ data: { user: verifiedUser }, error: null }),
    },
  } as any);
}

type RoleRow = { role_type: string; is_active: boolean };

/**
 * The service client: `profiles` answers the forced-password flag, `user_roles`
 * the role rows. The role chain honours every filter the helper applies
 * (user_id, role_type IN, is_active), so dropping one of them changes the result.
 */
function setService(
  byUser: Record<string, RoleRow[]>,
  opts: { roleError?: unknown; mustChange?: boolean; profileError?: unknown; bearerUser?: unknown } = {}
) {
  const calls: { userId?: string; roles?: string[]; activeOnly?: boolean } = {};
  const roles: any = {
    select: vi.fn(() => roles),
    eq: vi.fn((col: string, val: unknown) => {
      if (col === 'user_id') calls.userId = val as string;
      if (col === 'is_active') calls.activeOnly = val === true;
      return roles;
    }),
    in: vi.fn((_col: string, wanted: string[]) => {
      calls.roles = wanted;
      return roles;
    }),
    limit: vi.fn(async () => {
      if (opts.roleError) return { data: null, error: opts.roleError };
      const rows = (byUser[calls.userId ?? ''] ?? []).filter(
        (r) => calls.roles?.includes(r.role_type) && (!calls.activeOnly || r.is_active)
      );
      return { data: rows.map(({ role_type }) => ({ role_type })), error: null };
    }),
  };
  const profiles: any = {
    select: vi.fn(() => profiles),
    eq: vi.fn(() => profiles),
    maybeSingle: vi.fn(async () =>
      opts.profileError
        ? { data: null, error: opts.profileError }
        : { data: { must_change_password: opts.mustChange === true }, error: null }
    ),
  };
  mockedCreateClient.mockReturnValue({
    from: vi.fn((t: string) => (t === 'profiles' ? profiles : roles)),
    // getApiUser verifies a Bearer token with the service client.
    auth: { getUser: vi.fn(async () => ({ data: { user: opts.bearerUser ?? null }, error: opts.bearerUser ? null : { message: 'bad' } })) },
  } as any);
  return calls;
}

const active = (role_type: string): RoleRow => ({ role_type, is_active: true });

describe('requireVerifiedRole', () => {
  const origUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const origKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
  });

  afterEach(() => {
    if (origUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = origUrl;
    if (origKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = origKey;
  });

  it('401 without a session', async () => {
    setSession(null);
    setService({});
    expect(await requireVerifiedRole(req, res, ['admin'])).toMatchObject({ user: null, status: 401 });
  });

  it('403 for a user whose own metadata claims admin but who holds no admin role', async () => {
    setSession(user('docente-1', ['admin']));
    setService({ 'docente-1': [active('docente')] });
    expect(await requireVerifiedRole(req, res, ['admin'], 'solo admin')).toEqual({
      user: null,
      status: 403,
      body: { error: 'solo admin' },
    });
  });

  it('403 for an inactive role row', async () => {
    setSession(user('ex-admin'));
    const calls = setService({ 'ex-admin': [{ role_type: 'admin', is_active: false }] });
    expect(await requireVerifiedRole(req, res, ['admin'])).toMatchObject({ user: null, status: 403 });
    expect(calls.activeOnly).toBe(true);
  });

  it('allows a user with an active role of the requested kinds, returning the verified user', async () => {
    const admin = user('admin-1');
    setSession(admin);
    const calls = setService({ 'admin-1': [active('admin')] });
    expect(await requireVerifiedRole(req, res, ['admin', 'consultor'])).toEqual({ user: admin, status: null, body: null });
    expect(calls.roles).toEqual(['admin', 'consultor']);
  });

  it("looks up the auth server's user, not the cookie's claimed user", async () => {
    setSession(user('admin-1'), user('docente-1'));
    const calls = setService({ 'admin-1': [active('admin')], 'docente-1': [active('docente')] });
    expect(await requireVerifiedRole(req, res, ['admin'])).toMatchObject({ user: null, status: 403 });
    expect(calls.userId).toBe('docente-1');
  });

  it('holds an admin who must change their password (Bearer callers never meet the middleware gate)', async () => {
    setSession(user('admin-1'));
    setService({ 'admin-1': [active('admin')] }, { mustChange: true });
    expect(await requireVerifiedRole(req, res, ['admin'])).toMatchObject({
      user: null,
      status: 403,
      body: { code: 'PASSWORD_CHANGE_REQUIRED' },
    });
  });

  it('fails closed with 503 when the forced-password flag cannot be read', async () => {
    setSession(user('admin-1'));
    setService({ 'admin-1': [active('admin')] }, { profileError: { message: 'connection reset' } });
    expect(await requireVerifiedRole(req, res, ['admin'])).toMatchObject({
      user: null,
      status: 503,
      body: { code: 'PASSWORD_STATE_UNAVAILABLE' },
    });
  });

  it('fails closed with 500 when the role lookup errors', async () => {
    setSession(user('admin-1'));
    setService({ 'admin-1': [active('admin')] }, { roleError: { message: 'connection reset' } });
    expect(await requireVerifiedRole(req, res, ['admin'])).toMatchObject({ user: null, status: 500 });
  });

  describe('Bearer callers (no cookie: the middleware gate never runs for them)', () => {
    const bearerReq = { headers: { authorization: 'Bearer some-token' } } as unknown as NextApiRequest;

    it('holds a flagged admin calling with a Bearer token', async () => {
      setSession(null);
      setService({ 'admin-1': [active('admin')] }, { mustChange: true, bearerUser: user('admin-1') });
      expect(await requireVerifiedRole(bearerReq, res, ['admin'])).toMatchObject({
        status: 403,
        body: { code: 'PASSWORD_CHANGE_REQUIRED' },
      });
    });

    it('refuses a Bearer caller whose metadata claims admin without an admin row', async () => {
      setSession(null);
      setService({ 'docente-1': [active('docente')] }, { bearerUser: user('docente-1', ['admin']) });
      expect(await requireVerifiedRole(bearerReq, res, ['admin'])).toMatchObject({ user: null, status: 403 });
    });

    it('allows an active admin with a Bearer token', async () => {
      setSession(null);
      const admin = user('admin-1');
      setService({ 'admin-1': [active('admin')] }, { bearerUser: admin });
      expect(await requireVerifiedRole(bearerReq, res, ['admin'])).toEqual({ user: admin, status: null, body: null });
    });

    it('401 for an invalid Bearer token', async () => {
      setSession(null);
      setService({});
      expect(await requireVerifiedRole(bearerReq, res, ['admin'])).toMatchObject({ user: null, status: 401 });
    });
  });
});

/** Service client for the superadmin check: `auth_is_superadmin` answers from `superadmins`. */
function setSuperadminService(
  superadmins: string[],
  opts: { rpcError?: unknown; mustChange?: boolean; profileError?: unknown; bearerUser?: unknown } = {}
) {
  const asked: unknown[] = [];
  const profiles: any = {
    select: vi.fn(() => profiles),
    eq: vi.fn(() => profiles),
    maybeSingle: vi.fn(async () =>
      opts.profileError
        ? { data: null, error: opts.profileError }
        : { data: { must_change_password: opts.mustChange === true }, error: null }
    ),
  };
  mockedCreateClient.mockReturnValue({
    from: vi.fn(() => profiles),
    rpc: vi.fn(async (fn: string, args: { check_user_id: string }) => {
      asked.push([fn, args.check_user_id]);
      if (opts.rpcError) return { data: null, error: opts.rpcError };
      return { data: superadmins.includes(args.check_user_id), error: null };
    }),
    auth: { getUser: vi.fn(async () => ({ data: { user: opts.bearerUser ?? null }, error: opts.bearerUser ? null : { message: 'bad' } })) },
  } as any);
  return asked;
}

describe('requireVerifiedSuperadmin', () => {
  const origUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const origKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
  });

  afterEach(() => {
    if (origUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = origUrl;
    if (origKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = origKey;
  });

  it('401 without a session, and asks nothing', async () => {
    setSession(null);
    const asked = setSuperadminService(['super-1']);
    expect(await requireVerifiedSuperadmin(req, res)).toMatchObject({ user: null, status: 401 });
    expect(asked).toEqual([]);
  });

  it("asks about the auth server's user, not the cookie's claimed superadmin", async () => {
    setSession(user('super-1'), user('docente-1'));
    const asked = setSuperadminService(['super-1']);
    expect(await requireVerifiedSuperadmin(req, res)).toEqual({
      user: null,
      status: 403,
      body: { error: 'Acceso denegado - solo superadministradores' },
    });
    expect(asked).toEqual([['auth_is_superadmin', 'docente-1']]);
  });

  it('allows an active superadmin, returning the verified user', async () => {
    const sa = user('super-1');
    setSession(sa);
    setSuperadminService(['super-1']);
    expect(await requireVerifiedSuperadmin(req, res)).toEqual({ user: sa, status: null, body: null });
  });

  it('holds a superadmin who must change their password, before the superadmin check', async () => {
    setSession(user('super-1'));
    const asked = setSuperadminService(['super-1'], { mustChange: true });
    expect(await requireVerifiedSuperadmin(req, res)).toMatchObject({
      user: null,
      status: 403,
      body: { code: 'PASSWORD_CHANGE_REQUIRED' },
    });
    expect(asked).toEqual([]);
  });

  it('fails closed with 503 when the forced-password flag cannot be read', async () => {
    setSession(user('super-1'));
    setSuperadminService(['super-1'], { profileError: { message: 'connection reset' } });
    expect(await requireVerifiedSuperadmin(req, res)).toMatchObject({ user: null, status: 503 });
  });

  it('fails closed with 500 when the superadmin lookup errors', async () => {
    setSession(user('super-1'));
    setSuperadminService(['super-1'], { rpcError: { message: 'connection reset' } });
    expect(await requireVerifiedSuperadmin(req, res)).toMatchObject({ user: null, status: 500 });
  });

  it('accepts a verified Bearer superadmin', async () => {
    const bearerReq = { headers: { authorization: 'Bearer some-token' } } as unknown as NextApiRequest;
    setSession(null);
    const sa = user('super-1');
    setSuperadminService(['super-1'], { bearerUser: sa });
    expect(await requireVerifiedSuperadmin(bearerReq, res)).toEqual({ user: sa, status: null, body: null });
  });
});
