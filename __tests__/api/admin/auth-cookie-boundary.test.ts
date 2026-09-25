// @vitest-environment node
/**
 * S1 (SM-16 security review), through the real privileged routes.
 *
 * `reset-password` and `assign-role` authorize with
 * `checkIsAdminOrEquipoDirectivo`, and `course-assignments` applies the Bearer
 * forced-password gate with `getApiUser`. Nothing in `lib/api-auth` or
 * `utils/roleUtils` is mocked: only the two Supabase client factories are.
 *
 *   - the cookie client returns whatever the cookie claims from `getSession`
 *     (a forged legacy JSON cookie can claim any `user.id`), while `getUser` is
 *     the auth server's answer for the token that cookie carries;
 *   - the service-role client answers role and profile reads by the id it is
 *     asked about, and records every write, admin-auth call and RPC it receives.
 *
 * "Zero privileged mutation" is therefore an assertion on the recorded writes.
 * All identities are synthetic (Ley 21.719).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMocks } from 'node-mocks-http';

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

// The auth-tier limiter is not under test and would 429 later cases.
vi.mock('../../../lib/rateLimit', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, rateLimit: () => async () => true };
});

import resetPassword from '../../../pages/api/admin/reset-password';
import assignRole from '../../../pages/api/admin/assign-role';
import courseAssignments from '../../../pages/api/admin/course-assignments';

const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const ED_ID = '22222222-2222-4222-8222-222222222222';
const LOW_ID = '33333333-3333-4333-8333-333333333333';
const FLAGGED_ID = '44444444-4444-4444-8444-444444444444';
const TARGET_ID = '55555555-5555-4555-8555-555555555555';
const SCHOOL_ID = 42;
const TEMP_PASSWORD = 'Temporal-Sintetica-2026';

type RoleRow = { id: number; role_type: string; school_id: number | null; is_active: true };
const ACTIVE_ROLES: Record<string, RoleRow[]> = {
  [ADMIN_ID]: [{ id: 1, role_type: 'admin', school_id: null, is_active: true }],
  [ED_ID]: [{ id: 2, role_type: 'equipo_directivo', school_id: SCHOOL_ID, is_active: true }],
  [LOW_ID]: [{ id: 3, role_type: 'docente', school_id: SCHOOL_ID, is_active: true }],
  [FLAGGED_ID]: [{ id: 4, role_type: 'docente', school_id: SCHOOL_ID, is_active: true }],
};
const MUST_CHANGE_PASSWORD = new Set([FLAGGED_ID]);

const mkUser = (id: string) => ({
  id,
  email: `sintetico-${id.slice(0, 4)}@example.com`,
  app_metadata: {},
  user_metadata: {},
  aud: 'authenticated',
  created_at: '2026-09-25T00:00:00.000Z',
});

/** Everything the service-role client was asked to change. */
let mutations: string[] = [];
let bearerTokens: Record<string, string> = {};

function buildServiceClient() {
  const record = (what: string) => vi.fn(async () => {
    mutations.push(what);
    return { data: null, error: null };
  });
  return {
    auth: {
      getUser: vi.fn(async (token: string) => {
        const id = bearerTokens[token];
        return id
          ? { data: { user: mkUser(id) }, error: null }
          : { data: { user: null }, error: { message: 'invalid JWT', status: 403 } };
      }),
      admin: {
        updateUserById: record('auth.admin.updateUserById'),
        deleteUser: record('auth.admin.deleteUser'),
        signOut: record('auth.admin.signOut'),
      },
    },
    rpc: record('rpc'),
    from: vi.fn((table: string) => {
      const filters: Record<string, unknown> = {};
      const rows = () => {
        if (table === 'user_roles') {
          return (ACTIVE_ROLES[filters.user_id as string] ?? []).filter(
            (r) => filters.role_type === undefined || r.role_type === filters.role_type,
          );
        }
        if (table === 'profiles') {
          const id = filters.id as string;
          return [{ id, must_change_password: MUST_CHANGE_PASSWORD.has(id), school_id: SCHOOL_ID }];
        }
        return [];
      };
      const chain: any = {
        select: () => chain,
        order: () => chain,
        limit: () => chain,
        in: () => chain,
        eq: (column: string, value: unknown) => {
          filters[column] = value;
          return chain;
        },
        maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
        single: async () => ({ data: rows()[0] ?? null, error: null }),
        then: (resolve: (v: unknown) => void) => resolve({ data: rows(), error: null }),
      };
      for (const write of ['insert', 'update', 'upsert', 'delete']) {
        chain[write] = () => {
          mutations.push(`${table}.${write}`);
          return chain;
        };
      }
      return chain;
    }),
  };
}

/** A cookie whose stored user is `cookieUserId`; the provider says `verified`. */
function setCookie(cookieUserId: string, verified: { userId?: string; error?: unknown }) {
  const getSession = vi.fn().mockResolvedValue({
    data: {
      session: {
        access_token: 'cookie-access-token',
        refresh_token: 'cookie-refresh-token',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: mkUser(cookieUserId),
      },
    },
    error: null,
  });
  const getUser = vi.fn(async () => ({
    data: { user: verified.userId ? mkUser(verified.userId) : null },
    error: verified.error ?? null,
  }));
  mockCreateServerSupabaseClient.mockReturnValue({ auth: { getSession, getUser } });
  return { getSession, getUser };
}

