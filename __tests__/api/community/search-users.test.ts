// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';
import { opArgs, type RecordedRequest } from '../../helpers/recordingSupabase';

/**
 * EC-S5 (GENERA fixes F11): the feed's @mention search
 * (GET /api/community/search-users) answers a member with the people of
 * their communities — names and picture, never an e-mail — found also by
 * names with accents, hyphens and dots. The fake database answers like the
 * real one answers a member: co-members' role rows are readable, their
 * profile rows are not. Since send-back 1 (item 5) the route decides who
 * may be offered with its service client — approved profiles only — and
 * returns no e-mail and no approval status.
 */

const fake = vi.hoisted(() => ({ ref: null as any, service: null as any }));
vi.mock('@supabase/auth-helpers-nextjs', async () => {
  const { createRecordingSupabase } = await import('../../helpers/recordingSupabase');
  fake.ref = createRecordingSupabase();
  return { createServerSupabaseClient: () => fake.ref.client };
});
// The route's service client (server side only): it reads profiles past the
// rules, so the route itself must ask only for approved people and only the
// columns it returns (send-back 1, item 5).
vi.mock('../../../lib/api-auth', async () => {
  const { createRecordingSupabase } = await import('../../helpers/recordingSupabase');
  fake.service = createRecordingSupabase();
  return { createServiceRoleClient: () => fake.service.client };
});

import handler from '../../../pages/api/community/search-users';

const h = fake.ref.state as {
  requests: RecordedRequest[];
  respond: (req: RecordedRequest, terminal: string) => { data: unknown; error: unknown };
  userId: string | null;
};

const SELF = 'user-a1';
const PEOPLE = [
  { id: 'user-a2', first_name: 'María-José', last_name: 'Núñez', avatar_url: 'https://example.invalid/a2.png', email: 'a2@f11.test.local' },
  { id: 'user-a3', first_name: 'J.', last_name: 'Pérez', avatar_url: null, email: 'a3@f11.test.local' },
  { id: 'user-a4', first_name: 'Bruno', last_name: 'Dos', avatar_url: null, email: 'a4@f11.test.local' },
];

/** Co-members whose profile is not approved: never offered (send-back 1, 5). */
const NOT_APPROVED = [
  { id: 'user-a5', first_name: 'Rita', last_name: 'Rechazada', avatar_url: null, email: 'a5@f11.test.local', approval_status: 'rejected' },
  { id: 'user-a6', first_name: 'Pía', last_name: 'Pendiente', avatar_url: null, email: 'a6@f11.test.local', approval_status: 'pending' },
];
const ALL_PROFILES = [...PEOPLE.map((p) => ({ ...p, approval_status: 'approved' })), ...NOT_APPROVED];

// Loads the mocked service client (also before the route used it).
await import('../../../lib/api-auth');
const service = fake.service.state as typeof h;

beforeEach(() => {
  service.requests.length = 0;
  // The service client reads every profile row; it answers the columns asked for, filtered as asked.
  service.respond = (req) => {
    if (req.kind === 'from' && req.target === 'profiles') {
      const ids = (opArgs(req, 'in')?.[1] as string[]) ?? [];
      const filters = req.ops.filter((op) => op.method === 'eq').map((op) => op.args as [string, unknown]);
      const columns = String(opArgs(req, 'select')?.[0] ?? '*').split(',').map((c) => c.trim());
      const rows = ALL_PROFILES.filter((p) => ids.includes(p.id) && filters.every(([c, v]) => (p as any)[c] === v)).map((p) =>
        columns.includes('*') ? p : Object.fromEntries(columns.map((c) => [c, (p as any)[c]]))
      );
      return { data: rows, error: null };
    }
    return { data: null, error: null };
  };
  h.requests.length = 0;
  h.userId = SELF;
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  h.respond = (req) => {
    if (req.kind === 'rpc' && req.target === 'get_profile_cards') {
      const ids = (req.args as { p_ids: string[] }).p_ids;
      // Cards know every co-member, approved or not (they carry no approval status).
      return {
        data: ALL_PROFILES.filter((p) => ids.includes(p.id)).map(({ id, first_name, last_name, avatar_url }) => ({ id, first_name, last_name, avatar_url })),
        error: null,
      };
    }
    if (req.target === 'user_roles') {
      const own = opArgs(req, 'eq')?.[0] === 'user_id';
      return own
        ? { data: [{ community_id: 'community-a' }], error: null }
        : { data: [{ user_id: 'user-a2' }, { user_id: 'user-a3' }, { user_id: 'user-a4' }, { user_id: 'user-a5' }, { user_id: 'user-a6' }], error: null };
    }
    // profiles: a member reads no other person's row
    if (req.target === 'profiles') return { data: [], error: null };
    return { data: null, error: null };
  };
});

