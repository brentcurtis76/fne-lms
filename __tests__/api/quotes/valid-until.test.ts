// @vitest-environment node
/**
 * F15c GES-2.13 — the quote routes never send an empty or malformed date to
 * the database. «Válido hasta» (`valid_until`) and the early-payment date
 * (`early_bird_payment_date`) are date columns: '' or anything that is not a
 * real calendar date written YYYY-MM-DD is stored as nothing (null). A quote
 * saved as sent with no «válido hasta» gets the day of that save in Chile
 * (America/Santiago) plus 30 days; a draft keeps nothing.
 *
 * F15c CREATE-FIELDS — createV2 copies the early-payment discount and the
 * viáticos fields into the new row when the body carries them.
 *
 * Harness: the one of __tests__/api/admin/assignment-matrix-quotes-forged-
 * session.test.ts (only the external clients are faked; the real lib/api-auth
 * helpers run; every write is recorded). All data is synthetic (Ley 21.719).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';

const ADMIN = '15c00000-0000-4000-8000-0000000000a1';
const CONSULTOR = '15c00000-0000-4000-8000-0000000000a2';
const COOKIE_TOKEN = 'synthetic-cookie-token';

const ROLE_ROWS = [
  { user_id: ADMIN, role_type: 'admin', is_active: true },
  { user_id: CONSULTOR, role_type: 'consultor', is_active: true },
];

type StoredQuote = { id: string; created_by: string; status: string; valid_until: string | null; use_groups: boolean };
const QUOTES: Record<string, StoredQuote> = {};
function resetQuotes() {
  for (const k of Object.keys(QUOTES)) delete QUOTES[k];
  QUOTES['q-draft'] = { id: 'q-draft', created_by: CONSULTOR, status: 'draft', valid_until: null, use_groups: false };
  QUOTES['q-sent'] = { id: 'q-sent', created_by: CONSULTOR, status: 'sent', valid_until: '2027-04-01', use_groups: false };
}

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
    const uid = eqValue(ops, 'user_id');
    return { data: ROLE_ROWS.filter((r) => r.user_id === uid && r.is_active), error: null };
  }
  if (table === 'pasantias_quotes') {
    const id = eqValue(ops, 'id') as string | undefined;
    if (has('insert')) return { data: { id: 'q-new' }, error: null };
    if (has('update') || has('delete')) return { data: mode === 'one' ? { id } : null, error: null };
    const row = id ? QUOTES[id] : undefined;
    return row ? { data: { ...row }, error: null } : { data: null, error: null };
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

import createQuote from '../../../pages/api/quotes/createV2';
import quoteById from '../../../pages/api/quotes/[id]';

type Handler = (req: NextApiRequest, res: NextApiResponse) => Promise<unknown>;

async function call(handler: Handler, method: string, query: Record<string, string>, body: unknown) {
  const res: any = { statusCode: 0, body: undefined };
  res.status = (code: number) => ((res.statusCode = code), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.end = () => res;
  res.setHeader = () => res;
  await handler({ method, query, headers: {}, cookies: {}, body } as unknown as NextApiRequest, res);
  return res;
}

const writes = () =>
  serviceLog.flatMap((e) => e.ops.filter(([op]) => ['insert', 'update', 'upsert', 'delete'].includes(op)).map((o) => [e.table, ...o]));
const inserted = () =>
  writes().find(([t, o]) => t === 'pasantias_quotes' && o === 'insert')?.[2] as Record<string, unknown> | undefined;
const updated = () =>
  writes().find(([t, o]) => t === 'pasantias_quotes' && o === 'update')?.[2] as Record<string, unknown> | undefined;

/** A single-mode quote as the editor sends it (QuoteFormV2), invented data. */
const CREATE_BODY = {
  client_name: 'Colegio Sintético',
  arrival_date: '2027-01-10',
  departure_date: '2027-01-20',
  room_type: 'double',
  num_pasantes: 2,
  selected_programs: ['p-1'],
};

