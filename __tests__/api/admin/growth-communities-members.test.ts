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

import handler from '../../../pages/api/admin/growth-communities/[id]/members';

const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const ED_ID = '99999999-9999-4999-8999-999999999999';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const USER_LIDER = '33333333-3333-4333-8333-333333333333';
const COMMUNITY_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_COMMUNITY_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const GENERATION_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const FORBIDDEN_ERROR = 'No tienes permiso para gestionar miembros de esta comunidad';

interface TableResult {
  data?: unknown;
  error?: unknown;
  count?: number;
}

interface FromCall {
  table: string;
  updates: unknown[];
  inArgs: unknown[];
}

interface Tracker {
  fromCalls: FromCall[];
}

/**
 * Mock Supabase client: each `from(table)` call consumes the next configured
 * result for that table. The chain proxy supports await (resolves to
 * { data, error, count }), .single() / .maybeSingle(), and records every
 * .update(arg) and .in(col, ids) so tests can assert which rows were touched.
 */
function buildSequencedClient(
  resultsByTable: Record<string, TableResult[]>,
  tracker?: Tracker
) {
  const indices: Record<string, number> = {};

  return {
    from: vi.fn((table: string) => {
      const idx = indices[table] ?? 0;
      indices[table] = idx + 1;
      const result = resultsByTable[table]?.[idx] ?? { data: null };

      const fromCall: FromCall = { table, updates: [], inArgs: [] };
      tracker?.fromCalls.push(fromCall);

      const resolved = {
        data: result.data ?? null,
        error: result.error ?? null,
        count: result.count,
      };

      const handler: ProxyHandler<Record<string, unknown>> = {
        get(_t, prop) {
          if (prop === 'then') {
            return (resolve: (v: unknown) => void) => resolve(resolved);
          }
          if (prop === 'update') {
            return vi.fn((arg: unknown) => {
              fromCall.updates.push(arg);
              return new Proxy({}, handler);
            });
          }
          if (prop === 'in') {
            return vi.fn((_col: string, ids: unknown) => {
              fromCall.inArgs.push(ids);
              return new Proxy({}, handler);
            });
          }
          if (prop === 'single' || prop === 'maybeSingle') {
            return vi.fn(() => ({
              then: (resolve: (v: unknown) => void) => resolve(resolved),
            }));
          }
          return vi.fn(() => new Proxy({}, handler));
        },
      };
      return new Proxy({}, handler);
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

function setupEquipoDirectivo(schoolId: number, userId: string = ED_ID) {
  mockCheckIsAdminOrEquipoDirectivo.mockResolvedValueOnce({
    isAuthorized: true,
    role: 'equipo_directivo',
    schoolId,
    user: { id: userId } as any,
    error: null,
  });
}

function setupUnauthorized(userId: string = USER_ID) {
  mockCheckIsAdminOrEquipoDirectivo.mockResolvedValueOnce({
    isAuthorized: false,
    role: null,
    schoolId: null,
    user: { id: userId } as any,
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

const COMMUNITY_ROW = {
  id: COMMUNITY_ID,
  name: 'Comunidad A',
  school_id: 1,
  school: { name: 'Colegio Uno' },
  generation_id: GENERATION_ID,
  max_teachers: null as number | null,
};

describe('admin/growth-communities/[id]/members — auth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Roles whose users should always fail the helper (isAuthorized: false).
  // equipo_directivo is excluded here because ED has dedicated tests covering
  // both same-school (authorized) and other-school (forbidden) paths.
  const unauthorizedRoles = [
    'consultor',
    'lider_comunidad',
    'docente',
  ] as const;

  const requests = [
    { method: 'GET', query: { id: COMMUNITY_ID } },
    { method: 'POST', query: { id: COMMUNITY_ID }, body: { userIds: [USER_ID] } },
    { method: 'DELETE', query: { id: COMMUNITY_ID, userId: USER_ID } },
  ] as const;

  it.each(unauthorizedRoles)('%s cannot GET community members', async () => {
    setupUnauthorized();
    const { req, res } = createMocks(requests[0]);
    await handler(req as never, res as never);
    expect(res._getStatusCode()).toBe(403);
    expect(JSON.parse(res._getData())).toEqual({ error: FORBIDDEN_ERROR });
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
  });

  it.each(unauthorizedRoles)('%s cannot POST community members', async () => {
    setupUnauthorized();
    const { req, res } = createMocks(requests[1]);
    await handler(req as never, res as never);
    expect(res._getStatusCode()).toBe(403);
    expect(JSON.parse(res._getData())).toEqual({ error: FORBIDDEN_ERROR });
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
  });

  it.each(unauthorizedRoles)('%s cannot DELETE community members', async () => {
    setupUnauthorized();
    const { req, res } = createMocks(requests[2]);
    await handler(req as never, res as never);
    expect(res._getStatusCode()).toBe(403);
    expect(JSON.parse(res._getData())).toEqual({ error: FORBIDDEN_ERROR });
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
  });

  it.each(requests)('unauthenticated $method returns 401', async (request) => {
    setupUnauthenticated();
    const { req, res } = createMocks(request);
    await handler(req as never, res as never);
    expect(res._getStatusCode()).toBe(401);
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
  });

  it('isAuthorized: false returns 403 with forbidden body', async () => {
    setupUnauthorized();
    const { req, res } = createMocks(requests[0]);
    await handler(req as never, res as never);
    expect(res._getStatusCode()).toBe(403);
    expect(JSON.parse(res._getData())).toEqual({ error: FORBIDDEN_ERROR });
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
  });
});

describe('admin/growth-communities/[id]/members — POST', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates exactly one user_roles row per user, picked by ROLE_PRIORITY (docente over lider_comunidad / consultor)', async () => {
    setupAdmin();
    const tracker: Tracker = { fromCalls: [] };

    // The user holds three eligible rows in this school. ROLE_PRIORITY puts
    // docente first; lider_comunidad is intentionally lowest. Only the docente
    // row id must end up in the .in() filter of the update.
    const userRoles = [
      {
        id: 'role-lider',
        user_id: USER_ID,
        role_type: 'lider_comunidad',
        school_id: 1,
        generation_id: GENERATION_ID,
        community_id: null,
        is_active: true,
      },
      {
        id: 'role-consultor',
        user_id: USER_ID,
        role_type: 'consultor',
        school_id: 1,
        generation_id: GENERATION_ID,
        community_id: null,
        is_active: true,
      },
      {
        id: 'role-docente',
        user_id: USER_ID,
        role_type: 'docente',
        school_id: 1,
        generation_id: GENERATION_ID,
        community_id: null,
        is_active: true,
      },
    ];

    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildSequencedClient(
        {
          growth_communities: [{ data: COMMUNITY_ROW }],
          user_roles: [
            { data: userRoles }, // initial select
            { data: null, error: null }, // update result
          ],
        },
        tracker
      )
    );

    const { req, res } = createMocks({
      method: 'POST',
      query: { id: COMMUNITY_ID },
      body: { userIds: [USER_ID] },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);
    const body = JSON.parse(res._getData());
    expect(body.assigned).toBe(1);
    expect(body.skipped).toEqual([]);

    const updateCalls = tracker.fromCalls.filter(
      (c) => c.table === 'user_roles' && c.updates.length > 0
    );
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].updates[0]).toEqual({ community_id: COMMUNITY_ID });
    // Only the chosen (docente) row id is in the .in() filter — the leader and
    // consultor rows must not be touched.
    expect(updateCalls[0].inArgs).toEqual([['role-docente']]);
  });

  it('rejects with exceeds_max when adding members would exceed max_teachers — issues no update', async () => {
    setupAdmin();
    const tracker: Tracker = { fromCalls: [] };

    const community = { ...COMMUNITY_ROW, max_teachers: 1 };

    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildSequencedClient(
        {
          growth_communities: [{ data: community }],
          user_roles: [
            { count: 1 }, // capacity count: already 1 active member
          ],
        },
        tracker
      )
    );

    const { req, res } = createMocks({
      method: 'POST',
      query: { id: COMMUNITY_ID },
      body: { userIds: [USER_ID] },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(400);
    expect(JSON.parse(res._getData())).toEqual({
      error: 'exceeds_max',
      currentMemberCount: 1,
      maxTeachers: 1,
    });
    // Capacity check failed before any write — no update calls anywhere.
    expect(tracker.fromCalls.flatMap((c) => c.updates)).toHaveLength(0);
  });

  it('returns already_in_community skip reason without issuing any update', async () => {
    setupAdmin();
    const tracker: Tracker = { fromCalls: [] };

    const userRoles = [
      {
        id: 'role-existing',
        user_id: USER_ID,
        role_type: 'docente',
        school_id: 1,
        generation_id: GENERATION_ID,
        community_id: COMMUNITY_ID,
        is_active: true,
      },
    ];

    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildSequencedClient(
        {
          growth_communities: [{ data: COMMUNITY_ROW }],
          user_roles: [{ data: userRoles }],
        },
        tracker
      )
    );

    const { req, res } = createMocks({
      method: 'POST',
      query: { id: COMMUNITY_ID },
      body: { userIds: [USER_ID] },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);
    const body = JSON.parse(res._getData());
    expect(body.assigned).toBe(0);
    expect(body.skipped).toEqual([
      { userId: USER_ID, reason: 'already_in_community' },
    ]);
    expect(tracker.fromCalls.flatMap((c) => c.updates)).toHaveLength(0);
  });

  it('returns no_eligible_role when the user has no active role at the community school', async () => {
    setupAdmin();
    const tracker: Tracker = { fromCalls: [] };

    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildSequencedClient(
        {
          growth_communities: [{ data: COMMUNITY_ROW }],
          user_roles: [{ data: [] }],
        },
        tracker
      )
    );

    const { req, res } = createMocks({
      method: 'POST',
      query: { id: COMMUNITY_ID },
      body: { userIds: [USER_ID] },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);
    expect(JSON.parse(res._getData())).toEqual({
      assigned: 0,
      skipped: [{ userId: USER_ID, reason: 'no_eligible_role' }],
    });
    expect(tracker.fromCalls.flatMap((c) => c.updates)).toHaveLength(0);
  });

  it('bulk assigns three users and preserves role_type by updating only chosen row ids', async () => {
    setupAdmin();
    const tracker: Tracker = { fromCalls: [] };

    const userA = '00000000-0000-4000-8000-000000000101';
    const userB = '00000000-0000-4000-8000-000000000102';
    const userC = '00000000-0000-4000-8000-000000000103';
    const userRoles = [
      {
        id: 'role-a-docente',
        user_id: userA,
        role_type: 'docente',
        school_id: 1,
        generation_id: GENERATION_ID,
        community_id: null,
        is_active: true,
      },
      {
        id: 'role-b-directivo',
        user_id: userB,
        role_type: 'equipo_directivo',
        school_id: 1,
        generation_id: GENERATION_ID,
        community_id: null,
        is_active: true,
      },
      {
        id: 'role-c-consultor',
        user_id: userC,
        role_type: 'consultor',
        school_id: 1,
        generation_id: GENERATION_ID,
        community_id: null,
        is_active: true,
      },
    ];

    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildSequencedClient(
        {
          growth_communities: [{ data: COMMUNITY_ROW }],
          user_roles: [
            { data: userRoles },
            { data: null, error: null },
          ],
        },
        tracker
      )
    );

    const { req, res } = createMocks({
      method: 'POST',
      query: { id: COMMUNITY_ID },
      body: { userIds: [userA, userB, userC] },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);
    expect(JSON.parse(res._getData())).toEqual({ assigned: 3, skipped: [] });

    const updateCalls = tracker.fromCalls.filter((c) => c.updates.length > 0);
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].updates[0]).toEqual({ community_id: COMMUNITY_ID });
    expect(updateCalls[0].inArgs).toEqual([
      ['role-a-docente', 'role-b-directivo', 'role-c-consultor'],
    ]);
  });

  it('returns generation_mismatch and issues no update when the chosen row has another generation', async () => {
    setupAdmin();
    const tracker: Tracker = { fromCalls: [] };

    const otherGenerationId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
    const userRoles = [
      {
        id: 'role-mismatch',
        user_id: USER_ID,
        role_type: 'docente',
        school_id: 1,
        generation_id: otherGenerationId,
        community_id: null,
        is_active: true,
      },
    ];

    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildSequencedClient(
        {
          growth_communities: [{ data: COMMUNITY_ROW }],
          user_roles: [{ data: userRoles }],
        },
        tracker
      )
    );

    const { req, res } = createMocks({
      method: 'POST',
      query: { id: COMMUNITY_ID },
      body: { userIds: [USER_ID] },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);
    expect(JSON.parse(res._getData())).toEqual({
      assigned: 0,
      skipped: [{ userId: USER_ID, reason: 'generation_mismatch' }],
    });
    expect(tracker.fromCalls.flatMap((c) => c.updates)).toHaveLength(0);
  });

  it('skips with is_leader when the chosen row is lider_comunidad with community_id set — no update issued', async () => {
    setupAdmin();
    const tracker: Tracker = { fromCalls: [] };

    // lider_comunidad row is the only candidate AND its community_id is bound
    // to a different community. INVARIANT: never reuse that row. Skip the user.
    const userRoles = [
      {
        id: 'role-lider',
        user_id: USER_LIDER,
        role_type: 'lider_comunidad',
        school_id: 1,
        generation_id: GENERATION_ID,
        community_id: OTHER_COMMUNITY_ID,
        is_active: true,
      },
    ];

    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildSequencedClient(
        {
          growth_communities: [{ data: COMMUNITY_ROW }],
          user_roles: [{ data: userRoles }],
        },
        tracker
      )
    );

    const { req, res } = createMocks({
      method: 'POST',
      query: { id: COMMUNITY_ID },
      body: { userIds: [USER_LIDER] },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);
    const body = JSON.parse(res._getData());
    expect(body.assigned).toBe(0);
    expect(body.skipped).toEqual([{ userId: USER_LIDER, reason: 'is_leader' }]);
    expect(tracker.fromCalls.flatMap((c) => c.updates)).toHaveLength(0);
  });

  it('skips with is_leader even when lider_comunidad row has community_id=null — no role-escalation surface', async () => {
    setupAdmin();
    const tracker: Tracker = { fromCalls: [] };

    // Regression guard for F2: a user whose only eligible row is an
    // *unbound* lider_comunidad (community_id=null) used to slip through the
    // old `&& chosen.community_id` guard and get bound to this community —
    // effectively promoting them to leader via the bulk-add UI. The new
    // invariant is "never modify a lider_comunidad row, period."
    const userRoles = [
      {
        id: 'role-lider-unbound',
        user_id: USER_LIDER,
        role_type: 'lider_comunidad',
        school_id: 1,
        generation_id: GENERATION_ID,
        community_id: null,
        is_active: true,
      },
    ];

    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildSequencedClient(
        {
          growth_communities: [{ data: COMMUNITY_ROW }],
          user_roles: [{ data: userRoles }],
        },
        tracker
      )
    );

    const { req, res } = createMocks({
      method: 'POST',
      query: { id: COMMUNITY_ID },
      body: { userIds: [USER_LIDER] },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);
    const body = JSON.parse(res._getData());
    expect(body.assigned).toBe(0);
    expect(body.skipped).toEqual([{ userId: USER_LIDER, reason: 'is_leader' }]);
    expect(tracker.fromCalls.flatMap((c) => c.updates)).toHaveLength(0);
  });
});

