// @vitest-environment node
/**
 * SM-B015 batch B3 — reports and community routes must take the caller's
 * identity from the auth server, never from the session cookie.
 *
 * auth-helpers accepts a legacy JSON session cookie as-is, so `getSession()`
 * returns whatever `user` the cookie claims next to a valid access token.
 * These routes fed `session.user.id` into service-role lookups that pick the
 * caller's role and scope, so naming an admin's id in the cookie returned
 * every user's progress report, any user's details, any community's member
 * list, or created a workspace for any community.
 *
 * Only the external clients are faked; the real lib/api-auth helpers run.
 * The cookie always claims VICTIM, an admin; the auth server verifies the
 * token as someone else. All ids are synthetic (Ley 21.719).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';

const VICTIM = '11111111-1111-4111-8111-111111111111';
const ATTACKER = '22222222-2222-4222-8222-222222222222';
const ADMIN = '33333333-3333-4333-8333-333333333333';
const TARGET = '44444444-4444-4444-8444-444444444444';
const COMMUNITY = '55555555-5555-4555-8555-555555555555';

const LEADER = '66666666-6666-4666-8666-666666666666';
const PEER_A = '77777777-7777-4777-8777-777777777777';
const PEER_B = '88888888-8888-4888-8888-888888888888';

type RoleRow = {
  user_id: string;
  role_type: string;
  school_id: number | null;
  generation_id: string | null;
  community_id: string | null;
  is_active: boolean;
};
const row = (user_id: string, role_type: string, scope: Partial<RoleRow> = {}): RoleRow => ({
  user_id,
  role_type,
  school_id: null,
  generation_id: null,
  community_id: null,
  is_active: true,
  ...scope,
});
/** Active roles. LEADER leads school 1 / generation G-A / community C-A and also teaches in school 2 / G-B / C-B. */
const ROLE_ROWS: RoleRow[] = [
  row(VICTIM, 'admin'),
  row(ADMIN, 'admin'),
  row(LEADER, 'docente', { school_id: 2, generation_id: 'G-B', community_id: 'C-B' }),
  row(LEADER, 'equipo_directivo', { school_id: 1 }),
  row(PEER_A, 'docente', { school_id: 1, generation_id: 'G-A', community_id: 'C-A' }),
  row(PEER_B, 'docente', { school_id: 2, generation_id: 'G-B', community_id: 'C-B' }),
];
const COOKIE_TOKEN = 'caller-own-valid-token';

type Op = [string, ...unknown[]];
const serviceLog: Array<{ table: string; ops: Op[] }> = [];
let verifiedUser: { id: string } | null = null;

const eqValue = (ops: Op[], col: string) => ops.find(([op, c]) => op === 'eq' && c === col)?.[2];

/** Applies the eq / in / not-null filters a query was built with, in order, like PostgREST. */
function matchRows<T extends Record<string, unknown>>(rows: T[], ops: Op[]): T[] {
  let out = rows.filter((r) =>
    ops.every(([op, col, a, b]) => {
      if (op === 'eq') return r[col as string] === a;
      if (op === 'in') return (a as unknown[]).includes(r[col as string]);
      if (op === 'not' && a === 'is' && b === null) return r[col as string] !== null;
      return true;
    })
  );
  const limit = ops.find(([op]) => op === 'limit')?.[1] as number | undefined;
  if (limit !== undefined) out = out.slice(0, limit);
  return out;
}

/** Service-role tables, answering per queried id. */
function serviceAnswer(table: string, ops: Op[], mode: 'many' | 'one') {
  if (table === 'profiles') {
    if (ops.some(([op, col]) => op === 'in' && col === 'school_id')) {
      // Client-tenant reporting scope: everyone in the client schools.
      return { data: [TARGET, PEER_A, PEER_B, LEADER].map((id) => ({ id, school_id: 1 })), error: null };
    }
    const id = (eqValue(ops, 'id') as string) ?? null;
    // LEADER's profile points at school 2 / G-B / C-B, where they only teach.
    const scope = id === LEADER
      ? { school_id: 2, generation_id: 'G-B', community_id: 'C-B' }
      : { school_id: 1, generation_id: 'G-A', community_id: 'C-A' };
    const row = { id, first_name: 'Nombre', last_name: 'Sintético', ...scope, must_change_password: false };
    return { data: mode === 'one' ? row : [row], error: null };
  }
  if (table === 'schools' && mode === 'many' && !eqValue(ops, 'id')) {
    return { data: [{ id: 1, tenant_kind: 'client' }, { id: 2, tenant_kind: 'client' }], error: null };
  }
  if (table === 'user_roles') {
    const rows = matchRows(ROLE_ROWS, ops);
    return { data: mode === 'one' ? rows[0] ?? null : rows, error: null };
  }
  if (table === 'growth_communities') {
    const id = eqValue(ops, 'id');
    if (id === 'C-A' || id === 'C-B') {
      return { data: { id, name: 'Comunidad', generation_id: id === 'C-A' ? 'G-A' : 'G-B', school_id: id === 'C-A' ? 1 : 2 }, error: null };
    }
    return { data: mode === 'one' ? { id: COMMUNITY, name: 'Comunidad' } : [], error: null };
  }
  if (table === 'generations' && mode === 'one') {
    const id = eqValue(ops, 'id');
    return { data: { id, name: 'Generación', school_id: id === 'G-B' ? 2 : 1 }, error: null };
  }
  if (table === 'community_workspaces') {
    return ops.some(([op]) => op === 'insert')
      ? { data: { id: 'ws-1', community_id: COMMUNITY, name: 'Espacio' }, error: null }
      : { data: null, error: null };
  }
  return { data: mode === 'one' ? null : [], error: null };
}

