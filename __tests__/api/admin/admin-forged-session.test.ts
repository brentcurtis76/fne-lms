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
/** Accounts flagged to change their password before doing anything else. */
const MUST_CHANGE = new Set<string>();

/** The cookie's access token is the caller's own; only the auth server knows whose. */
const COOKIE_TOKEN = 'caller-own-valid-token';
const BEARER_TOKEN = 'caller-bearer-token';

type Op = [string, ...unknown[]];
const dataLog: Array<{ table: string; ops: Op[] }> = [];
const lookups: { superadmin: unknown[]; adminRole: unknown[]; profile: unknown[] } = {
  superadmin: [],
  adminRole: [],
  profile: [],
};
let verifiedUser: { id: string } | null = null;
/** False for a Bearer-only request: no session cookie at all. */
let cookiePresent = true;
const bearerTokensSeen: unknown[] = [];
/** test_mode_state rows by user_id (the overlay routes create and read them). */
const testModes = new Map<string, Record<string, unknown>>();

const eqValue = (ops: Op[], col: string) => ops.find(([op, c]) => op === 'eq' && c === col)?.[2];

/** Active `user_roles` rows, as the database would answer a filtered lookup. */
function roleRows(ops: Op[]) {
  const userId = eqValue(ops, 'user_id') as string;
  const roleType = eqValue(ops, 'role_type');
  const inRoles = ops.find(([op]) => op === 'in')?.[2] as string[] | undefined;
  const wantsAdmin = roleType === 'admin' || (inRoles?.includes('admin') ?? false);
  return wantsAdmin && ADMINS.has(userId) ? [{ id: `role-${userId}`, role_type: 'admin' }] : [];
}

/**
 * A recording query chain. `answer(ops, mode)` resolves it: mode is 'many'
 * when awaited, 'one' for single()/maybeSingle().
 */
function chainFor(
  table: string,
  answer: (ops: Op[], mode: 'many' | 'one') => { data: unknown; error: unknown },
  log?: Array<{ table: string; ops: Op[] }>
) {
  const entry = { table, ops: [] as Op[] };
  log?.push(entry);
  const chain: any = new Proxy(
    {},
    {
      get(_t, prop: string) {
        if (prop === 'then') {
          return (resolve: (v: unknown) => void) => resolve(answer(entry.ops, 'many'));
        }
        if (prop === 'single' || prop === 'maybeSingle') {
          return async () => answer(entry.ops, 'one');
        }
        return (...args: unknown[]) => {
          entry.ops.push([prop, ...args]);
          return chain;
        };
      },
    }
  );
  return chain;
}

/** What the cookie-bound / data client's tables hold. */
function dataAnswer(table: string, ops: Op[], mode: 'many' | 'one') {
  const has = (name: string) => ops.some(([op]) => op === name);
  if (table === 'user_roles') return { data: roleRows(ops), error: null };
  if (table === 'schools') {
    return { data: mode === 'one' ? { id: 1, name: 'Colegio' } : [{ id: 1, name: 'Colegio' }], error: null };
  }
  if (table === 'redes_de_colegios') return { data: { id: 'net-1', nombre: 'Red' }, error: null };
  if (table === 'role_permissions') {
    if (has('insert')) return { data: { id: 'ov-1' }, error: null };
    if (has('delete') || mode === 'one') return { data: null, error: null };
    return { data: [{ id: 'ov-1', role_type: 'docente', permission_key: 'k', granted: true }], error: null };
  }
  if (table === 'test_mode_state') {
    const upsert = ops.find(([op]) => op === 'upsert')?.[1] as Record<string, unknown> | undefined;
    if (upsert) {
      testModes.set(upsert.user_id as string, upsert);
      return { data: null, error: null };
    }
    if (has('update')) return { data: null, error: null };
    const byUser = eqValue(ops, 'user_id') as string | undefined;
    const byRun = eqValue(ops, 'test_run_id');
    const row = byUser
      ? testModes.get(byUser)
      : [...testModes.values()].find((r) => r.test_run_id === byRun);
    return { data: row ?? null, error: row ? null : { code: 'PGRST116' } };
  }
  return { data: mode === 'one' ? null : [], error: null };
}

/** The cookie/user-JWT client (also the networks routes' data client). */
function cookieClient() {
  return {
    auth: {
      getSession: vi.fn(async () => ({
        data: { session: cookiePresent ? { user: { id: VICTIM }, access_token: COOKIE_TOKEN } : null },
        error: null,
      })),
      getUser: vi.fn(async (token?: string) =>
        token === COOKIE_TOKEN && verifiedUser
          ? { data: { user: verifiedUser }, error: null }
          : { data: { user: null }, error: { message: 'invalid token' } }
      ),
    },
    from: vi.fn((table: string) => chainFor(table, (ops, mode) => dataAnswer(table, ops, mode), dataLog)),
  };
}

vi.mock('@supabase/auth-helpers-nextjs', () => ({
  createServerSupabaseClient: vi.fn(() => cookieClient()),
}));

