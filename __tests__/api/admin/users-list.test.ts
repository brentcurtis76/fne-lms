// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';

const { mockCheckIsAdminOrEquipoDirectivo, mockCreateServiceRoleClient } = vi.hoisted(() => ({
  mockCheckIsAdminOrEquipoDirectivo: vi.fn(),
  mockCreateServiceRoleClient: vi.fn(),
}));

vi.mock('../../../lib/api-auth', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    checkIsAdminOrEquipoDirectivo: mockCheckIsAdminOrEquipoDirectivo,
    createServiceRoleClient: mockCreateServiceRoleClient,
  };
});

import handler from '../../../pages/api/admin/users';

const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const ED_ID = '99999999-9999-4999-8999-999999999999';
const ED_SCHOOL_ID = 42;
const OTHER_SCHOOL_ID = 999;

interface TableResult {
  data?: unknown;
  error?: unknown;
  count?: number;
}

interface FromCall {
  table: string;
  index: number;
  eqs: Array<{ col: string; val: unknown }>;
  ins: Array<{ col: string; vals: unknown }>;
  ors: string[];
}

interface Tracker {
  fromCalls: FromCall[];
}

function makeTracker(): Tracker {
  return { fromCalls: [] };
}

/**
 * Each from(table) consumes the next configured result for that table.
 * Records .eq() and .in() filter calls so tests can assert school scoping.
 */
function buildSequencedClient(
  resultsByTable: Record<string, TableResult[]>,
  tracker?: Tracker,
) {
  const indices: Record<string, number> = {};

  return {
    from: vi.fn((table: string) => {
      const idx = indices[table] ?? 0;
      indices[table] = idx + 1;
      const result = resultsByTable[table]?.[idx] ?? { data: null };

      const fromCall: FromCall = { table, index: idx, eqs: [], ins: [], ors: [] };
      tracker?.fromCalls.push(fromCall);

      const resolved = {
        data: result.data ?? null,
        error: result.error ?? null,
        count: result.count ?? 0,
      };

      const proxyHandler: ProxyHandler<Record<string, unknown>> = {
        get(_t, prop) {
          if (prop === 'then') {
            return (resolve: (v: unknown) => void) => resolve(resolved);
          }
          if (prop === 'eq') {
            return vi.fn((col: string, val: unknown) => {
              fromCall.eqs.push({ col, val });
              return new Proxy({}, proxyHandler);
            });
          }
          if (prop === 'in') {
            return vi.fn((col: string, vals: unknown) => {
              fromCall.ins.push({ col, vals });
              return new Proxy({}, proxyHandler);
            });
          }
          if (prop === 'or') {
            return vi.fn((expr: string) => {
              fromCall.ors.push(expr);
              const match = /^school_id\.is\.null,school_id\.eq\.(\d+)$/.exec(expr);
              if (match && Array.isArray(resolved.data)) {
                const schoolId = parseInt(match[1], 10);
                resolved.data = (resolved.data as Array<Record<string, unknown>>).filter(
                  (row) => row.school_id === null || row.school_id === schoolId,
                );
              }
              return new Proxy({}, proxyHandler);
            });
          }
          return vi.fn(() => new Proxy({}, proxyHandler));
        },
      };
      return new Proxy({}, proxyHandler);
    }),
  };
}

function setupAdmin() {
  mockCheckIsAdminOrEquipoDirectivo.mockResolvedValueOnce({
    isAuthorized: true,
    role: 'admin',
    schoolId: null,
    user: { id: ADMIN_ID } as any,
    error: null,
  });
}

function setupEquipoDirectivo(schoolId: number) {
  mockCheckIsAdminOrEquipoDirectivo.mockResolvedValueOnce({
    isAuthorized: true,
    role: 'equipo_directivo',
    schoolId,
    user: { id: ED_ID } as any,
    error: null,
  });
}

function setupUnauthenticated() {
  mockCheckIsAdminOrEquipoDirectivo.mockResolvedValueOnce({
    isAuthorized: false,
    role: null,
    schoolId: null,
    user: null,
    error: new Error('No active session'),
  });
}

function setupWrongRole() {
  // Helper resolved cleanly but the user is neither admin nor ED (e.g. docente).
  mockCheckIsAdminOrEquipoDirectivo.mockResolvedValueOnce({
    isAuthorized: false,
    role: null,
    schoolId: null,
    user: { id: 'some-docente' } as any,
    error: null,
  });
}

