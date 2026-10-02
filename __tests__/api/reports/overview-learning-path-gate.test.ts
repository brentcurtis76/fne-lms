// @vitest-environment node
/**
 * GET /api/reports/overview — learning-path half (W-B2c-01 reporting scope, Brent
 * 2026-10-02). The route runs on the SERVICE-ROLE client, which the learning-path
 * report views treat as a backend caller (every row). This suite pins:
 *   * admin, consultor, equipo_directivo: user_learning_path_summary IS read — on the
 *     CALLER's own client (their bearer JWT, so the view applies their school scope),
 *     never on the service-role client — and only for the users this route already
 *     reports on for that caller (`.in('user_id', reportable users)`);
 *   * completion counts from is_finished; the per-user at-risk flag is the view's
 *     is_at_risk (null when the learning-path half is unavailable);
 *   * every other reporting audience (lider_generacion, lider_comunidad,
 *     supervisor_de_red): NO learning-path query is issued, the learning-path figures
 *     are null (unavailable, never 0), the payload says
 *     `learning_path_reporting: 'not_available'`, and the COURSE half is served unchanged;
 *   * per-person eligibility is asked of the database on the caller's client
 *     (auth_lp_report_all / auth_lp_report_sees_user): someone the route reports on but
 *     the views hide (profiles.school_id vs active user_roles school) gets NULL figures;
 *     a visible person with no assignment keeps genuine zeros (Codex step-2 r0 #1);
 *   * one credential per request: only an exact `Bearer <token>` header is accepted, the
 *     same token is verified and forwarded to the learning-path client, and a cookie
 *     session is never mixed in (Codex step-2 r0 #2);
 *   * forced password change (Codex step-2 r1): a flagged Bearer-only caller gets the
 *     standard 403 PASSWORD_CHANGE_REQUIRED, an unreadable flag the standard 503
 *     PASSWORD_STATE_UNAVAILABLE, before any report read;
 *   * a failed learning-path query is surfaced as a warning with null figures, not as
 *     a silent zero; an internal failure is a 500, not a zeroed 200.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMocks } from 'node-mocks-http';

const ADMIN = '11111111-1111-4111-8111-111111111111';
const DIRECTIVO = '22222222-2222-4222-8222-222222222222';
const CONSULTOR = '33333333-3333-4333-8333-333333333333';
const LIDER = '44444444-4444-4444-8444-444444444444';
const USER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ANON_KEY = 'synthetic-anon-key';
const TOKEN = 'synthetic-jwt';

const { mockGetUser, mockFrom, mockCreateClient, mockRpc, mockCookieClient } = vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://synthetic.local';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'synthetic-anon-key';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-service-key';
  return { mockGetUser: vi.fn(), mockFrom: vi.fn(), mockCreateClient: vi.fn(), mockRpc: vi.fn(), mockCookieClient: vi.fn() };
});
vi.mock('@supabase/supabase-js', () => ({
  createClient: (...args: unknown[]) => {
    mockCreateClient(...args);
    // The caller's client is the one built with the anon key + the bearer JWT.
    const client = args[1] === 'synthetic-anon-key' ? 'caller' : 'service';
    return {
      auth: { getUser: mockGetUser },
      from: (table: string) => mockFrom(table, client),
      rpc: (fn: string, fnArgs?: unknown) => mockRpc(fn, fnArgs, client),
    };
  },
}));
// A cookie-session client would carry a DIFFERENT identity (COOKIE_USER); it must never be built.
vi.mock('@supabase/auth-helpers-nextjs', () => ({
  createServerSupabaseClient: (...args: unknown[]) => {
    mockCookieClient(...args);
    return {
      auth: {
        getSession: async () => ({ data: { session: { access_token: 'cookie-jwt' } }, error: null }),
        getUser: async () => ({ data: { user: { id: '99999999-9999-4999-8999-999999999999' } }, error: null }),
      },
      from: (table: string) => mockFrom(table, 'cookie'),
      rpc: (fn: string, fnArgs?: unknown) => mockRpc(fn, fnArgs, 'cookie'),
    };
  },
  createPagesServerClient: (...args: unknown[]) => mockCookieClient(...args),
}));
vi.mock('../../../lib/simulation/tenant-policy', () => ({
  readClientReportingScope: async () => ({ filterUserIds: (ids: string[]) => ids }),
}));

import handler from '../../../pages/api/reports/overview';

type Call = { table: string; client: string; ops: Array<{ method: string; args: unknown[] }> };
function installQueryDouble(results: Record<string, { data?: unknown; error?: unknown }>) {
  const calls: Call[] = [];
  mockFrom.mockImplementation((table: string, client: string) => {
    const entry: Call = { table, client, ops: [] };
    calls.push(entry);
    const chain: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'in', 'not', 'order', 'limit', 'single', 'maybeSingle']) {
      chain[method] = (...args: unknown[]) => {
        entry.ops.push({ method, args });
        return chain;
      };
    }
    chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
      const key = `${table}:${entry.ops.map((op) => op.method).join('.')}`;
      const value = results[key] ?? results[table] ?? { data: [], error: null };
      return Promise.resolve(value).then(resolve, reject);
    };
    return chain;
  });
  return calls;
}

const lpCalls = (calls: Call[]) => calls.filter((c) => c.table === 'user_learning_path_summary');

function baseResults(role: string) {
  return {
    // forced-password-change flag of the requester (service role)
    'profiles:select.eq.maybeSingle': { data: { must_change_password: false }, error: null },
    // role lookup for the requester (ordered select) and roles of reportable users
    'user_roles:select.eq.eq.order': { data: [{ role_type: role }], error: null },
    'user_roles:select.in.eq': { data: [{ user_id: USER_A, role_type: 'docente' }], error: null },
    // reportable users — consultor: consultant_assignments; admin: role scans;
    // equipo_directivo: profiles of the requester's school; lider_generacion: generation
    'consultant_assignments:select.eq.eq': { data: [{ student_id: USER_A }], error: null },
    'consultant_assignments:select.in.eq': { data: [], error: null },
    'profiles:select.eq.single': { data: { school_id: 9, generation_id: 'g1' }, error: null },
    'profiles:select.eq': { data: [{ id: USER_A }], error: null },
    profiles: { data: [{ id: USER_A, first_name: 'A', last_name: 'B', email: 'a@test.local', school_id: 9, generation_id: null, community_id: null }], error: null },
    course_enrollments: { data: [{ user_id: USER_A, course_id: 'c1', progress_percentage: 100, completed_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z' }], error: null },
    user_learning_path_summary: {
      data: [
        { user_id: USER_A, path_id: 'p1', status: 'in_progress', overall_progress_percentage: 50, total_courses: 2, completed_courses: 1, total_time_spent_minutes: 85, last_session_date: '2026-09-02T00:00:00Z', is_at_risk: true, is_finished: false },
        { user_id: USER_A, path_id: 'p2', status: 'completed', overall_progress_percentage: 100, total_courses: 1, completed_courses: 1, total_time_spent_minutes: 15, last_session_date: '2026-09-01T00:00:00Z', is_at_risk: false, is_finished: true },
      ],
      error: null,
    },
  } as Record<string, { data?: unknown; error?: unknown }>;
}

async function call(token = TOKEN) {
  return callWithHeaders({ authorization: `Bearer ${token}` });
}

async function callWithHeaders(headers: Record<string, string>) {
  const { req, res } = createMocks({ method: 'GET', headers, query: {} });
  await handler(req as never, res as never);
  return res;
}

/** Scope answers of the DB helpers, on whatever client they are asked. */
function installScope(seesAll: boolean, visible: string[] = []) {
  mockRpc.mockImplementation(async (fn: string, args: { p_user?: string } | undefined) => {
    if (fn === 'auth_lp_report_all') return { data: seesAll, error: null };
    if (fn === 'auth_lp_report_sees_user') return { data: visible.includes(args?.p_user ?? ''), error: null };
    return { data: null, error: { message: `unexpected rpc ${fn}` } };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  installScope(true);
});
afterEach(() => vi.restoreAllMocks());

describe.each([
  ['admin', ADMIN],
  ['consultor', CONSULTOR],
  ['equipo_directivo', DIRECTIVO],
])('%s (learning-path report audience)', (role, requesterId) => {
  it('reads user_learning_path_summary on the CALLER\'s client, limited to the route\'s reportable users', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: requesterId } }, error: null });
    if (role === 'equipo_directivo') installScope(false, [USER_A]);
    const calls = installQueryDouble(baseResults(role));
    const res = await call();
    expect(res._getStatusCode()).toBe(200);
    const body = res._getJSONData();
    expect(body.learning_path_reporting).toBe('included');
    const lp = lpCalls(calls);
    expect(lp).toHaveLength(1);
    // Never the service-role client: the view must apply the caller's school scope.
    expect(lp[0].client).toBe('caller');
    expect(mockCreateClient).toHaveBeenCalledWith(
      'http://synthetic.local',
      ANON_KEY,
      expect.objectContaining({ global: { headers: { Authorization: `Bearer ${TOKEN}` } } }),
    );
    // ...and only for the users this route already reports on for this caller.
    expect(lp[0].ops.find((op) => op.method === 'in')?.args).toEqual(['user_id', [USER_A]]);
    expect(String(lp[0].ops[0].args[0])).toContain('is_finished');
    // Every other read of the route is unchanged (service role).
    expect(calls.filter((c) => c.table !== 'user_learning_path_summary').every((c) => c.client === 'service')).toBe(true);
    expect(body.users[0]).toMatchObject({ id: USER_A, total_courses: 1, completed_courses: 1, total_time_spent: 100, is_at_risk: true });
    expect(body.summary.total_time_spent).toBe(100);
    expect(body.warnings).not.toContain('Rutas de aprendizaje: disponible solo para administración, consultores y equipo directivo');
    // The scope helpers are asked on the caller's client only.
    expect(mockRpc.mock.calls.length).toBeGreaterThan(0);
    expect(mockRpc.mock.calls.every((c) => c[2] === 'caller')).toBe(true);
    expect(mockCookieClient).not.toHaveBeenCalled();
  });

  it('a user not at risk on any path is is_at_risk false (a real flag, not a placeholder)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: requesterId } }, error: null });
    const results = baseResults(role);
    results.user_learning_path_summary = { data: [{ user_id: USER_A, path_id: 'p1', status: 'in_progress', total_time_spent_minutes: 5, is_at_risk: false, is_finished: false }], error: null };
    installQueryDouble(results);
    const body = (await call())._getJSONData();
    expect(body.users[0].is_at_risk).toBe(false);
  });
});