async function search(q: string) {
  const { req, res } = createMocks({ method: 'GET', query: { q } });
  await handler(req as any, res as any);
  return { status: res._getStatusCode(), body: res._getJSONData() };
}

describe('EC-S5 GET /api/community/search-users', () => {
  it('lists the people of the caller\'s communities with names and picture, no e-mail', async () => {
    const { status, body } = await search('');
    expect(status).toBe(200);
    expect(body.map((u: any) => u.display_name)).toEqual(['María-José Núñez', 'J. Pérez', 'Bruno Dos']);
    for (const user of body) {
      expect(Object.keys(user).sort()).toEqual(['avatar_url', 'display_name', 'first_name', 'id', 'last_name']);
      expect(JSON.stringify(user)).not.toContain('@');
    }
  });

  it('finds names with accents, hyphens and dots', async () => {
    expect((await search('maría-jo')).body.map((u: any) => u.id)).toEqual(['user-a2']);
    expect((await search('nunez')).body.map((u: any) => u.id)).toEqual(['user-a2']);
    expect((await search('Núñez')).body.map((u: any) => u.id)).toEqual(['user-a2']);
    expect((await search('j. p')).body.map((u: any) => u.id)).toEqual(['user-a3']);
  });

  it('does not search by e-mail any more', async () => {
    expect((await search('f11.test.local')).body).toEqual([]);
  });

  it('refuses a visitor', async () => {
    h.userId = null;
    expect((await search('a')).status).toBe(401);
  });
});

describe('send-back 1 (5) only approved people are offered', () => {
  it('a rejected and a pending co-member are not offered; an approved one is', async () => {
    const { status, body } = await search('');
    expect(status).toBe(200);
    const ids = body.map((u: any) => u.id);
    expect(ids).not.toContain('user-a5');
    expect(ids).not.toContain('user-a6');
    expect(ids).toEqual(['user-a2', 'user-a3', 'user-a4']);
    expect((await search('rita')).body).toEqual([]);
    expect((await search('pía')).body).toEqual([]);
  });

  it('who may be offered is decided on the server, asking for approved profiles only and no e-mail', async () => {
    await search('');
    const lookup = service.requests.find((r) => r.kind === 'from' && r.target === 'profiles')!;
    expect(lookup).toBeDefined();
    expect(lookup.ops.filter((op) => op.method === 'eq').map((op) => op.args)).toContainEqual(['approval_status', 'approved']);
    const columns = String(opArgs(lookup, 'select')?.[0]).split(',').map((c) => c.trim());
    expect(columns).not.toContain('email');
    expect(columns).not.toContain('approval_status');
    expect(columns).not.toContain('*');
  });

  it('the answer carries only id, first_name, last_name, avatar_url and display_name', async () => {
    const { body } = await search('');
    for (const user of body) {
      expect(Object.keys(user).sort()).toEqual(['avatar_url', 'display_name', 'first_name', 'id', 'last_name']);
    }
  });
});

/**
 * F12e N97: with `workspace_id` the search answers for THAT workspace's
 * community: an admin, a person with an active role row in that community, or
 * a consultor currently assigned to its school (auth_consultor_assigned_school_ids
 * through the caller's session) get that community's approved people — and
 * only theirs. Without `workspace_id` the route behaves exactly as before.
 */