/**
 * Stocks results for a happy-path GET that returns one user from `schoolId`.
 * Covers: profiles main query, 3 summary counts, schools list, user_roles,
 * consultant_assignments (consultant + student), course_assignments,
 * learning_path_assignments. With empty rolesData no community paths run.
 */
function stockHappyPath(schoolId: number, tracker: Tracker) {
  const profile = {
    id: 'user-1',
    email: 'u1@example.com',
    first_name: 'Foo',
    last_name: 'Bar',
    school_id: schoolId,
    approval_status: 'approved',
    created_at: '2026-01-01T00:00:00Z',
    external_school_affiliation: null,
    can_run_qa_tests: false,
    school: { id: schoolId, name: `School ${schoolId}` },
  };

  mockCreateServiceRoleClient.mockReturnValueOnce(
    buildSequencedClient(
      {
        profiles: [
          { data: [profile], count: 1 },
          { count: 1 },
          { count: 0 },
          { count: 1 },
        ],
        schools: [{ data: [{ id: schoolId, name: `School ${schoolId}` }] }],
        user_roles: [{ data: [] }],
        consultant_assignments: [{ data: [] }, { data: [] }],
        course_assignments: [{ data: [] }],
        learning_path_assignments: [{ data: [] }],
      },
      tracker,
    ),
  );
}