describe('per-person eligibility (Codex step-2 r0 #1)', () => {
  function directorResults() {
    const results = baseResults('equipo_directivo');
    // profiles.school_id = 9 selects A and B; only A has an active role in the director's school
    results['profiles:select.eq'] = { data: [{ id: USER_A }, { id: USER_B }], error: null };
    results.profiles = {
      data: [
        { id: USER_A, first_name: 'A', last_name: 'A', email: 'a@test.local', school_id: 9, generation_id: null, community_id: null },
        { id: USER_B, first_name: 'B', last_name: 'B', email: 'b@test.local', school_id: 9, generation_id: null, community_id: null },
      ],
      error: null,
    };
    results.user_learning_path_summary = { data: [], error: null };
    return results;
  }

  it('profiles.school_id vs active user_roles school mismatch: the hidden person gets NULL, the visible unassigned one genuine zeros', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: DIRECTIVO } }, error: null });
    installScope(false, [USER_A]);
    const calls = installQueryDouble(directorResults());
    const res = await call();
    expect(res._getStatusCode()).toBe(200);
    const body = res._getJSONData();
    expect(body.learning_path_reporting).toBe('included');
    const a = body.users.find((u: any) => u.id === USER_A);
    const b = body.users.find((u: any) => u.id === USER_B);
    expect(a).toMatchObject({ total_time_spent: 0, is_at_risk: false });
    expect(b).toMatchObject({ total_time_spent: null, is_at_risk: null });
    // the hidden person is not even asked for
    expect(lpCalls(calls)[0].ops.find((op) => op.method === 'in')?.args).toEqual(['user_id', [USER_A]]);
    expect(mockRpc).toHaveBeenCalledWith('auth_lp_report_sees_user', { p_user: USER_B }, 'caller');
  });

  it('auth_lp_report_all true: everyone the route reports on is eligible, no per-person checks', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: CONSULTOR } }, error: null });
    installScope(true);
    const results = directorResults();
    results['user_roles:select.eq.eq.order'] = { data: [{ role_type: 'consultor' }], error: null };
    results['consultant_assignments:select.eq.eq'] = { data: [{ student_id: USER_A }, { student_id: USER_B }], error: null };
    installQueryDouble(results);
    const body = (await call())._getJSONData();
    for (const u of body.users) expect(u).toMatchObject({ total_time_spent: 0, is_at_risk: false });
    expect(mockRpc.mock.calls.map((c) => c[0])).toEqual(['auth_lp_report_all']);
  });

  it('a failed scope check is a warning with null figures for everyone, and no learning-path read', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: DIRECTIVO } }, error: null });
    mockRpc.mockResolvedValue({ data: null, error: { message: 'synthetic rpc failure' } });
    const calls = installQueryDouble(directorResults());
    const body = (await call())._getJSONData();
    expect(body.warnings).toContain('No se pudieron cargar datos de rutas de aprendizaje');
    for (const u of body.users) expect(u).toMatchObject({ total_time_spent: null, is_at_risk: null });
    expect(body.summary.total_time_spent).toBeNull();
    expect(lpCalls(calls)).toHaveLength(0);
  });
});

