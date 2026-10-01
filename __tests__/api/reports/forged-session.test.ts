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

const ADMINS = new Set([VICTIM, ADMIN]);
const COOKIE_TOKEN = 'caller-own-valid-token';

type Op = [string, ...unknown[]];
const serviceLog: Array<{ table: string; ops: Op[] }> = [];
let verifiedUser: { id: string } | null = null;

const eqValue = (ops: Op[], col: string) => ops.find(([op, c]) => op === 'eq' && c === col)?.[2];

/** Service-role tables, answering per queried id. */
function serviceAnswer(table: string, ops: Op[], mode: 'many' | 'one') {
  if (table === 'profiles') {
    const id = (eqValue(ops, 'id') as string) ?? null;
    const row = { id, first_name: 'Nombre', last_name: 'Sintético', school_id: 1, must_change_password: false };
    return { data: mode === 'one' ? row : [row], error: null };
  }
  if (table === 'user_roles') {
    const userId = eqValue(ops, 'user_id') as string | undefined;
    if (userId === undefined) return { data: mode === 'one' ? null : [], error: null };
    const rows = ADMINS.has(userId)
      ? [{ id: `role-${userId}`, user_id: userId, role_type: 'admin', community_id: null, is_active: true }]
      : [];
    return { data: mode === 'one' ? rows[0] ?? null : rows, error: null };
  }
  if (table === 'growth_communities') return { data: { id: COMMUNITY, name: 'Comunidad' }, error: null };
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
    expect(res.statusCode).not.toBe(401);
    expect(res.statusCode).not.toBe(403);
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
