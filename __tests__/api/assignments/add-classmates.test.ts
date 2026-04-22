// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';
import { buildChainableQuery } from '../assessment-builder/_helpers';

// ── Hoisted mocks ──────────────────────────────────────────────
const { mockCreatePagesServerClient, mockCreateClient } = vi.hoisted(() => ({
  mockCreatePagesServerClient: vi.fn(),
  mockCreateClient: vi.fn(),
}));

vi.mock('@supabase/auth-helpers-nextjs', () => ({
  createPagesServerClient: mockCreatePagesServerClient,
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: mockCreateClient,
}));

import handler from '../../../pages/api/assignments/add-classmates';

// ── Fixtures ───────────────────────────────────────────────────
const USER_ID = 'u0000001-0000-0000-0000-000000000001';
const CLASSMATE_ID = 'c0000001-0000-0000-0000-000000000001';
const CLASSMATE_ID_2 = 'c0000001-0000-0000-0000-000000000002';
const ASSIGNMENT_ID = 'a0000001-0000-0000-0000-000000000001';
const LESSON_ID = 'l0000001-0000-0000-0000-000000000001';
const COURSE_ID = 'crs00001-0000-0000-0000-000000000001';
const COMMUNITY_ID = 'cmm00001-0000-0000-0000-000000000001';
const GROUP_ID = 'grp00001-0000-0000-0000-000000000001';
const SCHOOL_25 = 25;
const SCHOOL_26 = 26;

type Leaf = { data?: unknown; error?: unknown; count?: number | null };
type TableHandler = Leaf | Leaf[];

type SessionClientOpts = {
  session?: unknown;
  tables?: Record<string, TableHandler>;
};

function buildSessionClient(opts: SessionClientOpts = {}) {
  const session = opts.session === undefined ? { user: { id: USER_ID } } : opts.session;
  const tables = opts.tables ?? {};
  const counters: Record<string, number> = {};
  return {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session } }),
    },
    from: vi.fn((table: string) => {
      const h = tables[table];
      if (!h) return buildChainableQuery(null, null);
      if (Array.isArray(h)) {
        const idx = counters[table] ?? 0;
        counters[table] = idx + 1;
        const entry = h[Math.min(idx, h.length - 1)];
        return buildChainableQuery(entry?.data ?? null, entry?.error ?? null, entry?.count ?? null);
      }
      return buildChainableQuery(h.data ?? null, h.error ?? null, h.count ?? null);
    }),
  };
}

type AdminOpts = {
  classmateRoles?: Array<{ user_id: string; school_id: number | null }> | null;
  classmateEnrollments?: Array<{ user_id: string }> | null;
  existingMembers?: Array<{ user_id: string }> | null;
  memberInsert?: { data?: unknown; error?: unknown };
  captures?: { memberInsertPayload?: unknown };
};

function buildAdminClient(opts: AdminOpts = {}) {
  const captures = opts.captures ?? {};
  const memberInsert = opts.memberInsert ?? { data: [{ id: 'm1' }], error: null };
  return {
    from: vi.fn((table: string) => {
      if (table === 'user_roles') {
        return buildChainableQuery(opts.classmateRoles ?? [], null);
      }
      if (table === 'course_enrollments') {
        return buildChainableQuery(opts.classmateEnrollments ?? [], null);
      }
      if (table === 'group_assignment_members') {
        return {
          select: vi.fn(() => buildChainableQuery(opts.existingMembers ?? [], null)),
          insert: vi.fn((payload: unknown) => {
            captures.memberInsertPayload = payload;
            return buildChainableQuery(memberInsert.data ?? null, memberInsert.error ?? null);
          }),
        };
      }
      return buildChainableQuery(null, null);
    }),
  };
}

// Session tables when requester IS a member of the group (short path).
function memberSessionTables(overrides: Record<string, TableHandler> = {}) {
  return {
    group_assignment_members: { data: { group_id: GROUP_ID, assignment_id: ASSIGNMENT_ID } },
    group_assignment_groups: { data: { is_consultant_managed: false } },
    user_roles: { data: [{ school_id: SCHOOL_25, role_type: 'estudiante' }] },
    blocks: [
      { data: { lesson_id: LESSON_ID } },
      { data: { payload: { title: 'Tarea X' } } },
    ],
    lessons: { data: { course_id: COURSE_ID } },
    profiles: { data: { first_name: 'Leo', last_name: 'Smith' } },
    ...overrides,
  } satisfies Record<string, TableHandler>;
}

// Session tables when requester is NOT a member, group is empty, access via
// course_enrollments (branch 1).
function nonMemberEnrollmentTables(overrides: Record<string, TableHandler> = {}) {
  return {
    group_assignment_members: [
      { data: null }, // membership check
      { data: null, count: 0 }, // empty-group count check
    ],
    group_assignment_groups: { data: { is_consultant_managed: false } },
    user_roles: { data: [{ school_id: SCHOOL_25, role_type: 'estudiante' }] },
    blocks: [
      { data: { lesson_id: LESSON_ID } },
      { data: { payload: { title: 'Tarea X' } } },
    ],
    lessons: { data: { course_id: COURSE_ID } },
    course_enrollments: { data: { status: 'active' } },
    profiles: { data: { first_name: 'Leo', last_name: 'Smith' } },
    ...overrides,
  } satisfies Record<string, TableHandler>;
}

