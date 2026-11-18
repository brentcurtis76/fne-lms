// @vitest-environment node
/**
 * F15c GES-2.12 — a quote with travel groups can be edited. The editor sends
 * the whole list of the quote's groups: listed groups with an id of this quote
 * are updated, listed groups without an id are added, groups of this quote
 * that are not listed are removed; an empty list and an id of another quote
 * are refused before anything is written. Group writes come first; a failing
 * one stops the save before the quote's own update.
 *
 * Harness: the one of __tests__/api/admin/assignment-matrix-quotes-forged-
 * session.test.ts (only the external clients are faked; the real lib/api-auth
 * helpers run; every call is recorded in order), extended to answer reads of
 * pasantias_quote_groups. All data is synthetic (Ley 21.719).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';

const ADMIN = '15c00000-0000-4000-8000-0000000000b1';
const OWNER = '15c00000-0000-4000-8000-0000000000b2';
const OTHER_CONSULTOR = '15c00000-0000-4000-8000-0000000000b3';
const COOKIE_TOKEN = 'synthetic-cookie-token';

const EDITABLE = [
  'group_name', 'num_participants', 'arrival_date', 'departure_date',
  'flight_price', 'room_type', 'room_price_per_night', 'accommodation_total',
  'flight_total', 'viaticos_type', 'viaticos_amount', 'viaticos_total',
  'viaticos_display_amount',
];

const ROLE_ROWS = [
  { user_id: ADMIN, role_type: 'admin', is_active: true },
  { user_id: OWNER, role_type: 'consultor', is_active: true },
  { user_id: OTHER_CONSULTOR, role_type: 'consultor', is_active: true },
];

const QUOTES: Record<string, { id: string; created_by: string; status: string; valid_until: string | null; use_groups: boolean }> = {
  'q-groups': { id: 'q-groups', created_by: OWNER, status: 'draft', valid_until: null, use_groups: true },
  'q-single': { id: 'q-single', created_by: OWNER, status: 'draft', valid_until: null, use_groups: false },
  'q-other': { id: 'q-other', created_by: OTHER_CONSULTOR, status: 'draft', valid_until: null, use_groups: true },
};

/** A group as GET /api/quotes/[id]/groups returns it (select '*'). */
const loaded = (id: string, quote_id: string, group_name: string) => ({
  id,
  quote_id,
  group_name,
  num_participants: 2,
  arrival_date: '2027-03-01',
  departure_date: '2027-03-05',
  nights: 4,
  flight_price: 300000,
  room_type: 'double',
  room_price_per_night: 100000,
  accommodation_total: 800000,
  flight_total: 600000,
  viaticos_type: null,
  viaticos_amount: 0,
  viaticos_total: 0,
  viaticos_display_amount: 0,
  created_at: '2026-11-01T00:00:00Z',
  updated_at: '2026-11-01T00:00:00Z',
});
const G1 = loaded('g-1', 'q-groups', 'Grupo Uno');
const G2 = loaded('g-2', 'q-groups', 'Grupo Dos');
const G_OTHER = loaded('g-other', 'q-other', 'Grupo Ajeno');
const GROUPS = [G1, G2, G_OTHER];

type Op = [string, ...unknown[]];
const serviceLog: Array<{ table: string; ops: Op[] }> = [];
let verifiedUser: { id: string } | null = null;
let failGroupWrite = false;

const eqValue = (ops: Op[], col: string) => ops.find(([op, c]) => op === 'eq' && c === col)?.[2];

function serviceAnswer(table: string, ops: Op[], mode: 'many' | 'one') {
  const has = (name: string) => ops.some(([op]) => op === name);
  const writing = has('insert') || has('update') || has('upsert') || has('delete');
  if (table === 'profiles') {
    return { data: { id: eqValue(ops, 'id'), must_change_password: false }, error: null };
  }
  if (table === 'user_roles') {
    const uid = eqValue(ops, 'user_id');
    return { data: ROLE_ROWS.filter((r) => r.user_id === uid && r.is_active), error: null };
  }
  if (table === 'pasantias_quotes') {
    const id = eqValue(ops, 'id') as string | undefined;
    if (writing) return { data: mode === 'one' ? { id } : null, error: null };
    const row = id ? QUOTES[id] : undefined;
    return row ? { data: { ...row }, error: null } : { data: null, error: null };
  }
  if (table === 'pasantias_quote_groups') {
    if (writing) return failGroupWrite ? { data: null, error: { message: 'synthetic failure' } } : { data: null, error: null };
    const quoteId = eqValue(ops, 'quote_id');
    const rows = GROUPS.filter((g) => g.quote_id === quoteId).map((g) => ({ ...g }));
    return { data: rows, error: null };
  }
  return { data: mode === 'one' ? null : [], error: null, count: 0 };
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
        data: { session: { user: { id: ADMIN }, access_token: COOKIE_TOKEN } },
        error: null,
      })),
      getUser: vi.fn(async (token?: string) =>
        token === COOKIE_TOKEN && verifiedUser
          ? { data: { user: verifiedUser }, error: null }
          : { data: { user: null }, error: { message: 'invalid token' } }
      ),
    },
    from: vi.fn((table: string) => recordingChain(table)),
  };
}