describe('one credential per request (Codex step-2 r0 #2)', () => {
  it.each([
    ['lowercase scheme', `bearer ${TOKEN}`],
    ['other scheme', `Token ${TOKEN}`],
    ['scheme only', 'Bearer'],
    ['empty token', 'Bearer '],
    ['extra parts', `Bearer ${TOKEN} extra`],
  ])('%s: 401 before any verification or query, and no cookie fallback', async (_label, header) => {
    mockGetUser.mockResolvedValue({ data: { user: { id: ADMIN } }, error: null });
    const calls = installQueryDouble(baseResults('admin'));
    const res = await callWithHeaders({ authorization: header, cookie: 'sb-access-token=cookie-jwt' });
    expect(res._getStatusCode()).toBe(401);
    expect(mockGetUser).not.toHaveBeenCalled();
    expect(mockCookieClient).not.toHaveBeenCalled();
    expect(calls).toHaveLength(0);
  });

  it('header (admin) + cookie (someone else): the header token is verified AND forwarded; the cookie is never used', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: ADMIN } }, error: null });
    const calls = installQueryDouble(baseResults('admin'));
    const res = await callWithHeaders({ authorization: `Bearer ${TOKEN}`, cookie: 'sb-access-token=cookie-jwt' });
    expect(res._getStatusCode()).toBe(200);
    expect(mockGetUser).toHaveBeenCalledWith(TOKEN);
    expect(mockGetUser).not.toHaveBeenCalledWith('cookie-jwt');
    expect(mockCookieClient).not.toHaveBeenCalled();
    const callerClients = mockCreateClient.mock.calls.filter((c) => c[1] === ANON_KEY);
    expect(callerClients.length).toBeGreaterThan(0);
    for (const c of callerClients) {
      expect(c[2]).toMatchObject({ global: { headers: { Authorization: `Bearer ${TOKEN}` } } });
    }
    expect(calls.some((c) => c.client === 'cookie')).toBe(false);
    expect(mockRpc.mock.calls.every((c) => c[2] === 'caller')).toBe(true);
  });
});