describe('admin/growth-communities/[id]/members — DELETE', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('blocks DELETE with is_leader_remove_blocked when the matching row is lider_comunidad — issues no update', async () => {
    setupAdmin();
    const tracker: Tracker = { fromCalls: [] };

    const matchingRows = [{ id: 'role-lider', role_type: 'lider_comunidad' }];

    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildSequencedClient(
        {
          growth_communities: [{ data: COMMUNITY_ROW }],
          user_roles: [{ data: matchingRows }],
        },
        tracker
      )
    );

    const { req, res } = createMocks({
      method: 'DELETE',
      query: { id: COMMUNITY_ID, userId: USER_LIDER },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(400);
    expect(JSON.parse(res._getData())).toEqual({
      error: 'is_leader_remove_blocked',
      message: 'Reasigna el liderazgo antes de remover este usuario.',
    });
    expect(tracker.fromCalls.flatMap((c) => c.updates)).toHaveLength(0);
  });

  it('only nulls the rows that match (user_id, community.id, is_active) — leaves rows in other communities untouched', async () => {
    setupAdmin();
    const tracker: Tracker = { fromCalls: [] };

    // The matching select is server-side filtered by community.id; only the
    // in-scope row is returned. The handler must update precisely those ids.
    const matchingRows = [{ id: 'role-here', role_type: 'docente' }];

    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildSequencedClient(
        {
          growth_communities: [{ data: COMMUNITY_ROW }],
          user_roles: [
            { data: matchingRows }, // matching select
            { data: null, error: null }, // update result
          ],
        },
        tracker
      )
    );

    const { req, res } = createMocks({
      method: 'DELETE',
      query: { id: COMMUNITY_ID, userId: USER_ID },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);
    expect(JSON.parse(res._getData())).toEqual({ removed: 1 });

    const updateCalls = tracker.fromCalls.filter((c) => c.updates.length > 0);
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].updates[0]).toEqual({ community_id: null });
    // Only the in-scope id appears in the .in() filter; rows in other
    // communities (which the matching select would not have returned) remain
    // unaffected.
    expect(updateCalls[0].inArgs).toEqual([['role-here']]);
  });
});

