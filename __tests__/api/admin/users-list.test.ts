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
  nots: Array<{ col: string; op: string; val: unknown }>;
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

      const fromCall: FromCall = { table, index: idx, eqs: [], ins: [], ors: [], nots: [] };
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
          if (prop === 'not') {
            return vi.fn((col: string, op: string, val: unknown) => {
              fromCall.nots.push({ col, op, val });
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
        // For ED scope the handler issues two user_roles SELECTs:
        //   [0] pre-fetch of users with active global (non-school-scoped) roles
        //   [1] main roles query for the returned profile ids
        // Admin scope only consumes [0] (the main roles query) — leaving [1]
        // configured is harmless.
        user_roles: [{ data: [] }, { data: [] }],
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

    // Main user_roles query is the LAST call against the table — for ED scope
    // there's also a pre-fetch of global-role holders ahead of it.
    const rolesCall = tracker.fromCalls.filter((c) => c.table === 'user_roles').at(-1)!;
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
    // Main user_roles query is the LAST call against the table — for ED scope
    // there's also a pre-fetch of global-role holders ahead of it.
    const rolesCall = tracker.fromCalls.filter((c) => c.table === 'user_roles').at(-1)!;
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

    // Main user_roles query is the LAST call against the table — for ED scope
    // there's also a pre-fetch of global-role holders ahead of it.
    const rolesCall = tracker.fromCalls.filter((c) => c.table === 'user_roles').at(-1)!;
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

  it('ED with ?communityId=<id>: 400 explicit reject (admin-only filter)', async () => {
    // F4: ED is already scoped to a single school. communityId is admin-only
    // tooling — rejecting loudly surfaces misuse, instead of silently dropping
    // the filter and returning unfiltered school-wide results.
    setupEquipoDirectivo(ED_SCHOOL_ID);

    const { req, res } = createMocks({
      method: 'GET',
      query: { communityId: 'some-community-id' },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(400);
    expect(JSON.parse(res._getData())).toEqual({
      error: 'communityId no está disponible para equipo_directivo',
    });
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
          // ED scope: [0] = global-role pre-fetch (empty), [1] = main roles
          user_roles: [{ data: [] }, { data: [roleRowWithNullSchool] }],
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

    // Main user_roles query is the LAST call against the table — for ED scope
    // there's also a pre-fetch of global-role holders ahead of it.
    const rolesCall = tracker.fromCalls.filter((c) => c.table === 'user_roles').at(-1)!;
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
          // ED scope: [0] = global-role pre-fetch (empty), [1] = main roles
          user_roles: [{ data: [] }, { data: [inSchoolRoleRow] }],
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

    // Main user_roles query is the LAST call against the table — for ED scope
    // there's also a pre-fetch of global-role holders ahead of it.
    const rolesCall = tracker.fromCalls.filter((c) => c.table === 'user_roles').at(-1)!;
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

  it('ED: user_roles query restricts role_type to SCHOOL_SCOPED_ROLES via SQL', async () => {
    // Contract-level assertion: the ED read path must push role-type filtering
    // down to Postgres via .in('role_type', SCHOOL_SCOPED_ROLES). We do not
    // assert on in-memory filtering of returned rows — there is no in-memory
    // re-check in production, and the local mock does not enforce .in() so
    // any such assertion would be misleading.
    setupEquipoDirectivo(ED_SCHOOL_ID);
    const tracker = makeTracker();
    stockHappyPath(ED_SCHOOL_ID, tracker);

    const { req, res } = createMocks({ method: 'GET' });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);

    // Main user_roles query is the LAST call against the table — for ED scope
    // there's also a pre-fetch of global-role holders ahead of it.
    const rolesCall = tracker.fromCalls.filter((c) => c.table === 'user_roles').at(-1)!;
    const roleTypeIn = rolesCall.ins.find((i) => i.col === 'role_type');
    expect(roleTypeIn).toBeDefined();
    expect(roleTypeIn!.vals as string[]).toEqual(
      expect.arrayContaining([
        'docente',
        'lider_comunidad',
        'lider_generacion',
        'equipo_directivo',
        'encargado_licitacion',
      ]),
    );
    expect(roleTypeIn!.vals as string[]).not.toContain('admin');
    expect(roleTypeIn!.vals as string[]).not.toContain('consultor');
    expect(roleTypeIn!.vals as string[]).not.toContain('supervisor_de_red');
    expect(roleTypeIn!.vals as string[]).not.toContain('community_manager');
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
          // ED scope: [0] = global-role pre-fetch (empty), [1] = main roles
          user_roles: [{ data: [] }, { data: [sameSchoolRole, foreignSchoolRole] }],
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

    // Main user_roles query is the LAST call against the table — for ED scope
    // there's also a pre-fetch of global-role holders ahead of it.
    const rolesCall = tracker.fromCalls.filter((c) => c.table === 'user_roles').at(-1)!;
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

  it('ED: profiles query excludes in-school users who hold any active global role', async () => {
    // F1: a user with profile.school_id = edSchoolId but also an active
    // admin/consultor/community_manager/supervisor_de_red role must NOT appear
    // in the ED's list — otherwise the row is a "ghost" the ED can see but
    // cannot edit (write-path target-role gate rejects with 403).
    setupEquipoDirectivo(ED_SCHOOL_ID);
    const tracker = makeTracker();

    const EXCLUDED_USER_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

    const visibleProfile = {
      id: 'user-visible',
      email: 'visible@example.com',
      first_name: 'Visible',
      last_name: 'User',
      school_id: ED_SCHOOL_ID,
      approval_status: 'approved',
      created_at: '2026-01-01T00:00:00Z',
      external_school_affiliation: null,
      can_run_qa_tests: false,
      school: { id: ED_SCHOOL_ID, name: `School ${ED_SCHOOL_ID}` },
    };

    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildSequencedClient(
        {
          profiles: [
            { data: [visibleProfile], count: 1 },
            { count: 1 },
            { count: 0 },
            { count: 1 },
          ],
          schools: [{ data: [{ id: ED_SCHOOL_ID, name: `School ${ED_SCHOOL_ID}` }] }],
          // [0] pre-fetch: one user holds a global (non-school-scoped) role.
          // [1] main user_roles for the returned profiles.
          user_roles: [
            { data: [{ user_id: EXCLUDED_USER_ID }] },
            { data: [] },
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

    // Pre-fetch (first user_roles call) must filter active rows whose
    // role_type is NOT in SCHOOL_SCOPED_ROLES.
    const userRolesCalls = tracker.fromCalls.filter((c) => c.table === 'user_roles');
    expect(userRolesCalls.length).toBeGreaterThanOrEqual(2);
    const preFetch = userRolesCalls[0];
    expect(preFetch.eqs).toContainEqual({ col: 'is_active', val: true });
    const notRoleType = preFetch.nots.find((n) => n.col === 'role_type' && n.op === 'in');
    expect(notRoleType).toBeDefined();
    const clause = notRoleType!.val as string;
    expect(clause).toContain('docente');
    expect(clause).toContain('equipo_directivo');
    expect(clause).toContain('lider_comunidad');
    expect(clause).toContain('lider_generacion');
    expect(clause).toContain('encargado_licitacion');

    // Profiles main query must exclude the global-role holder via .not('id', 'in', ...).
    const profilesMain = tracker.fromCalls.find(
      (c) => c.table === 'profiles' && c.index === 0,
    )!;
    const notId = profilesMain.nots.find((n) => n.col === 'id' && n.op === 'in');
    expect(notId).toBeDefined();
    expect(String(notId!.val)).toContain(EXCLUDED_USER_ID);

    // Summary counts must apply the same exclusion so the displayed totals
    // line up with the visible list.
    for (const idx of [1, 2, 3]) {
      const summary = tracker.fromCalls.find(
        (c) => c.table === 'profiles' && c.index === idx,
      )!;
      const summaryNotId = summary.nots.find((n) => n.col === 'id' && n.op === 'in');
      expect(summaryNotId).toBeDefined();
      expect(String(summaryNotId!.val)).toContain(EXCLUDED_USER_ID);
    }

    // Response payload does not contain the excluded user.
    const body = JSON.parse(res._getData());
    const returnedIds = (body.users as Array<{ id: string }>).map((u) => u.id);
    expect(returnedIds).not.toContain(EXCLUDED_USER_ID);
  });

  it('admin: profiles query is NOT filtered against the global-role pre-fetch', async () => {
    // F1 contract: the global-role exclusion is ED-scope only. Admin sees all
    // users and the pre-fetch is not issued.
    setupAdmin();
    const tracker = makeTracker();
    stockHappyPath(7, tracker);

    const { req, res } = createMocks({ method: 'GET' });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);

    // Admin issues exactly one user_roles call — the main roles query — and
    // the profiles query has no .not('id', 'in', ...) exclusion.
    const userRolesCalls = tracker.fromCalls.filter((c) => c.table === 'user_roles');
    expect(userRolesCalls).toHaveLength(1);

    const profilesMain = tracker.fromCalls.find(
      (c) => c.table === 'profiles' && c.index === 0,
    )!;
    expect(profilesMain.nots.find((n) => n.col === 'id')).toBeUndefined();
  });

});
