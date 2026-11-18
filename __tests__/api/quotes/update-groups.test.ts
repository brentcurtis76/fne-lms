// @vitest-environment node
/**
 * F15c GES-2.12 (send-back 1) — a quote with travel groups can be edited. The
 * editor sends the whole list of the quote's groups; the route makes its own
 * checks (caller, owner or admin, status rule, field allow-list, dates) and
 * then calls ONE database function, public.save_quote_with_groups, which
 * saves the groups and the quote's own fields together or not at all
 * (proven against a real database by supabase/tests/141-quote-groups-save.sql).
 * Here: the route calls it once with the reduced list and the prepared
 * fields, writes nothing else to the two tables, and maps its refusals.
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
let rpcError: { message: string; code?: string } | null = null;

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
    return row ? { data: { ...row, client_name: 'Leído de vuelta' }, error: null } : { data: null, error: null };
  }
  if (table === 'pasantias_quote_groups') {
    if (writing) return { data: null, error: null };
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

/** Every rpc of the service client, in call order with the other calls. */
function recordRpc(fn: string, args: unknown) {
  serviceLog.push({ table: `rpc:${fn}`, ops: [['rpc', args]] });
  return Promise.resolve(rpcError ? { data: null, error: rpcError } : { data: null, error: null });
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: null }, error: { message: 'no bearer here' } })) },
    from: vi.fn((table: string) => recordingChain(table)),
    rpc: vi.fn((fn: string, args: unknown) => recordRpc(fn, args)),
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
const quoteUpdate = () => writes().find((w) => w.table === 'pasantias_quotes' && w.op === 'update');
const groupEntries = () => serviceLog.filter((e) => e.table === 'pasantias_quote_groups');
const tableWrites = () => writes().filter((w) => w.table === 'pasantias_quotes' || w.table === 'pasantias_quote_groups');
const saves = () => serviceLog.filter((e) => e.table === 'rpc:save_quote_with_groups');
const saveArgs = () => saves()[0].ops[0][1] as { p_quote_id: string; p_fields: Record<string, unknown>; p_groups: unknown[] };
const tablesInOrder = () => serviceLog.map((e) => e.table);
/** A loaded group as the route must pass it on: its id and the editable columns only. */
const reduced = (g: Record<string, unknown>) => {
  const out: Record<string, unknown> = {};
  if (g.id !== undefined && g.id !== null) out.id = g.id;
  for (const k of EDITABLE) if (Object.prototype.hasOwnProperty.call(g, k)) out[k] = g[k];
  return out;
};
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

