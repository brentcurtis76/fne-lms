// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';

// The community members API takes the verified caller from
// requireVerifiedCaller (its forged-cookie behaviour is covered in
// reports-community-forged-session.test.ts), then reads role rows + profiles
// with a module-level service-role client. Mock both so we can drive the
// access checks and the returned data deterministically.
const { mockRequireVerifiedCaller, mockServiceFrom, mockSessionRpc } = vi.hoisted(() => ({
  mockRequireVerifiedCaller: vi.fn(),
  mockServiceFrom: vi.fn(),
  // F12e V5b: the caller's own session client, used only to ask
  // auth_consultor_assigned_school_ids (it answers about the caller).
  mockSessionRpc: vi.fn(),
}));

vi.mock('../../../lib/api-auth', () => ({
  requireVerifiedCaller: mockRequireVerifiedCaller,
  createApiSupabaseClient: async () => ({ rpc: mockSessionRpc }),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: mockServiceFrom,
  }),
}));

import handler from '../../../pages/api/community/members';

const COMMUNITY_ID = 'd75e23ca-621c-4b06-84df-2c61fb779dfb';
const OTHER_COMMUNITY_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const MEMBER_ID = '22222222-2222-4222-8222-222222222222';
const U1 = '33333333-3333-4333-8333-333333333333';
const U2 = '44444444-4444-4444-8444-444444444444';
const U3 = '55555555-5555-4555-8555-555555555555'; // holds two active roles

type Result = { data?: unknown; error?: unknown };

type EqCall = [column: string, value: unknown];

/** The filters one specific query instance was built with. */
type RecordedQuery = { eqCalls: EqCall[] };

/**
 * Every chain handed out by `from(table)`, per table and in call order, so a
 * test can assert the filters of ONE query instance. The handler queries
 * `user_roles` twice — [0] verifies the requester, [1] lists the community's
 * members — and a scope assertion must read [1], not whichever call happened
 * to carry a matching `.eq`.
 */
let recordedQueries: Record<string, RecordedQuery[]> = {};

/**
 * A thenable query chain: every builder method (.select/.eq/.in) returns the
 * same object, and awaiting it resolves to { data, error }. `.eq` arguments are
 * captured on this instance's record. The mock never filters rows itself, so
 * the ONLY proof that the handler scopes a query is the captured `.eq` calls —
 * a prefiltered fixture proves nothing.
 */
function makeChain(result: Result) {
  const resolved = { data: result.data ?? null, error: result.error ?? null };
  const record: RecordedQuery = { eqCalls: [] };
  const chain: any = {
    select: () => chain,
    eq: (column: string, value: unknown) => {
      record.eqCalls.push([column, value]);
      return chain;
    },
    in: () => chain,
    maybeSingle: () => Promise.resolve(resolved),
    then: (resolve: (v: unknown) => void) => resolve(resolved),
  };
  return { chain, record };
}

/**
 * Returns a `from(table)` impl that hands back the next queued result for that
 * table on each call (the handler queries `user_roles` twice, `profiles` once)
 * and records each created chain in `recordedQueries`.
 */
function sequencedFrom(queue: Record<string, Result[]>) {
  const idx: Record<string, number> = {};
  return (table: string) => {
    const i = idx[table] ?? 0;
    idx[table] = i + 1;
    const { chain, record } = makeChain(queue[table]?.[i] ?? { data: [] });
    (recordedQueries[table] ??= []).push(record);
    return chain;
  };
}

/**
 * Asserts that the SECOND `user_roles` query — the community-member query — was
 * built with exactly `.eq('community_id', <requested>)` and `.eq('is_active',
 * true)` and nothing else. Indexing the second instance explicitly means the
 * requester query's own `.eq('is_active', true)` (instance [0]) can never
 * satisfy this; removing either member filter from the handler fails it.
 */