describe('admin', () => {
  it('a failed learning-path query is a warning with null figures, not a silent zero', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: ADMIN } }, error: null });
    const results = baseResults('admin');
    results.user_learning_path_summary = { data: null, error: { message: 'synthetic view failure' } };
    installQueryDouble(results);
    const res = await call();
    expect(res._getStatusCode()).toBe(200);
    const body = res._getJSONData();
    expect(body.warnings).toContain('No se pudieron cargar datos de rutas de aprendizaje');
    expect(body.users[0].total_time_spent).toBeNull();
    expect(body.users[0].is_at_risk).toBeNull();
    expect(body.summary.total_time_spent).toBeNull();
    expect(body.users[0].total_courses).toBe(1); // the course half is still served
  });
});

describe.each([
  ['lider_generacion', LIDER],
  ['lider_comunidad', LIDER],
  ['supervisor_de_red', LIDER],
])('%s (reporting audience without learning-path reports)', (role, requesterId) => {
  it('issues no learning-path query, marks the learning-path half not_available and keeps the course half', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: requesterId } }, error: null });
    const results = baseResults(role);
    // lider_comunidad: community of the requester, then its members
    results['user_roles:select.eq.eq.not.limit.maybeSingle'] = { data: { community_id: 'cm1' }, error: null };
    results['user_roles:select.eq.eq'] = { data: [{ user_id: USER_A }], error: null };
    // supervisor_de_red: network, its schools, their people
    results['user_roles:select.eq.eq.eq.maybeSingle'] = { data: { red_id: 'r1' }, error: null };
    results['red_escuelas:select.eq'] = { data: [{ school_id: 9 }], error: null };
    results['profiles:select.in'] = results.profiles;
    const calls = installQueryDouble(results);
    const res = await call();
    expect(res._getStatusCode()).toBe(200);
    const body = res._getJSONData();
    expect(lpCalls(calls)).toHaveLength(0);
    expect(body.learning_path_reporting).toBe('not_available');
    expect(body.warnings).toContain('Rutas de aprendizaje: disponible solo para administración, consultores y equipo directivo');
    expect(body.users).toHaveLength(1);
    expect(body.users[0]).toMatchObject({ id: USER_A, total_courses: 1, completed_courses: 1, completion_rate: 100, total_time_spent: null, is_at_risk: null });
    expect(body.summary).toMatchObject({ total_users: 1, total_courses: 1, total_time_spent: null });
    expect(calls.some((c) => c.table === 'course_enrollments')).toBe(true);
  });
});