vi.mock('@supabase/auth-helpers-nextjs', () => ({
  createServerSupabaseClient: vi.fn(() => cookieClient()),
  createPagesServerClient: vi.fn(() => cookieClient()),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: null }, error: { message: 'no bearer here' } })) },
    from: vi.fn((table: string) => recordingChain(table)),
  })),
}));

import quoteById from '../../../pages/api/quotes/[id]';

async function put(id: string, body: unknown) {
  const res: any = { statusCode: 0, body: undefined };
  res.status = (code: number) => ((res.statusCode = code), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.end = () => res;
  res.setHeader = () => res;
  await quoteById({ method: 'PUT', query: { id }, headers: {}, cookies: {}, body } as unknown as NextApiRequest, res);
  return res;
}

const WRITE_OPS = ['insert', 'update', 'upsert', 'delete'];
/** Every write in call order: [table, op, payload, entry ops]. */
const writes = () =>
  serviceLog.flatMap((e, index) =>
    e.ops.filter(([op]) => WRITE_OPS.includes(op as string)).map((o) => ({ index, table: e.table, op: o[0], payload: o[1], ops: e.ops }))
  );
const groupWrites = (op?: string) => writes().filter((w) => w.table === 'pasantias_quote_groups' && (!op || w.op === op));
const quoteUpdate = () => writes().find((w) => w.table === 'pasantias_quotes' && w.op === 'update');
const groupEntries = () => serviceLog.filter((e) => e.table === 'pasantias_quote_groups');

const savedEnv: Record<string, string | undefined> = {};
beforeEach(() => {
  for (const k of ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY']) savedEnv[k] = process.env[k];
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:1';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
  serviceLog.length = 0;
  verifiedUser = { id: OWNER };
  failGroupWrite = false;
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

describe('quotes/[id] PUT saves the travel groups of a group-mode quote', () => {
  it('(1) both groups as loaded: each updated with only the editable columns, then the quote', async () => {
    const res = await put('q-groups', { client_name: 'Colegio Renombrado', use_groups: true, groups: [G1, G2] });
    expect(res.statusCode).toBe(200);

    const updates = groupWrites('update');
    expect(updates).toHaveLength(2);
    for (const [u, g] of [[updates[0], G1], [updates[1], G2]] as const) {
      expect(Object.keys(u.payload as object).sort()).toEqual([...EDITABLE].sort());
      for (const k of ['id', 'quote_id', 'nights', 'created_at', 'updated_at']) expect(u.payload).not.toHaveProperty(k);
      expect(eqValue(u.ops, 'id')).toBe(g.id);
      expect(eqValue(u.ops, 'quote_id')).toBe('q-groups');
    }
    expect(groupWrites('insert')).toEqual([]);
    expect(groupWrites('delete')).toEqual([]);

    // The stored groups were read for this quote only.
    const read = groupEntries().find((e) => !e.ops.some(([op]) => WRITE_OPS.includes(op as string)));
    expect(eqValue(read!.ops, 'quote_id')).toBe('q-groups');

    const q = quoteUpdate();
    expect(q?.payload).toMatchObject({ client_name: 'Colegio Renombrado', updated_by: OWNER });
    expect(q!.index).toBeGreaterThan(Math.max(...groupWrites().map((w) => w.index)));
  });

  it('(2) a changed num_participants reaches its group', async () => {
    const res = await put('q-groups', { use_groups: true, groups: [{ ...G1, num_participants: 7 }, G2] });
    expect(res.statusCode).toBe(200);
    const u1 = groupWrites('update').find((w) => eqValue(w.ops, 'id') === 'g-1');
    expect(u1?.payload).toMatchObject({ num_participants: 7 });
  });

  it('(3) a group without id is inserted for this quote, with only editable columns', async () => {
    const fresh = { group_name: 'Grupo Nuevo', num_participants: 3, arrival_date: '2027-04-01', departure_date: '2027-04-04', room_type: 'single', room_price_per_night: 150000, nights: 99, created_at: '2020-01-01T00:00:00Z', quote_id: 'q-other' };
    const res = await put('q-groups', { use_groups: true, groups: [G1, G2, fresh] });
    expect(res.statusCode).toBe(200);
    const inserts = groupWrites('insert');
    expect(inserts).toHaveLength(1);
    const { nights: _n, created_at: _c, quote_id: _q, ...editable } = fresh;
    expect(inserts[0].payload).toEqual([{ ...editable, quote_id: 'q-groups' }]);
    expect(groupWrites('update')).toHaveLength(2);
    expect(groupWrites('delete')).toEqual([]);
  });

  it('(4) a stored group not listed is deleted, filtered by its id and this quote', async () => {
    const res = await put('q-groups', { use_groups: true, groups: [G1] });
    expect(res.statusCode).toBe(200);
    const deletes = groupWrites('delete');
    expect(deletes).toHaveLength(1);
    const ops = deletes[0].ops;
    expect(ops.find(([op, col]) => op === 'in' && col === 'id')?.[2]).toEqual(['g-2']);
    expect(eqValue(ops, 'quote_id')).toBe('q-groups');
    expect(groupWrites('update')).toHaveLength(1);
  });

  it('(5) an empty list in group mode is refused and nothing is written', async () => {
    const res = await put('q-groups', { client_name: 'X', use_groups: true, groups: [] });
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'Debe incluir al menos un grupo de viaje' });
    expect(writes()).toEqual([]);
  });

  it("(6) an id of another quote's group is refused and nothing is written", async () => {
    const res = await put('q-groups', { client_name: 'X', use_groups: true, groups: [G1, G2, { ...G_OTHER, quote_id: 'q-groups' }] });
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'Un grupo de viaje no pertenece a esta cotización' });
    expect(writes()).toEqual([]);
  });

  it('(7) a body without groups on a quote without groups behaves as before', async () => {
    const res = await put('q-single', { client_name: 'X', arrival_date: '2027-01-10' });
    expect(res.statusCode).toBe(200);
    expect(groupEntries()).toEqual([]);
    expect(quoteUpdate()?.payload).toMatchObject({ client_name: 'X', arrival_date: '2027-01-10', updated_by: OWNER });
  });

  it('(8) a non-owner non-admin is refused before any group read or write', async () => {
    verifiedUser = { id: OTHER_CONSULTOR };
    const res = await put('q-groups', { client_name: 'X', use_groups: true, groups: [G1, G2] });
    expect(res.statusCode).toBe(403);
    expect(groupEntries()).toEqual([]);
    expect(writes()).toEqual([]);
  });

  it('(9) a failing group write answers 500 and the quote is not updated', async () => {
    failGroupWrite = true;
    const res = await put('q-groups', { client_name: 'X', use_groups: true, groups: [G1, G2] });
    expect(res.statusCode).toBe(500);
    expect(res.body).toMatchObject({ error: 'Error al guardar los grupos de viaje' });
    expect(groupWrites()).toHaveLength(1);
    expect(quoteUpdate()).toBeUndefined();
  });

  it('an admin may save the groups of a quote they did not create', async () => {
    verifiedUser = { id: ADMIN };
    const res = await put('q-groups', { client_name: 'X', use_groups: true, groups: [G1, G2] });
    expect(res.statusCode).toBe(200);
    expect(groupWrites('update')).toHaveLength(2);
  });

  it('group mode comes from the stored quote when the body does not name use_groups', async () => {
    const res = await put('q-groups', { client_name: 'X', groups: [G1] });
    expect(res.statusCode).toBe(200);
    expect(groupWrites('delete')).toHaveLength(1);
  });

  it('a list sent while the quote is not in group mode after the save is ignored', async () => {
    const res = await put('q-groups', { client_name: 'X', use_groups: false, groups: [G1] });
    expect(res.statusCode).toBe(200);
    expect(groupEntries()).toEqual([]);
    expect(quoteUpdate()?.payload).toMatchObject({ client_name: 'X', use_groups: false });
  });

  it('the status rule still refuses before any group is touched', async () => {
    const res = await put('q-groups', { status: 'accepted', use_groups: true, groups: [G1, G2] });
    expect(res.statusCode).toBe(400);
    expect(groupEntries()).toEqual([]);
    expect(writes()).toEqual([]);
  });

  it('sending a group quote from the editor saves the groups and gets the «válido hasta» default', async () => {
    const res = await put('q-groups', { client_name: 'X', status: 'sent', valid_until: '', use_groups: true, groups: [G1, G2] });
    expect(res.statusCode).toBe(200);
    expect(groupWrites('update')).toHaveLength(2);
    expect(quoteUpdate()?.payload).toMatchObject({ status: 'sent' });
    expect((quoteUpdate()?.payload as Record<string, unknown>).valid_until).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