// Non-member path, access via course_assignments (branch 2).
function nonMemberCourseAssignmentTables(overrides: Record<string, TableHandler> = {}) {
  return {
    group_assignment_members: [
      { data: null },
      { data: null, count: 0 },
    ],
    group_assignment_groups: { data: { is_consultant_managed: false } },
    user_roles: { data: [{ school_id: SCHOOL_25, role_type: 'docente' }] },
    blocks: [
      { data: { lesson_id: LESSON_ID } },
      { data: { payload: { title: 'Tarea X' } } },
    ],
    lessons: { data: { course_id: COURSE_ID } },
    course_enrollments: { data: null },
    course_assignments: { data: { id: 'ca1' } },
    profiles: { data: { first_name: 'Leo', last_name: 'Smith' } },
    ...overrides,
  } satisfies Record<string, TableHandler>;
}

// Non-member path, access via consultant_assignments (branch 3).
// group_assignment_groups is hit TWICE: once for is_consultant_managed, once
// for community_id.
function nonMemberConsultantTables(overrides: Record<string, TableHandler> = {}) {
  return {
    group_assignment_members: [
      { data: null },
      { data: null, count: 0 },
    ],
    group_assignment_groups: [
      { data: { is_consultant_managed: false } },
      { data: { community_id: COMMUNITY_ID } },
    ],
    user_roles: { data: [{ school_id: SCHOOL_25, role_type: 'consultor' }] },
    blocks: [
      { data: { lesson_id: LESSON_ID } },
      { data: { payload: { title: 'Tarea X' } } },
    ],
    lessons: { data: { course_id: COURSE_ID } },
    course_enrollments: { data: null },
    course_assignments: { data: null },
    consultant_assignments: { data: { id: 'ca-consult' } },
    profiles: { data: { first_name: 'Leo', last_name: 'Smith' } },
    ...overrides,
  } satisfies Record<string, TableHandler>;
}

function postBody(overrides: Record<string, unknown> = {}) {
  return {
    assignmentId: ASSIGNMENT_ID,
    groupId: GROUP_ID,
    classmateIds: [CLASSMATE_ID],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
});