describe('admin/growth-communities/[id]/members — GET response shape', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('splits rows into currentMembers, eligibleUsers.unassigned, eligibleUsers.reassignFrom, and excludedSummary', async () => {
    setupAdmin();

    const memberId = '00000000-0000-4000-8000-00000000000a';
    const unassignedId = '00000000-0000-4000-8000-00000000000b';
    const reassignId = '00000000-0000-4000-8000-00000000000c';
    const leaderId = '00000000-0000-4000-8000-00000000000d';
    const mismatchId = '00000000-0000-4000-8000-00000000000e';
    const otherGenerationId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

    const userRoles = [
      // currentMembers — already in this community
      {
        id: 'r1',
        user_id: memberId,
        role_type: 'docente',
        school_id: 1,
        generation_id: GENERATION_ID,
        community_id: COMMUNITY_ID,
        is_active: true,
      },
      // eligibleUsers.unassigned — chosen row has no community
      {
        id: 'r2',
        user_id: unassignedId,
        role_type: 'docente',
        school_id: 1,
        generation_id: GENERATION_ID,
        community_id: null,
        is_active: true,
      },
      // eligibleUsers.reassignFrom — chosen row sits in a different community
      {
        id: 'r3',
        user_id: reassignId,
        role_type: 'docente',
        school_id: 1,
        generation_id: GENERATION_ID,
        community_id: OTHER_COMMUNITY_ID,
        is_active: true,
      },
      // excludedSummary.is_leader — only candidate is a bound leader row
      {
        id: 'r4',
        user_id: leaderId,
        role_type: 'lider_comunidad',
        school_id: 1,
        generation_id: GENERATION_ID,
        community_id: OTHER_COMMUNITY_ID,
        is_active: true,
      },
      // excludedSummary.generation_mismatch — chosen row's generation differs
      {
        id: 'r5',
        user_id: mismatchId,
        role_type: 'docente',
        school_id: 1,
        generation_id: otherGenerationId,
        community_id: null,
        is_active: true,
      },
    ];

    const profiles = [
      { id: memberId, first_name: 'Ana', last_name: 'M', email: 'ana@x', avatar_url: null },
      { id: unassignedId, first_name: 'Bea', last_name: 'U', email: 'bea@x', avatar_url: null },
      { id: reassignId, first_name: 'Cam', last_name: 'R', email: 'cam@x', avatar_url: null },
      { id: leaderId, first_name: 'Dom', last_name: 'L', email: 'dom@x', avatar_url: null },
      { id: mismatchId, first_name: 'Eli', last_name: 'G', email: 'eli@x', avatar_url: null },
    ];

    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildSequencedClient({
        growth_communities: [
          { data: COMMUNITY_ROW }, // initial single() lookup
          { data: [{ id: OTHER_COMMUNITY_ID, name: 'Otra Comunidad' }] }, // related-name lookup
        ],
        user_roles: [{ data: userRoles }],
        profiles: [{ data: profiles }],
      })
    );

    const { req, res } = createMocks({
      method: 'GET',
      query: { id: COMMUNITY_ID },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);
    const body = JSON.parse(res._getData());

    expect(body.community).toEqual({
      id: COMMUNITY_ID,
      name: 'Comunidad A',
      school_id: 1,
      school_name: 'Colegio Uno',
      generation_id: GENERATION_ID,
      max_teachers: null,
    });

    expect(body.currentMembers.map((m: { user_id: string }) => m.user_id)).toEqual([memberId]);
    expect(body.currentMembers[0]).toMatchObject({
      user_id: memberId,
      first_name: 'Ana',
      last_name: 'M',
      email: 'ana@x',
      role_type: 'docente',
      user_roles_id: 'r1',
    });

    expect(
      body.eligibleUsers.unassigned.map((u: { user_id: string }) => u.user_id)
    ).toEqual([unassignedId]);
    expect(body.eligibleUsers.unassigned[0]).toMatchObject({
      user_id: unassignedId,
      first_name: 'Bea',
      last_name: 'U',
      email: 'bea@x',
      role_type: 'docente',
    });

    expect(
      body.eligibleUsers.reassignFrom.map((u: { user_id: string }) => u.user_id)
    ).toEqual([reassignId]);
    expect(body.eligibleUsers.reassignFrom[0]).toMatchObject({
      user_id: reassignId,
      first_name: 'Cam',
      last_name: 'R',
      email: 'cam@x',
      role_type: 'docente',
      current_community_id: OTHER_COMMUNITY_ID,
      current_community_name: 'Otra Comunidad',
    });

    expect(body.excludedSummary).toEqual({
      count: 2,
      reasons: {
        is_leader: 1,
        generation_mismatch: 1,
      },
    });
  });
});

