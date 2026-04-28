// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';

const { mockCheckIsAdmin, mockCreateServiceRoleClient } = vi.hoisted(() => ({
  mockCheckIsAdmin: vi.fn(),
  mockCreateServiceRoleClient: vi.fn(),
}));

vi.mock('../../../lib/api-auth', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    checkIsAdmin: mockCheckIsAdmin,
    createServiceRoleClient: mockCreateServiceRoleClient,
  };
});

import handler from '../../../pages/api/admin/growth-communities/[id]/members';

const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const USER_LIDER = '33333333-3333-4333-8333-333333333333';
const COMMUNITY_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_COMMUNITY_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const GENERATION_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

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
  mockCheckIsAdmin.mockResolvedValueOnce({
    isAdmin: true,
    user: { id: ADMIN_ID },
    error: null,
  });
}

function setupNonAdmin(userId: string = USER_ID) {
  mockCheckIsAdmin.mockResolvedValueOnce({
    isAdmin: false,
    user: { id: userId },
    error: null,
  });
}

const COMMUNITY_ROW = {
  id: COMMUNITY_ID,
  name: 'Comunidad A',
  school_id: 1,
  generation_id: GENERATION_ID,
  max_teachers: null as number | null,
};

describe('admin/growth-communities/[id]/members — auth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('GET rejects non-admin with 403 and never opens a service-role client', async () => {
    setupNonAdmin();
    const { req, res } = createMocks({ method: 'GET', query: { id: COMMUNITY_ID } });
    await handler(req as never, res as never);
    expect(res._getStatusCode()).toBe(403);
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
  });

  it('POST rejects non-admin with 403 and never opens a service-role client', async () => {
    setupNonAdmin();
    const { req, res } = createMocks({
      method: 'POST',
      query: { id: COMMUNITY_ID },
      body: { userIds: [USER_ID] },
    });
    await handler(req as never, res as never);
    expect(res._getStatusCode()).toBe(403);
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
  });

  it('DELETE rejects non-admin with 403 and never opens a service-role client', async () => {
    setupNonAdmin();
    const { req, res } = createMocks({
      method: 'DELETE',
      query: { id: COMMUNITY_ID, userId: USER_ID },
    });
    await handler(req as never, res as never);
    expect(res._getStatusCode()).toBe(403);
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
  });

  it('lider_comunidad is not admin: GET still returns 403 — leader role does not auto-elevate', async () => {
    // checkIsAdmin returns isAdmin=false even when the caller is a community
    // leader. This is the same code path as any other non-admin, but we name
    // the case explicitly to lock in the expectation.
    setupNonAdmin(USER_LIDER);
    const { req, res } = createMocks({ method: 'GET', query: { id: COMMUNITY_ID } });
    await handler(req as never, res as never);
    expect(res._getStatusCode()).toBe(403);
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
    expect(body.added).toEqual([
      { user_id: USER_ID, role_id: 'role-docente', role_type: 'docente' },
    ]);
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
    const userRoles = [
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
          growth_communities: [{ data: community }],
          user_roles: [
            { data: userRoles }, // initial select
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
    expect(JSON.parse(res._getData())).toEqual({ error: 'exceeds_max' });
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
    expect(body.added).toEqual([]);
    expect(body.skipped).toEqual([
      { user_id: USER_ID, reason: 'already_in_community' },
    ]);
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
    expect(body.added).toEqual([]);
    expect(body.skipped).toEqual([{ user_id: USER_LIDER, reason: 'is_leader' }]);
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
    expect(body.added).toEqual([]);
    expect(body.skipped).toEqual([{ user_id: USER_LIDER, reason: 'is_leader' }]);
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
    expect(JSON.parse(res._getData())).toEqual({ error: 'is_leader_remove_blocked' });
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

    expect(body.currentMembers.map((m: { user_id: string }) => m.user_id)).toEqual([memberId]);
    expect(body.currentMembers[0].role.id).toBe('r1');
    expect(body.currentMembers[0].profile.first_name).toBe('Ana');

    expect(
      body.eligibleUsers.unassigned.map((u: { user_id: string }) => u.user_id)
    ).toEqual([unassignedId]);
    expect(body.eligibleUsers.unassigned[0].chosen_role.id).toBe('r2');

    expect(
      body.eligibleUsers.reassignFrom.map((u: { user_id: string }) => u.user_id)
    ).toEqual([reassignId]);
    expect(body.eligibleUsers.reassignFrom[0].from_community_id).toBe(OTHER_COMMUNITY_ID);
    expect(body.eligibleUsers.reassignFrom[0].from_community_name).toBe('Otra Comunidad');

    expect(body.excludedSummary).toEqual({
      is_leader: 1,
      generation_mismatch: 1,
    });
  });
});
