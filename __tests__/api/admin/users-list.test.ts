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

import handler, { toQuotedInList } from '../../../pages/api/admin/users';

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
  ranges: Array<{ from: number; to: number }>;
  orders: Array<{ col: string; opts: unknown }>;
  /** Records the sequence of chainable filter methods on this query so tests
   *  can assert one runs before another (e.g. .order before .range). */
  callSequence: string[];
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

      const fromCall: FromCall = {
        table,
        index: idx,
        eqs: [],
        ins: [],
        ors: [],
        nots: [],
        ranges: [],
        orders: [],
        callSequence: [],
      };
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
              fromCall.callSequence.push('eq');
              return new Proxy({}, proxyHandler);
            });
          }
          if (prop === 'in') {
            return vi.fn((col: string, vals: unknown) => {
              fromCall.ins.push({ col, vals });
              fromCall.callSequence.push('in');
              return new Proxy({}, proxyHandler);
            });
          }
          if (prop === 'order') {
            return vi.fn((col: string, opts: unknown) => {
              fromCall.orders.push({ col, opts });
              fromCall.callSequence.push('order');
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
              fromCall.callSequence.push('not');
              return new Proxy({}, proxyHandler);
            });
          }
          if (prop === 'range') {
            return vi.fn((from: number, to: number) => {
              fromCall.ranges.push({ from, to });
              fromCall.callSequence.push('range');
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
 *
 * For ED scope, pass `isEd = true` so an extra profiles slot is prepended for
 * the in-school user_ids pre-fetch (Phase 15.7 perf: global-role check scoped
 * to in-school users instead of scanning the whole tenant).
 */
function stockHappyPath(schoolId: number, tracker: Tracker, isEd = false) {
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

  const profileSlots = isEd
    ? [
        { data: [{ id: profile.id }] }, // in-school user_ids pre-fetch
        { data: [profile], count: 1 },
        { count: 1 },
        { count: 0 },
        { count: 1 },
      ]
    : [
        { data: [profile], count: 1 },
        { count: 1 },
        { count: 0 },
        { count: 1 },
      ];

  mockCreateServiceRoleClient.mockReturnValueOnce(
    buildSequencedClient(
      {
        profiles: profileSlots,
        schools: [{ data: [{ id: schoolId, name: `School ${schoolId}` }] }],
        // For ED scope the handler issues three user_roles SELECTs:
        //   [0] pre-fetch of users with active global (non-school-scoped) roles
        //   [1] pre-fetch of users with school-scoped roles attached to ANOTHER school
        //   [2] main roles query for the returned profile ids
        // Admin scope only consumes [0] (the main roles query) — leaving the
        // remaining slots configured is harmless.
        user_roles: [{ data: [] }, { data: [] }, { data: [] }],
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
    stockHappyPath(ED_SCHOOL_ID, tracker, true);

    const { req, res } = createMocks({ method: 'GET' });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);

    // ED scope (post-F2): profiles index 0 is the in-school user_ids
    // pre-fetch (widened to include approval_status). The main paginated
    // query is index 1. Summary counts are computed in memory — there are
    // no longer separate count round-trips against profiles.
    const profilesCalls = tracker.fromCalls.filter((c) => c.table === 'profiles');
    expect(profilesCalls).toHaveLength(2);

    const profilesMain = profilesCalls[1];
    expect(
      profilesMain.eqs.find((e) => e.col === 'school_id' && e.val === ED_SCHOOL_ID),
    ).toBeDefined();

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
    stockHappyPath(ED_SCHOOL_ID, tracker, true);

    const { req, res } = createMocks({
      method: 'GET',
      query: { schoolId: String(OTHER_SCHOOL_ID) },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);

    // ED scope: main paginated query is profiles index 1 (index 0 is the
    // in-school user_ids pre-fetch).
    const profilesMain = tracker.fromCalls.find(
      (c) => c.table === 'profiles' && c.index === 1,
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
    stockHappyPath(ED_SCHOOL_ID, tracker, true);

    const { req, res } = createMocks({
      method: 'GET',
      query: { schoolId: String(ED_SCHOOL_ID) },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);

    // ED scope: main paginated query is profiles index 1 (index 0 is the
    // in-school user_ids pre-fetch).
    const profilesMain = tracker.fromCalls.find(
      (c) => c.table === 'profiles' && c.index === 1,
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
            // ED scope (Phase 15.7): [0] = in-school user_ids pre-fetch,
            // [1] = main paginated query, [2..4] = summary counts.
            { data: [{ id: 'user-in-school' }] },
            { data: [inSchoolProfile], count: 1 },
            { count: 1 },
            { count: 0 },
            { count: 1 },
          ],
          schools: [{ data: [{ id: ED_SCHOOL_ID, name: `School ${ED_SCHOOL_ID}` }] }],
          // ED scope: [0] = global-role pre-fetch (empty), [1] = cross-school
          // pre-fetch (empty), [2] = main roles
          user_roles: [{ data: [] }, { data: [] }, { data: [roleRowWithNullSchool] }],
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
            // ED scope (Phase 15.7): [0] = in-school user_ids pre-fetch.
            { data: [{ id: 'user-in-school' }] },
            { data: [inSchoolProfile], count: 1 },
            { count: 1 },
            { count: 0 },
            { count: 1 },
          ],
          schools: [{ data: [{ id: ED_SCHOOL_ID, name: `School ${ED_SCHOOL_ID}` }] }],
          // ED scope: [0] = global-role pre-fetch (empty), [1] = cross-school
          // pre-fetch (empty), [2] = main roles
          user_roles: [{ data: [] }, { data: [] }, { data: [inSchoolRoleRow] }],
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
    stockHappyPath(ED_SCHOOL_ID, tracker, true);

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
            // ED scope (Phase 15.7): [0] = in-school user_ids pre-fetch.
            { data: [{ id: 'user-in-school' }] },
            { data: [inSchoolProfile], count: 1 },
            { count: 1 },
            { count: 0 },
            { count: 1 },
          ],
          schools: [{ data: [{ id: ED_SCHOOL_ID, name: `School ${ED_SCHOOL_ID}` }] }],
          // ED scope: [0] = global-role pre-fetch (empty), [1] = cross-school
          // pre-fetch (empty), [2] = main roles
          user_roles: [{ data: [] }, { data: [] }, { data: [sameSchoolRole, foreignSchoolRole] }],
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

  it('ED: ghost in-school users (global-role holders) are filtered out client-side after the unfiltered main query', async () => {
    // F2: a user with profile.school_id = edSchoolId but also an active
    // admin/consultor/community_manager/supervisor_de_red role must NOT appear
    // in the ED's list — otherwise the row is a "ghost" the ED can see but
    // cannot edit (write-path target-role gate rejects with 403). Phase 15.16's
    // chunked `.not('id', 'in', ...)` strategy is gone; the main query now
    // returns the row and the handler drops it in memory.
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

    const excludedProfile = {
      id: EXCLUDED_USER_ID,
      email: 'ghost@example.com',
      first_name: 'Ghost',
      last_name: 'User',
      school_id: ED_SCHOOL_ID,
      approval_status: 'pending',
      created_at: '2026-01-01T00:00:00Z',
      external_school_affiliation: null,
      can_run_qa_tests: false,
      school: { id: ED_SCHOOL_ID, name: `School ${ED_SCHOOL_ID}` },
    };

    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildSequencedClient(
        {
          profiles: [
            // [0] prefetch widened to id + approval_status; returns both users.
            {
              data: [
                { id: 'user-visible', approval_status: 'approved' },
                { id: EXCLUDED_USER_ID, approval_status: 'pending' },
              ],
            },
            // [1] main paginated query — returns BOTH including the ghost; the
            // handler must filter it out client-side.
            { data: [visibleProfile, excludedProfile], count: 2 },
          ],
          schools: [{ data: [{ id: ED_SCHOOL_ID, name: `School ${ED_SCHOOL_ID}` }] }],
          // [0] global pre-fetch: one user holds a global (non-school-scoped) role.
          // [1] cross-school pre-fetch: no cross-school role holders.
          // [2] main user_roles for the returned profiles.
          user_roles: [
            { data: [{ user_id: EXCLUDED_USER_ID }] },
            { data: [] },
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

    // Pre-fetch is scoped to in-school user_ids so the user_roles scan is
    // bounded to O(school) instead of O(tenant).
    const preFetchUserIdIn = preFetch.ins.find((i) => i.col === 'user_id');
    expect(preFetchUserIdIn).toBeDefined();
    expect(preFetchUserIdIn!.vals as string[]).toEqual(
      expect.arrayContaining(['user-visible', EXCLUDED_USER_ID]),
    );

    // F2 contract: the main profiles query carries NO `.not('id', 'in', ...)`
    // exclusion clause. Exclusion is applied in memory after the fetch.
    const profilesCalls = tracker.fromCalls.filter((c) => c.table === 'profiles');
    expect(profilesCalls).toHaveLength(2);
    const profilesMain = profilesCalls[1];
    expect(profilesMain.nots.find((n) => n.col === 'id')).toBeUndefined();

    // Response payload does not contain the excluded user, even though the
    // main query returned it.
    const body = JSON.parse(res._getData());
    const returnedIds = (body.users as Array<{ id: string }>).map((u) => u.id);
    expect(returnedIds).toContain('user-visible');
    expect(returnedIds).not.toContain(EXCLUDED_USER_ID);

    // F2 summary counts are computed in memory from the prefetched in-school
    // users with excludedSet removed. Visible user is `approved`; the
    // excluded user (pending) is dropped from every bucket.
    expect(body.summary).toEqual({ total: 1, pending: 0, approved: 1 });

    // F1 contract: response `total` mirrors `summary.total` (post-exclusion),
    // not the raw `count` returned by the main paginated query (which still
    // counts the ghost row before in-memory filtering).
    expect(body.total).toBe(1);
    expect(body.total).toBe(body.summary.total);
  });

  it('ED: response `total` equals post-exclusion summary total, not raw profiles count (50 raw, 3 excluded → 47)', async () => {
    // F1 acceptance scenario: with 50 in-school profiles and 3 ghost users
    // (global-role holders), the API must report total=47 so the UI's
    // "Mostrando X-Y de Z" label and page math agree with the filtered list.
    setupEquipoDirectivo(ED_SCHOOL_ID);
    const tracker = makeTracker();

    const IN_SCHOOL_IDS = Array.from({ length: 50 }, (_, i) =>
      `aaaaaaaa-aaaa-4aaa-8aaa-${String(i).padStart(12, '0')}`,
    );
    const EXCLUDED_IDS = IN_SCHOOL_IDS.slice(0, 3);

    const buildProfile = (id: string, approval_status: string) => ({
      id,
      email: `${id}@example.com`,
      first_name: 'User',
      last_name: id.slice(-4),
      school_id: ED_SCHOOL_ID,
      approval_status,
      created_at: '2026-01-01T00:00:00Z',
      external_school_affiliation: null,
      can_run_qa_tests: false,
      school: { id: ED_SCHOOL_ID, name: `School ${ED_SCHOOL_ID}` },
    });

    // Main paginated query returns all 50 rows; handler drops the 3 ghosts in
    // memory. The raw `count` on this query is 50 (matches the unfiltered
    // result set); the API must NOT surface it as `total` for ED scope.
    const mainPageProfiles = IN_SCHOOL_IDS.map((id) =>
      buildProfile(id, 'approved'),
    );

    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildSequencedClient(
        {
          profiles: [
            // [0] in-school prefetch — all 50 users with approval_status.
            {
              data: IN_SCHOOL_IDS.map((id) => ({
                id,
                approval_status: 'approved',
              })),
            },
            // [1] main paginated query — raw count is 50, including ghosts.
            { data: mainPageProfiles, count: 50 },
          ],
          schools: [{ data: [{ id: ED_SCHOOL_ID, name: `School ${ED_SCHOOL_ID}` }] }],
          // [0] global-role pre-fetch flags 3 ghosts.
          // [1] cross-school pre-fetch (empty).
          // [2] main user_roles for returned profiles.
          user_roles: [
            { data: EXCLUDED_IDS.map((user_id) => ({ user_id })) },
            { data: [] },
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

    const body = JSON.parse(res._getData());
    expect(body.summary.total).toBe(47);
    expect(body.total).toBe(47);
    expect(body.total).not.toBe(50);
    expect(body.users).toHaveLength(47);
  });

  it('admin: response `total` uses raw profiles count (no exclusion applied)', async () => {
    // Admin path is unchanged by the F1 ED-total fix: `total` continues to
    // reflect the raw `count` returned by the main paginated query.
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

    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildSequencedClient(
        {
          profiles: [
            { data: [profile], count: 123 },
            { count: 123 },
            { count: 0 },
            { count: 123 },
          ],
          schools: [{ data: [{ id: 7, name: 'School 7' }] }],
          user_roles: [{ data: [] }],
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
    expect(body.total).toBe(123);
    expect(body.summary.total).toBe(123);
  });

  it('ED (F2): main profiles query carries no `.not(id, in, ...)` exclusion clause regardless of prefetch size', async () => {
    // Phase 15.16 chunked the main query's exclusion `.not('id', 'in', ...)`
    // across USER_ID_BATCH-sized clauses. Phase F2 removes that strategy
    // entirely — the main query has no exclusion, and rows are dropped in
    // memory afterwards. This test forces a multi-page prefetch with a
    // global-role holder on page 2 and asserts the main query is unfiltered.
    setupEquipoDirectivo(ED_SCHOOL_ID);
    const tracker = makeTracker();

    const PAGE1_IDS = Array.from({ length: 1000 }, (_, i) =>
      `aaaaaaaa-aaaa-4aaa-8aaa-${String(i).padStart(12, '0')}`,
    );
    const PAGE2_EXCLUDED = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const PAGE2_VISIBLE = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

    const visibleProfile = {
      id: PAGE2_VISIBLE,
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

    const excludedProfile = {
      ...visibleProfile,
      id: PAGE2_EXCLUDED,
      email: 'ghost@example.com',
      first_name: 'Ghost',
      approval_status: 'pending',
    };

    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildSequencedClient(
        {
          profiles: [
            // Prefetch page 1 — full BATCH=1000, so pagination must continue.
            { data: PAGE1_IDS.map((id) => ({ id, approval_status: 'approved' })) },
            // Prefetch page 2 — partial batch, loop breaks.
            {
              data: [
                { id: PAGE2_EXCLUDED, approval_status: 'pending' },
                { id: PAGE2_VISIBLE, approval_status: 'approved' },
              ],
            },
            // Main paginated query — returns BOTH; handler drops the ghost
            // client-side. No `.not('id', 'in', ...)` clause is added.
            { data: [visibleProfile, excludedProfile], count: 2 },
          ],
          schools: [{ data: [{ id: ED_SCHOOL_ID, name: `School ${ED_SCHOOL_ID}` }] }],
          // After F1 URL-length chunking, 1002 in-school ids → 11 global-role
          // batches (100*10 + 2) + 11 cross-school batches + 1 main roles.
          // The page-2 excluded user lands on the 11th global batch (the
          // partial batch holding both PAGE2 ids).
          user_roles: [
            ...Array.from({ length: 10 }, () => ({ data: [] as unknown[] })),
            { data: [{ user_id: PAGE2_EXCLUDED }] },
            ...Array.from({ length: 11 }, () => ({ data: [] as unknown[] })),
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

    const profilesCalls = tracker.fromCalls.filter((c) => c.table === 'profiles');
    // Two prefetch pages + one main query — no summary count queries for ED.
    expect(profilesCalls).toHaveLength(3);
    expect(profilesCalls[0].ranges).toEqual([{ from: 0, to: 999 }]);
    expect(profilesCalls[1].ranges).toEqual([{ from: 1000, to: 1999 }]);

    // Global-role pre-fetch must cover the *full* collected id list across all
    // chunked batches (both pages × USER_ID_BATCH=100 → 11 batches).
    const userRolesCalls = tracker.fromCalls.filter((c) => c.table === 'user_roles');
    const globalBatches = userRolesCalls.slice(0, 11);
    const idsPassed = globalBatches.flatMap(
      (c) => (c.ins.find((i) => i.col === 'user_id')?.vals as string[]) ?? [],
    );
    expect(idsPassed).toContain(PAGE2_EXCLUDED);
    expect(idsPassed).toContain(PAGE2_VISIBLE);
    expect(idsPassed.length).toBe(PAGE1_IDS.length + 2);
    for (const batch of globalBatches) {
      const batchIds = batch.ins.find((i) => i.col === 'user_id')!.vals as string[];
      expect(batchIds.length).toBeLessThanOrEqual(100);
    }

    // F2 contract: main profiles query has NO `.not('id', 'in', ...)` clause.
    const profilesMain = profilesCalls[2];
    expect(profilesMain.nots.find((n) => n.col === 'id')).toBeUndefined();

    // Response payload omits the excluded user and includes the visible one.
    const body = JSON.parse(res._getData());
    const returnedIds = (body.users as Array<{ id: string }>).map((u) => u.id);
    expect(returnedIds).not.toContain(PAGE2_EXCLUDED);
    expect(returnedIds).toContain(PAGE2_VISIBLE);
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

  it('ED (F1 cross-school): in-school users who hold an active school-scoped role at ANOTHER school are excluded', async () => {
    // A user whose profile.school_id = edSchoolId may still hold a docente
    // role attached to a different school. Every ED write against them would
    // hit the cross-school target gate (403), so the row would be a ghost.
    // The prefetch must surface them and the main profiles + summary queries
    // must exclude them via .not('id', 'in', ...).
    setupEquipoDirectivo(ED_SCHOOL_ID);
    const tracker = makeTracker();

    const CROSS_SCHOOL_USER_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

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

    const crossSchoolProfile = {
      ...visibleProfile,
      id: CROSS_SCHOOL_USER_ID,
      email: 'cross@example.com',
      first_name: 'Cross',
      approval_status: 'pending',
    };

    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildSequencedClient(
        {
          profiles: [
            // [0] in-school prefetch — visible user + the cross-school user
            // (their profile lives at ED_SCHOOL_ID even though they also hold
            // a docente role attached to OTHER_SCHOOL_ID).
            {
              data: [
                { id: 'user-visible', approval_status: 'approved' },
                { id: CROSS_SCHOOL_USER_ID, approval_status: 'pending' },
              ],
            },
            // [1] main paginated query — returns BOTH; handler drops the
            // cross-school user client-side.
            { data: [visibleProfile, crossSchoolProfile], count: 2 },
          ],
          schools: [{ data: [{ id: ED_SCHOOL_ID, name: `School ${ED_SCHOOL_ID}` }] }],
          // [0] global-role pre-fetch (empty).
          // [1] cross-school pre-fetch flags the user with a docente role at
          // another school.
          // [2] main user_roles query.
          user_roles: [
            { data: [] },
            { data: [{ user_id: CROSS_SCHOOL_USER_ID }] },
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

    const userRolesCalls = tracker.fromCalls.filter((c) => c.table === 'user_roles');
    expect(userRolesCalls.length).toBeGreaterThanOrEqual(3);

    // Cross-school pre-fetch is the SECOND user_roles call. It must:
    //  - filter active rows: .eq('is_active', true)
    //  - scope to in-school user ids: .in('user_id', [...])
    //  - restrict to school-scoped role types: .in('role_type', [...])
    //  - exclude rows tied to edSchoolId: .not('school_id', 'eq', edSchoolId)
    const crossFetch = userRolesCalls[1];
    expect(crossFetch.eqs).toContainEqual({ col: 'is_active', val: true });

    const crossUserIdIn = crossFetch.ins.find((i) => i.col === 'user_id');
    expect(crossUserIdIn).toBeDefined();
    expect(crossUserIdIn!.vals as string[]).toEqual(
      expect.arrayContaining(['user-visible', CROSS_SCHOOL_USER_ID]),
    );

    const crossRoleTypeIn = crossFetch.ins.find((i) => i.col === 'role_type');
    expect(crossRoleTypeIn).toBeDefined();
    expect(crossRoleTypeIn!.vals as string[]).toEqual(
      expect.arrayContaining(['docente', 'lider_comunidad', 'equipo_directivo']),
    );

    const crossNotSchool = crossFetch.nots.find(
      (n) => n.col === 'school_id' && n.op === 'eq',
    );
    expect(crossNotSchool).toBeDefined();
    expect(crossNotSchool!.val).toBe(ED_SCHOOL_ID);

    // F2 contract: main profiles query has NO `.not('id', 'in', ...)` clause.
    const profilesMain = tracker.fromCalls.find(
      (c) => c.table === 'profiles' && c.index === 1,
    )!;
    expect(profilesMain.nots.find((n) => n.col === 'id')).toBeUndefined();

    const body = JSON.parse(res._getData());
    const returnedIds = (body.users as Array<{ id: string }>).map((u) => u.id);
    expect(returnedIds).not.toContain(CROSS_SCHOOL_USER_ID);
    expect(returnedIds).toContain('user-visible');

    // Summary counts computed in memory: visible user is `approved`; the
    // cross-school user (pending) is removed from the excluded set.
    expect(body.summary).toEqual({ total: 1, pending: 0, approved: 1 });
  });

  it('ED (F1): a user holding both a same-school AND a cross-school school-scoped role is still excluded', async () => {
    // Double-binding edge case. The cross-school pre-fetch is based on the
    // existence of ANY active school-scoped role at a different school, even
    // if the same user also has a same-school role. Such users would still
    // fail the write-path target gate, so they remain ghosts and must be
    // hidden from the ED list.
    setupEquipoDirectivo(ED_SCHOOL_ID);
    const tracker = makeTracker();

    const DOUBLE_BOUND_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

    const doubleBoundProfile = {
      id: DOUBLE_BOUND_ID,
      email: 'double@example.com',
      first_name: 'Double',
      last_name: 'Bound',
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
            { data: [{ id: DOUBLE_BOUND_ID, approval_status: 'approved' }] },
            // Main query still returns the row; it's filtered out in memory.
            { data: [doubleBoundProfile], count: 1 },
          ],
          schools: [{ data: [{ id: ED_SCHOOL_ID, name: `School ${ED_SCHOOL_ID}` }] }],
          user_roles: [
            { data: [] },
            { data: [{ user_id: DOUBLE_BOUND_ID }] },
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

    // F2 contract: main profiles query has no `.not(id, in, ...)` clause.
    const profilesMain = tracker.fromCalls.find(
      (c) => c.table === 'profiles' && c.index === 1,
    )!;
    expect(profilesMain.nots.find((n) => n.col === 'id')).toBeUndefined();

    const body = JSON.parse(res._getData());
    const returnedIds = (body.users as Array<{ id: string }>).map((u) => u.id);
    expect(returnedIds).not.toContain(DOUBLE_BOUND_ID);
    expect(body.summary).toEqual({ total: 0, pending: 0, approved: 0 });
  });

  it('ED (F3 stable pagination): in-school user-id prefetch issues .order(id, asc) before .range(...) on every page', async () => {
    // PostgREST does not guarantee deterministic row order without an explicit
    // ORDER BY. Without stable ordering, paginated prefetch could duplicate or
    // skip ids across calls (and on retries), corrupting the F1 exclusion set.
    setupEquipoDirectivo(ED_SCHOOL_ID);
    const tracker = makeTracker();

    // Force a multi-page prefetch so we can assert ordering on every page.
    const PAGE1_IDS = Array.from({ length: 1000 }, (_, i) =>
      `aaaaaaaa-aaaa-4aaa-8aaa-${String(i).padStart(12, '0')}`,
    );
    const PAGE2_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

    const visibleProfile = {
      id: PAGE2_ID,
      email: 'p2@example.com',
      first_name: 'Page',
      last_name: 'Two',
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
            { data: PAGE1_IDS.map((id) => ({ id })) },
            { data: [{ id: PAGE2_ID }] },
            { data: [visibleProfile], count: 1 },
            { count: 1 },
            { count: 0 },
            { count: 1 },
          ],
          schools: [{ data: [{ id: ED_SCHOOL_ID, name: `School ${ED_SCHOOL_ID}` }] }],
          user_roles: [{ data: [] }, { data: [] }, { data: [] }],
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

    const profilesCalls = tracker.fromCalls.filter((c) => c.table === 'profiles');

    // Both prefetch calls must include .order('id', { ascending: true })
    // strictly BEFORE .range(...). Use callSequence to verify ordering.
    for (const prefetchIdx of [0, 1]) {
      const call = profilesCalls[prefetchIdx];
      const idOrder = call.orders.find((o) => o.col === 'id');
      expect(idOrder).toBeDefined();
      expect(idOrder!.opts).toEqual({ ascending: true });

      const orderPos = call.callSequence.indexOf('order');
      const rangePos = call.callSequence.indexOf('range');
      expect(orderPos).toBeGreaterThanOrEqual(0);
      expect(rangePos).toBeGreaterThanOrEqual(0);
      expect(orderPos).toBeLessThan(rangePos);
    }

    // Ranges remain contiguous and non-overlapping across pages.
    expect(profilesCalls[0].ranges).toEqual([{ from: 0, to: 999 }]);
    expect(profilesCalls[1].ranges).toEqual([{ from: 1000, to: 1999 }]);
  });

  it('ED (F1 URL-length): both ED-only user_roles prefetch legs are chunked at 100 ids/call, so 250 in-school users yield 3 global + 3 cross-school batches with slices 100/100/50', async () => {
    // PostgREST encodes `.in()` filters as URL query params. Large schools
    // would otherwise push request URLs past proxy/load-balancer limits and
    // trigger 414s or truncated filters. The handler must chunk both ED-only
    // legs (global-role and cross-school) at USER_ID_BATCH=100.
    setupEquipoDirectivo(ED_SCHOOL_ID);
    const tracker = makeTracker();

    const IN_SCHOOL_IDS = Array.from({ length: 250 }, (_, i) =>
      `eeeeeeee-eeee-4eee-8eee-${String(i).padStart(12, '0')}`,
    );

    const visibleProfile = {
      id: IN_SCHOOL_IDS[0],
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
            // [0] in-school user_ids pre-fetch — 250 ids fit in one PostgREST
            // page (cap is 1000), so the prefetch loop runs once.
            { data: IN_SCHOOL_IDS.map((id) => ({ id })) },
            // [1] main paginated query.
            { data: [visibleProfile], count: 1 },
            // [2..4] summary counts.
            { count: 1 },
            { count: 0 },
            { count: 1 },
          ],
          schools: [{ data: [{ id: ED_SCHOOL_ID, name: `School ${ED_SCHOOL_ID}` }] }],
          // 3 global batches + 3 cross-school batches + 1 main roles query.
          user_roles: [
            { data: [] }, { data: [] }, { data: [] },
            { data: [] }, { data: [] }, { data: [] },
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

    const userRolesCalls = tracker.fromCalls.filter((c) => c.table === 'user_roles');
    // 3 global + 3 cross-school + 1 main = 7 user_roles calls.
    expect(userRolesCalls).toHaveLength(7);

    // Verify the global-role prefetch leg (first 3 calls).
    const globalBatches = userRolesCalls.slice(0, 3);
    for (const call of globalBatches) {
      expect(call.eqs).toContainEqual({ col: 'is_active', val: true });
      expect(
        call.nots.find((n) => n.col === 'role_type' && n.op === 'in'),
      ).toBeDefined();
      const userIdIn = call.ins.find((i) => i.col === 'user_id');
      expect(userIdIn).toBeDefined();
      expect((userIdIn!.vals as string[]).length).toBeLessThanOrEqual(100);
    }
    const globalSlices = globalBatches.map(
      (c) => (c.ins.find((i) => i.col === 'user_id')!.vals as string[]).length,
    );
    expect(globalSlices).toEqual([100, 100, 50]);

    // Verify the cross-school prefetch leg (next 3 calls).
    const crossBatches = userRolesCalls.slice(3, 6);
    for (const call of crossBatches) {
      expect(call.eqs).toContainEqual({ col: 'is_active', val: true });
      const roleTypeIn = call.ins.find((i) => i.col === 'role_type');
      expect(roleTypeIn).toBeDefined();
      expect(roleTypeIn!.vals as string[]).toEqual(
        expect.arrayContaining(['docente']),
      );
      expect(
        call.nots.find((n) => n.col === 'school_id' && n.op === 'eq'),
      ).toBeDefined();
      const userIdIn = call.ins.find((i) => i.col === 'user_id');
      expect(userIdIn).toBeDefined();
      expect((userIdIn!.vals as string[]).length).toBeLessThanOrEqual(100);
    }
    const crossSlices = crossBatches.map(
      (c) => (c.ins.find((i) => i.col === 'user_id')!.vals as string[]).length,
    );
    expect(crossSlices).toEqual([100, 100, 50]);

    // Slices in order cover the full id list exactly once per leg.
    const globalCovered = globalBatches.flatMap(
      (c) => c.ins.find((i) => i.col === 'user_id')!.vals as string[],
    );
    expect(globalCovered).toEqual(IN_SCHOOL_IDS);
    const crossCovered = crossBatches.flatMap(
      (c) => c.ins.find((i) => i.col === 'user_id')!.vals as string[],
    );
    expect(crossCovered).toEqual(IN_SCHOOL_IDS);
  });

});

describe('toQuotedInList — PostgREST quoting & escaping', () => {
  it('escapes embedded backslashes and double quotes inside values', () => {
    expect(toQuotedInList(['foo"bar', 'baz\\qux'])).toBe('("foo\\"bar","baz\\\\qux")');
  });

  it('passes through plain UUID / role-identifier inputs with only normal quoting', () => {
    expect(toQuotedInList(['plain-uuid-here', 'another_role_name'])).toBe(
      '("plain-uuid-here","another_role_name")',
    );
  });
});