describe('admin/growth-communities/[id]/members — equipo_directivo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('GET by equipo_directivo in same school returns 200', async () => {
    setupEquipoDirectivo(1);

    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildSequencedClient({
        growth_communities: [{ data: COMMUNITY_ROW }],
        user_roles: [{ data: [] }],
        profiles: [{ data: [] }],
      })
    );

    const { req, res } = createMocks({
      method: 'GET',
      query: { id: COMMUNITY_ID },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);
    const body = JSON.parse(res._getData());
    expect(body.community.school_id).toBe(1);
    expect(body.currentMembers).toEqual([]);
  });

  it('GET by equipo_directivo in a different school returns 403', async () => {
    setupEquipoDirectivo(999);

    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildSequencedClient({
        growth_communities: [{ data: COMMUNITY_ROW }],
      })
    );

    const { req, res } = createMocks({
      method: 'GET',
      query: { id: COMMUNITY_ID },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(403);
    expect(JSON.parse(res._getData())).toEqual({ error: FORBIDDEN_ERROR });
  });

  it('GET by equipo_directivo succeeds when community.school_id is "42" and helper schoolId is 42', async () => {
    // Type coercion: the DB column may surface as a string in some shapes.
    // The handler must coerce to number before comparing against the helper's
    // numeric schoolId.
    setupEquipoDirectivo(42);

    const community = { ...COMMUNITY_ROW, school_id: '42' };

    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildSequencedClient({
        growth_communities: [{ data: community }],
        user_roles: [{ data: [] }],
        profiles: [{ data: [] }],
      })
    );

    const { req, res } = createMocks({
      method: 'GET',
      query: { id: COMMUNITY_ID },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);
  });

  it('POST by equipo_directivo in same school assigns one member', async () => {
    setupEquipoDirectivo(1);

    const userRoles = [
      {
        id: 'role-docente-ed',
        user_id: USER_ID,
        role_type: 'docente',
        school_id: 1,
        generation_id: GENERATION_ID,
        community_id: null,
        is_active: true,
      },
    ];

    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildSequencedClient({
        growth_communities: [{ data: COMMUNITY_ROW }],
        user_roles: [
          { data: userRoles },
          { data: null, error: null },
        ],
      })
    );

    const { req, res } = createMocks({
      method: 'POST',
      query: { id: COMMUNITY_ID },
      body: { userIds: [USER_ID] },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);
    expect(JSON.parse(res._getData())).toEqual({ assigned: 1, skipped: [] });
  });

  it('DELETE by equipo_directivo in same school removes the member', async () => {
    setupEquipoDirectivo(1);

    const matchingRows = [{ id: 'role-here', role_type: 'docente' }];

    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildSequencedClient({
        growth_communities: [{ data: COMMUNITY_ROW }],
        user_roles: [
          { data: matchingRows },
          { data: null, error: null },
        ],
      })
    );

    const { req, res } = createMocks({
      method: 'DELETE',
      query: { id: COMMUNITY_ID, userId: USER_ID },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);
    expect(JSON.parse(res._getData())).toEqual({ removed: 1 });
  });
});
