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

const SCHOOL_A = 1;
const SCHOOL_B = 2;
const COMMUNITY_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const COMMUNITY_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

type RoleRow = { user_id: string; role_type: string; school_id: number | null; community_id: string | null; is_active: boolean };
const role = (user_id: string, role_type: string, extra: Partial<RoleRow> = {}): RoleRow => ({
  user_id, role_type, school_id: null, community_id: null, is_active: true, ...extra,
});
/** CONSULTOR consults for school A / community A and also teaches in school B / community B. */
const ROLE_ROWS: RoleRow[] = [
  role(VICTIM, 'admin'),
  role(ADMIN, 'admin'),
  role(ATTACKER, 'admin', { is_active: false }),
  role(CONSULTOR, 'docente', { school_id: SCHOOL_B, community_id: COMMUNITY_B }),
  role(CONSULTOR, 'consultor', { school_id: SCHOOL_A, community_id: COMMUNITY_A }),
];
const CONSULTOR_VIA_COMMUNITY = '55555555-5555-4555-8555-555555555555';
ROLE_ROWS.push(role(CONSULTOR_VIA_COMMUNITY, 'consultor', { community_id: COMMUNITY_A }));

/** Plain tables the routes read, answered with PostgREST-style filtering. */
const TABLES: Record<string, Record<string, unknown>[]> = {
  growth_communities: [
    { id: COMMUNITY_A, school_id: SCHOOL_A, name: 'Comunidad A' },
    { id: COMMUNITY_B, school_id: SCHOOL_B, name: 'Comunidad B' },
  ],
  schools: [
    { id: SCHOOL_A, name: 'Colegio A' },
    { id: SCHOOL_B, name: 'Colegio B' },
  ],
  course_enrollments: [
    { user_id: CONSULTOR, course_id: 'course-1', lessons_completed: 1, total_lessons: 2, status: 'active', courses: { id: 'course-1', title: 'Curso Sintético', description: '' } },
  ],
  assignment_audit_log: [
    { id: 'log-1', content_type: 'course', content_id: COMMUNITY_A, action: 'assigned', created_at: '2026-10-01T00:00:00Z', performed_by: ADMIN },
  ],
  courses: [{ id: 'course-1', title: 'Curso Sintético', description: '', status: 'published' }],
};
const MUST_CHANGE = new Set<string>();
const BEARER_TOKEN = 'caller-bearer-token';
let cookiePresent = true;
const QUOTE_OWNERS: Record<string, string> = { 'q-victim': VICTIM, 'q-consultor': CONSULTOR, 'q-accepted': CONSULTOR };
const QUOTE_STATUS: Record<string, string> = { 'q-victim': 'draft', 'q-consultor': 'draft', 'q-accepted': 'accepted' };
const COOKIE_TOKEN = 'caller-own-valid-token';

type Op = [string, ...unknown[]];
const serviceLog: Array<{ table: string; ops: Op[] }> = [];
let verifiedUser: { id: string } | null = null;

const eqValue = (ops: Op[], col: string) => ops.find(([op, c]) => op === 'eq' && c === col)?.[2];

/** Applies eq / in filters like PostgREST. */
function matchRows<T extends Record<string, unknown>>(rows: T[], ops: Op[]): T[] {
  return rows.filter((r) =>
    ops.every(([op, col, a]) => {
      if (op === 'eq') return r[col as string] === a;
      if (op === 'in') return (a as unknown[]).includes(r[col as string]);
      return true;
    })
  );
}

