// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';

// The community members API authorizes the caller with a session client, then
// reads role rows + profiles with a module-level service-role client. Mock both
// so we can drive the access checks and the returned data deterministically.
const { mockGetSession, mockServiceFrom } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockServiceFrom: vi.fn(),
}));

vi.mock('@supabase/auth-helpers-nextjs', () => ({
  createPagesServerClient: () => ({
    auth: { getSession: mockGetSession },
  }),
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

/**
 * A thenable query chain: every builder method (.select/.eq/.in) returns the
 * same object, and awaiting it resolves to { data, error }.
 */
function makeChain(result: Result) {
  const resolved = { data: result.data ?? null, error: result.error ?? null };
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    in: () => chain,
    then: (resolve: (v: unknown) => void) => resolve(resolved),
  };
  return chain;
}

/**
 * Returns a `from(table)` impl that hands back the next queued result for that
 * table on each call (the handler queries `user_roles` twice, `profiles` once).
 */
function sequencedFrom(queue: Record<string, Result[]>) {
  const idx: Record<string, number> = {};
  return (table: string) => {
    const i = idx[table] ?? 0;
    idx[table] = i + 1;
    return makeChain(queue[table]?.[i] ?? { data: [] });
  };
}

function setSession(userId: string | null) {
  mockGetSession.mockResolvedValue({
    data: { session: userId ? { user: { id: userId } } : null },
  });
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
  { id: U1, email: 'ana@x.cl', first_name: 'Ana', last_name: 'Uno', avatar_url: null, school_id: 7, generation_id: null, community_id: null, created_at: '2026-01-01', external_school_affiliation: null },
  { id: U2, email: 'bruno@x.cl', first_name: 'Bruno', last_name: 'Dos', avatar_url: null, school_id: 7, generation_id: null, community_id: null, created_at: '2026-01-02', external_school_affiliation: null },
  { id: U3, email: 'carla@x.cl', first_name: 'Carla', last_name: 'Tres', avatar_url: 'http://x/c.png', school_id: 7, generation_id: null, community_id: null, created_at: '2026-01-03', external_school_affiliation: null },
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
    expect(ana.email).toBe('ana@x.cl');
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