const savedEnv: Record<string, string | undefined> = {};
beforeEach(() => {
  for (const k of ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY']) savedEnv[k] = process.env[k];
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:1';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
  serviceLog.length = 0;
  verifiedUser = { id: CONSULTOR };
  resetQuotes();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  // A fixed clock: 10 June 2027, 15:00 UTC = 11:00 in Chile (UTC-4).
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2027-06-10T15:00:00Z'));
});
afterEach(() => {
  vi.useRealTimers();
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  vi.restoreAllMocks();
});

describe('createV2: «válido hasta»', () => {
  it("a draft with valid_until '' is inserted with null", async () => {
    const res = await call(createQuote, 'POST', {}, { ...CREATE_BODY, status: 'draft', valid_until: '' });
    expect(res.statusCode).toBe(200);
    expect(inserted()).toHaveProperty('valid_until', null);
  });

  it("a sent quote with valid_until '' gets the Chile date of now plus 30 days", async () => {
    const res = await call(createQuote, 'POST', {}, { ...CREATE_BODY, status: 'sent', valid_until: '' });
    expect(res.statusCode).toBe(200);
    expect(inserted()).toHaveProperty('valid_until', '2027-07-10');
  });

  it('the default counts from the Chile day when UTC is already on the next day', async () => {
    // 15 January 2027, 02:00 UTC = 14 January, 23:00 in Chile (UTC-3, summer).
    vi.setSystemTime(new Date('2027-01-15T02:00:00Z'));
    const res = await call(createQuote, 'POST', {}, { ...CREATE_BODY, status: 'sent', valid_until: '' });
    expect(res.statusCode).toBe(200);
    expect(inserted()).toHaveProperty('valid_until', '2027-02-13');
  });

  it('a sent quote without the field at all gets the default too', async () => {
    const res = await call(createQuote, 'POST', {}, { ...CREATE_BODY, status: 'sent' });
    expect(res.statusCode).toBe(200);
    expect(inserted()).toHaveProperty('valid_until', '2027-07-10');
  });

  it.each(['draft', 'sent'])('a typed 2027-03-15 is kept for a %s', async (status) => {
    const res = await call(createQuote, 'POST', {}, { ...CREATE_BODY, status, valid_until: '2027-03-15' });
    expect(res.statusCode).toBe(200);
    expect(inserted()).toHaveProperty('valid_until', '2027-03-15');
  });

  it.each(['not-a-date', '2027-02-31'])('a draft with valid_until %s is inserted with null', async (value) => {
    const res = await call(createQuote, 'POST', {}, { ...CREATE_BODY, status: 'draft', valid_until: value });
    expect(res.statusCode).toBe(200);
    expect(inserted()).toHaveProperty('valid_until', null);
  });
});

describe('quotes/[id] PUT: «válido hasta»', () => {
  it("valid_until '' on a draft is written as null", async () => {
    const res = await call(quoteById, 'PUT', { id: 'q-draft' }, { client_name: 'X', valid_until: '' });
    expect(res.statusCode).toBe(200);
    expect(updated()).toHaveProperty('valid_until', null);
  });

  it('sending a draft with no stored date and no date in the body writes the default', async () => {
    const res = await call(quoteById, 'PUT', { id: 'q-draft' }, { client_name: 'X', status: 'sent' });
    expect(res.statusCode).toBe(200);
    expect(updated()).toMatchObject({ status: 'sent', valid_until: '2027-07-10' });
  });

  it("sending a draft with valid_until '' writes the default", async () => {
    const res = await call(quoteById, 'PUT', { id: 'q-draft' }, { client_name: 'X', status: 'sent', valid_until: '' });
    expect(res.statusCode).toBe(200);
    expect(updated()).toHaveProperty('valid_until', '2027-07-10');
  });

  it('sending a draft with a typed date keeps it', async () => {
    const res = await call(quoteById, 'PUT', { id: 'q-draft' }, { client_name: 'X', status: 'sent', valid_until: '2027-03-15' });
    expect(res.statusCode).toBe(200);
    expect(updated()).toHaveProperty('valid_until', '2027-03-15');
  });

  it('a sent quote with a stored date, body not naming the field: the field is not written', async () => {
    const res = await call(quoteById, 'PUT', { id: 'q-sent' }, { client_name: 'X' });
    expect(res.statusCode).toBe(200);
    expect(updated()).not.toHaveProperty('valid_until');
  });

  it("early_bird_payment_date '' is written as null", async () => {
    const res = await call(quoteById, 'PUT', { id: 'q-draft' }, { client_name: 'X', early_bird_payment_date: '' });
    expect(res.statusCode).toBe(200);
    expect(updated()).toHaveProperty('early_bird_payment_date', null);
  });

  it('the stored quote is read with its status and «válido hasta»', async () => {
    await call(quoteById, 'PUT', { id: 'q-draft' }, { client_name: 'X' });
    const read = serviceLog.find((e) => e.table === 'pasantias_quotes' && e.ops.some(([op]) => op === 'select'));
    const columns = String(read?.ops.find(([op]) => op === 'select')?.[1]);
    expect(columns).toContain('status');
    expect(columns).toContain('valid_until');
  });
});

describe('createV2: early-payment discount and viáticos (CREATE-FIELDS)', () => {
  const SIX = {
    apply_early_bird_discount: true,
    early_bird_payment_date: '2027-05-31',
    viaticos_type: 'daily',
    viaticos_amount: 25000,
    viaticos_total: 500000,
    viaticos_display_amount: 250000,
  };
  const SIX_KEYS = Object.keys(SIX);

  it('a create carrying the six fields inserts them', async () => {
    const res = await call(createQuote, 'POST', {}, { ...CREATE_BODY, ...SIX });
    expect(res.statusCode).toBe(200);
    expect(inserted()).toMatchObject(SIX);
  });

  it("early_bird_payment_date '' is inserted with null", async () => {
    const res = await call(createQuote, 'POST', {}, { ...CREATE_BODY, ...SIX, early_bird_payment_date: '' });
    expect(res.statusCode).toBe(200);
    expect(inserted()).toHaveProperty('early_bird_payment_date', null);
  });

  it('a create without them does not name them (the table defaults apply)', async () => {
    const res = await call(createQuote, 'POST', {}, CREATE_BODY);
    expect(res.statusCode).toBe(200);
    for (const k of SIX_KEYS) expect(inserted()).not.toHaveProperty(k);
  });

  it('a group-mode create carries them too, and attribution stays the caller', async () => {
    const res = await call(createQuote, 'POST', {}, {
      client_name: 'Colegio Sintético',
      use_groups: true,
      groups: [{ group_name: 'G', num_participants: 2, arrival_date: '2027-01-10', departure_date: '2027-01-12', room_type: 'double', room_price_per_night: 1 }],
      created_by: ADMIN,
      updated_by: ADMIN,
      ...SIX,
    });
    expect(res.statusCode).toBe(200);
    expect(inserted()).toMatchObject({ ...SIX, use_groups: true, created_by: CONSULTOR, updated_by: CONSULTOR });
  });
});