describe('admin/users — GET (school scoping)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('admin: full list returned, no school scoping added', async () => {
    setupAdmin();
    const tracker = makeTracker();
    stockHappyPath(7, tracker);

    const { req, res } = createMocks({ method: 'GET' });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);

    const profilesMain = tracker.fromCalls.find(
      (c) => c.table === 'profiles' && c.index === 0,
    )!;
    expect(profilesMain.eqs.find((e) => e.col === 'school_id')).toBeUndefined();

    // Summary counts must not be school-scoped for admin.
    for (const idx of [1, 2, 3]) {
      const summary = tracker.fromCalls.find(
        (c) => c.table === 'profiles' && c.index === idx,
      )!;
      expect(summary.eqs.find((e) => e.col === 'school_id')).toBeUndefined();
    }

    const schoolsCall = tracker.fromCalls.find((c) => c.table === 'schools')!;
    expect(schoolsCall.eqs.find((e) => e.col === 'id')).toBeUndefined();

    const rolesCall = tracker.fromCalls.find((c) => c.table === 'user_roles')!;
    expect(rolesCall.eqs.find((e) => e.col === 'school_id')).toBeUndefined();
  });

  it('ED with no schoolId param: profiles, summaries, schools, and user_roles are scoped to edSchoolId', async () => {
    setupEquipoDirectivo(ED_SCHOOL_ID);
    const tracker = makeTracker();
    stockHappyPath(ED_SCHOOL_ID, tracker);

    const { req, res } = createMocks({ method: 'GET' });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);

    const profilesMain = tracker.fromCalls.find(
      (c) => c.table === 'profiles' && c.index === 0,
    )!;
    expect(
      profilesMain.eqs.find((e) => e.col === 'school_id' && e.val === ED_SCHOOL_ID),
    ).toBeDefined();

    for (const idx of [1, 2, 3]) {
      const summary = tracker.fromCalls.find(
        (c) => c.table === 'profiles' && c.index === idx,
      )!;
      expect(
        summary.eqs.find((e) => e.col === 'school_id' && e.val === ED_SCHOOL_ID),
      ).toBeDefined();
    }

    const schoolsCall = tracker.fromCalls.find((c) => c.table === 'schools')!;
    expect(
      schoolsCall.eqs.find((e) => e.col === 'id' && e.val === ED_SCHOOL_ID),
    ).toBeDefined();

    // user_roles scoping is enforced via .in('user_id', userIds) — not
    // .eq('school_id', ...), so rows with school_id=NULL are still returned.
    const rolesCall = tracker.fromCalls.find((c) => c.table === 'user_roles')!;
    expect(
      rolesCall.eqs.find((e) => e.col === 'school_id'),
    ).toBeUndefined();
    expect(
      rolesCall.ins.find((i) => i.col === 'user_id'),
    ).toBeDefined();
  });

  it('ED with ?schoolId=<other>: param is ignored, scope is still edSchoolId', async () => {
    setupEquipoDirectivo(ED_SCHOOL_ID);
    const tracker = makeTracker();
    stockHappyPath(ED_SCHOOL_ID, tracker);

    const { req, res } = createMocks({
      method: 'GET',
      query: { schoolId: String(OTHER_SCHOOL_ID) },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);

    const profilesMain = tracker.fromCalls.find(
      (c) => c.table === 'profiles' && c.index === 0,
    )!;
    const profileSchoolEqs = profilesMain.eqs.filter((e) => e.col === 'school_id');
    expect(profileSchoolEqs).toHaveLength(1);
    expect(profileSchoolEqs[0].val).toBe(ED_SCHOOL_ID);
    expect(
      profileSchoolEqs.find((e) => e.val === OTHER_SCHOOL_ID),
    ).toBeUndefined();

    const schoolsCall = tracker.fromCalls.find((c) => c.table === 'schools')!;
    expect(
      schoolsCall.eqs.find((e) => e.col === 'id' && e.val === ED_SCHOOL_ID),
    ).toBeDefined();
  });

  it('ED with ?schoolId=<own>: same scoping as no param', async () => {
    setupEquipoDirectivo(ED_SCHOOL_ID);
    const tracker = makeTracker();
    stockHappyPath(ED_SCHOOL_ID, tracker);

    const { req, res } = createMocks({
      method: 'GET',
      query: { schoolId: String(ED_SCHOOL_ID) },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);

    const profilesMain = tracker.fromCalls.find(
      (c) => c.table === 'profiles' && c.index === 0,
    )!;
    expect(
      profilesMain.eqs.find((e) => e.col === 'school_id' && e.val === ED_SCHOOL_ID),
    ).toBeDefined();

    const rolesCall = tracker.fromCalls.find((c) => c.table === 'user_roles')!;
    expect(
      rolesCall.eqs.find((e) => e.col === 'school_id'),
    ).toBeUndefined();
  });

  it('unauthenticated: 401, no supabase call', async () => {
    setupUnauthenticated();

    const { req, res } = createMocks({ method: 'GET' });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(401);
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
  });

  it('wrong role (e.g. docente): rejected with 401 or 403, no supabase call', async () => {
    setupWrongRole();

    const { req, res } = createMocks({ method: 'GET' });
    await handler(req as never, res as never);

    expect([401, 403]).toContain(res._getStatusCode());
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
  });

  it('defensive guard — ED with helper returning schoolId: null gets 403', async () => {
    mockCheckIsAdminOrEquipoDirectivo.mockResolvedValueOnce({
      isAuthorized: true,
      role: 'equipo_directivo',
      schoolId: null,
      user: { id: ED_ID } as any,
      error: null,
    });

    const { req, res } = createMocks({ method: 'GET' });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(403);
    expect(JSON.parse(res._getData())).toEqual({
      error: 'School context missing for equipo_directivo',
    });
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
  });

  it('ED: user_roles rows for in-school users with school_id=NULL are still returned', async () => {
    setupEquipoDirectivo(ED_SCHOOL_ID);
    const tracker = makeTracker();

    const inSchoolProfile = {
      id: 'user-in-school',
      email: 'in@example.com',
      first_name: 'In',
      last_name: 'School',
      school_id: ED_SCHOOL_ID,
      approval_status: 'approved',
      created_at: '2026-01-01T00:00:00Z',
      external_school_affiliation: null,
      can_run_qa_tests: false,
      school: { id: ED_SCHOOL_ID, name: `School ${ED_SCHOOL_ID}` },
    };

    const roleRowWithNullSchool = {
      id: 'role-1',
      user_id: 'user-in-school',
      role_type: 'docente',
      school_id: null,
      community_id: null,
      is_active: true,
      school: null,
      generation: null,
      community: null,
    };

    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildSequencedClient(
        {
          profiles: [
            { data: [inSchoolProfile], count: 1 },
            { count: 1 },
            { count: 0 },
            { count: 1 },
          ],
          schools: [{ data: [{ id: ED_SCHOOL_ID, name: `School ${ED_SCHOOL_ID}` }] }],
          user_roles: [{ data: [roleRowWithNullSchool] }],
          consultant_assignments: [{ data: [] }, { data: [] }],
          course_assignments: [{ data: [] }],
          learning_path_assignments: [{ data: [] }],
        },
        tracker,
      ),
    );

    const { req, res } = createMocks({ method: 'GET' });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);

    const rolesCall = tracker.fromCalls.find((c) => c.table === 'user_roles')!;
    expect(rolesCall.eqs.find((e) => e.col === 'school_id')).toBeUndefined();
    expect(rolesCall.ins.find((i) => i.col === 'user_id')).toBeDefined();

    const body = JSON.parse(res._getData());
    expect(body.users).toHaveLength(1);
    expect(body.users[0].id).toBe('user-in-school');
    expect(body.users[0].user_roles).toHaveLength(1);
    expect(body.users[0].user_roles[0].school_id).toBeNull();
    expect(body.users[0].user_roles[0].role_type).toBe('docente');
  });

  it('ED: user_roles query is scoped to in-school user_ids so out-of-school role rows cannot leak', async () => {
    setupEquipoDirectivo(ED_SCHOOL_ID);
    const tracker = makeTracker();

    const inSchoolProfile = {
      id: 'user-in-school',
      email: 'in@example.com',
      first_name: 'In',
      last_name: 'School',
      school_id: ED_SCHOOL_ID,
      approval_status: 'approved',
      created_at: '2026-01-01T00:00:00Z',
      external_school_affiliation: null,
      can_run_qa_tests: false,
      school: { id: ED_SCHOOL_ID, name: `School ${ED_SCHOOL_ID}` },
    };

    // Even if the upstream DB were to return rows for an outside user, the
    // .in('user_id', [in-school ids]) filter on the user_roles query prevents
    // them from being included. We assert the filter is in place and that the
    // payload contains no role data for outside users.
    const inSchoolRoleRow = {
      id: 'role-in',
      user_id: 'user-in-school',
      role_type: 'docente',
      school_id: ED_SCHOOL_ID,
      community_id: null,
      is_active: true,
      school: { id: ED_SCHOOL_ID, name: `School ${ED_SCHOOL_ID}` },
      generation: null,
      community: null,
    };

    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildSequencedClient(
        {
          profiles: [
            { data: [inSchoolProfile], count: 1 },
            { count: 1 },
            { count: 0 },
            { count: 1 },
          ],
          schools: [{ data: [{ id: ED_SCHOOL_ID, name: `School ${ED_SCHOOL_ID}` }] }],
          user_roles: [{ data: [inSchoolRoleRow] }],
          consultant_assignments: [{ data: [] }, { data: [] }],
          course_assignments: [{ data: [] }],
          learning_path_assignments: [{ data: [] }],
        },
        tracker,
      ),
    );

    const { req, res } = createMocks({ method: 'GET' });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);

    const rolesCall = tracker.fromCalls.find((c) => c.table === 'user_roles')!;
    const userIdIn = rolesCall.ins.find((i) => i.col === 'user_id');
    expect(userIdIn).toBeDefined();
    expect(userIdIn!.vals).toEqual(['user-in-school']);
    expect((userIdIn!.vals as string[])).not.toContain('user-outside-school');

    const body = JSON.parse(res._getData());
    const allRoleUserIds = body.users.flatMap((u: any) =>
      (u.user_roles || []).map((r: any) => r.user_id),
    );
    expect(allRoleUserIds.every((id: string) => id === 'user-in-school')).toBe(true);
  });

  it('ED: null-school user_roles rows for global roles (admin/consultor/supervisor_de_red/community_manager) are filtered out', async () => {
    setupEquipoDirectivo(ED_SCHOOL_ID);
    const tracker = makeTracker();

    const inSchoolProfile = {
      id: 'user-in-school',
      email: 'in@example.com',
      first_name: 'In',
      last_name: 'School',
      school_id: ED_SCHOOL_ID,
      approval_status: 'approved',
      created_at: '2026-01-01T00:00:00Z',
      external_school_affiliation: null,
      can_run_qa_tests: false,
      school: { id: ED_SCHOOL_ID, name: `School ${ED_SCHOOL_ID}` },
    };

    const baseRoleRow = {
      user_id: 'user-in-school',
      school_id: null,
      community_id: null,
      is_active: true,
      school: null,
      generation: null,
      community: null,
    };

    const docenteRow = { ...baseRoleRow, id: 'role-docente', role_type: 'docente' };
    const adminRow = { ...baseRoleRow, id: 'role-admin', role_type: 'admin' };
    const consultorRow = { ...baseRoleRow, id: 'role-consultor', role_type: 'consultor' };
    const supervisorRow = {
      ...baseRoleRow,
      id: 'role-supervisor',
      role_type: 'supervisor_de_red',
    };
    const communityManagerRow = {
      ...baseRoleRow,
      id: 'role-cm',
      role_type: 'community_manager',
    };

    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildSequencedClient(
        {
          profiles: [
            { data: [inSchoolProfile], count: 1 },
            { count: 1 },
            { count: 0 },
            { count: 1 },
          ],
          schools: [{ data: [{ id: ED_SCHOOL_ID, name: `School ${ED_SCHOOL_ID}` }] }],
          user_roles: [
            {
              data: [
                docenteRow,
                adminRow,
                consultorRow,
                supervisorRow,
                communityManagerRow,
              ],
            },
          ],
          consultant_assignments: [{ data: [] }, { data: [] }],
          course_assignments: [{ data: [] }],
          learning_path_assignments: [{ data: [] }],
        },
        tracker,
      ),
    );

    const { req, res } = createMocks({ method: 'GET' });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);

    const body = JSON.parse(res._getData());
    expect(body.users).toHaveLength(1);
    const returnedRoles = body.users[0].user_roles;
    const returnedRoleTypes = returnedRoles.map((r: any) => r.role_type);

    expect(returnedRoleTypes).toContain('docente');
    expect(returnedRoleTypes).not.toContain('admin');
    expect(returnedRoleTypes).not.toContain('consultor');
    expect(returnedRoleTypes).not.toContain('supervisor_de_red');
    expect(returnedRoleTypes).not.toContain('community_manager');
  });

  it('admin: null-school user_roles rows for global roles are NOT filtered out', async () => {
    setupAdmin();
    const tracker = makeTracker();

    const profile = {
      id: 'user-1',
      email: 'u1@example.com',
      first_name: 'Foo',
      last_name: 'Bar',
      school_id: 7,
      approval_status: 'approved',
      created_at: '2026-01-01T00:00:00Z',
      external_school_affiliation: null,
      can_run_qa_tests: false,
      school: { id: 7, name: 'School 7' },
    };

    const baseRoleRow = {
      user_id: 'user-1',
      school_id: null,
      community_id: null,
      is_active: true,
      school: null,
      generation: null,
      community: null,
    };
    const adminRow = { ...baseRoleRow, id: 'role-admin', role_type: 'admin' };
    const consultorRow = { ...baseRoleRow, id: 'role-consultor', role_type: 'consultor' };
    const docenteRow = { ...baseRoleRow, id: 'role-docente', role_type: 'docente' };

    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildSequencedClient(
        {
          profiles: [
            { data: [profile], count: 1 },
            { count: 1 },
            { count: 0 },
            { count: 1 },
          ],
          schools: [{ data: [{ id: 7, name: 'School 7' }] }],
          user_roles: [{ data: [adminRow, consultorRow, docenteRow] }],
          consultant_assignments: [{ data: [] }, { data: [] }],
          course_assignments: [{ data: [] }],
          learning_path_assignments: [{ data: [] }],
        },
        tracker,
      ),
    );

    const { req, res } = createMocks({ method: 'GET' });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);

    const body = JSON.parse(res._getData());
    const returnedRoleTypes = body.users[0].user_roles.map((r: any) => r.role_type);
    expect(returnedRoleTypes).toEqual(
      expect.arrayContaining(['admin', 'consultor', 'docente']),
    );
    expect(returnedRoleTypes).toHaveLength(3);
  });

  it('ED: out-of-school user_roles rows for in-school users are filtered out', async () => {
    setupEquipoDirectivo(ED_SCHOOL_ID);
    const tracker = makeTracker();

    const inSchoolProfile = {
      id: 'user-in-school',
      email: 'in@example.com',
      first_name: 'In',
      last_name: 'School',
      school_id: ED_SCHOOL_ID,
      approval_status: 'approved',
      created_at: '2026-01-01T00:00:00Z',
      external_school_affiliation: null,
      can_run_qa_tests: false,
      school: { id: ED_SCHOOL_ID, name: `School ${ED_SCHOOL_ID}` },
    };

    const sameSchoolRole = {
      id: 'role-same',
      user_id: 'user-in-school',
      role_type: 'docente',
      school_id: ED_SCHOOL_ID,
      community_id: null,
      is_active: true,
      school: { id: ED_SCHOOL_ID, name: `School ${ED_SCHOOL_ID}` },
      generation: null,
      community: null,
    };

    const foreignSchoolRole = {
      id: 'role-foreign',
      user_id: 'user-in-school',
      role_type: 'docente',
      school_id: OTHER_SCHOOL_ID,
      community_id: null,
      is_active: true,
      school: { id: OTHER_SCHOOL_ID, name: `School ${OTHER_SCHOOL_ID}` },
      generation: null,
      community: null,
    };

    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildSequencedClient(
        {
          profiles: [
            { data: [inSchoolProfile], count: 1 },
            { count: 1 },
            { count: 0 },
            { count: 1 },
          ],
          schools: [{ data: [{ id: ED_SCHOOL_ID, name: `School ${ED_SCHOOL_ID}` }] }],
          user_roles: [{ data: [sameSchoolRole, foreignSchoolRole] }],
          consultant_assignments: [{ data: [] }, { data: [] }],
          course_assignments: [{ data: [] }],
          learning_path_assignments: [{ data: [] }],
        },
        tracker,
      ),
    );

    const { req, res } = createMocks({ method: 'GET' });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);

    const rolesCall = tracker.fromCalls.find((c) => c.table === 'user_roles')!;
    expect(rolesCall.ins.find((i) => i.col === 'user_id')).toBeDefined();
    expect(rolesCall.ors).toContain(
      `school_id.is.null,school_id.eq.${ED_SCHOOL_ID}`,
    );

    const body = JSON.parse(res._getData());
    expect(body.users).toHaveLength(1);
    const returnedRoles = body.users[0].user_roles;
    expect(returnedRoles).toHaveLength(1);
    expect(returnedRoles[0].id).toBe('role-same');
    expect(returnedRoles[0].school_id).toBe(ED_SCHOOL_ID);
    expect(returnedRoles.find((r: any) => r.school_id === OTHER_SCHOOL_ID)).toBeUndefined();
  });

  it('ED: GLOBAL role row stored with school_id=edSchoolId is filtered out', async () => {
    setupEquipoDirectivo(ED_SCHOOL_ID);
    const tracker = makeTracker();

    const inSchoolProfile = {
      id: 'user-in-school',
      email: 'in@example.com',
      first_name: 'In',
      last_name: 'School',
      school_id: ED_SCHOOL_ID,
      approval_status: 'approved',
      created_at: '2026-01-01T00:00:00Z',
      external_school_affiliation: null,
      can_run_qa_tests: false,
      school: { id: ED_SCHOOL_ID, name: `School ${ED_SCHOOL_ID}` },
    };

    // Anomalous data: a row with a GLOBAL role_type (admin) stored with
    // school_id=edSchoolId. The .or() mock would let it through (school_id
    // matches), so the API must additionally restrict role_type to
    // ED_ASSIGNABLE_ROLES.
    const anomalousAdminRow = {
      id: 'role-admin-anomaly',
      user_id: 'user-in-school',
      role_type: 'admin',
      school_id: ED_SCHOOL_ID,
      community_id: null,
      is_active: true,
      school: { id: ED_SCHOOL_ID, name: `School ${ED_SCHOOL_ID}` },
      generation: null,
      community: null,
    };

    const docenteRow = {
      id: 'role-docente',
      user_id: 'user-in-school',
      role_type: 'docente',
      school_id: ED_SCHOOL_ID,
      community_id: null,
      is_active: true,
      school: { id: ED_SCHOOL_ID, name: `School ${ED_SCHOOL_ID}` },
      generation: null,
      community: null,
    };

    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildSequencedClient(
        {
          profiles: [
            { data: [inSchoolProfile], count: 1 },
            { count: 1 },
            { count: 0 },
            { count: 1 },
          ],
          schools: [{ data: [{ id: ED_SCHOOL_ID, name: `School ${ED_SCHOOL_ID}` }] }],
          user_roles: [{ data: [anomalousAdminRow, docenteRow] }],
          consultant_assignments: [{ data: [] }, { data: [] }],
          course_assignments: [{ data: [] }],
          learning_path_assignments: [{ data: [] }],
        },
        tracker,
      ),
    );

    const { req, res } = createMocks({ method: 'GET' });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);

    // Query must restrict role_type to the ED-assignable whitelist.
    const rolesCall = tracker.fromCalls.find((c) => c.table === 'user_roles')!;
    const roleTypeIn = rolesCall.ins.find((i) => i.col === 'role_type');
    expect(roleTypeIn).toBeDefined();
    expect(roleTypeIn!.vals as string[]).toEqual(
      expect.arrayContaining(['docente', 'lider_comunidad', 'lider_generacion', 'equipo_directivo', 'encargado_licitacion']),
    );
    expect(roleTypeIn!.vals as string[]).not.toContain('admin');

    const body = JSON.parse(res._getData());
    expect(body.users).toHaveLength(1);
    const returnedRoleTypes = body.users[0].user_roles.map((r: any) => r.role_type);
    expect(returnedRoleTypes).toContain('docente');
    expect(returnedRoleTypes).not.toContain('admin');
  });
});