function expectCommunityMemberQueryScopedTo(requestedCommunityId: string) {
  const queries = recordedQueries.user_roles ?? [];
  expect(queries).toHaveLength(2);
  const { eqCalls } = queries[1];
  expect(eqCalls).toHaveLength(2);
  expect(eqCalls).toContainEqual(['community_id', requestedCommunityId]);
  expect(eqCalls).toContainEqual(['is_active', true]);
}

function setSession(userId: string | null) {
  mockRequireVerifiedCaller.mockResolvedValue(
    userId
      ? { user: { id: userId }, status: null, body: null }
      : { user: null, status: 401, body: { error: 'No autorizado' } },
  );
}

function setService(queue: Record<string, Result[]>) {
  mockServiceFrom.mockImplementation(sequencedFrom(queue));
}

async function invoke(query: Record<string, string>) {
  const { req, res } = createMocks({ method: 'GET', query });
  await handler(req as never, res as never);
  return res;
}

// Active role rows for COMMUNITY_ID. U3 deliberately appears twice, with the
// lower-priority `docente` row BEFORE the higher-priority `lider_comunidad` row,
// to prove dedup + deterministic role ordering (not DB row order).
const roleRows = [
  { id: 'r1', user_id: U1, role_type: 'docente', community_id: COMMUNITY_ID, school_id: 7, generation_id: null, is_active: true, assigned_at: '2026-01-01', created_at: '2026-01-01' },
  { id: 'r2', user_id: U2, role_type: 'docente', community_id: COMMUNITY_ID, school_id: 7, generation_id: null, is_active: true, assigned_at: '2026-01-02', created_at: '2026-01-02' },
  { id: 'r3', user_id: U3, role_type: 'docente', community_id: COMMUNITY_ID, school_id: 7, generation_id: null, is_active: true, assigned_at: '2026-01-03', created_at: '2026-01-03' },
  { id: 'r4', user_id: U3, role_type: 'lider_comunidad', community_id: COMMUNITY_ID, school_id: 7, generation_id: null, is_active: true, assigned_at: '2026-01-04', created_at: '2026-01-04' },
];

const profiles = [
  { id: U1, email: 'ana@x.cl', first_name: 'Ana', last_name: 'Uno', avatar_url: null, school_id: 7, generation_id: null, community_id: null, created_at: '2026-01-01', external_school_affiliation: null, approval_status: 'approved' },
  { id: U2, email: 'bruno@x.cl', first_name: 'Bruno', last_name: 'Dos', avatar_url: null, school_id: 7, generation_id: null, community_id: null, created_at: '2026-01-02', external_school_affiliation: null, approval_status: 'approved' },
  { id: U3, email: 'carla@x.cl', first_name: 'Carla', last_name: 'Tres', avatar_url: 'http://x/c.png', school_id: 7, generation_id: null, community_id: null, created_at: '2026-01-03', external_school_affiliation: null, approval_status: 'approved' },
];

function setMemberRequester(communityId: string) {
  setService({
    user_roles: [
      { data: [{ role_type: 'docente', community_id: communityId, is_active: true }] }, // requester roles
      { data: roleRows }, // community role rows
    ],
    profiles: [{ data: profiles }],
  });
}

