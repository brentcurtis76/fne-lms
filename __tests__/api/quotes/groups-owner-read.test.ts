// @vitest-environment node
/**
 * F7 GES-1.1c — GET /api/quotes/[id]/groups follows the same owner rule as the
 * route's writes: an admin, or the person who created the quote. Only after
 * that check does the route read the groups, with the full-rights client it
 * already builds for its checks. Anyone else who passed the role check gets the
 * write branches' refusal; a quote that does not exist gets their 404.
 *
 * Only the external clients are faked; the real lib/api-auth helpers run. The
 * caller's own (cookie) client answers pasantias_quote_groups as the database
 * rule does (an admin, or the consultor who created the quote; nothing for a
 * community manager or a non-owner). All data is synthetic (Ley 21.719).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';

const ADMIN = '12300000-0000-4000-8000-0000000000c1';
const CONSULTOR_OWNER = '12300000-0000-4000-8000-0000000000c2';
const OTHER_CONSULTOR = '12300000-0000-4000-8000-0000000000c3';
const DOCENTE = '12300000-0000-4000-8000-0000000000c4';
const CM_OWNER = '12300000-0000-4000-8000-0000000000c5';
const OTHER_CM = '12300000-0000-4000-8000-0000000000c6';
const SERVICE_KEY = 'synthetic-service-key';
const COOKIE_TOKEN = 'synthetic-cookie-token';

const ROLES: Array<{ user_id: string; role_type: string; is_active: boolean }> = [
  { user_id: ADMIN, role_type: 'admin', is_active: true },
  { user_id: CONSULTOR_OWNER, role_type: 'consultor', is_active: true },
  { user_id: OTHER_CONSULTOR, role_type: 'consultor', is_active: true },
  { user_id: DOCENTE, role_type: 'docente', is_active: true },
  { user_id: CM_OWNER, role_type: 'community_manager', is_active: true },
  { user_id: OTHER_CM, role_type: 'community_manager', is_active: true },
];

const QUOTES: Record<string, { id: string; created_by: string }> = {
  'q-consultor': { id: 'q-consultor', created_by: CONSULTOR_OWNER },
  'q-cm': { id: 'q-cm', created_by: CM_OWNER },
};
const GROUPS = [
  { id: 'g-1', quote_id: 'q-consultor', group_name: 'Grupo A', arrival_date: '2027-03-01' },
  { id: 'g-2', quote_id: 'q-cm', group_name: 'Grupo B', arrival_date: '2027-03-01' },
  { id: 'g-3', quote_id: 'q-cm', group_name: 'Grupo C', arrival_date: '2027-03-05' },
];

type Op = [string, ...unknown[]];
type Kind = 'service' | 'caller';
const log: Array<{ kind: Kind; table: string; ops: Op[] }> = [];
let signedIn: string | null = null;

const eqValue = (ops: Op[], col: string) => ops.find(([op, c]) => op === 'eq' && c === col)?.[2];
const isAdmin = (uid: string | null) => ROLES.some((r) => r.user_id === uid && r.role_type === 'admin' && r.is_active);
const isConsultor = (uid: string | null) => ROLES.some((r) => r.user_id === uid && r.role_type === 'consultor' && r.is_active);

function answer(kind: Kind, table: string, ops: Op[], how: 'many' | 'single' | 'maybeSingle') {
  if (table === 'pasantias_quotes') {
    const row = QUOTES[eqValue(ops, 'id') as string];
    if (!row) {
      return how === 'maybeSingle'
        ? { data: null, error: null }
        : { data: null, error: { code: 'PGRST116', message: 'not found' } };
    }
    return { data: row, error: null };
  }
  if (table === 'pasantias_quote_groups') {
    const quoteId = eqValue(ops, 'quote_id') as string;
    const rows = GROUPS.filter((g) => g.quote_id === quoteId);
    if (kind === 'service') return { data: rows, error: null };
    // The database rule for the caller's own session.
    const quote = QUOTES[quoteId];
    const visible = isAdmin(signedIn) || (!!quote && isConsultor(signedIn) && quote.created_by === signedIn);
    return { data: visible ? rows : [], error: null };
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
    return { data: { must_change_password: false }, error: null };
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
        if (prop === 'then') return (resolve: (v: unknown) => void) => resolve(answer(kind, table, entry.ops, 'many'));
        if (prop === 'single' || prop === 'maybeSingle') return async () => answer(kind, table, entry.ops, prop);
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

import groupsHandler from '../../../pages/api/quotes/[id]/groups';

async function get(id: string) {
  const res: any = { statusCode: 0, body: undefined };
  res.status = (code: number) => ((res.statusCode = code), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.end = () => res;
  res.setHeader = () => res;
  await groupsHandler({ method: 'GET', query: { id }, headers: {}, cookies: {}, body: {} } as unknown as NextApiRequest, res);
  return res;
}

const names = (body: any) => (body.groups as Array<{ group_name: string }>).map((g) => g.group_name);
const serviceGroupReads = () => log.filter((e) => e.kind === 'service' && e.table === 'pasantias_quote_groups');

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

describe('GET /api/quotes/[id]/groups — owner or admin', () => {
  it('the community manager who made the quote gets its groups', async () => {
    signedIn = CM_OWNER;
    const res = await get('q-cm');
    expect(res.statusCode).toBe(200);
    expect(names(res.body)).toEqual(['Grupo B', 'Grupo C']);
  });

  it('the consultor who made the quote gets its groups', async () => {
    signedIn = CONSULTOR_OWNER;
    const res = await get('q-consultor');
    expect(res.statusCode).toBe(200);
    expect(names(res.body)).toEqual(['Grupo A']);
  });

  it('an admin gets the groups of any quote', async () => {
    signedIn = ADMIN;
    const res = await get('q-cm');
    expect(res.statusCode).toBe(200);
    expect(names(res.body)).toEqual(['Grupo B', 'Grupo C']);
  });
});

describe('GET /api/quotes/[id]/groups — refused', () => {
  it('a consultor who did not make the quote gets the write branches\' refusal; groups never read with full rights', async () => {
    signedIn = OTHER_CONSULTOR;
    const res = await get('q-cm');
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: 'Solo puedes editar tus propias cotizaciones' });
    expect(serviceGroupReads()).toEqual([]);
  });

  it('a community manager who did not make the quote gets the same refusal', async () => {
    signedIn = OTHER_CM;
    const res = await get('q-consultor');
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: 'Solo puedes editar tus propias cotizaciones' });
    expect(serviceGroupReads()).toEqual([]);
  });

  it('a docente gets the role check\'s refusal', async () => {
    signedIn = DOCENTE;
    const res = await get('q-consultor');
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: 'No tienes permisos para gestionar cotizaciones' });
    expect(serviceGroupReads()).toEqual([]);
  });

  it('no session gets 401', async () => {
    const res = await get('q-consultor');
    expect(res.statusCode).toBe(401);
    expect(serviceGroupReads()).toEqual([]);
  });

  it('a quote that does not exist gets the write branches\' 404', async () => {
    signedIn = ADMIN;
    const res = await get('q-missing');
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: 'Cotización no encontrada' });
    expect(serviceGroupReads()).toEqual([]);
  });
});
