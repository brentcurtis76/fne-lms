// @vitest-environment node
/**
 * SM-B015 batch B1 — admin privilege routes must take the caller's identity
 * from the auth server, never from the session cookie.
 *
 * auth-helpers accepts a legacy JSON session cookie as-is, so `getSession()`
 * returns whatever `user` the cookie claims next to a perfectly valid access
 * token. Before this fix these routes read `session.user.id`: a plain user
 * with their own token could name a superadmin's or admin's id in the cookie
 * and rewrite role permissions, delete test runs, or assign schools to
 * networks through the service role.
 *
 * Only the external clients are faked (auth-helpers and supabase-js); the
 * real lib/api-auth helpers run. The cookie always claims VICTIM, a
 * privileged account; the auth server verifies the token as someone else.
 *
 * All ids are synthetic (Ley 21.719 — no real PII).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';

const VICTIM = 'victim-superadmin-and-admin';
const ATTACKER = 'attacker-plain-user';
const SUPER = 'verified-superadmin';
const ADMIN = 'verified-admin';

const SUPERADMINS = new Set([VICTIM, SUPER]);
const ADMINS = new Set([VICTIM, ADMIN]);

type Op = [string, ...unknown[]];
const dataLog: Array<{ table: string; ops: Op[] }> = [];
const lookups: { superadmin: unknown[]; adminRole: unknown[] } = { superadmin: [], adminRole: [] };
let verifiedUser: { id: string } | null = null;

/** The cookie/user-JWT client (also the networks routes' data client). */
function recordingClient() {
  return {
    auth: {
      getSession: vi.fn(async () => ({
        data: { session: { user: { id: VICTIM }, access_token: 'attacker-own-valid-token' } },
        error: null,
      })),
      getUser: vi.fn(async () =>
        verifiedUser
          ? { data: { user: verifiedUser }, error: null }
          : { data: { user: null }, error: { message: 'invalid token' } }
      ),
    },
    from: vi.fn((table: string) => {
      const entry = { table, ops: [] as Op[] };
      dataLog.push(entry);
      const chain: any = new Proxy(
        {},
        {
          get(_t, prop: string) {
            if (prop === 'then') {
              const rows =
                table === 'schools'
                  ? [{ id: 1, name: 'Colegio' }]
                  : table === 'role_permissions' && !entry.ops.some(([op]) => op === 'delete')
                    ? [{ id: 'ov-1', role_type: 'docente', permission_key: 'k', granted: true }]
                    : [];
              return (resolve: (v: unknown) => void) => resolve({ data: rows, error: null });
            }
            if (prop === 'single' || prop === 'maybeSingle') {
              return async () => {
                const wrote = entry.ops.some(([op]) => op === 'insert' || op === 'upsert');
                if (table === 'redes_de_colegios') return { data: { id: 'net-1', nombre: 'Red' }, error: null };
                if (table === 'schools') return { data: { id: 1, name: 'Colegio' }, error: null };
                if (table === 'role_permissions' && wrote) return { data: { id: 'ov-1' }, error: null };
                if (table === 'test_mode_state') {
                  // The run belongs to whoever the auth server verified.
                  return { data: { enabled: true, test_run_id: 'run-1', expires_at: 'x', user_id: verifiedUser?.id ?? null }, error: null };
                }
                return { data: null, error: null };
              };
            }
            return (...args: unknown[]) => {
              entry.ops.push([prop, ...args]);
              return chain;
            };
          },
        }
      );
      return chain;
    }),
  };
}

vi.mock('@supabase/auth-helpers-nextjs', () => ({
  createServerSupabaseClient: vi.fn(() => recordingClient()),
}));

/** The service-role client the helpers use for the privilege decision. */
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: null }, error: { message: 'no bearer' } })) },
    rpc: vi.fn(async (fn: string, args: { check_user_id: string }) => {
      if (fn !== 'auth_is_superadmin') throw new Error(`unexpected rpc ${fn}`);
      lookups.superadmin.push(args.check_user_id);
      return { data: SUPERADMINS.has(args.check_user_id), error: null };
    }),
    from: vi.fn((table: string) => {
      const q: any = { userId: undefined as unknown, roles: [] as string[] };
      const chain: any = {
        select: () => chain,
        eq: (col: string, val: unknown) => {
          if (col === 'user_id' || col === 'id') q.userId = val;
          return chain;
        },
        in: (_c: string, v: string[]) => ((q.roles = v), chain),
        maybeSingle: async () => ({ data: { must_change_password: false }, error: null }),
        limit: async () => {
          lookups.adminRole.push(q.userId);
          const hit = table === 'user_roles' && q.roles.includes('admin') && ADMINS.has(q.userId as string);
          return { data: hit ? [{ role_type: 'admin' }] : [], error: null };
        },
      };
      return chain;
    }),
  })),
}));

import overlay from '../../../pages/api/admin/roles/permissions/overlay';
import overlayBackup from '../../../pages/api/admin/roles/permissions/overlay-backup';
import cleanup from '../../../pages/api/admin/test-runs/cleanup';
import networkSchools from '../../../pages/api/admin/networks/schools';
import availableSchools from '../../../pages/api/admin/networks/available-schools';

