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

import handler from '../../../pages/api/assignments/create-group';

// ── Fixtures ───────────────────────────────────────────────────
const USER_ID = 'u0000001-0000-0000-0000-000000000001';
const CLASSMATE_ID = 'c0000001-0000-0000-0000-000000000001';
const ASSIGNMENT_ID = 'a0000001-0000-0000-0000-000000000001';
const LESSON_ID = 'l0000001-0000-0000-0000-000000000001';
const COURSE_ID = 'crs00001-0000-0000-0000-000000000001';
const COMMUNITY_ID = 'cmm00001-0000-0000-0000-000000000001';
const GROUP_ID = 'grp00001-0000-0000-0000-000000000001';
const SCHOOL_25 = 25;
const SCHOOL_26 = 26;

type TableHandler = { data?: unknown; error?: unknown } | Array<{ data?: unknown; error?: unknown }>;

type SessionClientOpts = {
  session?: unknown;
  tables?: Record<string, TableHandler>;
  throwOnTable?: string;
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
      if (opts.throwOnTable === table) {
        throw new Error(`Simulated failure on ${table}`);
      }
      const h = tables[table];
      if (!h) return buildChainableQuery(null, null);
      if (Array.isArray(h)) {
        const idx = counters[table] ?? 0;
        counters[table] = idx + 1;
        const entry = h[Math.min(idx, h.length - 1)];
        return buildChainableQuery(entry?.data ?? null, entry?.error ?? null);
      }
      return buildChainableQuery(h.data ?? null, h.error ?? null);
    }),
  };
}

type AdminOpts = {
  classmateRoles?: Array<{ user_id: string; school_id: number | null }> | null;
  existingGroup?: unknown;
  existingMembers?: unknown;
  groupInsert?: { data?: unknown; error?: unknown };
  memberInsert?: { data?: unknown; error?: unknown };
  captures?: { groupInsertPayload?: unknown; memberInsertPayload?: unknown };
};

