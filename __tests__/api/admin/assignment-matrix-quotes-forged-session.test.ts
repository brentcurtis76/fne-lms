// @vitest-environment node
/**
 * SM-B015 batch B4 — the assignment-matrix and quote routes must take the
 * caller's identity from the auth server, never from the session cookie.
 *
 * auth-helpers accepts a legacy JSON session cookie as-is, so `getSession()`
 * returns whatever `user` the cookie claims next to a valid access token.
 * These routes picked the caller's role (and quote ownership) from
 * `session.user.id` through the service role, so naming an admin's id in the
 * cookie read any group's assignments, the assignment audit log and content
 * statistics, created quotes, and edited or deleted anyone's quotes.
 *
 * Only the external clients are faked; the real lib/api-auth helpers run.
 * The cookie always claims VICTIM, an admin who also owns quote Q-VICTIM.
 * All ids are synthetic (Ley 21.719).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';

const VICTIM = '11111111-1111-4111-8111-111111111111';
const ATTACKER = '22222222-2222-4222-8222-222222222222';
const ADMIN = '33333333-3333-4333-8333-333333333333';
const CONSULTOR = '44444444-4444-4444-8444-444444444444';

const ROLES: Record<string, string[]> = { [VICTIM]: ['admin'], [ADMIN]: ['admin'], [CONSULTOR]: ['consultor'] };
const QUOTE_OWNERS: Record<string, string> = { 'q-victim': VICTIM, 'q-consultor': CONSULTOR };
const COOKIE_TOKEN = 'caller-own-valid-token';

type Op = [string, ...unknown[]];
const serviceLog: Array<{ table: string; ops: Op[] }> = [];
let verifiedUser: { id: string } | null = null;

const eqValue = (ops: Op[], col: string) => ops.find(([op, c]) => op === 'eq' && c === col)?.[2];

function serviceAnswer(table: string, ops: Op[], mode: 'many' | 'one') {
  const has = (name: string) => ops.some(([op]) => op === name);
  if (table === 'profiles') {
    return { data: { id: eqValue(ops, 'id'), must_change_password: false }, error: null };
  }
  if (table === 'user_roles') {
    const userId = eqValue(ops, 'user_id') as string | undefined;
    const wanted = ops.find(([op]) => op === 'in')?.[2] as string[] | undefined;
    const rows = (ROLES[userId ?? ''] ?? [])
      .filter((r) => !wanted || wanted.includes(r))
      .map((role_type) => ({ role_type, school_id: null, community_id: null }));
    return { data: rows, error: null };
  }
  if (table === 'pasantias_quotes') {
    const id = eqValue(ops, 'id') as string | undefined;
    if (has('insert')) return { data: { id: 'q-new' }, error: null };
    if (has('update') || has('delete')) return { data: mode === 'one' ? { id } : null, error: null };
    return id && QUOTE_OWNERS[id] ? { data: { id, created_by: QUOTE_OWNERS[id] }, error: null } : { data: null, error: null };
  }
  if (table === 'pasantias_programs') return { data: [{ id: 'p-1', price: 1000 }], error: null };
  return { data: mode === 'one' ? null : [], error: null };
}

function recordingChain(table: string) {
  const entry = { table, ops: [] as Op[] };
  serviceLog.push(entry);
  const chain: any = new Proxy(
    {},
    {
      get(_t, prop: string) {
        if (prop === 'then') return (resolve: (v: unknown) => void) => resolve(serviceAnswer(table, entry.ops, 'many'));
        if (prop === 'single' || prop === 'maybeSingle') return async () => serviceAnswer(table, entry.ops, 'one');
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
    rpc: vi.fn(async () => ({ data: null, error: null })),
    from: vi.fn((table: string) => recordingChain(table)),
  })),
}));

import groupAssignments from '../../../pages/api/admin/assignment-matrix/group-assignments';
import auditLog from '../../../pages/api/admin/assignment-matrix/audit-log';
import contentStats from '../../../pages/api/admin/assignment-matrix/content-stats';
import createQuote from '../../../pages/api/quotes/createV2';
import quoteById from '../../../pages/api/quotes/[id]';

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

const QUOTE_BODY = { client_name: 'Cliente', arrival_date: '2027-01-10', departure_date: '2027-01-20', room_type: 'double', selected_programs: ['p-1'], num_pasantes: 1 };

const ROUTES: Array<[string, Handler, string, Record<string, string>, unknown]> = [
  ['assignment-matrix/group-assignments', groupAssignments, 'GET', { groupType: 'community', groupId: 'c-1' }, {}],
  ['assignment-matrix/audit-log', auditLog, 'GET', {}, {}],
  ['assignment-matrix/content-stats', contentStats, 'GET', {}, {}],
  ['quotes/createV2', createQuote, 'POST', {}, QUOTE_BODY],
  ['quotes/[id] PUT', quoteById, 'PUT', { id: 'q-victim' }, { client_name: 'X' }],
  ['quotes/[id] DELETE', quoteById, 'DELETE', { id: 'q-victim' }, {}],
];

const askedIds = () =>
  serviceLog.flatMap((e) => e.ops.filter(([op, col]) => op === 'eq' && (col === 'user_id' || col === 'id')).map(([, , v]) => v));
const writes = () =>
  serviceLog.flatMap((e) => e.ops.filter(([op]) => ['insert', 'update', 'upsert', 'delete'].includes(op)).map((o) => [e.table, ...o]));

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
  it.each(ROUTES)('%s: a verified caller with no role is refused and nothing is written', async (_n, handler, method, query, body) => {
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
    expect([401, 403]).not.toContain(res.statusCode);
    expect(askedIds()).toContain(ADMIN);
    expect(askedIds().filter((v) => v === VICTIM)).toEqual([]);
  });
});

describe('quote ownership is decided by the verified caller', () => {
  it.each([
    ['PUT', { client_name: 'X' }],
    ['DELETE', {}],
  ])("%s: a consultor cannot touch the cookie user's quote", async (method, body) => {
    verifiedUser = { id: CONSULTOR };
    const res = await call(quoteById, method, { id: 'q-victim' }, body);
    expect(res.statusCode).toBe(403);
    expect(writes()).toEqual([]);
  });

  it.each([
    ['PUT', { client_name: 'X' }, 'update'],
    ['DELETE', {}, 'delete'],
  ])('%s: a consultor may act on their own quote, logged as themselves', async (method, body, op) => {
    verifiedUser = { id: CONSULTOR };
    const res = await call(quoteById, method, { id: 'q-consultor' }, body);
    expect(res.statusCode).toBe(200);
    const w = writes();
    expect(w.filter(([t, o]) => t === 'pasantias_quotes' && o === op)).toHaveLength(1);
    const log = w.find(([t, o]) => t === 'activity_logs' && o === 'insert');
    expect(log?.[2]).toMatchObject({ user_id: CONSULTOR });
    if (op === 'update') {
      const update = w.find(([t, o]) => t === 'pasantias_quotes' && o === 'update');
      expect(update?.[2]).toMatchObject({ updated_by: CONSULTOR });
    }
  });

  it('createV2 attributes the quote to the verified caller', async () => {
    verifiedUser = { id: CONSULTOR };
    await call(createQuote, 'POST', {}, QUOTE_BODY);
    const insert = writes().find(([t, o]) => t === 'pasantias_quotes' && o === 'insert');
    expect(insert?.[2]).toMatchObject({ created_by: CONSULTOR, updated_by: CONSULTOR });
  });
});
