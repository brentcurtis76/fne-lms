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
import { format } from 'node:util';
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

import { getApiUser, checkIsAdmin, checkIsAdminOrEquipoDirectivo, loggableError } from '../../lib/api-auth';

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

  describe('R4-F1 — getApiUser logs carry no identity, e-mail or raw error', () => {
    // Sentinels in every place an identity or an error could reach a log line.
    const SENTINEL = `SINTETICO-RAW ${LOW_ID} alumno@qa.local.test`;
    const logged = () =>
      [console.log, console.error].flatMap((fn) => (fn as unknown as ReturnType<typeof vi.fn>).mock.calls.map((args) => format(...args)));
    const bearerReq = () => ({ headers: { authorization: `Bearer ${BEARER_TOKEN}` } }) as unknown as NextApiRequest;

    afterEach(() => {
      for (const line of logged()) {
        expect(line).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|@|sintetico|juan|perez|maria|m4ria|ju4na/i);
      }
    });

    it('Bearer success keeps the verified identity and logs only its label', async () => {
      bearerGetUser.mockResolvedValue({ data: { user: mkUser(LOW_ID) }, error: null });

      expect((await getApiUser(bearerReq(), res)).user?.id).toBe(LOW_ID);
      expect(logged()).toEqual(['[API Auth] User authenticated via Bearer token']);
    });

    it('cookie success keeps the verified identity and logs a count of the user-written metadata roles', async () => {
      setCookie(ADMIN_ID, { user: { ...mkUser(LOW_ID), user_metadata: { role: 'SINTETICO-ROL', roles: ['docente'] } } });

      expect((await getApiUser(cookieReq(), res)).user?.id).toBe(LOW_ID);
      expect(logged()).toEqual(['[API Auth] User authenticated via session: { metadataRoles: 2 }']);
    });

    it.each([
      ['a rejected Bearer token', () => bearerGetUser.mockResolvedValue({ data: { user: null }, error: { code: 'bad_jwt', status: 403, message: SENTINEL } }), bearerReq, "[API Auth] Bearer token validation failed: { code: 'bad_jwt', status: 403 }"],
      ['an expired cookie token', () => setCookie(LOW_ID, { error: { code: 'session_expired', status: 403, message: SENTINEL } }), cookieReq, "[API Auth] Cookie session verification failed: { code: 'session_expired', status: 403 }"],
      ['a rejected Bearer token whose code is name-shaped', () => bearerGetUser.mockResolvedValue({ data: { user: null }, error: { code: 'alumno_juan_perez', status: 403, message: SENTINEL } }), bearerReq, '[API Auth] Bearer token validation failed: { status: 403 }'],
      ['a cookie token whose code is name-shaped', () => setCookie(LOW_ID, { error: { code: 'student_name_maria', status: 401, message: SENTINEL } }), cookieReq, '[API Auth] Cookie session verification failed: { status: 401 }'],
      ['a rejected Bearer token whose code is a name with a digit', () => bearerGetUser.mockResolvedValue({ data: { user: null }, error: { code: 'M4RIA', status: 403, message: SENTINEL } }), bearerReq, '[API Auth] Bearer token validation failed: { status: 403 }'],
      ['a cookie token whose code is a name with a digit', () => setCookie(LOW_ID, { error: { code: 'JU4NA', status: 401, message: SENTINEL } }), cookieReq, '[API Auth] Cookie session verification failed: { status: 401 }'],
      ['a provider error without a code', () => setCookie(LOW_ID, { error: { message: SENTINEL, status: 504 } }), cookieReq, '[API Auth] Cookie session verification failed: { status: 504 }'],
      ['an unreadable cookie session', () => mockCreateServerSupabaseClient.mockReturnValue({ auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: new Error(SENTINEL) }), getUser: vi.fn() } }), cookieReq, '[API Auth] Session error: {}'],
      ['a provider lookup that throws', () => setCookie(LOW_ID, { throws: new Error(SENTINEL) }), cookieReq, '[API Auth] Unexpected error: {}'],
      ['a cookie client that cannot be built', () => mockCreateServerSupabaseClient.mockImplementation(() => { throw new Error(SENTINEL); }), cookieReq, '[API Auth] Failed to create Supabase client: {}'],
      ['a service client that cannot be built', () => mockCreateClient.mockImplementation(() => { throw new Error(SENTINEL); }), bearerReq, '[API Auth] Failed to create service role client: {}'],
    ])('%s is denied and logged by label, code and status only', async (_label, arrange, req, line) => {
      arrange();

      const result = await getApiUser(req(), res);

      expect(result.user).toBeNull();
      expect(result.error).toBeTruthy();
      expect(logged()).toContain(line);
    });
  });

  describe('R5-F2 — loggableError keeps only vetted auth, SQLSTATE and PostgREST codes', () => {
    it.each(['alumno_juan_perez', 'student_name_maria', 'juan_perez', 'maria', 'MARIA', 'PEREZ', 'PGRST', 'bad_jwt_juan', ''])(
      'drops the unvetted code %j and keeps the status',
      (code) => {
        expect(loggableError({ code, status: 403, message: 'SINTETICO-RAW' })).toEqual({ status: 403 });
      },
    );

    it.each(['bad_jwt', 'session_expired', 'session_not_found', 'refresh_token_not_found', 'user_not_found', '22023', '23505', '42501', 'XX000', 'P0001', 'PGRST116'])(
      'keeps the vetted code %s',
      (code) => {
        expect(loggableError({ code, message: 'SINTETICO-RAW', details: LOW_ID })).toEqual({ code });
      },
    );

    it('keeps only an integer HTTP status', () => {
      expect([504, 99, 600, 4.5, '403', null].map((status) => loggableError({ status }))).toEqual([{ status: 504 }, {}, {}, {}, {}, {}]);
      expect(loggableError(null)).toEqual({});
      expect(loggableError(new Error('SINTETICO-RAW'))).toEqual({});
    });
  });

  describe('R6-F1 — loggableError keeps a listed code only, never text that merely looks like one', () => {
    // The first eight fit the r6 shape rule (five uppercase letters or digits, one a digit, or PGRST and three digits).
    it.each(['M4RIA', 'JU4NA', 'P3DR0', '4LUMN', 'R0SA1', '12345', 'A1B2C', 'PGRST999', 'xx000', '23505 ', 'PGRST116 '])(
      'drops the unlisted code %j and keeps the status',
      (code) => {
        expect(loggableError({ code, status: 500, message: 'SINTETICO-RAW' })).toEqual({ status: 500 });
      },
    );

    it.each(['22023', '23502', '23503', '23505', '23514', '40001', '40P01', '42501', '57014', 'P0001', 'XX000', 'PGRST116', 'PGRST202', 'PGRST301'])(
      'keeps the listed database code %s',
      (code) => {
        expect(loggableError({ code, status: 500, message: 'SINTETICO-RAW', details: LOW_ID })).toEqual({ code, status: 500 });
      },
    );
  });
});