describe('POST /api/assignments/add-classmates', () => {
  // ── 1. 405 on wrong method ───────────────────────────────────
  it('returns 405 when method is not POST', async () => {
    const { req, res } = createMocks({ method: 'GET' });
    await handler(req as any, res as any);
    expect(res._getStatusCode()).toBe(405);
  });

  // ── 2. 401 when no session ───────────────────────────────────
  it('returns 401 when there is no session', async () => {
    mockCreatePagesServerClient.mockReturnValue(buildSessionClient({ session: null }));
    mockCreateClient.mockReturnValue(buildAdminClient());

    const { req, res } = createMocks({ method: 'POST', body: postBody() });
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(401);
  });

  // ── 3. 400 missing required fields ───────────────────────────
  it('returns 400 when required payload fields are missing', async () => {
    mockCreatePagesServerClient.mockReturnValue(buildSessionClient());
    mockCreateClient.mockReturnValue(buildAdminClient());

    const { req, res } = createMocks({ method: 'POST', body: { assignmentId: ASSIGNMENT_ID } });
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(400);
    const data = JSON.parse(res._getData());
    expect(data.error).toContain('classmateIds');
  });

  // ── 4. 200 dual rows [{requesterSchoolId},{null}] ────────────
  it('returns 200 when classmate has dual active rows [{requesterSchoolId},{null}]', async () => {
    mockCreatePagesServerClient.mockReturnValue(
      buildSessionClient({ tables: memberSessionTables() }),
    );
    const captures: AdminOpts['captures'] = {};
    mockCreateClient.mockReturnValue(
      buildAdminClient({
        classmateRoles: [
          { user_id: CLASSMATE_ID, school_id: SCHOOL_25 },
          { user_id: CLASSMATE_ID, school_id: null },
        ],
        classmateEnrollments: [{ user_id: CLASSMATE_ID }],
        existingMembers: [],
        memberInsert: { data: [{ id: 'm1' }] },
        captures,
      }),
    );

    const { req, res } = createMocks({ method: 'POST', body: postBody() });
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data.success).toBe(true);
    expect(data.count).toBe(1);
    expect(captures.memberInsertPayload).toEqual([
      { group_id: GROUP_ID, assignment_id: ASSIGNMENT_ID, user_id: CLASSMATE_ID, role: 'member' },
    ]);
  });

  // ── 5. 200 duplicate rows at requester's school ──────────────
  // Proves the removed length check no longer blocks classmates with
  // multiple active rows at the same school. Also exercises the
  // course_enrollments access branch (requester not a member, group empty).
  it('returns 200 when classmate has four duplicate active rows at requester school (via course_enrollments)', async () => {
    mockCreatePagesServerClient.mockReturnValue(
      buildSessionClient({ tables: nonMemberEnrollmentTables() }),
    );
    mockCreateClient.mockReturnValue(
      buildAdminClient({
        classmateRoles: [
          { user_id: CLASSMATE_ID, school_id: SCHOOL_25 },
          { user_id: CLASSMATE_ID, school_id: SCHOOL_25 },
          { user_id: CLASSMATE_ID, school_id: SCHOOL_25 },
          { user_id: CLASSMATE_ID, school_id: SCHOOL_25 },
        ],
        classmateEnrollments: [{ user_id: CLASSMATE_ID }],
        existingMembers: [],
        memberInsert: { data: [{ id: 'm1' }] },
      }),
    );

    const { req, res } = createMocks({ method: 'POST', body: postBody() });
    await handler(req as any, res as any);

    // No 400 — the old length-based check would have rejected 4 rows for 1 id.
    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data.success).toBe(true);
  });

  // ── 6. 403 not a member and group non-empty ──────────────────
  it('returns 403 when requester is not a member and group is non-empty', async () => {
    mockCreatePagesServerClient.mockReturnValue(
      buildSessionClient({
        tables: {
          group_assignment_members: [
            { data: null }, // membership check
            { data: null, count: 3 }, // group non-empty
          ],
          group_assignment_groups: { data: { is_consultant_managed: false } },
          user_roles: { data: [{ school_id: SCHOOL_25, role_type: 'estudiante' }] },
          blocks: { data: { lesson_id: LESSON_ID } },
          lessons: { data: { course_id: COURSE_ID } },
        },
      }),
    );
    mockCreateClient.mockReturnValue(buildAdminClient());

    const { req, res } = createMocks({ method: 'POST', body: postBody() });
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(403);
    const data = JSON.parse(res._getData());
    expect(data.error).toContain('No eres miembro');
  });

  // ── 7. 403 consultant-managed group ──────────────────────────
  it('returns 403 when the group is consultant-managed', async () => {
    mockCreatePagesServerClient.mockReturnValue(
      buildSessionClient({
        tables: {
          group_assignment_members: { data: null },
          group_assignment_groups: { data: { is_consultant_managed: true } },
        },
      }),
    );
    mockCreateClient.mockReturnValue(buildAdminClient());

    const { req, res } = createMocks({ method: 'POST', body: postBody() });
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(403);
    const data = JSON.parse(res._getData());
    expect(data.error).toContain('consultor');
  });

  // ── 8. 400 classmate from wrong school (via course_assignments) ─
  it('returns 400 when a classmate is from another school (via course_assignments branch)', async () => {
    mockCreatePagesServerClient.mockReturnValue(
      buildSessionClient({ tables: nonMemberCourseAssignmentTables() }),
    );
    mockCreateClient.mockReturnValue(
      buildAdminClient({
        classmateRoles: [{ user_id: CLASSMATE_ID, school_id: SCHOOL_26 }],
      }),
    );

    const { req, res } = createMocks({ method: 'POST', body: postBody() });
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(400);
    const data = JSON.parse(res._getData());
    expect(data.error).toBe('Algunos compañeros no pertenecen a tu escuela');
    expect(data.details.missingIds).toEqual([CLASSMATE_ID]);
  });

  // ── 9. 400 classmate not enrolled (via consultant_assignments) ─
  it('returns 400 with notEnrolled details when a classmate is not enrolled (via consultant_assignments branch)', async () => {
    mockCreatePagesServerClient.mockReturnValue(
      buildSessionClient({ tables: nonMemberConsultantTables() }),
    );
    mockCreateClient.mockReturnValue(
      buildAdminClient({
        classmateRoles: [
          { user_id: CLASSMATE_ID, school_id: SCHOOL_25 },
          { user_id: CLASSMATE_ID_2, school_id: SCHOOL_25 },
        ],
        // Only CLASSMATE_ID enrolled — CLASSMATE_ID_2 is missing.
        classmateEnrollments: [{ user_id: CLASSMATE_ID }],
      }),
    );

    const { req, res } = createMocks({
      method: 'POST',
      body: postBody({ classmateIds: [CLASSMATE_ID, CLASSMATE_ID_2] }),
    });
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(400);
    const data = JSON.parse(res._getData());
    expect(data.error).toContain('no están inscritos');
    expect(data.details.notEnrolled).toEqual([CLASSMATE_ID_2]);
    expect(data.details.courseId).toBe(COURSE_ID);
  });

  // ── 10. 400 when a classmate is already in a group ───────────
  it('returns 400 when a classmate is already in a group for this assignment', async () => {
    mockCreatePagesServerClient.mockReturnValue(
      buildSessionClient({ tables: memberSessionTables() }),
    );
    mockCreateClient.mockReturnValue(
      buildAdminClient({
        classmateRoles: [{ user_id: CLASSMATE_ID, school_id: SCHOOL_25 }],
        classmateEnrollments: [{ user_id: CLASSMATE_ID }],
        existingMembers: [{ user_id: CLASSMATE_ID }],
      }),
    );

    const { req, res } = createMocks({ method: 'POST', body: postBody() });
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(400);
    const data = JSON.parse(res._getData());
    expect(data.error).toContain('ya están en grupos');
  });
});
