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

      const fromCall: FromCall = { table, index: idx, eqs: [], ins: [] };
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

    const rolesCall = tracker.fromCalls.find((c) => c.table === 'user_roles')!;
    expect(
      rolesCall.eqs.find((e) => e.col === 'school_id' && e.val === ED_SCHOOL_ID),
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
      rolesCall.eqs.find((e) => e.col === 'school_id' && e.val === ED_SCHOOL_ID),
    ).toBeDefined();
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
});