async function call(
  handler: (req: any, res: any) => Promise<unknown>,
  opts: { method?: string; body?: unknown; bearer?: string } = {},
) {
  const { req, res } = createMocks({
    method: (opts.method ?? 'POST') as any,
    headers: opts.bearer ? { authorization: `Bearer ${opts.bearer}` } : {},
    body: opts.body as any,
  });
  await handler(req, res);
  return { status: res._getStatusCode(), body: res._getJSONData() };
}

const resetBody = { userId: TARGET_ID, temporaryPassword: TEMP_PASSWORD };
const escalateBody = { targetUserId: LOW_ID, roleType: 'admin' };

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

describe('privileged API routes — cookie identity boundary', () => {
  const origUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const origKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
    mutations = [];
    bearerTokens = {};
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
    mockCreateClient.mockImplementation(() => buildServiceClient());
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    restoreEnv('NEXT_PUBLIC_SUPABASE_URL', origUrl);
    restoreEnv('SUPABASE_SERVICE_ROLE_KEY', origKey);
    vi.restoreAllMocks();
  });

  describe('D1 — a low-role token with a cookie naming a privileged user', () => {
    it.each([
      ['admin', ADMIN_ID],
      ['equipo_directivo', ED_ID],
    ])('reset-password denies the forged %s and changes nothing', async (_label, forgedId) => {
      setCookie(forgedId, { userId: LOW_ID });

      const { status } = await call(resetPassword, { body: resetBody });

      expect(status).toBe(403);
      expect(mutations).toEqual([]);
    });

    it.each([
      ['admin', ADMIN_ID],
      ['equipo_directivo', ED_ID],
    ])('assign-role denies the forged %s and changes nothing', async (_label, forgedId) => {
      setCookie(forgedId, { userId: LOW_ID });

      const { status } = await call(assignRole, { body: escalateBody });

      expect(status).toBe(403);
      expect(mutations).toEqual([]);
    });
  });

  describe('D2 at the route — a real admin cookie still gets through', () => {
    it('reset-password passes authorization and reaches body validation', async () => {
      setCookie(ADMIN_ID, { userId: ADMIN_ID });

      const { status, body } = await call(resetPassword, { body: { userId: TARGET_ID } });

      expect(status).toBe(400);
      expect(body.error).toMatch(/temporaryPassword/);
    });

    it('assign-role passes authorization and reaches role validation', async () => {
      setCookie(ADMIN_ID, { userId: ADMIN_ID });

      const { status, body } = await call(assignRole, {
        body: { targetUserId: TARGET_ID, roleType: 'not-a-role' },
      });

      expect(status).toBe(400);
      expect(body.error).toBe('Invalid role type');
    });
  });

  describe('D3 — a rejected cookie token fails closed before any service-role client', () => {
    it.each([
      ['invalid', { message: 'invalid JWT: unable to parse or verify signature', status: 403 }],
      ['expired', { message: 'token is expired', status: 403 }],
      ['provider error', { message: 'upstream request timeout', status: 504 }],
    ])('%s token: both routes answer 401 and no service-role client is built', async (_l, providerError) => {
      setCookie(ADMIN_ID, { error: providerError });

      const reset = await call(resetPassword, { body: resetBody });
      const assign = await call(assignRole, { body: escalateBody });

      expect(reset.status).toBe(401);
      expect(assign.status).toBe(401);
      expect(mockCreateClient).not.toHaveBeenCalled();
      expect(mutations).toEqual([]);
    });
  });

  describe('D4 — Bearer callers and the forced-password gate are unchanged', () => {
    it('a Bearer admin is verified from the header and never reads the cookie', async () => {
      bearerTokens = { 'admin-token': ADMIN_ID };

      const { status } = await call(resetPassword, { body: { userId: TARGET_ID }, bearer: 'admin-token' });

      expect(status).toBe(400);
      expect(mockCreateServerSupabaseClient).not.toHaveBeenCalled();
    });

    it('a Bearer low-role caller is denied and an unknown Bearer token is rejected', async () => {
      bearerTokens = { 'low-token': LOW_ID };

      const low = await call(assignRole, { body: escalateBody, bearer: 'low-token' });
      const unknown = await call(assignRole, { body: escalateBody, bearer: 'forged-token' });

      expect(low.status).toBe(403);
      expect(unknown.status).toBe(401);
      expect(mutations).toEqual([]);
    });

    it('a flagged Bearer caller gets the forced-change response', async () => {
      bearerTokens = { 'flagged-token': FLAGGED_ID };

      const { status, body } = await call(courseAssignments, { method: 'GET', bearer: 'flagged-token' });

      expect(status).toBe(403);
      expect(body.code).toBe('PASSWORD_CHANGE_REQUIRED');
    });

    it('a flagged cookie caller naming an unflagged admin still gets the forced-change response', async () => {
      setCookie(ADMIN_ID, { userId: FLAGGED_ID });

      const { status, body } = await call(courseAssignments, { method: 'GET' });

      expect(status).toBe(403);
      expect(body.code).toBe('PASSWORD_CHANGE_REQUIRED');
      expect(mutations).toEqual([]);
    });

    it('an unflagged real admin cookie passes the gate and the admin check', async () => {
      setCookie(ADMIN_ID, { userId: ADMIN_ID });

      const { status } = await call(courseAssignments, { method: 'PUT' });

      expect(status).toBe(405);
    });
  });
});