function serviceAnswer(table: string, ops: Op[], mode: 'many' | 'one') {
  const has = (name: string) => ops.some(([op]) => op === name);
  if (table === 'profiles') {
    const id = eqValue(ops, 'id') as string;
    if (mode === 'one') return { data: { id, must_change_password: MUST_CHANGE.has(id) }, error: null };
    return { data: [], error: null };
  }
  if (table === 'user_roles') {
    if (eqValue(ops, 'user_id') !== undefined) return { data: matchRows(ROLE_ROWS, ops), error: null };
    // A group's members: everyone holding an active role in it.
    return { data: matchRows(ROLE_ROWS, ops).map((r) => ({ user_id: r.user_id })), error: null };
  }
  if (TABLES[table]) {
    const rows = matchRows(TABLES[table], ops);
    return mode === 'one' ? { data: rows[0] ?? null, error: null } : { data: rows, error: null, count: rows.length };
  }
  if (table === 'pasantias_quotes') {
    const id = eqValue(ops, 'id') as string | undefined;
    if (has('insert')) return { data: { id: 'q-new' }, error: null };
    if (has('update') || has('delete')) return { data: mode === 'one' ? { id } : null, error: null };
    return id && QUOTE_OWNERS[id]
      ? { data: { id, created_by: QUOTE_OWNERS[id], status: QUOTE_STATUS[id] }, error: null }
      : { data: null, error: null };
  }
  if (table === 'pasantias_programs') return { data: [{ id: 'p-1', price: 1000 }], error: null };
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
        data: { session: cookiePresent ? { user: { id: VICTIM }, access_token: COOKIE_TOKEN } : null },
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
    auth: {
      getUser: vi.fn(async (token?: string) =>
        token === BEARER_TOKEN && verifiedUser
          ? { data: { user: verifiedUser }, error: null }
          : { data: { user: null }, error: { message: 'invalid token' } }
      ),
    },
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

async function call(
  handler: Handler,
  method: string,
  query: Record<string, string> = {},
  body: unknown = {},
  headers: Record<string, string> = {}
) {
  const res: any = { statusCode: 0, body: undefined };
  res.status = (code: number) => ((res.statusCode = code), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.end = () => res;
  res.setHeader = () => res;
  await handler({ method, query, headers, cookies: {}, body } as unknown as NextApiRequest, res);
  return res;
}

const QUOTE_BODY = { client_name: 'Cliente', arrival_date: '2027-01-10', departure_date: '2027-01-20', room_type: 'double', selected_programs: ['p-1'], num_pasantes: 1 };

const ROUTES: Array<[string, Handler, string, Record<string, string>, unknown]> = [
  ['assignment-matrix/group-assignments', groupAssignments, 'GET', { groupType: 'community', groupId: COMMUNITY_A }, {}],
  ['assignment-matrix/audit-log', auditLog, 'GET', { contentType: 'course', contentId: COMMUNITY_A }, {}],
  ['assignment-matrix/content-stats', contentStats, 'GET', {}, {}],
  ['quotes/createV2', createQuote, 'POST', {}, QUOTE_BODY],
  ['quotes/[id] PUT', quoteById, 'PUT', { id: 'q-victim' }, { client_name: 'X' }],
  ['quotes/[id] DELETE', quoteById, 'DELETE', { id: 'q-victim' }, {}],
];

/** A verified admin's exact success: status and payload keys. */
const ADMIN_SUCCESS: Record<string, [number, string[]]> = {
  'assignment-matrix/group-assignments': [200, ['group', 'commonAssignments', 'stats']],
  'assignment-matrix/audit-log': [200, ['logs', 'total', 'page']],
  'assignment-matrix/content-stats': [200, ['courses', 'page', 'pageSize']],
  'quotes/createV2': [200, ['success', 'quote', 'share_url']],
  'quotes/[id] PUT': [200, ['success', 'quote']],
  'quotes/[id] DELETE': [200, ['success']],
};

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
  cookiePresent = true;
  MUST_CHANGE.clear();
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
    const [status, keys] = ADMIN_SUCCESS[_n];
    expect(res.statusCode).toBe(status);
    expect(Object.keys(res.body ?? {})).toEqual(expect.arrayContaining(keys));
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

describe('a consultor reads only the scope of their consultor role', () => {
  it.each([
    ['school', String(SCHOOL_A), 200],
    ['community', COMMUNITY_A, 200],
    ['school', String(SCHOOL_B), 403],
    ['community', COMMUNITY_B, 403],
  ])('group-assignments %s %s → %i', async (groupType, groupId, status) => {
    verifiedUser = { id: CONSULTOR };
    const res = await call(groupAssignments, 'GET', { groupType, groupId });
    expect(res.statusCode).toBe(status);
    if (status === 403) {
      // Refused before any member or enrolment read.
      expect(serviceLog.filter((e) => e.table === 'course_enrollments')).toEqual([]);
      expect(serviceLog.filter((e) => e.table === 'user_roles' && eqValue(e.ops, 'user_id') === undefined)).toEqual([]);
    }
  });
});

describe('quote edits cannot set protected columns', () => {
  it('drops quote_number, attribution and lifecycle timestamps from a PUT', async () => {
    verifiedUser = { id: CONSULTOR };
    const res = await call(quoteById, 'PUT', { id: 'q-consultor' }, {
      client_name: 'Nuevo',
      status: 'sent',
      quote_number: 1,
      created_by: VICTIM,
      updated_by: VICTIM,
      viewed_at: '2026-01-01T00:00:00Z',
      accepted_at: '2026-01-01T00:00:00Z',
      created_at: '2020-01-01T00:00:00Z',
      id: 'q-other',
      nights: 99,
    });
    expect(res.statusCode).toBe(200);
    const update = writes().find(([t, o]) => t === 'pasantias_quotes' && o === 'update')?.[2] as Record<string, unknown>;
    expect(update).toMatchObject({ client_name: 'Nuevo', status: 'sent', updated_by: CONSULTOR });
    for (const k of ['quote_number', 'created_by', 'viewed_at', 'accepted_at', 'created_at', 'id', 'nights']) {
      expect(update).not.toHaveProperty(k);
    }
  });
});

describe('inactive roles, the password gate and Bearer callers', () => {
  it.each(ROUTES)('%s: an inactive admin row grants nothing', async (_n, handler, method, query, body) => {
    verifiedUser = { id: ATTACKER }; // holds only an inactive admin row
    const res = await call(handler, method, query, body);
    expect(res.statusCode).toBe(403);
    expect(writes()).toEqual([]);
  });

  it.each(ROUTES)('%s: an admin who must change their password is held before any role read', async (_n, handler, method, query, body) => {
    verifiedUser = { id: ADMIN };
    MUST_CHANGE.add(ADMIN);
    const res = await call(handler, method, query, body);
    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({ code: 'PASSWORD_CHANGE_REQUIRED' });
    expect(serviceLog.filter((e) => e.table !== 'profiles')).toEqual([]);
  });

  it.each(ROUTES)('%s: a verified Bearer admin with no cookie succeeds', async (_n, handler, method, query, body) => {
    cookiePresent = false;
    verifiedUser = { id: ADMIN };
    const res = await call(handler, method, query, body, { authorization: `Bearer ${BEARER_TOKEN}` });
    expect(res.statusCode).toBe(ADMIN_SUCCESS[_n][0]);
    expect(askedIds()).toContain(ADMIN);
  });
});

describe('populated results for a verified admin', () => {
  it('group-assignments aggregates the community members\' courses', async () => {
    verifiedUser = { id: ADMIN };
    const res = await call(groupAssignments, 'GET', { groupType: 'community', groupId: COMMUNITY_A });
    expect(res.statusCode).toBe(200);
    expect(res.body.stats.totalMembers).toBeGreaterThan(0);
    expect(JSON.stringify(res.body.commonAssignments)).toContain('Curso Sintético');
  });

  it('audit-log returns the seeded entry', async () => {
    verifiedUser = { id: ADMIN };
    const res = await call(auditLog, 'GET', { contentType: 'course', contentId: COMMUNITY_A });
    expect(res.statusCode).toBe(200);
    expect(res.body.logs).toHaveLength(1);
  });

  it('content-stats lists the seeded course', async () => {
    verifiedUser = { id: ADMIN };
    const res = await call(contentStats, 'GET', {});
    expect(res.statusCode).toBe(200);
    expect(JSON.stringify(res.body.courses)).toContain('course-1');
  });

  it('a consultor holding only community A reaches school A through it, not school B', async () => {
    verifiedUser = { id: CONSULTOR_VIA_COMMUNITY };
    expect((await call(groupAssignments, 'GET', { groupType: 'school', groupId: String(SCHOOL_A) })).statusCode).toBe(200);
    expect((await call(groupAssignments, 'GET', { groupType: 'school', groupId: String(SCHOOL_B) })).statusCode).toBe(403);
  });
});

describe('quote status and travel groups on PUT', () => {
  it.each(['accepted', 'viewed', 'rejected', 'expired'])('an owner cannot set status %s by hand', async (status) => {
    verifiedUser = { id: CONSULTOR };
    const res = await call(quoteById, 'PUT', { id: 'q-consultor' }, { client_name: 'X', status });
    expect(res.statusCode).toBe(400);
    expect(writes()).toEqual([]);
  });

  it('an admin cannot either', async () => {
    verifiedUser = { id: ADMIN };
    const res = await call(quoteById, 'PUT', { id: 'q-consultor' }, { status: 'accepted' });
    expect(res.statusCode).toBe(400);
    expect(writes()).toEqual([]);
  });

  it.each([
    ['q-consultor', 'sent'],
    ['q-consultor', 'draft'],
    ['q-accepted', 'accepted'],
  ])('%s may be saved with status %s (publish, or unchanged)', async (id, status) => {
    verifiedUser = { id: CONSULTOR };
    const res = await call(quoteById, 'PUT', { id }, { client_name: 'X', status });
    expect(res.statusCode).toBe(200);
    const update = writes().find(([t, o]) => t === 'pasantias_quotes' && o === 'update')?.[2];
    expect(update).toMatchObject({ status });
  });

  it('a save carrying travel groups is refused instead of silently dropping them', async () => {
    verifiedUser = { id: CONSULTOR };
    const res = await call(quoteById, 'PUT', { id: 'q-consultor' }, { client_name: 'X', use_groups: true, groups: [{ name: 'g' }] });
    expect(res.statusCode).toBe(400);
    expect(writes()).toEqual([]);
  });
});