const savedEnv: Record<string, string | undefined> = {};
beforeEach(() => {
  for (const k of ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY']) savedEnv[k] = process.env[k];
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:1';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
  serviceLog.length = 0;
  verifiedUser = { id: OWNER };
  rpcError = null;
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

describe('quotes/[id] PUT saves a group-mode quote through save_quote_with_groups', () => {
  it('(1) both groups as loaded: ONE call with the quote id, the prepared fields and the reduced groups', async () => {
    const res = await put('q-groups', { client_name: 'Colegio Renombrado', use_groups: true, groups: [G1, G2] });
    expect(res.statusCode).toBe(200);

    expect(saves()).toHaveLength(1);
    const args = saveArgs();
    expect(Object.keys(args).sort()).toEqual(['p_fields', 'p_groups', 'p_quote_id']);
    expect(args.p_quote_id).toBe('q-groups');
    expect(args.p_fields).toEqual({
      client_name: 'Colegio Renombrado',
      use_groups: true,
      updated_by: OWNER,
      updated_at: expect.stringMatching(ISO),
    });
    expect(args.p_groups).toEqual([reduced(G1), reduced(G2)]);
    for (const g of args.p_groups as Record<string, unknown>[]) {
      expect(Object.keys(g).sort()).toEqual(['id', ...EDITABLE].sort());
      for (const k of ['quote_id', 'nights', 'created_at', 'updated_at']) expect(g).not.toHaveProperty(k);
    }
  });

  it('(1b) nothing else is written to the two tables; the quote is read back; then the activity log', async () => {
    const res = await put('q-groups', { client_name: 'Colegio Renombrado', use_groups: true, groups: [G1, G2] });
    expect(res.statusCode).toBe(200);
    expect(groupEntries()).toEqual([]);
    expect(tableWrites()).toEqual([]);
    // the calls after the stored-quote read: the one save, the read-back, the log
    const order = tablesInOrder();
    const at = order.indexOf('rpc:save_quote_with_groups');
    expect(order.slice(at)).toEqual(['rpc:save_quote_with_groups', 'pasantias_quotes', 'activity_logs']);
    const readBack = serviceLog[at + 1];
    expect(eqValue(readBack.ops, 'id')).toBe('q-groups');
    expect(writes().map((w) => `${w.table}.${w.op}`)).toEqual(['activity_logs.insert']);
    expect(res.body).toEqual({ success: true, quote: expect.objectContaining({ id: 'q-groups', client_name: 'Leído de vuelta' }) });
  });

  it('(2) a changed num_participants and a group without id are passed on, reduced', async () => {
    const fresh = { group_name: 'Grupo Nuevo', num_participants: 3, arrival_date: '2027-04-01', departure_date: '2027-04-04', room_type: 'single', room_price_per_night: 150000, nights: 99, created_at: '2020-01-01T00:00:00Z', quote_id: 'q-other' };
    const res = await put('q-groups', { use_groups: true, groups: [{ ...G1, num_participants: 7 }, { ...fresh, id: null }, fresh] });
    expect(res.statusCode).toBe(200);
    const { nights: _n, created_at: _c, quote_id: _q, ...editable } = fresh;
    expect(saveArgs().p_groups).toEqual([{ ...reduced(G1), num_participants: 7 }, editable, editable]);
  });

  it('(3) p_fields is the allow-listed, date-cleaned update with updated_by and updated_at', async () => {
    const res = await put('q-groups', {
      client_name: 'X', status: 'sent', valid_until: '', early_bird_payment_date: 'not-a-date',
      quote_number: 1, created_by: OTHER_CONSULTOR, updated_by: OTHER_CONSULTOR, viewed_at: '2000-01-01', id: 'q-other',
      use_groups: true, groups: [G1],
    });
    expect(res.statusCode).toBe(200);
    expect(saveArgs().p_fields).toEqual({
      client_name: 'X',
      status: 'sent',
      valid_until: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      early_bird_payment_date: null,
      use_groups: true,
      updated_by: OWNER,
      updated_at: expect.stringMatching(ISO),
    });
  });

  it('(4) an entry that is not an object is passed on as it is (the function refuses it)', async () => {
    const res = await put('q-groups', { use_groups: true, groups: [G1, 'G2', null, [1]] });
    expect(res.statusCode).toBe(200);
    expect(saveArgs().p_groups).toEqual([reduced(G1), 'G2', null, [1]]);
  });

  it.each([
    ['groups_empty', 400, { error: 'Debe incluir al menos un grupo de viaje' }],
    ['group_foreign', 400, { error: 'Un grupo de viaje no pertenece a esta cotización' }],
    ['group_duplicate', 400, { error: 'Un grupo de viaje no pertenece a esta cotización' }],
    ['group_malformed', 400, { error: 'Los grupos de viaje no son válidos' }],
    ['quote_not_found', 404, { error: 'Cotización no encontrada' }],
    ['null value in column "client_name" of relation "pasantias_quotes" violates not-null constraint', 500, { error: 'Error al guardar los grupos de viaje' }],
    ['toString', 500, { error: 'Error al guardar los grupos de viaje' }],
  ])('(5) the refusal %s answers %i with its text, and nothing follows', async (message, status, body) => {
    rpcError = { message };
    const res = await put('q-groups', { client_name: 'X', use_groups: true, groups: [G1] });
    expect(res.statusCode).toBe(status);
    expect(res.body).toEqual(body);
    expect(saves()).toHaveLength(1);
    expect(writes()).toEqual([]);
    expect(tablesInOrder().at(-1)).toBe('rpc:save_quote_with_groups');
  });

  it('(6) an empty list is passed to the function, which is the rule (no early refusal in the route)', async () => {
    rpcError = { message: 'groups_empty' };
    const res = await put('q-groups', { client_name: 'X', use_groups: true, groups: [] });
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'Debe incluir al menos un grupo de viaje' });
    expect(saveArgs().p_groups).toEqual([]);
    expect(groupEntries()).toEqual([]);
  });

  it("(7) an id of another quote's group is passed on and the function's refusal is answered", async () => {
    rpcError = { message: 'group_foreign' };
    const res = await put('q-groups', { client_name: 'X', use_groups: true, groups: [G1, { ...G_OTHER, quote_id: 'q-groups' }] });
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'Un grupo de viaje no pertenece a esta cotización' });
    expect(saveArgs().p_groups).toEqual([reduced(G1), reduced(G_OTHER)]);
    expect(writes()).toEqual([]);
  });

  it('(8) a non-owner non-admin is refused before any call', async () => {
    verifiedUser = { id: OTHER_CONSULTOR };
    const res = await put('q-groups', { client_name: 'X', use_groups: true, groups: [G1, G2] });
    expect(res.statusCode).toBe(403);
    expect(saves()).toEqual([]);
    expect(groupEntries()).toEqual([]);
    expect(writes()).toEqual([]);
  });

  it('(9) a body without groups on a quote without groups behaves as before (no call)', async () => {
    const res = await put('q-single', { client_name: 'X', arrival_date: '2027-01-10' });
    expect(res.statusCode).toBe(200);
    expect(saves()).toEqual([]);
    expect(groupEntries()).toEqual([]);
    expect(quoteUpdate()?.payload).toMatchObject({ client_name: 'X', arrival_date: '2027-01-10', updated_by: OWNER });
  });

  it('(10) a list sent while the quote is not in group mode after the save is ignored (no call, plain update)', async () => {
    const res = await put('q-groups', { client_name: 'X', use_groups: false, groups: [G1] });
    expect(res.statusCode).toBe(200);
    expect(saves()).toEqual([]);
    expect(groupEntries()).toEqual([]);
    expect(quoteUpdate()?.payload).toMatchObject({ client_name: 'X', use_groups: false });
  });

  it('(11) a list sent for a stored single-mode quote is ignored (no call, plain update)', async () => {
    const res = await put('q-single', { client_name: 'X', groups: [G1] });
    expect(res.statusCode).toBe(200);
    expect(saves()).toEqual([]);
    expect(quoteUpdate()?.payload).toMatchObject({ client_name: 'X' });
  });

  it('an admin may save the groups of a quote they did not create', async () => {
    verifiedUser = { id: ADMIN };
    const res = await put('q-groups', { client_name: 'X', use_groups: true, groups: [G1, G2] });
    expect(res.statusCode).toBe(200);
    expect(saves()).toHaveLength(1);
    expect(saveArgs().p_fields).toMatchObject({ updated_by: ADMIN });
  });

  it('group mode comes from the stored quote when the body does not name use_groups', async () => {
    const res = await put('q-groups', { client_name: 'X', groups: [G1] });
    expect(res.statusCode).toBe(200);
    expect(saves()).toHaveLength(1);
    expect(saveArgs().p_fields).not.toHaveProperty('use_groups');
  });

  it('the status rule still refuses before any call', async () => {
    const res = await put('q-groups', { status: 'accepted', use_groups: true, groups: [G1, G2] });
    expect(res.statusCode).toBe(400);
    expect(saves()).toEqual([]);
    expect(writes()).toEqual([]);
  });

  it('sending a group quote from the editor passes status sent and the «válido hasta» default', async () => {
    const res = await put('q-groups', { client_name: 'X', status: 'sent', valid_until: '', use_groups: true, groups: [G1, G2] });
    expect(res.statusCode).toBe(200);
    expect(saveArgs().p_fields).toMatchObject({ status: 'sent' });
    expect(saveArgs().p_fields.valid_until).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