type Handler = (req: NextApiRequest, res: NextApiResponse) => Promise<unknown>;

async function call(handler: Handler, method: string, body: unknown = {}) {
  const res: any = { statusCode: 0, body: undefined };
  res.status = (code: number) => ((res.statusCode = code), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.setHeader = () => res;
  await handler({ method, query: {}, headers: {}, cookies: {}, body } as unknown as NextApiRequest, res);
  return res;
}

const OVERLAY_BODY = { role_type: 'docente', permission_key: 'k', granted: true, reason: 'r' };

const SUPERADMIN_ROUTES: Array<[string, Handler, string, unknown]> = [
  ['overlay', overlay, 'POST', OVERLAY_BODY],
  ['overlay-backup', overlayBackup, 'POST', OVERLAY_BODY],
  ['test-runs/cleanup', cleanup, 'POST', { test_run_id: 'run-1', confirm: true }],
];
const ADMIN_ROUTES: Array<[string, Handler, string, unknown]> = [
  ['networks/schools GET', networkSchools, 'GET', {}],
  ['networks/schools POST', networkSchools, 'POST', { networkId: 'net-1', schoolId: 1 }],
  ['networks/schools PUT', networkSchools, 'PUT', { networkId: 'net-1', schoolIds: [1] }],
  ['networks/schools DELETE', networkSchools, 'DELETE', { networkId: 'net-1', schoolId: 1 }],
  ['networks/available-schools', availableSchools, 'GET', {}],
];

const envKeys = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'FEATURE_SUPERADMIN_RBAC', 'RBAC_DEV_MOCK'] as const;
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of envKeys) savedEnv[k] = process.env[k];
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:1';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
  process.env.FEATURE_SUPERADMIN_RBAC = 'true';
  delete process.env.RBAC_DEV_MOCK;
  dataLog.length = 0;
  lookups.superadmin.length = 0;
  lookups.adminRole.length = 0;
  verifiedUser = null;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  for (const k of envKeys) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  vi.restoreAllMocks();
});

const touchedIds = () =>
  JSON.stringify(dataLog.map((d) => d.ops));

describe('a cookie naming a privileged id does not lend its privilege', () => {
  it.each(SUPERADMIN_ROUTES)('%s: plain verified caller → 403, nothing read or written', async (_n, handler, method, body) => {
    verifiedUser = { id: ATTACKER };
    const res = await call(handler, method, body);
    expect(res.statusCode).toBe(403);
    expect(lookups.superadmin).toEqual([ATTACKER]);
    expect(dataLog).toEqual([]);
  });

  it.each(ADMIN_ROUTES)('%s: plain verified caller → 403, nothing read or written', async (_n, handler, method, body) => {
    verifiedUser = { id: ATTACKER };
    const res = await call(handler, method, body);
    expect(res.statusCode).toBe(403);
    expect(lookups.adminRole).toEqual([ATTACKER]);
    expect(dataLog).toEqual([]);
  });

  it.each([...SUPERADMIN_ROUTES, ...ADMIN_ROUTES])('%s: token the auth server rejects → 401, no lookups', async (_n, handler, method, body) => {
    verifiedUser = null;
    const res = await call(handler, method, body);
    expect(res.statusCode).toBe(401);
    expect(lookups.superadmin).toEqual([]);
    expect(lookups.adminRole).toEqual([]);
    expect(dataLog).toEqual([]);
  });
});

describe('a verified privileged caller acts as themselves, not as the cookie user', () => {
  it.each(SUPERADMIN_ROUTES)('%s', async (_n, handler, method, body) => {
    verifiedUser = { id: SUPER };
    const res = await call(handler, method, body);
    expect(res.statusCode).toBe(200);
    expect(lookups.superadmin).toEqual([SUPER]);
    expect(touchedIds()).toContain(SUPER);
    expect(touchedIds()).not.toContain(VICTIM);
  });

  it('overlay records the verified superadmin as the creator', async () => {
    verifiedUser = { id: SUPER };
    await call(overlay, 'POST', OVERLAY_BODY);
    const inserts = dataLog.filter((d) => d.table === 'role_permissions').flatMap((d) => d.ops.filter(([op]) => op === 'insert'));
    expect(inserts).toHaveLength(1);
    expect(inserts[0][1]).toMatchObject({ created_by: SUPER });
  });

  it.each([
    ['POST', { networkId: 'net-1', schoolId: 1 }],
    ['PUT', { networkId: 'net-1', schoolIds: [1] }],
  ])('networks/schools %s records the verified admin as the assigner', async (method, body) => {
    verifiedUser = { id: ADMIN };
    await call(networkSchools, method, body);
    expect(lookups.adminRole).toEqual([ADMIN]);
    const inserts = dataLog.filter((d) => d.table === 'red_escuelas').flatMap((d) => d.ops.filter(([op]) => op === 'insert'));
    expect(inserts.length).toBeGreaterThan(0);
    expect(JSON.stringify(inserts)).toContain(ADMIN);
    expect(touchedIds()).not.toContain(VICTIM);
  });
});