describe('F12e N97 search within a workspace (workspace_id)', () => {
  const WS_A = '0a000000-0000-4000-8000-0000000000a1';
  const WS_B = '0b000000-0000-4000-8000-0000000000b1';
  const WS_NONE = '0c000000-0000-4000-8000-0000000000c1';
  const WORKSPACES: Record<string, { community_id: string }> = {
    [WS_A]: { community_id: 'community-a' },
    [WS_B]: { community_id: 'community-b' },
  };
  const SCHOOL_OF: Record<string, number> = { 'community-a': 101, 'community-b': 202 };
  const MEMBERS_OF: Record<string, string[]> = {
    'community-a': [SELF, 'user-a2', 'user-a3', 'user-a4', 'user-a5', 'user-a6'],
    'community-b': [SELF, 'user-b1'],
  };
  const PERSON_B = { id: 'user-b1', first_name: 'Berta', last_name: 'Bravo', avatar_url: null, email: 'b1@f12.test.local', approval_status: 'approved' };
  const EVERYONE = [...ALL_PROFILES, PERSON_B];

  let callerRoles: Array<{ role_type: string; community_id: string | null }>;
  let assignedSchools: { data: unknown; error: unknown };

  /** Role rows of a community, filtered as the query asks (community, active, not the caller). */
  function communityRows(req: RecordedRequest) {
    const eqs = req.ops.filter((op) => op.method === 'eq').map((op) => op.args as [string, unknown]);
    const neqs = req.ops.filter((op) => op.method === 'neq').map((op) => op.args as [string, unknown]);
    const ins = req.ops.filter((op) => op.method === 'in').map((op) => op.args as [string, unknown[]]);
    const community = eqs.find(([c]) => c === 'community_id')?.[1] as string | undefined;
    const communities = community ? [community] : ((ins.find(([c]) => c === 'community_id')?.[1] as string[]) ?? []);
    const excluded = neqs.find(([c]) => c === 'user_id')?.[1];
    const rows = communities.flatMap((c) => (MEMBERS_OF[c] ?? []).map((user_id) => ({ user_id })));
    return rows.filter((r) => r.user_id !== excluded);
  }

  beforeEach(() => {
    callerRoles = [];
    assignedSchools = { data: [], error: null };
    service.respond = (req, terminal) => {
      if (req.kind === 'from' && req.target === 'profiles') {
        const ids = (opArgs(req, 'in')?.[1] as string[]) ?? [];
        const filters = req.ops.filter((op) => op.method === 'eq').map((op) => op.args as [string, unknown]);
        const columns = String(opArgs(req, 'select')?.[0] ?? '*').split(',').map((c) => c.trim());
        const rows = EVERYONE.filter((p) => ids.includes(p.id) && filters.every(([c, v]) => (p as any)[c] === v)).map((p) =>
          Object.fromEntries(columns.map((c) => [c, (p as any)[c]]))
        );
        return { data: rows, error: null };
      }
      if (req.target === 'community_workspaces') {
        const id = opArgs(req, 'eq')?.[1] as string;
        const ws = WORKSPACES[id];
        return { data: ws ? { id, ...ws } : null, error: null };
      }
      if (req.target === 'growth_communities') {
        const id = opArgs(req, 'eq')?.[1] as string;
        return { data: id in SCHOOL_OF ? { id, school_id: SCHOOL_OF[id] } : null, error: null };
      }
      if (req.target === 'user_roles') {
        const own = req.ops.some((op) => op.method === 'eq' && (op.args as unknown[])[0] === 'user_id');
        return own ? { data: callerRoles.map((r) => ({ ...r, is_active: true })), error: null } : { data: communityRows(req), error: null };
      }
      void terminal;
      return { data: null, error: null };
    };
    h.respond = (req) => {
      if (req.kind === 'rpc' && req.target === 'auth_consultor_assigned_school_ids') return assignedSchools;
      if (req.target === 'user_roles') {
        const own = opArgs(req, 'eq')?.[0] === 'user_id';
        return own
          ? { data: callerRoles.filter((r) => r.community_id).map((r) => ({ community_id: r.community_id })), error: null }
          : { data: communityRows(req), error: null };
      }
      if (req.target === 'profiles') return { data: [], error: null };
      return { data: null, error: null };
    };
  });

  async function searchIn(workspaceId: string | undefined, q = '') {
    const query: Record<string, string> = { q };
    if (workspaceId !== undefined) query.workspace_id = workspaceId;
    const { req, res } = createMocks({ method: 'GET', query });
    await handler(req as any, res as any);
    return { status: res._getStatusCode(), body: res._getJSONData() };
  }

  it("an admin gets that community's approved people (today: 400)", async () => {
    callerRoles = [{ role_type: 'admin', community_id: null }];
    const { status, body } = await searchIn(WS_A);
    expect(status).toBe(200);
    expect(body.map((u: any) => u.id)).toEqual(['user-a2', 'user-a3', 'user-a4']);
    for (const user of body) {
      expect(Object.keys(user).sort()).toEqual(['avatar_url', 'display_name', 'first_name', 'id', 'last_name']);
    }
  });

  it("a consultor currently assigned to the community's school gets them too", async () => {
    callerRoles = [{ role_type: 'consultor', community_id: null }];
    assignedSchools = { data: [101], error: null };
    const { status, body } = await searchIn(WS_A);
    expect(status).toBe(200);
    expect(body.map((u: any) => u.id)).toEqual(['user-a2', 'user-a3', 'user-a4']);
    expect(h.requests.some((r) => r.kind === 'rpc' && r.target === 'auth_consultor_assigned_school_ids')).toBe(true);
  });

  it('the text filter still applies (accents folded)', async () => {
    callerRoles = [{ role_type: 'admin', community_id: null }];
    expect((await searchIn(WS_A, 'nunez')).body.map((u: any) => u.id)).toEqual(['user-a2']);
  });

  it('a person in two communities gets ONLY the named community\'s people', async () => {
    callerRoles = [
      { role_type: 'docente', community_id: 'community-a' },
      { role_type: 'docente', community_id: 'community-b' },
    ];
    const { status, body } = await searchIn(WS_B);
    expect(status).toBe(200);
    expect(body.map((u: any) => u.id)).toEqual(['user-b1']);
  });

  it("a member naming another community's workspace: 403", async () => {
    callerRoles = [{ role_type: 'docente', community_id: 'community-a' }];
    expect((await searchIn(WS_B)).status).toBe(403);
  });

  it('an unassigned consultor: 403; a consultor of another school: 403', async () => {
    callerRoles = [{ role_type: 'consultor', community_id: null }];
    assignedSchools = { data: [], error: null };
    expect((await searchIn(WS_A)).status).toBe(403);
    assignedSchools = { data: [202], error: null };
    expect((await searchIn(WS_A)).status).toBe(403);
  });

  it('a workspace_id that is not a UUID: 400', async () => {
    callerRoles = [{ role_type: 'admin', community_id: null }];
    expect((await searchIn('not-a-uuid')).status).toBe(400);
    expect((await searchIn("x' or 1=1")).status).toBe(400);
  });

  it('a UUID of no workspace: 404', async () => {
    callerRoles = [{ role_type: 'admin', community_id: null }];
    expect((await searchIn(WS_NONE)).status).toBe(404);
  });

  it('without workspace_id: as today (an admin with no community row: 400; no workspace lookup)', async () => {
    callerRoles = [{ role_type: 'admin', community_id: null }];
    const { status, body } = await searchIn(undefined);
    expect(status).toBe(400);
    expect(body).toEqual({ error: 'User not assigned to a community' });
    expect(service.requests.some((r) => r.target === 'community_workspaces')).toBe(false);
  });

  it('without workspace_id: a person in two communities still gets both (as today)', async () => {
    callerRoles = [
      { role_type: 'docente', community_id: 'community-a' },
      { role_type: 'docente', community_id: 'community-b' },
    ];
    const { status, body } = await searchIn(undefined);
    expect(status).toBe(200);
    expect(body.map((u: any) => u.id)).toEqual(['user-a2', 'user-a3', 'user-a4', 'user-b1']);
  });
});