function recordingChain(table: string, answer: (ops: Op[], mode: 'many' | 'one') => unknown, log: typeof serviceLog) {
  const entry = { table, ops: [] as Op[] };
  log.push(entry);
  const chain: any = new Proxy(
    {},
    {
      get(_t, prop: string) {
        if (prop === 'then') return (resolve: (v: unknown) => void) => resolve(answer(entry.ops, 'many'));
        if (prop === 'single' || prop === 'maybeSingle') return async () => answer(entry.ops, 'one');
        return (...args: unknown[]) => {
          entry.ops.push([prop, ...args]);
          return chain;
        };
      },
    }
  );
  return chain;
}

function cookieClient() {
  return {
    auth: {
      getSession: vi.fn(async () => ({
        data: { session: { user: { id: VICTIM }, access_token: COOKIE_TOKEN } },
        error: null,
      })),
      getUser: vi.fn(async (token?: string) =>
        token === COOKIE_TOKEN && verifiedUser
          ? { data: { user: verifiedUser }, error: null }
          : { data: { user: null }, error: { message: 'invalid token' } }
      ),
    },
    from: vi.fn(() => {
      throw new Error('these routes read through the service client only');
    }),
  };
}

vi.mock('@supabase/auth-helpers-nextjs', () => ({
  createServerSupabaseClient: vi.fn(() => cookieClient()),
  createPagesServerClient: vi.fn(() => cookieClient()),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: null }, error: { message: 'no bearer' } })) },
    rpc: vi.fn(async () => ({ data: [], error: null })),
    from: vi.fn((table: string) => recordingChain(table, (ops, mode) => serviceAnswer(table, ops, mode), serviceLog)),
  })),
}));

import detailed from '../../../pages/api/reports/detailed';
import filterOptions from '../../../pages/api/reports/filter-options';
import userDetails from '../../../pages/api/reports/user-details';
import communityMembers from '../../../pages/api/community/members';
import ensureWorkspace from '../../../pages/api/community/ensure-workspace';

type Handler = (req: NextApiRequest, res: NextApiResponse) => Promise<unknown>;