function buildAdminClient(opts: AdminOpts = {}) {
  const captures = opts.captures ?? {};
  const groupInsert = opts.groupInsert ?? { data: { id: GROUP_ID }, error: null };
  const memberInsert = opts.memberInsert ?? { data: [], error: null };
  return {
    from: vi.fn((table: string) => {
      if (table === 'user_roles') {
        return buildChainableQuery(opts.classmateRoles ?? [], null);
      }
      if (table === 'group_assignment_groups') {
        return {
          insert: vi.fn((payload: unknown) => {
            captures.groupInsertPayload = payload;
            return buildChainableQuery(groupInsert.data ?? null, groupInsert.error ?? null);
          }),
        };
      }
      if (table === 'group_assignment_members') {
        return {
          select: vi.fn((cols: string) => {
            if (cols === 'group_id') {
              return buildChainableQuery(opts.existingGroup ?? null, null);
            }
            if (cols === 'user_id') {
              return buildChainableQuery(opts.existingMembers ?? [], null);
            }
            return buildChainableQuery(null, null);
          }),
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

// Base session-client tables for requests that reach past role/assignment lookups.
function happySessionTables() {
  return {
    user_roles: {
      data: [
        { school_id: SCHOOL_25, role_type: 'equipo_directivo', community_id: COMMUNITY_ID },
      ],
    },
    blocks: { data: { lesson_id: LESSON_ID, payload: { title: 'Tarea X' } } },
    lessons: { data: { course_id: COURSE_ID } },
    course_enrollments: { data: { status: 'active' } },
    profiles: { data: { first_name: 'Leo', last_name: 'Smith' } },
  } satisfies Record<string, TableHandler>;
}

function postBody(overrides: Record<string, unknown> = {}) {
  return {
    assignmentId: ASSIGNMENT_ID,
    classmateIds: [CLASSMATE_ID],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
});

describe('POST /api/assignments/create-group', () => {
  // ── 1. 405 on wrong method ────────────────────────────────────
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

  // ── 3. 400 missing assignmentId/classmateIds ─────────────────
  it('returns 400 when assignmentId or classmateIds is missing', async () => {
    mockCreatePagesServerClient.mockReturnValue(buildSessionClient());
    mockCreateClient.mockReturnValue(buildAdminClient());

    const { req, res } = createMocks({ method: 'POST', body: {} });
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(400);
    const data = JSON.parse(res._getData());
    expect(data.error).toContain('assignmentId');
  });

  // ── 4. 403 when requester has no active roles ────────────────
  it('returns 403 when requester has no active roles', async () => {
    mockCreatePagesServerClient.mockReturnValue(
      buildSessionClient({ tables: { user_roles: { data: [] } } }),
    );
    mockCreateClient.mockReturnValue(buildAdminClient());

    const { req, res } = createMocks({ method: 'POST', body: postBody() });
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(403);
    const data = JSON.parse(res._getData());
    expect(data.error).toContain('escuela');
  });

  // ── 5. 403 when no role has a school_id ──────────────────────
  it('returns 403 when requester has no role with a school_id', async () => {
    mockCreatePagesServerClient.mockReturnValue(
      buildSessionClient({
        tables: {
          user_roles: {
            data: [{ school_id: null, role_type: 'docente', community_id: null }],
          },
        },
      }),
    );
    mockCreateClient.mockReturnValue(buildAdminClient());

    const { req, res } = createMocks({ method: 'POST', body: postBody() });
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(403);
  });

  // ── 6. 200 happy path: dual rows [{25},{null}] ───────────────
  it('returns 200 and inserts group when classmate has dual rows [{25},{null}]', async () => {
    mockCreatePagesServerClient.mockReturnValue(
      buildSessionClient({ tables: happySessionTables() }),
    );
    const captures: AdminOpts['captures'] = {};
    mockCreateClient.mockReturnValue(
      buildAdminClient({
        classmateRoles: [
          { user_id: CLASSMATE_ID, school_id: SCHOOL_25 },
          { user_id: CLASSMATE_ID, school_id: null },
        ],
        groupInsert: { data: { id: GROUP_ID, name: 'Grupo de Leo Smith' } },
        memberInsert: { data: [{ id: 'm1' }, { id: 'm2' }] },
        captures,
      }),
    );

    const { req, res } = createMocks({ method: 'POST', body: postBody() });
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data.success).toBe(true);
    expect(data.group.id).toBe(GROUP_ID);
    expect(captures.groupInsertPayload).toEqual({
      assignment_id: ASSIGNMENT_ID,
      is_consultant_managed: false,
      community_id: COMMUNITY_ID,
      name: 'Grupo de Leo Smith',
    });
    expect(captures.memberInsertPayload).toEqual([
      { group_id: GROUP_ID, assignment_id: ASSIGNMENT_ID, user_id: USER_ID, role: 'leader' },
      { group_id: GROUP_ID, assignment_id: ASSIGNMENT_ID, user_id: CLASSMATE_ID, role: 'member' },
    ]);
  });

  // ── 7. 200 happy path: four duplicate rows at school 25 ──────
  it('returns 200 when classmate has four duplicate active rows at school 25', async () => {
    mockCreatePagesServerClient.mockReturnValue(
      buildSessionClient({ tables: happySessionTables() }),
    );
    mockCreateClient.mockReturnValue(
      buildAdminClient({
        classmateRoles: [
          { user_id: CLASSMATE_ID, school_id: SCHOOL_25 },
          { user_id: CLASSMATE_ID, school_id: SCHOOL_25 },
          { user_id: CLASSMATE_ID, school_id: SCHOOL_25 },
          { user_id: CLASSMATE_ID, school_id: SCHOOL_25 },
        ],
        groupInsert: { data: { id: GROUP_ID } },
        memberInsert: { data: [{ id: 'm1' }, { id: 'm2' }] },
      }),
    );

    const { req, res } = createMocks({ method: 'POST', body: postBody() });
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
  });

  // ── 8. 400 when classmate is at another school ───────────────
  it('returns 400 when classmate only has an active role at another school', async () => {
    mockCreatePagesServerClient.mockReturnValue(
      buildSessionClient({ tables: happySessionTables() }),
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
  });

  // ── 9. 400 when requester is already in a group ──────────────
  it('returns 400 when requester is already in a group for this assignment', async () => {
    mockCreatePagesServerClient.mockReturnValue(
      buildSessionClient({ tables: happySessionTables() }),
    );
    mockCreateClient.mockReturnValue(
      buildAdminClient({
        existingGroup: { group_id: GROUP_ID },
      }),
    );

    const { req, res } = createMocks({ method: 'POST', body: postBody() });
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(400);
    const data = JSON.parse(res._getData());
    expect(data.error).toContain('Ya perteneces');
  });

  // ── 10. 400 when a classmate is already in a group ───────────
  it('returns 400 when a classmate is already in a group', async () => {
    mockCreatePagesServerClient.mockReturnValue(
      buildSessionClient({ tables: happySessionTables() }),
    );
    mockCreateClient.mockReturnValue(
      buildAdminClient({
        classmateRoles: [{ user_id: CLASSMATE_ID, school_id: SCHOOL_25 }],
        existingMembers: [{ user_id: CLASSMATE_ID }],
      }),
    );

    const { req, res } = createMocks({ method: 'POST', body: postBody() });
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(400);
    const data = JSON.parse(res._getData());
    expect(data.error).toContain('ya están en grupos');
  });

  // ── 11. 500 when group insert fails ──────────────────────────
  it('returns 500 with details when group insert fails', async () => {
    mockCreatePagesServerClient.mockReturnValue(
      buildSessionClient({ tables: happySessionTables() }),
    );
    const insertError = { message: 'boom-group', code: 'P0001' };
    mockCreateClient.mockReturnValue(
      buildAdminClient({
        classmateRoles: [{ user_id: CLASSMATE_ID, school_id: SCHOOL_25 }],
        groupInsert: { data: null, error: insertError },
      }),
    );

    const { req, res } = createMocks({ method: 'POST', body: postBody() });
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(500);
    const data = JSON.parse(res._getData());
    expect(data.error).toBe('Error al crear el grupo');
    expect(data.details).toEqual(insertError);
  });

  // ── 12. 500 when member insert fails ─────────────────────────
  it('returns 500 with details when member insert fails', async () => {
    mockCreatePagesServerClient.mockReturnValue(
      buildSessionClient({ tables: happySessionTables() }),
    );
    const memberError = { message: 'boom-member', code: 'P0002' };
    mockCreateClient.mockReturnValue(
      buildAdminClient({
        classmateRoles: [{ user_id: CLASSMATE_ID, school_id: SCHOOL_25 }],
        groupInsert: { data: { id: GROUP_ID } },
        memberInsert: { data: null, error: memberError },
      }),
    );

    const { req, res } = createMocks({ method: 'POST', body: postBody() });
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(500);
    const data = JSON.parse(res._getData());
    expect(data.error).toBe('Error al agregar miembros');
    expect(data.details).toEqual(memberError);
  });

  // ── 13. Notification failure is swallowed ────────────────────
  it('returns 200 even when notification insert throws', async () => {
    mockCreatePagesServerClient.mockReturnValue(
      buildSessionClient({
        tables: happySessionTables(),
        throwOnTable: 'notifications',
      }),
    );
    mockCreateClient.mockReturnValue(
      buildAdminClient({
        classmateRoles: [{ user_id: CLASSMATE_ID, school_id: SCHOOL_25 }],
        groupInsert: { data: { id: GROUP_ID } },
        memberInsert: { data: [{ id: 'm1' }, { id: 'm2' }] },
      }),
    );

    const { req, res } = createMocks({ method: 'POST', body: postBody() });
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data.success).toBe(true);
  });
});
