// F12e V5b (N28): a consultor's communities in the workspace are those of the
// schools they are CURRENTLY ASSIGNED to (public.auth_consultor_assigned_school_ids
// through the caller's own client), not those of the school on their role row.
// With no assigned school, a consultor who is also a member of a community
// enters as that community's member; with neither, no access.
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;

const state = vi.hoisted(() => ({
  roles: [] as Row[],
  communities: [] as Row[],
  workspaces: [] as Row[],
  assigned: { data: [] as unknown, error: null as unknown },
  inCalls: [] as Array<{ table: string; column: string; values: unknown[] }>,
}));

const { from, rpc } = vi.hoisted(() => {
  function builder(table: string) {
    const filters: Array<{ column: string; values: unknown[] }> = [];
    const b: any = {
      select: () => b,
      eq: () => b,
      order: () => b,
      in: (column: string, values: unknown[]) => {
        filters.push({ column, values });
        state.inCalls.push({ table, column, values });
        return b;
      },
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
        let data: Row[] = [];
        if (table === 'user_roles') data = state.roles;
        if (table === 'growth_communities') {
          data = state.communities.filter((c) =>
            filters.every((f) => f.values.map(String).includes(String(c[f.column])))
          );
        }
        if (table === 'community_workspaces') {
          data = state.workspaces.filter((w) =>
            filters.every((f) => f.values.map(String).includes(String(w[f.column])))
          );
        }
        return Promise.resolve({ data, error: null }).then(resolve, reject);
      },
    };
    return b;
  }
  return {
    from: vi.fn((table: string) => builder(table)),
    rpc: vi.fn(() => Promise.resolve(state.assigned)),
  };
});

vi.mock('../../lib/supabase-wrapper', () => ({ supabase: { from, rpc } }));

import { getUserWorkspaceAccess } from '../../utils/workspaceUtils';

const COMMUNITIES: Row[] = [
  { id: 'com-a1', name: 'Comunidad A1', school_id: 101, school: { name: 'Escuela A' }, generation: { name: 'G1' } },
  { id: 'com-a2', name: 'Comunidad A2', school_id: 101, school: { name: 'Escuela A' }, generation: { name: 'G1' } },
  { id: 'com-b1', name: 'Comunidad B1', school_id: 202, school: { name: 'Escuela B' }, generation: { name: 'G2' } },
  { id: 'com-m1', name: 'Comunidad M1', school_id: 303, school: { name: 'Escuela M' }, generation: { name: 'G3' } },
];

beforeEach(() => {
  state.roles = [];
  state.communities = COMMUNITIES;
  state.workspaces = [{ id: 'ws-a1', community_id: 'com-a1', custom_name: null }];
  state.assigned = { data: [], error: null };
  state.inCalls = [];
  rpc.mockClear();
  from.mockClear();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('getUserWorkspaceAccess — consultor by current assignment (F12e V5b)', () => {
  it("lists the communities of the assigned schools, not of the role's school", async () => {
    // role row names school B; the current assignment is school A
    state.roles = [{ role_type: 'consultor', school_id: 202, community_id: null, is_active: true }];
    state.assigned = { data: [101], error: null };

    const access = await getUserWorkspaceAccess('cons-1');

    expect(rpc).toHaveBeenCalledWith('auth_consultor_assigned_school_ids');
    expect(access.canAccess).toBe(true);
    expect(access.accessType).toBe('consultant');
    expect(access.availableCommunities.map((c) => c.id).sort()).toEqual(['com-a1', 'com-a2']);
    expect(access.availableCommunities.find((c) => c.id === 'com-a1')?.workspace_id).toBe('ws-a1');
    expect(state.inCalls).toContainEqual({ table: 'growth_communities', column: 'school_id', values: [101] });
    expect(access.defaultCommunityId).toBe(access.availableCommunities[0].id);
  });

  it('two assigned schools: the communities of both', async () => {
    state.roles = [{ role_type: 'consultor', school_id: 202, community_id: null, is_active: true }];
    state.assigned = { data: [101, 202], error: null };
    const access = await getUserWorkspaceAccess('cons-1');
    expect(access.availableCommunities.map((c) => c.id).sort()).toEqual(['com-a1', 'com-a2', 'com-b1']);
  });

  it('no assigned school and no community role: no access', async () => {
    state.roles = [{ role_type: 'consultor', school_id: 202, community_id: null, is_active: true }];
    state.assigned = { data: [], error: null };
    const access = await getUserWorkspaceAccess('cons-1');
    expect(access).toEqual({ canAccess: false, accessType: 'none', availableCommunities: [] });
    // the role's school is never used to list communities
    expect(state.inCalls.some((c) => c.table === 'growth_communities' && c.column === 'school_id')).toBe(false);
  });

  it('lookup error: treated as no assignment (no access)', async () => {
    state.roles = [{ role_type: 'consultor', school_id: 202, community_id: null, is_active: true }];
    state.assigned = { data: null, error: { code: '42501' } };
    const access = await getUserWorkspaceAccess('cons-1');
    expect(access.canAccess).toBe(false);
    expect(access.accessType).toBe('none');
  });

  it('no assigned school but a member role in a community: enters as that member', async () => {
    state.roles = [
      { role_type: 'consultor', school_id: 202, community_id: null, is_active: true },
      { role_type: 'docente', school_id: 303, community_id: 'com-m1', is_active: true },
    ];
    state.assigned = { data: [], error: null };
    const access = await getUserWorkspaceAccess('cons-1');
    expect(access.canAccess).toBe(true);
    expect(access.accessType).toBe('community_member');
    expect(access.availableCommunities.map((c) => c.id)).toEqual(['com-m1']);
    expect(access.userCommunityId).toBe('com-m1');
    expect(access.defaultCommunityId).toBe('com-m1');
  });

  it('a plain member makes no assignment lookup', async () => {
    state.roles = [{ role_type: 'docente', school_id: 303, community_id: 'com-m1', is_active: true }];
    const access = await getUserWorkspaceAccess('doc-1');
    expect(access.accessType).toBe('community_member');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('an admin makes no assignment lookup', async () => {
    state.roles = [{ role_type: 'admin', school_id: null, community_id: null, is_active: true }];
    const access = await getUserWorkspaceAccess('adm-1');
    expect(access.accessType).toBe('admin');
    expect(rpc).not.toHaveBeenCalled();
  });
});