async function call(handler: Handler, method: string, query: Record<string, string> = {}, body: unknown = {}) {
  const res: any = { statusCode: 0, body: undefined };
  res.status = (code: number) => ((res.statusCode = code), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.end = () => res;
  res.setHeader = () => res;
  await handler({ method, query, headers: {}, cookies: {}, body } as unknown as NextApiRequest, res);
  return res;
}

const ROUTES: Array<[string, Handler, string, Record<string, string>, unknown]> = [
  ['reports/detailed', detailed, 'POST', {}, {}],
  ['reports/filter-options', filterOptions, 'GET', {}, {}],
  ['reports/user-details', userDetails, 'GET', { userId: TARGET }, {}],
  ['community/members', communityMembers, 'GET', { community_id: COMMUNITY }, {}],
  ['community/ensure-workspace', ensureWorkspace, 'POST', {}, { communityId: COMMUNITY }],
];

/** Every id the service client was asked about, as user_id / id filters. */
const askedIds = () =>
  serviceLog.flatMap((e) => e.ops.filter(([op, col]) => op === 'eq' && (col === 'user_id' || col === 'id')).map(([, , v]) => v));
const writes = () => serviceLog.flatMap((e) => e.ops.filter(([op]) => ['insert', 'update', 'upsert', 'delete'].includes(op)));

const savedEnv: Record<string, string | undefined> = {};
beforeEach(() => {
  for (const k of ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) savedEnv[k] = process.env[k];
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:1';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
  serviceLog.length = 0;
  verifiedUser = null;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  vi.restoreAllMocks();
});

describe("a cookie naming an admin's id does not lend the admin's access", () => {
  it.each(ROUTES)('%s: a plain verified caller is refused and nothing is written', async (_n, handler, method, query, body) => {
    verifiedUser = { id: ATTACKER };
    const res = await call(handler, method, query, body);
    expect(res.statusCode).toBe(403);
    expect(askedIds()).toContain(ATTACKER);
    expect(askedIds()).not.toContain(VICTIM);
    expect(writes()).toEqual([]);
  });

  it.each(ROUTES)('%s: a token the auth server rejects → 401 before any data lookup', async (_n, handler, method, query, body) => {
    verifiedUser = null;
    const res = await call(handler, method, query, body);
    expect(res.statusCode).toBe(401);
    expect(serviceLog).toEqual([]);
  });

  it.each(ROUTES)('%s: a verified admin is looked up as themselves, never as the cookie user', async (_n, handler, method, query, body) => {
    verifiedUser = { id: ADMIN };
    const res = await call(handler, method, query, body);
    expect(res.statusCode).toBeLessThan(300);
    expect(askedIds()).toContain(ADMIN);
    expect(askedIds()).not.toContain(VICTIM);
  });
});

describe('community routes, verified admin', () => {
  it('members returns the list', async () => {
    verifiedUser = { id: ADMIN };
    expect((await call(communityMembers, 'GET', { community_id: COMMUNITY })).statusCode).toBe(200);
  });

  it('ensure-workspace creates the workspace', async () => {
    verifiedUser = { id: ADMIN };
    const res = await call(ensureWorkspace, 'POST', {}, { communityId: COMMUNITY });
    expect(res.statusCode).toBe(201);
    expect(writes()).toHaveLength(1);
  });
});

describe('ensure-workspace communityId is a bare UUID', () => {
  // The id is interpolated into a PostgREST `or(...)` filter; extra terms
  // would let any active role satisfy the membership check.
  it.each([
    `${COMMUNITY},role_type.eq.docente`,
    'x,user_id.not.is.null',
    `${COMMUNITY})`,
  ])('rejects %s with 400 before any lookup', async (communityId) => {
    verifiedUser = { id: ATTACKER };
    const res = await call(ensureWorkspace, 'POST', {}, { communityId });
    expect(res.statusCode).toBe(400);
    expect(serviceLog.filter((e) => e.table !== 'profiles')).toEqual([]);
  });
});

describe('reports/detailed: leadership scope comes from the leadership role row', () => {
  // LEADER's docente row (school 2) is listed first, as the database may
  // return it; only the equipo_directivo row (school 1) may set the scope.
  it.each([
    ['equipo_directivo', { school_id: 1 }, 'school_id', 1, 2],
    ['lider_generacion', { generation_id: 'G-A' }, 'generation_id', 'G-A', 'G-B'],
    ['lider_comunidad', { community_id: 'C-A' }, 'community_id', 'C-A', 'C-B'],
  ] as const)('%s reports on its own scope only', async (role, scope, col, own, other) => {
    const idx = ROLE_ROWS.findIndex((r) => r.user_id === LEADER && r.role_type !== 'docente');
    const saved = ROLE_ROWS[idx];
    ROLE_ROWS[idx] = row(LEADER, role, scope);
    try {
      verifiedUser = { id: LEADER };
      const res = await call(detailed, 'POST', {}, {});
      expect(res.statusCode).toBe(200);
      const scopeLookups = serviceLog
        .filter((e) => e.table === 'user_roles' && eqValue(e.ops, 'user_id') === undefined)
        .map((e) => eqValue(e.ops, col));
      expect(scopeLookups).toContain(own);
      expect(scopeLookups).not.toContain(other);
    } finally {
      ROLE_ROWS[idx] = saved;
    }
  });
});

describe('reports/filter-options: leadership options come from the leadership role row', () => {
  it.each([
    ['equipo_directivo', { school_id: 1 }, [1], [2]],
    ['lider_generacion', { school_id: 1, generation_id: 'G-A' }, ['G-A', 1], ['G-B', 2]],
    ['lider_generacion', { generation_id: 'G-A' }, ['G-A', 1], ['G-B', 2]],
    ['lider_comunidad', { community_id: 'C-A' }, ['C-A', 1], ['C-B', 2]],
  ] as const)('%s %j lists its own scope only', async (role, scope, own, other) => {
    const idx = ROLE_ROWS.findIndex((r) => r.user_id === LEADER && r.role_type !== 'docente');
    const saved = ROLE_ROWS[idx];
    ROLE_ROWS[idx] = row(LEADER, role, scope);
    try {
      verifiedUser = { id: LEADER };
      const res = await call(filterOptions, 'GET');
      expect(res.statusCode).toBe(200);
      const scoped = serviceLog
        .filter((e) => ['schools', 'generations', 'growth_communities'].includes(e.table))
        .flatMap((e) => e.ops.filter(([op, col]) => op === 'eq' && col !== 'tenant_kind').map(([, , v]) => v));
      for (const v of own) expect(scoped).toContain(v);
      for (const v of other) expect(scoped).not.toContain(v);
    } finally {
      ROLE_ROWS[idx] = saved;
    }
  });
});
