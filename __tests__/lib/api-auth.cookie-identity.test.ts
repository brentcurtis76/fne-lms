// @vitest-environment node
/**
 * S1 (SM-16 security review) — the cookie branch of `getApiUser` identifies the
 * caller from the auth server, never from the `user` stored in the cookie.
 *
 * The installed auth-helpers parser accepts a legacy JSON session object and
 * hands its `user` field back untouched, so a caller holding a valid token of
 * their own can put any `user.id` beside it. The service-role role lookups in
 * `checkIsAdmin` / `checkIsAdminOrEquipoDirectivo` then answered for THAT id.
 *
 * The service-role double below answers role queries by the `user_id` it is
 * actually asked about, so every assertion here is about WHICH identity reached
 * the database, not about a pre-decided verdict.
 *
 * All identities are synthetic (Ley 21.719).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';

const { mockCreateServerSupabaseClient, mockCreateClient } = vi.hoisted(() => ({
  mockCreateServerSupabaseClient: vi.fn(),
  mockCreateClient: vi.fn(),
}));

vi.mock('@supabase/auth-helpers-nextjs', () => ({
  createServerSupabaseClient: mockCreateServerSupabaseClient,
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: mockCreateClient,
}));

import { getApiUser, checkIsAdmin, checkIsAdminOrEquipoDirectivo } from '../../lib/api-auth';

const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const ED_ID = '22222222-2222-4222-8222-222222222222';
const LOW_ID = '33333333-3333-4333-8333-333333333333';
const ED_SCHOOL_ID = 42;
const COOKIE_ACCESS_TOKEN = 'cookie-access-token';
const BEARER_TOKEN = 'bearer-access-token';

/** Active role rows, as the database would return them. */
const ACTIVE_ROLES: Record<string, Array<{ id: number; role_type: string; school_id: number | null }>> = {
  [ADMIN_ID]: [{ id: 1, role_type: 'admin', school_id: null }],
  [ED_ID]: [{ id: 2, role_type: 'equipo_directivo', school_id: ED_SCHOOL_ID }],
  [LOW_ID]: [{ id: 3, role_type: 'docente', school_id: ED_SCHOOL_ID }],
};

const mkUser = (id: string) =>
  ({
    id,
    email: `sintetico-${id.slice(0, 4)}@example.com`,
    app_metadata: {},
    user_metadata: {},
    aud: 'authenticated',
    created_at: '2026-09-25T00:00:00.000Z',
  }) as any;

/** Every `user_roles.user_id` the service-role client was asked about. */
let roleLookups: string[] = [];
let bearerGetUser: ReturnType<typeof vi.fn>;

function buildServiceClient() {
  return {
    auth: { getUser: bearerGetUser },
    from: vi.fn((table: string) => {
      const filters: Record<string, unknown> = {};
      const chain: any = {
        select: () => chain,
        order: () => chain,
        limit: () => chain,
        eq: (column: string, value: unknown) => {
          filters[column] = value;
          if (table === 'user_roles' && column === 'user_id') roleLookups.push(value as string);
          return chain;
        },
        then: (resolve: (v: unknown) => void) => {
          const rows =
            table === 'user_roles'
              ? (ACTIVE_ROLES[filters.user_id as string] ?? []).filter(
                  (r) => filters.role_type === undefined || r.role_type === filters.role_type,
                )
              : [];
          resolve({ data: rows, error: null });
        },
      };
      return chain;
    }),
  };
}

/**
 * The cookie client: `getSession` returns whatever the cookie says (including a
 * forged `user`), `getUser` is the auth server's answer for the cookie's token.
 */
function setCookie(
  cookieUserId: string | null,
  verified: { user?: any; error?: unknown; throws?: unknown },
) {
  const getSession = vi.fn().mockResolvedValue({
    data: {
      session: cookieUserId
        ? {
            access_token: COOKIE_ACCESS_TOKEN,
            refresh_token: 'cookie-refresh-token',
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            user: mkUser(cookieUserId),
          }
        : null,
    },
    error: null,
  });
  const getUser = vi.fn(async () => {
    if (verified.throws) throw verified.throws;
    return { data: { user: verified.user ?? null }, error: verified.error ?? null };
  });
  mockCreateServerSupabaseClient.mockReturnValue({ auth: { getSession, getUser } });
  return { getSession, getUser };
}

const cookieReq = () => ({ headers: {} }) as unknown as NextApiRequest;
const res = {} as NextApiResponse;

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