describe('GET /api/community/members', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    recordedQueries = {};
  });

  it('lets a member of the community fetch its members', async () => {
    setSession(MEMBER_ID);
    setMemberRequester(COMMUNITY_ID);

    const res = await invoke({ community_id: COMMUNITY_ID });

    expect(res._getStatusCode()).toBe(200);
    const { members } = JSON.parse(res._getData());
    // 4 role rows -> 3 distinct users (U3 deduped)
    expect(members).toHaveLength(3);
    expect(members.map((m: any) => m.id).sort()).toEqual([U1, U2, U3].sort());

    // The member list is scoped at the query, not by the fixture.
    expect(recordedQueries.user_roles[0].eqCalls).toEqual([
      ['user_id', MEMBER_ID],
      ['is_active', true],
    ]);
    expectCommunityMemberQueryScopedTo(COMMUNITY_ID);
  });

  it('scopes the member query to the requested community id, not to the requester', async () => {
    setSession(MEMBER_ID);
    // Requester belongs to BOTH communities; the query must carry the one that
    // was requested (OTHER_COMMUNITY_ID), never the requester's first/other one.
    setService({
      user_roles: [
        {
          data: [
            { role_type: 'docente', community_id: COMMUNITY_ID, is_active: true },
            { role_type: 'docente', community_id: OTHER_COMMUNITY_ID, is_active: true },
          ],
        },
        { data: [] },
      ],
    });

    const res = await invoke({ community_id: OTHER_COMMUNITY_ID });

    expect(res._getStatusCode()).toBe(200);
    expect(JSON.parse(res._getData()).members).toEqual([]);
    expectCommunityMemberQueryScopedTo(OTHER_COMMUNITY_ID);
    // Zero member rows short-circuits before any profile lookup.
    expect(recordedQueries.profiles ?? []).toHaveLength(0);
  });

  it('forbids a member of a different community (403)', async () => {
    setSession(MEMBER_ID);
    // Requester only belongs to OTHER_COMMUNITY_ID and is not admin.
    setService({
      user_roles: [
        { data: [{ role_type: 'docente', community_id: OTHER_COMMUNITY_ID, is_active: true }] },
      ],
    });

    const res = await invoke({ community_id: COMMUNITY_ID });

    expect(res._getStatusCode()).toBe(403);
    // Denied before the member query is ever built.
    expect(recordedQueries.user_roles).toHaveLength(1);
    expect(recordedQueries.profiles ?? []).toHaveLength(0);
  });

  it('lets an admin fetch any community', async () => {
    setSession(ADMIN_ID);
    setService({
      user_roles: [
        { data: [{ role_type: 'admin', community_id: null, is_active: true }] }, // admin, no community
        { data: roleRows },
      ],
      profiles: [{ data: profiles }],
    });

    const res = await invoke({ community_id: COMMUNITY_ID });

    expect(res._getStatusCode()).toBe(200);
    expect(JSON.parse(res._getData()).members).toHaveLength(3);

    // An admin who is NOT a member of the community is authorized by role, yet
    // the member query must still be scoped to the REQUESTED community and to
    // active rows. The requester query ([0]) carries the admin's own filters;
    // the member query ([1]) is asserted on its own instance.
    expect(recordedQueries.user_roles).toHaveLength(2);
    expect(recordedQueries.user_roles[0].eqCalls).toEqual([
      ['user_id', ADMIN_ID],
      ['is_active', true],
    ]);
    expectCommunityMemberQueryScopedTo(COMMUNITY_ID);
  });

  it('returns profile fields for every active community member', async () => {
    setSession(MEMBER_ID);
    setMemberRequester(COMMUNITY_ID);

    const res = await invoke({ community_id: COMMUNITY_ID });
    const { members } = JSON.parse(res._getData());

    for (const m of members) {
      expect(m).toHaveProperty('email');
      expect(m).toHaveProperty('first_name');
      expect(m).toHaveProperty('last_name');
      expect(m).toHaveProperty('avatar_url');
    }
    const ana = members.find((m: any) => m.id === U1);
    // F7c (N99): a plain member sees name and photo only; the e-mail is ''.
    expect(ana.email).toBe('');
    expect(ana.first_name).toBe('Ana');
    expect(ana.last_name).toBe('Uno');
  });

  it('dedupes multi-role users and merges roles in priority order', async () => {
    setSession(MEMBER_ID);
    setMemberRequester(COMMUNITY_ID);

    const res = await invoke({ community_id: COMMUNITY_ID });
    const { members } = JSON.parse(res._getData());

    // U3 appears exactly once...
    const u3Rows = members.filter((m: any) => m.id === U3);
    expect(u3Rows).toHaveLength(1);

    // ...with both roles merged, ordered most-significant-first
    // (lider_comunidad before docente), regardless of DB row order.
    const u3 = u3Rows[0];
    expect(u3.user_roles.map((r: any) => r.role_type)).toEqual([
      'lider_comunidad',
      'docente',
    ]);
  });

  // F7c (member e-mails, N99): e-mail addresses only for admins, the community
  // manager of this community and its leader; unapproved people only for admins.
  describe('e-mails and approval (F7c, N99)', () => {
    const U4 = '66666666-6666-4666-8666-666666666666'; // profile not approved
    const rowsWithPending = [
      ...roleRows,
      { id: 'r5', user_id: U4, role_type: 'docente', community_id: COMMUNITY_ID, school_id: 7, generation_id: null, is_active: true, assigned_at: '2026-01-05', created_at: '2026-01-05' },
    ];
    const profilesWithPending = [
      ...profiles,
      { id: U4, email: 'diego@x.cl', first_name: 'Diego', last_name: 'Cuatro', avatar_url: null, school_id: 7, generation_id: null, community_id: null, created_at: '2026-01-05', external_school_affiliation: null, approval_status: 'pending' },
    ];
    function setRequester(requesterRoles: Array<{ role_type: string; community_id: string | null }>) {
      setService({
        user_roles: [
          { data: requesterRoles.map(r => ({ ...r, is_active: true })) },
          { data: rowsWithPending },
        ],
        profiles: [{ data: profilesWithPending }],
      });
    }
    async function membersFor(requesterRoles: Array<{ role_type: string; community_id: string | null }>) {
      setSession(MEMBER_ID);
      setRequester(requesterRoles);
      const res = await invoke({ community_id: COMMUNITY_ID });
      expect(res._getStatusCode()).toBe(200);
      return JSON.parse(res._getData()).members as any[];
    }
    const emailsOf = (members: any[]) => Object.fromEntries(members.map(m => [m.id, m.email]));

    it('a plain member (docente) gets empty e-mails and only approved people', async () => {
      const members = await membersFor([{ role_type: 'docente', community_id: COMMUNITY_ID }]);
      expect(members.map(m => m.id)).toEqual([U1, U2, U3]);
      expect(emailsOf(members)).toEqual({ [U1]: '', [U2]: '', [U3]: '' });
      for (const m of members) {
        expect(m.first_name).toBeTruthy();
        expect(m).toHaveProperty('avatar_url');
        expect(m.user_roles.length).toBeGreaterThan(0);
        expect(m).not.toHaveProperty('approval_status');
      }
    });

    it('the leader of this community (lider_comunidad) gets e-mails; still only approved people', async () => {
      const members = await membersFor([{ role_type: 'lider_comunidad', community_id: COMMUNITY_ID }]);
      expect(emailsOf(members)).toEqual({ [U1]: 'ana@x.cl', [U2]: 'bruno@x.cl', [U3]: 'carla@x.cl' });
    });

    it('the community manager of this community gets e-mails; still only approved people', async () => {
      const members = await membersFor([{ role_type: 'community_manager', community_id: COMMUNITY_ID }]);
      expect(emailsOf(members)).toEqual({ [U1]: 'ana@x.cl', [U2]: 'bruno@x.cl', [U3]: 'carla@x.cl' });
    });

    it('a community manager of ANOTHER community who is a docente here gets empty e-mails', async () => {
      const members = await membersFor([
        { role_type: 'community_manager', community_id: OTHER_COMMUNITY_ID },
        { role_type: 'docente', community_id: COMMUNITY_ID },
      ]);
      expect(emailsOf(members)).toEqual({ [U1]: '', [U2]: '', [U3]: '' });
    });

    it('an admin gets e-mails and unapproved people too', async () => {
      const members = await membersFor([{ role_type: 'admin', community_id: null }]);
      expect(emailsOf(members)).toEqual({ [U1]: 'ana@x.cl', [U2]: 'bruno@x.cl', [U3]: 'carla@x.cl', [U4]: 'diego@x.cl' });
    });
  });

  // F12e V5b (N28): a consultor CURRENTLY ASSIGNED to the community's school is
  // accepted and gets exactly what a plain member gets (no e-mails, approved
  // people only). Unassigned, other-school and ended assignments: 403.
  describe('consultor by current assignment (F12e V5b, N28)', () => {
    const CONSULTOR_ID = '77777777-7777-4777-8777-777777777777';
    const U4 = '66666666-6666-4666-8666-666666666666'; // profile not approved
    const rowsWithPending = [
      ...roleRows,
      { id: 'r5', user_id: U4, role_type: 'docente', community_id: COMMUNITY_ID, school_id: 7, generation_id: null, is_active: true, assigned_at: '2026-01-05', created_at: '2026-01-05' },
    ];
    const profilesWithPending = [
      ...profiles,
      { id: U4, email: 'diego@x.cl', first_name: 'Diego', last_name: 'Cuatro', avatar_url: null, school_id: 7, generation_id: null, community_id: null, created_at: '2026-01-05', external_school_affiliation: null, approval_status: 'pending' },
    ];

    function setConsultor(assignedSchools: unknown, error: unknown = null) {
      setSession(CONSULTOR_ID);
      setService({
        user_roles: [
          // the consultor's role row names no community
          { data: [{ role_type: 'consultor', community_id: null, is_active: true }] },
          { data: rowsWithPending },
        ],
        growth_communities: [{ data: { school_id: 7 } }],
        profiles: [{ data: profilesWithPending }],
      });
      mockSessionRpc.mockResolvedValue({ data: assignedSchools, error });
    }

    it("accepts a consultor assigned to the community's school, with no e-mails and approved people only", async () => {
      setConsultor([7]);
      const res = await invoke({ community_id: COMMUNITY_ID });
      expect(res._getStatusCode()).toBe(200);
      const { members } = JSON.parse(res._getData());
      expect(members.map((m: any) => m.id)).toEqual([U1, U2, U3]);
      expect(Object.fromEntries(members.map((m: any) => [m.id, m.email]))).toEqual({ [U1]: '', [U2]: '', [U3]: '' });
      expect(mockSessionRpc).toHaveBeenCalledWith('auth_consultor_assigned_school_ids');
      expect(recordedQueries.growth_communities[0].eqCalls).toEqual([['id', COMMUNITY_ID]]);
      expectCommunityMemberQueryScopedTo(COMMUNITY_ID);
    });

    it('forbids an unassigned consultor (or one whose assignment ended: the helper names no school) (403)', async () => {
      setConsultor([]);
      const res = await invoke({ community_id: COMMUNITY_ID });
      expect(res._getStatusCode()).toBe(403);
      expect(recordedQueries.user_roles).toHaveLength(1);
      expect(recordedQueries.profiles ?? []).toHaveLength(0);
    });

    it('forbids a consultor assigned to another school (403)', async () => {
      setConsultor([8]);
      const res = await invoke({ community_id: COMMUNITY_ID });
      expect(res._getStatusCode()).toBe(403);
    });

    it('forbids when the assignment lookup fails (403, fail closed)', async () => {
      setConsultor(null, { code: '42501' });
      const res = await invoke({ community_id: COMMUNITY_ID });
      expect(res._getStatusCode()).toBe(403);
    });

    it('a member of the community makes no assignment lookup', async () => {
      setSession(MEMBER_ID);
      setMemberRequester(COMMUNITY_ID);
      await invoke({ community_id: COMMUNITY_ID });
      expect(mockSessionRpc).not.toHaveBeenCalled();
      expect(recordedQueries.growth_communities ?? []).toHaveLength(0);
    });
  });

  it('requires authentication (401)', async () => {
    setSession(null);

    const res = await invoke({ community_id: COMMUNITY_ID });

    expect(res._getStatusCode()).toBe(401);
  });

  it('requires a community_id (400)', async () => {
    setSession(MEMBER_ID);

    const res = await invoke({});

    expect(res._getStatusCode()).toBe(400);
  });
});