describe('empty reportable population', () => {
  it('a consultor with no assigned students: included marker, zero (not null) time, no learning-path query', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: CONSULTOR } }, error: null });
    const results = baseResults('consultor');
    results['consultant_assignments:select.eq.eq'] = { data: [], error: null };
    const calls = installQueryDouble(results);
    const res = await call();
    expect(res._getStatusCode()).toBe(200);
    const body = res._getJSONData();
    expect(body.users).toEqual([]);
    expect(body.learning_path_reporting).toBe('included');
    expect(body.summary.total_time_spent).toBe(0);
    expect(lpCalls(calls)).toHaveLength(0);
  });

  it('a lider_generacion with nobody in scope still gets the not_available marker and null time', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: LIDER } }, error: null });
    const results = baseResults('lider_generacion');
    results['profiles:select.eq'] = { data: [], error: null };
    const calls = installQueryDouble(results);
    const body = (await call())._getJSONData();
    expect(body.users).toEqual([]);
    expect(body.learning_path_reporting).toBe('not_available');
    expect(body.summary.total_time_spent).toBeNull();
    expect(lpCalls(calls)).toHaveLength(0);
  });
});

describe('failure contract', () => {
  it('an internal failure is a 500, never a zeroed 200 summary', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: ADMIN } }, error: null });
    installQueryDouble(baseResults('admin'));
    const double = mockFrom.getMockImplementation()!;
    let profileReads = 0;
    mockFrom.mockImplementation((table: string, client: string) => {
      // the 1st profiles read is the password gate; the 2nd is the report's profile load
      if (table === 'profiles' && ++profileReads === 2) throw new Error('synthetic internal failure');
      return double(table, client);
    });
    const res = await call();
    expect(res._getStatusCode()).toBe(500);
    expect(res._getJSONData()).toMatchObject({ error: 'Error interno del servidor al cargar reportes', summary: null });
  });

  it('a docente (not a reporting audience) is 403 before any report query', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_A } }, error: null });
    const calls = installQueryDouble({ 'user_roles:select.eq.eq.order': { data: [{ role_type: 'docente' }], error: null } });
    const res = await call();
    expect(res._getStatusCode()).toBe(403);
    expect(calls.map((c) => c.table)).toEqual(['profiles', 'user_roles']);
  });
});

describe('forced password change (Codex step-2 r1)', () => {
  it('a flagged Bearer-only caller is refused with the standard 403 before any report read', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: ADMIN } }, error: null });
    const results = baseResults('admin');
    results['profiles:select.eq.maybeSingle'] = { data: { must_change_password: true }, error: null };
    const calls = installQueryDouble(results);
    const res = await call();
    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData()).toMatchObject({ code: 'PASSWORD_CHANGE_REQUIRED' });
    expect(calls.map((c) => `${c.table}:${c.ops.map((o) => o.method).join('.')}`)).toEqual(['profiles:select.eq.maybeSingle']);
    expect(calls[0].client).toBe('service');
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('an unreadable password state fails closed with the standard 503 and no report read', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: DIRECTIVO } }, error: null });
    const results = baseResults('equipo_directivo');
    results['profiles:select.eq.maybeSingle'] = { data: null, error: { message: 'synthetic' } };
    const calls = installQueryDouble(results);
    const res = await call();
    expect(res._getStatusCode()).toBe(503);
    expect(res._getJSONData()).toMatchObject({ code: 'PASSWORD_STATE_UNAVAILABLE' });
    expect(calls).toHaveLength(1);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('an unflagged caller is served (200) after the check', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: ADMIN } }, error: null });
    const calls = installQueryDouble(baseResults('admin'));
    const res = await call();
    expect(res._getStatusCode()).toBe(200);
    expect(calls[0]).toMatchObject({ table: 'profiles', client: 'service' });
    expect(calls[0].ops.find((o) => o.method === 'eq')?.args).toEqual(['id', ADMIN]);
  });
});