describe('getApiUser cookie branch — provider-verified identity', () => {
  const origUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const origKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
    roleLookups = [];
    bearerGetUser = vi.fn();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
    mockCreateClient.mockImplementation(() => buildServiceClient());
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    restoreEnv('NEXT_PUBLIC_SUPABASE_URL', origUrl);
    restoreEnv('SUPABASE_SERVICE_ROLE_KEY', origKey);
    vi.restoreAllMocks();
  });

  describe('D2 — real callers keep their current role and school rules', () => {
    it('a real admin cookie is authorized through the verified id', async () => {
      const { getUser } = setCookie(ADMIN_ID, { user: mkUser(ADMIN_ID) });

      const admin = await checkIsAdmin(cookieReq(), res);
      const either = await checkIsAdminOrEquipoDirectivo(cookieReq(), res);

      expect(getUser).toHaveBeenCalledWith(COOKIE_ACCESS_TOKEN);
      expect(admin).toMatchObject({ isAdmin: true, error: null });
      expect(admin.user?.id).toBe(ADMIN_ID);
      expect(either).toMatchObject({ isAuthorized: true, role: 'admin', schoolId: null, error: null });
      expect(new Set(roleLookups)).toEqual(new Set([ADMIN_ID]));
    });

    it('a real equipo_directivo cookie keeps its school scope', async () => {
      setCookie(ED_ID, { user: mkUser(ED_ID) });

      const result = await checkIsAdminOrEquipoDirectivo(cookieReq(), res);

      expect(result).toMatchObject({
        isAuthorized: true,
        role: 'equipo_directivo',
        schoolId: ED_SCHOOL_ID,
        error: null,
      });
      expect(result.user?.id).toBe(ED_ID);
    });

    it('an ordinary low-role cookie is denied', async () => {
      setCookie(LOW_ID, { user: mkUser(LOW_ID) });

      const admin = await checkIsAdmin(cookieReq(), res);
      const either = await checkIsAdminOrEquipoDirectivo(cookieReq(), res);

      expect(admin.isAdmin).toBe(false);
      expect(either).toMatchObject({ isAuthorized: false, role: null, schoolId: null });
      expect(new Set(roleLookups)).toEqual(new Set([LOW_ID]));
    });
  });

  describe('D1 at the helper — a forged cookie user is ignored', () => {
    it.each([
      ['admin', ADMIN_ID],
      ['equipo_directivo', ED_ID],
    ])('a low-role token beside a cookie user naming a %s is denied', async (_label, forgedId) => {
      setCookie(forgedId, { user: mkUser(LOW_ID) });

      const apiUser = await getApiUser(cookieReq(), res);
      const admin = await checkIsAdmin(cookieReq(), res);
      const either = await checkIsAdminOrEquipoDirectivo(cookieReq(), res);

      expect(apiUser.user?.id).toBe(LOW_ID);
      expect(admin.isAdmin).toBe(false);
      expect(either).toMatchObject({ isAuthorized: false, role: null, schoolId: null });
      expect(either.user?.id).toBe(LOW_ID);
      // The forged id never reached a role lookup.
      expect(roleLookups).not.toContain(forgedId);
    });
  });

  describe('D3 — verification failure fails closed, with no cookie-user fallback', () => {
    it.each([
      ['an invalid token', { message: 'invalid JWT: unable to parse or verify signature', status: 403 }],
      ['an expired token', { message: 'token is expired', status: 403 }],
      ['a revoked session', { message: 'Session from session_id claim in JWT does not exist', status: 403 }],
      ['a provider outage', { message: 'upstream request timeout', status: 504 }],
    ])('%s: denied before any service-role client exists', async (_label, providerError) => {
      setCookie(ADMIN_ID, { error: providerError });

      const apiUser = await getApiUser(cookieReq(), res);
      const admin = await checkIsAdmin(cookieReq(), res);
      const either = await checkIsAdminOrEquipoDirectivo(cookieReq(), res);

      expect(apiUser).toEqual({ user: null, error: providerError });
      expect(admin).toMatchObject({ isAdmin: false, user: null });
      expect(either).toMatchObject({ isAuthorized: false, role: null, schoolId: null, user: null });
      expect(mockCreateClient).not.toHaveBeenCalled();
      expect(roleLookups).toEqual([]);
    });

    it('a provider answer with no user and no error is denied', async () => {
      setCookie(ADMIN_ID, {});

      const apiUser = await getApiUser(cookieReq(), res);
      const either = await checkIsAdminOrEquipoDirectivo(cookieReq(), res);

      expect(apiUser.user).toBeNull();
      expect(apiUser.error).toBeInstanceOf(Error);
      expect(either).toMatchObject({ isAuthorized: false, user: null });
      expect(mockCreateClient).not.toHaveBeenCalled();
    });

    it('a provider lookup that throws is denied', async () => {
      setCookie(ADMIN_ID, { throws: new Error('fetch failed') });

      const apiUser = await getApiUser(cookieReq(), res);
      const admin = await checkIsAdmin(cookieReq(), res);

      expect(apiUser.user).toBeNull();
      expect(apiUser.error?.message).toBe('fetch failed');
      expect(admin).toMatchObject({ isAdmin: false, user: null });
      expect(mockCreateClient).not.toHaveBeenCalled();
    });

    it('a session read error is denied without asking the provider', async () => {
      const sessionError = new Error('cookie unreadable');
      const getUser = vi.fn();
      mockCreateServerSupabaseClient.mockReturnValue({
        auth: {
          getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: sessionError }),
          getUser,
        },
      });

      const apiUser = await getApiUser(cookieReq(), res);

      expect(apiUser).toEqual({ user: null, error: sessionError });
      expect(getUser).not.toHaveBeenCalled();
    });

    it('no cookie session is denied without asking the provider', async () => {
      const { getUser } = setCookie(null, { user: mkUser(ADMIN_ID) });

      const apiUser = await getApiUser(cookieReq(), res);

      expect(apiUser.user).toBeNull();
      expect(apiUser.error?.message).toBe('No active session');
      expect(getUser).not.toHaveBeenCalled();
    });
  });

  describe('Bearer branch is unchanged', () => {
    it('verifies the header token on the service client and never reads the cookie', async () => {
      bearerGetUser.mockResolvedValue({ data: { user: mkUser(ADMIN_ID) }, error: null });
      const req = { headers: { authorization: `Bearer ${BEARER_TOKEN}` } } as unknown as NextApiRequest;

      const result = await checkIsAdminOrEquipoDirectivo(req, res);

      expect(bearerGetUser).toHaveBeenCalledWith(BEARER_TOKEN);
      expect(mockCreateServerSupabaseClient).not.toHaveBeenCalled();
      expect(result).toMatchObject({ isAuthorized: true, role: 'admin' });
    });
  });
});
