// @vitest-environment node
/**
 * RLS closure C3 (2026-09-07) — GET /api/reports/overview runs on the SERVICE-ROLE client, so
 * the settled rule "cross-user learning-path reporting is literal-admin-only" (W-B2c-01) must
 * be enforced in the route itself, not by the summary view's own filter. This suite pins:
 *   * admin: user_learning_path_summary is queried and learning-path time is reported;
 *   * every other reporting audience (consultor, equipo_directivo, lider_generacion,
 *     lider_comunidad, supervisor_de_red): NO learning-path query is issued, the
 *     learning-path time is null (unavailable, never 0) for every user and for the summary,
 *     the payload says `learning_path_reporting: 'admin_only'`, and the COURSE half is
 *     served unchanged;
 *   * a failed learning-path query for the admin is surfaced as a warning with null time,
 *     not as a silent zero; an internal failure is a 500, not a zeroed 200.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMocks } from 'node-mocks-http';

const ADMIN = '11111111-1111-4111-8111-111111111111';
const CONSULTOR = '33333333-3333-4333-8333-333333333333';
const USER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const { mockGetUser, mockFrom } = vi.hoisted(() => ({ mockGetUser: vi.fn(), mockFrom: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { getUser: mockGetUser }, from: mockFrom }),
}));
vi.mock('../../../lib/simulation/tenant-policy', () => ({
  readClientReportingScope: async () => ({ filterUserIds: (ids: string[]) => ids }),
}));

import handler from '../../../pages/api/reports/overview';

type Call = { table: string; ops: Array<{ method: string; args: unknown[] }> };
function installQueryDouble(results: Record<string, { data?: unknown; error?: unknown }>) {
  const calls: Call[] = [];
  mockFrom.mockImplementation((table: string) => {
    const entry: Call = { table, ops: [] };
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

function baseResults(role: string, requesterId: string) {
  return {
    // role lookup for the requester (ordered select) and roles of reportable users
    'user_roles:select.eq.eq.order': { data: [{ role_type: role }], error: null },
    'user_roles:select.in.eq': { data: [{ user_id: USER_A, role_type: 'docente' }], error: null },
    // reportable users for a consultor: consultant_assignments; for admin: role scans
    'consultant_assignments:select.eq.eq': { data: [{ student_id: USER_A }], error: null },
    'consultant_assignments:select.in.eq': { data: [], error: null },
    'user_roles:select.in.eq#roles': { data: [], error: null },
    profiles: { data: [{ id: USER_A, first_name: 'A', last_name: 'B', email: 'a@test.local', school_id: null, generation_id: null, community_id: null }], error: null },
    course_enrollments: { data: [{ user_id: USER_A, course_id: 'c1', progress_percentage: 100, completed_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z' }], error: null },
    user_learning_path_summary: { data: [{ user_id: USER_A, path_id: 'p1', status: 'in_progress', overall_progress_percentage: 50, total_courses: 2, completed_courses: 1, total_time_spent_minutes: 85, last_session_date: '2026-09-02T00:00:00Z', is_at_risk: null }], error: null },
  } as Record<string, { data?: unknown; error?: unknown }>;
}

async function call(token = 'synthetic-jwt') {
  const { req, res } = createMocks({ method: 'GET', headers: { authorization: `Bearer ${token}` }, query: {} });
  await handler(req as never, res as never);
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

describe('admin', () => {
  it('queries user_learning_path_summary and reports learning-path time', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: ADMIN } }, error: null });
    const results = baseResults('admin', ADMIN);
    // admin reportable users: teaching roles + student roles scans return USER_A
    results['user_roles:select.in.eq'] = { data: [{ user_id: USER_A, role_type: 'docente' }], error: null };
    const calls = installQueryDouble(results);
    const res = await call();
    expect(res._getStatusCode()).toBe(200);
    const body = res._getJSONData();
    expect(body.learning_path_reporting).toBe('included');
    expect(calls.some((c) => c.table === 'user_learning_path_summary')).toBe(true);
    expect(body.users[0]).toMatchObject({ id: USER_A, total_courses: 1, completed_courses: 1, total_time_spent: 85 });
    expect(body.summary.total_time_spent).toBe(85);
  });

  it('a failed learning-path query is a warning with null time, not a silent zero', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: ADMIN } }, error: null });
    const results = baseResults('admin', ADMIN);
    results['user_roles:select.in.eq'] = { data: [{ user_id: USER_A, role_type: 'docente' }], error: null };
    results.user_learning_path_summary = { data: null, error: { message: 'synthetic view failure' } };
    installQueryDouble(results);
    const res = await call();
    expect(res._getStatusCode()).toBe(200);
    const body = res._getJSONData();
    expect(body.warnings).toContain('No se pudieron cargar datos de rutas de aprendizaje');
    expect(body.users[0].total_time_spent).toBeNull();
    expect(body.summary.total_time_spent).toBeNull();
    expect(body.users[0].total_courses).toBe(1); // the course half is still served
  });
});

describe.each([
  ['consultor', CONSULTOR],
])('%s (non-admin reporting audience)', (role, requesterId) => {
  it('issues no learning-path query, marks the learning-path half admin_only and keeps the course half', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: requesterId } }, error: null });
    const calls = installQueryDouble(baseResults(role, requesterId));
    const res = await call();
    expect(res._getStatusCode()).toBe(200);
    const body = res._getJSONData();
    expect(calls.some((c) => c.table === 'user_learning_path_summary')).toBe(false);
    expect(body.learning_path_reporting).toBe('admin_only');
    expect(body.warnings).toContain('Tiempo de rutas de aprendizaje: disponible solo para administradores');
    expect(body.users).toHaveLength(1);
    expect(body.users[0]).toMatchObject({ id: USER_A, total_courses: 1, completed_courses: 1, completion_rate: 100, total_time_spent: null });
    expect(body.summary).toMatchObject({ total_users: 1, total_courses: 1, total_time_spent: null });
    expect(calls.some((c) => c.table === 'course_enrollments')).toBe(true);
  });
});

describe('empty reportable population', () => {
  it('a consultor with no assigned students still gets the admin_only marker and null learning-path time', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: CONSULTOR } }, error: null });
    const results = baseResults('consultor', CONSULTOR);
    results['consultant_assignments:select.eq.eq'] = { data: [], error: null };
    const calls = installQueryDouble(results);
    const res = await call();
    expect(res._getStatusCode()).toBe(200);
    const body = res._getJSONData();
    expect(body.users).toEqual([]);
    expect(body.learning_path_reporting).toBe('admin_only');
    expect(body.summary.total_time_spent).toBeNull();
    expect(body.warnings).toContain('Tiempo de rutas de aprendizaje: disponible solo para administradores');
    expect(calls.some((c) => c.table === 'user_learning_path_summary')).toBe(false);
  });
});

describe('failure contract', () => {
  it('an internal failure is a 500, never a zeroed 200 summary', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: ADMIN } }, error: null });
    const results = baseResults('admin', ADMIN);
    results['user_roles:select.in.eq'] = { data: [{ user_id: USER_A, role_type: 'docente' }], error: null };
    installQueryDouble(results);
    const double = mockFrom.getMockImplementation()!;
    mockFrom.mockImplementation((table: string) => {
      if (table === 'profiles') throw new Error('synthetic internal failure');
      return double(table);
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
    expect(calls.map((c) => c.table)).toEqual(['user_roles']);
  });
});