/** The service-role client the helpers use for the privilege decision. */
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(async (token?: string) => {
        bearerTokensSeen.push(token);
        return token === BEARER_TOKEN && verifiedUser
          ? { data: { user: verifiedUser }, error: null }
          : { data: { user: null }, error: { message: 'invalid token' } };
      }),
    },
    rpc: vi.fn(async (fn: string, args: { check_user_id: string }) => {
      if (fn !== 'auth_is_superadmin') throw new Error(`unexpected rpc ${fn}`);
      lookups.superadmin.push(args.check_user_id);
      return { data: SUPERADMINS.has(args.check_user_id), error: null };
    }),
    from: vi.fn((table: string) =>
      chainFor(table, (ops) => {
        if (table === 'profiles') {
          const id = eqValue(ops, 'id') as string;
          lookups.profile.push(id);
          return { data: { must_change_password: MUST_CHANGE.has(id) }, error: null };
        }
        if (table === 'user_roles') {
          lookups.adminRole.push(eqValue(ops, 'user_id'));
          return { data: roleRows(ops), error: null };
        }
        if (table === 'superadmins') {
          // The pre-fix overlay read this table directly.
          const id = eqValue(ops, 'user_id') as string;
          lookups.superadmin.push(id);
          return { data: SUPERADMINS.has(id) ? { user_id: id } : null, error: null };
        }
        return { data: null, error: null };
      })
    ),
  })),
}));

import overlay from '../../../pages/api/admin/roles/permissions/overlay';
import overlayBackup from '../../../pages/api/admin/roles/permissions/overlay-backup';
import cleanup from '../../../pages/api/admin/test-runs/cleanup';
import networkSchools from '../../../pages/api/admin/networks/schools';
import availableSchools from '../../../pages/api/admin/networks/available-schools';

type Handler = (req: NextApiRequest, res: NextApiResponse) => Promise<unknown>;

async function call(handler: Handler, method: string, body: unknown = {}, headers: Record<string, string> = {}) {
  const res: any = { statusCode: 0, body: undefined };
  res.status = (code: number) => ((res.statusCode = code), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.setHeader = () => res;
  await handler({ method, query: {}, headers, cookies: {}, body } as unknown as NextApiRequest, res);
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
  lookups.profile.length = 0;
  MUST_CHANGE.clear();
  testModes.clear();
  verifiedUser = null;
  cookiePresent = true;
  bearerTokensSeen.length = 0;
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
    expect(lookups.profile).toEqual([ATTACKER]);
    expect(dataLog).toEqual([]);
  });

  it.each(ADMIN_ROUTES)('%s: plain verified caller → 403, nothing read or written', async (_n, handler, method, body) => {
    verifiedUser = { id: ATTACKER };
    const res = await call(handler, method, body);
    expect(res.statusCode).toBe(403);
    expect(lookups.adminRole).toEqual([ATTACKER]);
    expect(lookups.profile).toEqual([ATTACKER]);
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
    // cleanup needs a run to clean; the overlay routes create test mode themselves.
    if (handler === cleanup) testModes.set(SUPER, { user_id: SUPER, enabled: true, test_run_id: 'run-1' });
    const res = await call(handler, method, body);
    expect(res.statusCode).toBe(200);
    expect(lookups.superadmin).toEqual([SUPER]);
    expect(touchedIds()).toContain(SUPER);
    expect(touchedIds()).not.toContain(VICTIM);
  });

  it('overlay creates test mode for, and records as creator, the verified superadmin', async () => {
    verifiedUser = { id: SUPER };
    await call(overlay, 'POST', OVERLAY_BODY);
    expect([...testModes.keys()]).toEqual([SUPER]);
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

describe('cleanup only clears the verified caller\'s own run', () => {
  it("refuses a run that belongs to the cookie's claimed user", async () => {
    verifiedUser = { id: SUPER };
    testModes.set(VICTIM, { user_id: VICTIM, enabled: true, test_run_id: 'run-1' });
    const res = await call(cleanup, 'POST', { test_run_id: 'run-1', confirm: true });
    expect(res.statusCode).toBe(403);
    expect(dataLog.flatMap((d) => d.ops.filter(([op]) => op === 'delete' || op === 'update'))).toEqual([]);
  });
});

describe('forced password change and Bearer callers', () => {
  it.each([...SUPERADMIN_ROUTES, ...ADMIN_ROUTES])('%s: a privileged caller who must change their password is held', async (_n, handler, method, body) => {
    const id = SUPERADMIN_ROUTES.some(([, h]) => h === handler) ? SUPER : ADMIN;
    verifiedUser = { id };
    MUST_CHANGE.add(id);
    const res = await call(handler, method, body);
    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({ code: 'PASSWORD_CHANGE_REQUIRED' });
    expect(lookups.superadmin).toEqual([]);
    expect(lookups.adminRole).toEqual([]);
    expect(dataLog).toEqual([]);
  });

  const bearer = { authorization: `Bearer ${BEARER_TOKEN}` };

  it.each(ADMIN_ROUTES)('%s: a verified Bearer admin (no cookie) passes the gate', async (_n, handler, method, body) => {
    cookiePresent = false;
    verifiedUser = { id: ADMIN };
    const res = await call(handler, method, body, bearer);
    expect(res.statusCode).not.toBe(401);
    expect(res.statusCode).not.toBe(403);
    expect(bearerTokensSeen).toEqual([BEARER_TOKEN]);
    expect(lookups.adminRole).toEqual([ADMIN]);
  });

  it.each(ADMIN_ROUTES)('%s: a Bearer plain user (no cookie) is refused before any data access', async (_n, handler, method, body) => {
    cookiePresent = false;
    verifiedUser = { id: ATTACKER };
    const res = await call(handler, method, body, bearer);
    expect(res.statusCode).toBe(403);
    expect(bearerTokensSeen).toEqual([BEARER_TOKEN]);
    expect(dataLog).toEqual([]);
  });
});
