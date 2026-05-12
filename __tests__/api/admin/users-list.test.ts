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
import { toQuotedInList } from '../../../lib/admin/users-query';

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

  it('ED (F1 SQL path): a small ghost set (<=MAX_EXCLUDED_FOR_SQL) is excluded via .not(id, in, ...) on main + count queries', async () => {
    // Phase 15.19 hybrid exclusion: with 1 ghost user the excluded set is
    // well below MAX_EXCLUDED_FOR_SQL=100, so the handler applies
    // `.not('id', 'in', ...)` directly to the paginated profiles query AND
    // to the three scoped count queries. PostgREST returns the
    // post-exclusion rows + count, and `total` is sourced from that count.
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
            // [0] in-school prefetch (id + approval_status).
            {
              data: [
                { id: 'user-visible', approval_status: 'approved' },
                { id: EXCLUDED_USER_ID, approval_status: 'pending' },
              ],
            },
            // [1] main paginated query — PostgREST would have applied
            // `.not('id', 'in', ...)` server-side, so the simulated result
            // contains only the visible row with count=1.
            { data: [visibleProfile], count: 1 },
            // [2..4] scoped count queries (total / pending / approved) with
            // the same exclusion applied.
            { count: 1 },
            { count: 0 },
            { count: 1 },
          ],
          schools: [{ data: [{ id: ED_SCHOOL_ID, name: `School ${ED_SCHOOL_ID}` }] }],
          // [0] global pre-fetch flags one user.
          // [1] cross-school pre-fetch (empty).
          // [2] main user_roles for returned profiles.
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

    // Pre-fetch (first user_roles call) still filters active rows whose
    // role_type is NOT in SCHOOL_SCOPED_ROLES.
    const userRolesCalls = tracker.fromCalls.filter((c) => c.table === 'user_roles');
    expect(userRolesCalls.length).toBeGreaterThanOrEqual(2);
    const preFetch = userRolesCalls[0];
    expect(preFetch.eqs).toContainEqual({ col: 'is_active', val: true });
    const notRoleType = preFetch.nots.find((n) => n.col === 'role_type' && n.op === 'in');
    expect(notRoleType).toBeDefined();

    // SQL path: prefetch + main + 3 count queries = 5 profiles calls.
    const profilesCalls = tracker.fromCalls.filter((c) => c.table === 'profiles');
    expect(profilesCalls).toHaveLength(5);

    // Main profiles query carries `.not('id', 'in', toQuotedInList([excluded]))`.
    const profilesMain = profilesCalls[1];
    const mainNotId = profilesMain.nots.find((n) => n.col === 'id' && n.op === 'in');
    expect(mainNotId).toBeDefined();
    expect(mainNotId!.val as string).toContain(EXCLUDED_USER_ID);

    // All three scoped count queries also carry the same `.not(id, in, ...)`.
    for (const idx of [2, 3, 4]) {
      const countCall = profilesCalls[idx];
      const notId = countCall.nots.find((n) => n.col === 'id' && n.op === 'in');
      expect(notId).toBeDefined();
      expect(notId!.val as string).toContain(EXCLUDED_USER_ID);
      // Count queries are school-scoped (eq school_id = edSchoolId).
      expect(countCall.eqs).toContainEqual({ col: 'school_id', val: ED_SCHOOL_ID });
    }

    // Response payload reflects the SQL-filtered main query — visible only.
    const body = JSON.parse(res._getData());
    const returnedIds = (body.users as Array<{ id: string }>).map((u) => u.id);
    expect(returnedIds).toEqual(['user-visible']);
    expect(returnedIds).not.toContain(EXCLUDED_USER_ID);

    // Summary comes from the SQL-applied count queries.
    expect(body.summary).toEqual({ total: 1, pending: 0, approved: 1 });

    // `total` is sourced from the SQL-applied count on the main query.
    expect(body.total).toBe(1);
  });

  it('ED (F1 SQL path): response `total` equals SQL-applied count (50 raw, 3 ghosts → 47)', async () => {
    // F1 acceptance scenario: with 50 in-school profiles and 3 ghost users
    // (global-role holders), the SQL path applies `.not('id', 'in', ...)` so
    // PostgREST returns count=47 directly. `total` reflects that, and pagination
    // offsets apply to the already-filtered row set.
    setupEquipoDirectivo(ED_SCHOOL_ID);
    const tracker = makeTracker();

    const IN_SCHOOL_IDS = Array.from({ length: 50 }, (_, i) =>
      `aaaaaaaa-aaaa-4aaa-8aaa-${String(i).padStart(12, '0')}`,
    );
    const EXCLUDED_IDS = IN_SCHOOL_IDS.slice(0, 3);
    const VISIBLE_IDS = IN_SCHOOL_IDS.slice(3);

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

    // SQL path mock: main query is server-side filtered, returns 47 rows
    // and count=47. Page size defaults to 25 in the handler, but the mock
    // doesn't enforce `.range()`, so returning the full visible set works.
    const visibleProfiles = VISIBLE_IDS.map((id) => buildProfile(id, 'approved'));

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
            // [1] main paginated query — SQL exclusion applied → 47 / count=47.
            { data: visibleProfiles, count: 47 },
            // [2..4] scoped count queries: total=47, pending=0, approved=47.
            { count: 47 },
            { count: 0 },
            { count: 47 },
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

    // Main profiles query carries `.not('id', 'in', toQuotedInList([excluded ids]))`.
    const profilesCalls = tracker.fromCalls.filter((c) => c.table === 'profiles');
    const profilesMain = profilesCalls[1];
    const mainNotId = profilesMain.nots.find((n) => n.col === 'id' && n.op === 'in');
    expect(mainNotId).toBeDefined();
    for (const excludedId of EXCLUDED_IDS) {
      expect(mainNotId!.val as string).toContain(excludedId);
    }

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

  it('ED (0-excluded path) with status=pending: `total` equals filtered DB count, not unfiltered summary.total', async () => {
    // Phase 15.23 regression: with zero ghost users, `useSqlExclusion` and
    // `useClientFallback` are both false, so the response `total` must come
    // from the filtered DB `count` (which already reflects ?status=pending),
    // not from `summary.total` (the in-memory in-school count that ignores
    // the status filter). Previously the handler returned `summary.total`
    // here, inflating pagination when filters were active.
    setupEquipoDirectivo(ED_SCHOOL_ID);
    const tracker = makeTracker();

    // 10 in-school users: 3 pending, 7 approved. None are ghosts.
    const IN_SCHOOL = [
      ...Array.from({ length: 3 }, (_, i) => ({
        id: `pppppppp-pppp-4ppp-8ppp-${String(i).padStart(12, '0')}`,
        approval_status: 'pending',
      })),
      ...Array.from({ length: 7 }, (_, i) => ({
        id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(i).padStart(12, '0')}`,
        approval_status: 'approved',
      })),
    ];

    const pendingProfiles = IN_SCHOOL.filter((u) => u.approval_status === 'pending').map(
      (u) => ({
        id: u.id,
        email: `${u.id}@example.com`,
        first_name: 'Pending',
        last_name: u.id.slice(-4),
        school_id: ED_SCHOOL_ID,
        approval_status: 'pending',
        created_at: '2026-01-01T00:00:00Z',
        external_school_affiliation: null,
        can_run_qa_tests: false,
        school: { id: ED_SCHOOL_ID, name: `School ${ED_SCHOOL_ID}` },
      }),
    );

    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildSequencedClient(
        {
          profiles: [
            // [0] in-school prefetch — 10 users with approval_status.
            { data: IN_SCHOOL },
            // [1] main paginated query — server-side ?status=pending filter
            // applied, so PostgREST returns the 3 pending rows and count=3.
            { data: pendingProfiles, count: 3 },
          ],
          schools: [{ data: [{ id: ED_SCHOOL_ID, name: `School ${ED_SCHOOL_ID}` }] }],
          // [0] global-role prefetch (empty — no ghosts).
          // [1] cross-school prefetch (empty — no ghosts).
          // [2] main user_roles for returned profiles.
          user_roles: [{ data: [] }, { data: [] }, { data: [] }],
          consultant_assignments: [{ data: [] }, { data: [] }],
          course_assignments: [{ data: [] }],
          learning_path_assignments: [{ data: [] }],
        },
        tracker,
      ),
    );

    const { req, res } = createMocks({ method: 'GET', query: { status: 'pending' } });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);

    // 0-excluded path: no scoped count queries are issued — prefetch + main = 2.
    const profilesCalls = tracker.fromCalls.filter((c) => c.table === 'profiles');
    expect(profilesCalls).toHaveLength(2);

    // Main profiles query applied the status filter and was NOT decorated
    // with any `.not('id', 'in', ...)` exclusion clause.
    const profilesMain = profilesCalls[1];
    expect(
      profilesMain.eqs.find((e) => e.col === 'approval_status' && e.val === 'pending'),
    ).toBeDefined();
    expect(profilesMain.nots.find((n) => n.col === 'id' && n.op === 'in')).toBeUndefined();

    const body = JSON.parse(res._getData());
    // `total` must equal the filtered DB `count` (3 pending), not the
    // unfiltered in-school summary total (10).
    expect(body.total).toBe(3);
    expect(body.summary.total).toBe(10);
    expect(body.total).not.toBe(body.summary.total);
    expect(body.users).toHaveLength(3);
  });

  it('ED (0-excluded path) with search filter: `total` equals filtered DB count, not unfiltered summary.total', async () => {
    // Phase 15.23: same guarantee as the status-filter case but driven by a
    // ?search= query parameter. The filtered DB `count` reflects the
    // ilike-matched row count and is the correct pagination total; the
    // unfiltered in-memory summary must not leak through.
    setupEquipoDirectivo(ED_SCHOOL_ID);
    const tracker = makeTracker();

    // 8 in-school users, none ghosts. Only 2 match the search term in the
    // simulated DB response.
    const IN_SCHOOL = Array.from({ length: 8 }, (_, i) => ({
      id: `ssssssss-ssss-4sss-8sss-${String(i).padStart(12, '0')}`,
      approval_status: i < 5 ? 'approved' : 'pending',
    }));

    const matchedProfiles = IN_SCHOOL.slice(0, 2).map((u) => ({
      id: u.id,
      email: `alice-${u.id.slice(-4)}@example.com`,
      first_name: 'Alice',
      last_name: u.id.slice(-4),
      school_id: ED_SCHOOL_ID,
      approval_status: u.approval_status,
      created_at: '2026-01-01T00:00:00Z',
      external_school_affiliation: null,
      can_run_qa_tests: false,
      school: { id: ED_SCHOOL_ID, name: `School ${ED_SCHOOL_ID}` },
    }));

    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildSequencedClient(
        {
          profiles: [
            // [0] in-school prefetch — 8 users with approval_status.
            { data: IN_SCHOOL },
            // [1] main paginated query — server-side ilike search applied,
            // PostgREST returns 2 matching rows and count=2.
            { data: matchedProfiles, count: 2 },
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

    const { req, res } = createMocks({ method: 'GET', query: { search: 'alice' } });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);

    // 0-excluded path: prefetch + main = 2 profiles calls; no scoped counts.
    const profilesCalls = tracker.fromCalls.filter((c) => c.table === 'profiles');
    expect(profilesCalls).toHaveLength(2);

    // Main query recorded the search `.or(...)` and NO id-exclusion clause.
    const profilesMain = profilesCalls[1];
    expect(profilesMain.ors.some((expr) => expr.includes('alice'))).toBe(true);
    expect(profilesMain.nots.find((n) => n.col === 'id' && n.op === 'in')).toBeUndefined();

    const body = JSON.parse(res._getData());
    // `total` must equal the filtered DB `count` (2 matches), not the
    // unfiltered in-school summary total (8).
    expect(body.total).toBe(2);
    expect(body.summary.total).toBe(8);
    expect(body.total).not.toBe(body.summary.total);
    expect(body.users).toHaveLength(2);
  });

  it('ED (F1 SQL path): multi-page prefetch still collects all in-school ids and SQL exclusion is applied on the main query', async () => {
    // Forces multi-page prefetch (1002 in-school users) with one ghost. The
    // collected exclusion list (size 1) is well under MAX_EXCLUDED_FOR_SQL=100,
    // so the SQL path applies `.not('id', 'in', ...)` to the main query.
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
            // Main paginated query — SQL exclusion applied → only visible row.
            { data: [visibleProfile], count: 1001 },
            // [3..5] scoped count queries with the exclusion applied.
            { count: 1001 },
            { count: 0 },
            { count: 1001 },
          ],
          schools: [{ data: [{ id: ED_SCHOOL_ID, name: `School ${ED_SCHOOL_ID}` }] }],
          // After F1 URL-length chunking, 1002 in-school ids → 11 global-role
          // batches (100*10 + 2) + 11 cross-school batches + 1 main roles.
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
    // Two prefetch pages + main + 3 scoped count queries = 6 profiles calls.
    expect(profilesCalls).toHaveLength(6);
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

    // SQL path contract: main profiles query carries `.not('id', 'in', ...)`
    // referencing the (single) excluded user.
    const profilesMain = profilesCalls[2];
    const mainNotId = profilesMain.nots.find((n) => n.col === 'id' && n.op === 'in');
    expect(mainNotId).toBeDefined();
    expect(mainNotId!.val as string).toContain(PAGE2_EXCLUDED);

    // Response payload reflects the SQL-filtered main query.
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
            // [1] main paginated query — SQL exclusion applied server-side,
            // so the simulated result contains only the visible row.
            { data: [visibleProfile], count: 1 },
            // [2..4] scoped count queries (total / pending / approved).
            { count: 1 },
            { count: 0 },
            { count: 1 },
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

    // SQL path contract: main profiles query carries `.not('id', 'in', ...)`
    // referencing the cross-school ghost user.
    const profilesMain = tracker.fromCalls.find(
      (c) => c.table === 'profiles' && c.index === 1,
    )!;
    const mainNotId = profilesMain.nots.find((n) => n.col === 'id' && n.op === 'in');
    expect(mainNotId).toBeDefined();
    expect(mainNotId!.val as string).toContain(CROSS_SCHOOL_USER_ID);

    const body = JSON.parse(res._getData());
    const returnedIds = (body.users as Array<{ id: string }>).map((u) => u.id);
    expect(returnedIds).not.toContain(CROSS_SCHOOL_USER_ID);
    expect(returnedIds).toContain('user-visible');

    expect(body.summary).toEqual({ total: 1, pending: 0, approved: 1 });
    expect(body.total).toBe(1);
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
            // Main query: SQL exclusion drops the double-bound user → empty.
            { data: [], count: 0 },
            // Scoped count queries — also zero post-exclusion.
            { count: 0 },
            { count: 0 },
            { count: 0 },
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

    // SQL path contract: main profiles query carries `.not('id', 'in', ...)`.
    const profilesMain = tracker.fromCalls.find(
      (c) => c.table === 'profiles' && c.index === 1,
    )!;
    const mainNotId = profilesMain.nots.find((n) => n.col === 'id' && n.op === 'in');
    expect(mainNotId).toBeDefined();
    expect(mainNotId!.val as string).toContain(DOUBLE_BOUND_ID);

    const body = JSON.parse(res._getData());
    const returnedIds = (body.users as Array<{ id: string }>).map((u) => u.id);
    expect(returnedIds).not.toContain(DOUBLE_BOUND_ID);
    expect(body.summary).toEqual({ total: 0, pending: 0, approved: 0 });
    expect(body.total).toBe(0);
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

  it('ED (F1 SQL path, pagination): page 2 does not overlap page 1 visible users when ghosts exist', async () => {
    // Phase 15.19 hybrid exclusion: in the SQL path, `.not('id', 'in', ...)`
    // is applied to the main query, so the paginated offset (.range) is over
    // the already-filtered row set. This guarantees that page 2 returns rows
    // strictly after page 1's visible window — never the same user twice.
    setupEquipoDirectivo(ED_SCHOOL_ID);
    const tracker = makeTracker();

    // 30 in-school users, 2 ghosts. Visible set = 28 users. Page 1 (size 25)
    // returns rows 1-25; page 2 returns rows 26-28.
    const IN_SCHOOL_IDS = Array.from({ length: 30 }, (_, i) =>
      `aaaaaaaa-aaaa-4aaa-8aaa-${String(i).padStart(12, '0')}`,
    );
    const EXCLUDED_IDS = [IN_SCHOOL_IDS[0], IN_SCHOOL_IDS[1]];
    const VISIBLE_IDS = IN_SCHOOL_IDS.slice(2);
    const PAGE1_IDS = VISIBLE_IDS.slice(0, 25);
    const PAGE2_IDS = VISIBLE_IDS.slice(25);

    const buildProfile = (id: string) => ({
      id,
      email: `${id}@example.com`,
      first_name: 'User',
      last_name: id.slice(-4),
      school_id: ED_SCHOOL_ID,
      approval_status: 'approved',
      created_at: '2026-01-01T00:00:00Z',
      external_school_affiliation: null,
      can_run_qa_tests: false,
      school: { id: ED_SCHOOL_ID, name: `School ${ED_SCHOOL_ID}` },
    });

    // Build a single shared mock for the two-request scenario by attaching
    // distinct slot arrays per request.
    mockCreateServiceRoleClient
      .mockReturnValueOnce(
        buildSequencedClient(
          {
            profiles: [
              { data: IN_SCHOOL_IDS.map((id) => ({ id, approval_status: 'approved' })) },
              { data: PAGE1_IDS.map(buildProfile), count: 28 },
              { count: 28 },
              { count: 0 },
              { count: 28 },
            ],
            schools: [{ data: [{ id: ED_SCHOOL_ID, name: `School ${ED_SCHOOL_ID}` }] }],
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
      )
      .mockReturnValueOnce(
        buildSequencedClient(
          {
            profiles: [
              { data: IN_SCHOOL_IDS.map((id) => ({ id, approval_status: 'approved' })) },
              { data: PAGE2_IDS.map(buildProfile), count: 28 },
              { count: 28 },
              { count: 0 },
              { count: 28 },
            ],
            schools: [{ data: [{ id: ED_SCHOOL_ID, name: `School ${ED_SCHOOL_ID}` }] }],
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

    setupEquipoDirectivo(ED_SCHOOL_ID);

    // Request page 1.
    const { req: req1, res: res1 } = createMocks({
      method: 'GET',
      query: { page: '1', pageSize: '25' },
    });
    await handler(req1 as never, res1 as never);
    expect(res1._getStatusCode()).toBe(200);

    // Request page 2.
    const { req: req2, res: res2 } = createMocks({
      method: 'GET',
      query: { page: '2', pageSize: '25' },
    });
    await handler(req2 as never, res2 as never);
    expect(res2._getStatusCode()).toBe(200);

    const page1Body = JSON.parse(res1._getData());
    const page2Body = JSON.parse(res2._getData());

    const page1Ids = (page1Body.users as Array<{ id: string }>).map((u) => u.id);
    const page2Ids = (page2Body.users as Array<{ id: string }>).map((u) => u.id);

    // No overlap between page 1 and page 2.
    const overlap = page1Ids.filter((id) => page2Ids.includes(id));
    expect(overlap).toEqual([]);

    // Neither page exposes a ghost row.
    for (const ghost of EXCLUDED_IDS) {
      expect(page1Ids).not.toContain(ghost);
      expect(page2Ids).not.toContain(ghost);
    }

    // Both pages share the same SQL-applied `total` = 28.
    expect(page1Body.total).toBe(28);
    expect(page2Body.total).toBe(28);

    // Each page's main profiles query carries the SQL exclusion AND the
    // correct .range offset (page 1: 0-24; page 2: 25-49).
    const profilesCalls = tracker.fromCalls.filter((c) => c.table === 'profiles');
    // Two requests, each producing 5 profile calls
    // (1 prefetch + 1 main + 3 count queries) = 10 total.
    expect(profilesCalls).toHaveLength(10);
    const page1Main = profilesCalls[1];
    const page2Main = profilesCalls[6];
    expect(page1Main.ranges).toEqual([{ from: 0, to: 24 }]);
    expect(page2Main.ranges).toEqual([{ from: 25, to: 49 }]);
    for (const main of [page1Main, page2Main]) {
      const notId = main.nots.find((n) => n.col === 'id' && n.op === 'in');
      expect(notId).toBeDefined();
      for (const ghost of EXCLUDED_IDS) {
        expect(notId!.val as string).toContain(ghost);
      }
    }
  });

  it('ED (F1 fallback): exclusion set above MAX_EXCLUDED_FOR_SQL=100 logs a warning and stays on the client-side path', async () => {
    // When the ghost list grows past the SQL threshold, encoded `.not(id, in,
    // ...)` filters risk exceeding URL-length limits. The handler must:
    //  - emit a warning that pagination may be inexact,
    //  - skip `.not('id', 'in', ...)` on the main profiles query,
    //  - skip the scoped count queries (no SQL counts in fallback),
    //  - drop ghost rows from the main page in memory,
    //  - source `total` from the in-memory summary, not the raw `count`.
    setupEquipoDirectivo(ED_SCHOOL_ID);
    const tracker = makeTracker();

    // 101 ghost users (> MAX_EXCLUDED_FOR_SQL=100). To exercise the fallback
    // path purely, the prefetched in-school set IS the 101 ghosts plus one
    // visible user. The global-role pre-fetch flags all 101 ghosts.
    const GHOST_IDS = Array.from({ length: 101 }, (_, i) =>
      `ggggggg0-gggg-4ggg-8ggg-${String(i).padStart(12, '0')}`,
    );
    const VISIBLE_ID = 'vvvvvvvv-vvvv-4vvv-8vvv-vvvvvvvvvvvv';

    const visibleProfile = {
      id: VISIBLE_ID,
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

    const ghostProfileSubset = GHOST_IDS.slice(0, 5).map((id) => ({
      id,
      email: `${id}@example.com`,
      first_name: 'Ghost',
      last_name: id.slice(-4),
      school_id: ED_SCHOOL_ID,
      approval_status: 'pending',
      created_at: '2026-01-01T00:00:00Z',
      external_school_affiliation: null,
      can_run_qa_tests: false,
      school: { id: ED_SCHOOL_ID, name: `School ${ED_SCHOOL_ID}` },
    }));

    const allInSchool = [
      { id: VISIBLE_ID, approval_status: 'approved' },
      ...GHOST_IDS.map((id) => ({ id, approval_status: 'pending' })),
    ];

    // After F1 URL-length chunking, 102 in-school ids → 2 global-role batches
    // (100 + 2) + 2 cross-school batches + 1 main roles = 5 user_roles calls.
    const globalBatch1Ghosts = GHOST_IDS.slice(0, 100).map((user_id) => ({ user_id }));
    const globalBatch2Ghosts = GHOST_IDS.slice(100).map((user_id) => ({ user_id }));

    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildSequencedClient(
        {
          profiles: [
            // [0] in-school prefetch — 102 users.
            { data: allInSchool },
            // [1] main paginated query — unfiltered; returns visible + a
            // partial slice of ghost rows that the handler drops in memory.
            { data: [visibleProfile, ...ghostProfileSubset], count: 102 },
          ],
          schools: [{ data: [{ id: ED_SCHOOL_ID, name: `School ${ED_SCHOOL_ID}` }] }],
          user_roles: [
            { data: globalBatch1Ghosts },
            { data: globalBatch2Ghosts },
            { data: [] },
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

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { req, res } = createMocks({ method: 'GET' });
    try {
      await handler(req as never, res as never);

      expect(res._getStatusCode()).toBe(200);

      // Fallback warning was emitted with the actual exclusion size.
      expect(warnSpy).toHaveBeenCalled();
      const warned = warnSpy.mock.calls.map((args) => args.join(' ')).join('\n');
      expect(warned).toContain('exceeds MAX_EXCLUDED_FOR_SQL=100');
      expect(warned).toContain('pagination may be inexact');
      expect(warned).toContain('101');
    } finally {
      warnSpy.mockRestore();
    }

    // No scoped count queries are issued in fallback mode — prefetch + main = 2.
    const profilesCalls = tracker.fromCalls.filter((c) => c.table === 'profiles');
    expect(profilesCalls).toHaveLength(2);

    // Main profiles query carries NO `.not('id', 'in', ...)` clause.
    const profilesMain = profilesCalls[1];
    expect(profilesMain.nots.find((n) => n.col === 'id' && n.op === 'in')).toBeUndefined();

    // Client-side filter removes the 5 ghost rows from the page; only the
    // visible user survives. Summary counts come from the in-memory prefetch
    // (1 visible / 102 in-school - 101 ghosts), and `total` mirrors summary.
    const body = JSON.parse(res._getData());
    const returnedIds = (body.users as Array<{ id: string }>).map((u) => u.id);
    expect(returnedIds).toEqual([VISIBLE_ID]);
    for (const ghost of GHOST_IDS) {
      expect(returnedIds).not.toContain(ghost);
    }
    expect(body.summary).toEqual({ total: 1, pending: 0, approved: 1 });
    expect(body.total).toBe(1);
    expect(body.total).toBe(body.summary.total);
    expect(body.total).not.toBe(102);
  });

});

describe('ED prefetch ceiling (MAX_ED_PREFETCH_USERS)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('ED: school size exceeding MAX_ED_PREFETCH_USERS returns 500 with structured log', async () => {
    setupEquipoDirectivo(ED_SCHOOL_ID);
    const tracker = makeTracker();

    // Mock the in-school prefetch to return >5000 rows in the first batch.
    // The loop continues to a second batch (range(1000, 1999)) which returns
    // 0 rows so the loop terminates; the ceiling check then fires.
    const OVERSIZED = Array.from({ length: 5001 }, (_, i) => ({
      id: `eeeeeeee-eeee-4eee-8eee-${String(i).padStart(12, '0')}`,
      approval_status: 'approved',
    }));

    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildSequencedClient(
        {
          profiles: [{ data: OVERSIZED }, { data: [] }],
        },
        tracker,
      ),
    );

    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { req, res } = createMocks({ method: 'GET' });
    try {
      await handler(req as never, res as never);

      expect(res._getStatusCode()).toBe(500);
      const body = JSON.parse(res._getData());
      expect(body.error).toContain('Lista de usuarios temporalmente no disponible');

      expect(errSpy).toHaveBeenCalled();
      const errorCall = errSpy.mock.calls.find((args) =>
        String(args[0]).includes('ED prefetch exceeded MAX_ED_PREFETCH_USERS'),
      );
      expect(errorCall).toBeDefined();
      const ctx = errorCall![1] as {
        edSchoolId: number;
        actualCount: number;
        limit: number;
      };
      expect(ctx.edSchoolId).toBe(ED_SCHOOL_ID);
      expect(ctx.actualCount).toBe(5001);
      expect(ctx.limit).toBe(5000);
    } finally {
      errSpy.mockRestore();
    }

    // No downstream user_roles / main paginated query should have run.
    const profilesCalls = tracker.fromCalls.filter((c) => c.table === 'profiles');
    expect(profilesCalls.length).toBeLessThanOrEqual(2);
    expect(tracker.fromCalls.find((c) => c.table === 'user_roles')).toBeUndefined();
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
