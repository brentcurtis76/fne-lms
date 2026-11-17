// @vitest-environment node
/**
 * F7 GES-1.1b — the public quote link (GET /api/quotes/[id]) returns to a
 * visitor only what the public page (pages/quote/[id].tsx +
 * components/quotes/QuotePublicView.tsx) shows, reads with full rights, and a
 * visitor opening a sent quote marks it as seen with a client that can write.
 * Staff with full view (an active admin, or the quote's own consultor /
 * community manager) get every field, and opening the editor no longer marks
 * the quote as seen.
 *
 * Only the external clients are faked; the real lib/api-auth helpers run. The
 * caller's own (cookie) client answers reads as the old open rules did, so the
 * test shows what the route itself decides. All data is synthetic (Ley 21.719).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';

const ADMIN = '12200000-0000-4000-8000-0000000000b1';
const OWNER = '12200000-0000-4000-8000-0000000000b2';
const OTHER_CONSULTOR = '12200000-0000-4000-8000-0000000000b3';
const DOCENTE = '12200000-0000-4000-8000-0000000000b4';
const COMMUNITY_MANAGER_OWNER = '12200000-0000-4000-8000-0000000000b5';
const ADMIN_MUST_CHANGE = '12200000-0000-4000-8000-0000000000b6';
const ADMIN_UNCONFIRMED = '12200000-0000-4000-8000-0000000000b7';
const SERVICE_KEY = 'synthetic-service-key';
const COOKIE_TOKEN = 'synthetic-cookie-token';

const ROLES: Array<{ user_id: string; role_type: string; is_active: boolean }> = [
  { user_id: ADMIN, role_type: 'admin', is_active: true },
  { user_id: OWNER, role_type: 'consultor', is_active: true },
  { user_id: OTHER_CONSULTOR, role_type: 'consultor', is_active: true },
  { user_id: DOCENTE, role_type: 'docente', is_active: true },
  { user_id: COMMUNITY_MANAGER_OWNER, role_type: 'community_manager', is_active: true },
  { user_id: ADMIN_MUST_CHANGE, role_type: 'admin', is_active: true },
  { user_id: ADMIN_UNCONFIRMED, role_type: 'admin', is_active: true },
];

const PUBLIC_FIELDS = [
  'id', 'quote_number', 'status', 'created_at', 'valid_until',
  'client_name', 'client_email', 'client_phone', 'client_institution',
  'arrival_date', 'departure_date', 'nights', 'num_pasantes', 'room_type',
  'flight_price', 'flight_notes', 'accommodation_total', 'total_per_person', 'grand_total',
  'apply_early_bird_discount', 'discount_amount', 'viaticos_type', 'viaticos_display_amount', 'notes',
];
const PRIVATE_FIELDS = ['internal_notes', 'created_by', 'updated_by', 'viaticos_amount', 'viaticos_total'];

function quoteRow(id: string, owner: string, status: string) {
  return {
    id, quote_number: 1201, status, created_at: '2026-11-01T00:00:00Z', valid_until: '2026-12-01',
    client_name: 'Colegio Sintético', client_email: 'contacto@example.invalid', client_phone: '+56 2 0000 0000',
    client_institution: 'Institución Sintética', arrival_date: '2027-03-01', departure_date: '2027-03-08',
    nights: 7, num_pasantes: 5, room_type: 'double', flight_price: 900000, flight_notes: 'Vuelo sintético',
    single_room_price: 100, double_room_price: 80, selected_programs: ['p-2', 'p-1'], program_total: 5000000,
    original_program_total: 5000000, accommodation_total: 2000000, total_per_person: 1500000, grand_total: 7500000,
    notes: 'Nota visible sintética', internal_notes: 'Nota interna sintética', viewed_at: null, accepted_at: null,
    created_by: owner, updated_by: owner, updated_at: '2026-11-02T00:00:00Z', use_groups: true,
    apply_early_bird_discount: false, early_bird_payment_date: null, discount_amount: 0,
    viaticos_type: 'daily', viaticos_amount: 50000, viaticos_total: 287500, viaticos_display_amount: 57500,
  };
}

const QUOTES: Record<string, ReturnType<typeof quoteRow>> = {
  'q-sent': quoteRow('q-sent', OWNER, 'sent'),
  'q-cm': quoteRow('q-cm', COMMUNITY_MANAGER_OWNER, 'sent'),
};
const PROGRAMS = [
  { id: 'p-2', name: 'Programa Dos', description: 'Descripción dos', price: 2000000, pdf_url: null, display_order: 1, is_active: true, created_at: 'x', updated_at: 'x' },
  { id: 'p-1', name: 'Programa Uno', description: 'Descripción uno', price: 3000000, pdf_url: 'https://example.invalid/p1.pdf', display_order: 2, is_active: true, created_at: 'x', updated_at: 'x' },
];
const GROUPS = [
  { id: 'g-1', quote_id: 'q-sent', group_name: 'Grupo A', num_participants: 2, viaticos_amount: 1 },
  { id: 'g-2', quote_id: 'q-sent', group_name: 'Grupo B', num_participants: 3, viaticos_amount: 1 },
];

type Op = [string, ...unknown[]];
type Kind = 'service' | 'caller';
const log: Array<{ kind: Kind; table: string; ops: Op[] }> = [];
let signedIn: string | null = null;

const eqValue = (ops: Op[], col: string) => ops.find(([op, c]) => op === 'eq' && c === col)?.[2];

function answer(table: string, ops: Op[]) {
  if (table === 'pasantias_quotes') {
    if (ops.some(([op]) => op === 'update')) return { data: null, error: null };
    const row = QUOTES[eqValue(ops, 'id') as string];
    if (!row) return { data: null, error: { code: 'PGRST116', message: 'not found' } };
    const select = String(ops.find(([op]) => op === 'select')?.[1] ?? '');
    const withProfile = select.includes('profiles!pasantias_quotes_created_by_fkey');
    return {
      data: withProfile
        ? { ...row, created_by: { id: row.created_by, first_name: 'Nombre', last_name: 'Sintético', email: 'autor@example.invalid' } }
        : row,
      error: null,
    };
  }
  if (table === 'pasantias_programs') {
    const ids = (ops.find(([op, col]) => op === 'in' && col === 'id')?.[2] as string[]) ?? [];
    return { data: PROGRAMS.filter((p) => ids.includes(p.id)), error: null };
  }
  if (table === 'pasantias_quote_groups') {
    return { data: GROUPS.filter((g) => g.quote_id === eqValue(ops, 'quote_id')), error: null };
  }
  if (table === 'user_roles') {
    const uid = eqValue(ops, 'user_id');
    const kinds = (ops.find(([op, col]) => op === 'in' && col === 'role_type')?.[2] as string[]) ?? null;
    return {
      data: ROLES.filter((r) => r.user_id === uid && r.is_active && (!kinds || kinds.includes(r.role_type))).map((r) => ({ role_type: r.role_type })),
      error: null,
    };
  }
  if (table === 'profiles') {
    // The password-change flag the real getForcedPasswordChangeVerdict reads:
    // ADMIN_MUST_CHANGE -> 'required', ADMIN_UNCONFIRMED -> 'unavailable'.
    const uid = eqValue(ops, 'id');
    if (uid === ADMIN_UNCONFIRMED) return { data: null, error: { code: '57014', message: 'unreadable' } };
    return { data: { must_change_password: uid === ADMIN_MUST_CHANGE }, error: null };
  }
  return { data: null, error: null };
}

function chainFor(kind: Kind, table: string) {
  const entry = { kind, table, ops: [] as Op[] };
  log.push(entry);
  const chain: any = new Proxy(
    {},
    {
      get(_t, prop: string) {
        if (prop === 'then') return (resolve: (v: unknown) => void) => resolve(answer(table, entry.ops));
        if (prop === 'single' || prop === 'maybeSingle') return async () => answer(table, entry.ops);
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
        data: { session: signedIn ? { access_token: COOKIE_TOKEN, user: { id: signedIn } } : null },
        error: null,
      })),
      getUser: vi.fn(async (token?: string) =>
        signedIn && token === COOKIE_TOKEN
          ? { data: { user: { id: signedIn } }, error: null }
          : { data: { user: null }, error: { message: 'invalid token' } }
      ),
    },
    from: vi.fn((table: string) => chainFor('caller', table)),
  };
}

vi.mock('@supabase/auth-helpers-nextjs', () => ({
  createServerSupabaseClient: vi.fn(() => cookieClient()),
  createPagesServerClient: vi.fn(() => cookieClient()),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn((_url: string, key: string) => {
    const kind: Kind = key === SERVICE_KEY ? 'service' : 'caller';
    return {
      auth: { getUser: vi.fn(async () => ({ data: { user: null }, error: { message: 'invalid token' } })) },
      from: vi.fn((table: string) => chainFor(kind, table)),
    };
  }),
}));

import quoteById from '../../../pages/api/quotes/[id]';

async function get(id: string) {
  const res: any = { statusCode: 0, body: undefined };
  res.status = (code: number) => ((res.statusCode = code), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.end = () => res;
  res.setHeader = () => res;
  await quoteById({ method: 'GET', query: { id }, headers: {}, cookies: {}, body: {} } as unknown as NextApiRequest, res);
  return res;
}

const updates = () =>
  log.flatMap((e) => (e.table === 'pasantias_quotes' ? e.ops.filter(([op]) => op === 'update').map((o) => ({ kind: e.kind, values: o[1], ops: e.ops })) : []));

const savedEnv: Record<string, string | undefined> = {};
beforeEach(() => {
  for (const k of ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY']) savedEnv[k] = process.env[k];
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:1';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'synthetic-anon-key';
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
  log.length = 0;
  signedIn = null;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  vi.restoreAllMocks();
});

function expectPublicView(body: any) {
  const quote = body.quote;
  expect(Object.keys(quote).sort()).toEqual([...PUBLIC_FIELDS, 'programs', 'groups'].sort());
  for (const f of PRIVATE_FIELDS) expect(quote).not.toHaveProperty(f);
  expect(quote.groups).toEqual([]);
  expect(quote.programs).toEqual([
    { id: 'p-2', name: 'Programa Dos', description: 'Descripción dos', price: 2000000, pdf_url: null },
    { id: 'p-1', name: 'Programa Uno', description: 'Descripción uno', price: 3000000, pdf_url: 'https://example.invalid/p1.pdf' },
  ]);
  for (const f of PUBLIC_FIELDS) expect(quote[f]).toEqual((QUOTES[quote.id] as any)[f]);
}

function expectFullView(body: any, owner: string) {
  const quote = body.quote;
  expect(quote.internal_notes).toBe('Nota interna sintética');
  expect(quote.viaticos_amount).toBe(50000);
  expect(quote.updated_by).toBe(owner);
  expect(quote.created_by).toMatchObject({ id: owner });
  expect(quote.groups).toHaveLength(2);
  expect(quote.programs[0]).toHaveProperty('display_order');
}

describe('a visitor (no session) opening the public quote link', () => {
  it('gets only the fields the public page shows', async () => {
    const res = await get('q-sent');
    expect(res.statusCode).toBe(200);
    expectPublicView(res.body);
  });

  it('marks a sent quote as seen once, with the full-rights client', async () => {
    await get('q-sent');
    const u = updates();
    expect(u).toHaveLength(1);
    expect(u[0].kind).toBe('service');
    expect(u[0].values).toMatchObject({ status: 'viewed' });
    expect(eqValue(u[0].ops, 'id')).toBe('q-sent');
  });

  it('reads the quote with the full-rights client', async () => {
    await get('q-sent');
    expect(log.filter((e) => e.table === 'pasantias_quotes' && e.kind === 'caller')).toEqual([]);
  });
});

describe('staff with full view', () => {
  it('an admin gets every field and does not mark the quote as seen', async () => {
    signedIn = ADMIN;
    const res = await get('q-sent');
    expect(res.statusCode).toBe(200);
    expectFullView(res.body, OWNER);
    expect(updates()).toEqual([]);
  });

  it('the consultor who made the quote gets every field', async () => {
    signedIn = OWNER;
    const res = await get('q-sent');
    expect(res.statusCode).toBe(200);
    expectFullView(res.body, OWNER);
    expect(updates()).toEqual([]);
  });

  it('the community manager who made the quote gets every field', async () => {
    signedIn = COMMUNITY_MANAGER_OWNER;
    const res = await get('q-cm');
    expect(res.statusCode).toBe(200);
    expect(res.body.quote.internal_notes).toBe('Nota interna sintética');
  });
});

describe('signed in without full view', () => {
  it.each([
    ['a consultor who did not make the quote', OTHER_CONSULTOR],
    ['a docente', DOCENTE],
  ])('%s gets the visitor view', async (_n, who) => {
    signedIn = who;
    const res = await get('q-sent');
    expect(res.statusCode).toBe(200);
    expectPublicView(res.body);
  });
});

describe('F7 send-back 1 (GES-1.1d)', () => {
  it.each([
    ['who must change their password', ADMIN_MUST_CHANGE],
    ['whose status cannot be confirmed', ADMIN_UNCONFIRMED],
  ])('an admin %s gets the visitor view, not the full one', async (_n, who) => {
    signedIn = who;
    const res = await get('q-sent');
    expect(res.statusCode).toBe(200);
    expectPublicView(res.body);
  });

  it('a signed-in docente opening a sent quote does not mark it as seen', async () => {
    signedIn = DOCENTE;
    await get('q-sent');
    expect(updates()).toEqual([]);
  });

  it('a visitor marks it as seen only where it is still sent and unseen', async () => {
    await get('q-sent');
    const u = updates();
    expect(u).toHaveLength(1);
    expect(eqValue(u[0].ops, 'id')).toBe('q-sent');
    expect(eqValue(u[0].ops, 'status')).toBe('sent');
    expect(u[0].ops).toContainEqual(['is', 'viewed_at', null]);
  });
});

describe('a quote that does not exist', () => {
  it.each([
    ['a visitor', null],
    ['an admin', ADMIN],
  ])('%s gets 404', async (_n, who) => {
    signedIn = who;
    const res = await get('q-missing');
    expect(res.statusCode).toBe(404);
    expect(updates()).toEqual([]);
  });
});
