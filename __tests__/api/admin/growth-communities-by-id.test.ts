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

import handler from '../../../pages/api/admin/growth-communities/[id]/index';

const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const ED_ID = '99999999-9999-4999-8999-999999999999';
const COMMUNITY_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const GENERATION_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const OTHER_GENERATION_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const THIRD_GENERATION_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

interface TableResult {
  data?: unknown;
  error?: unknown;
  count?: number;
}

interface FromCall {
  table: string;
  updates: unknown[];
  inserts: unknown[];
  deletes: number;
  inArgs: unknown[];
}

interface Tracker {
  fromCalls: FromCall[];
}

function makeTracker(): Tracker {
  return { fromCalls: [] };
}

/**
 * Mock Supabase client: each `from(table)` consumes the next configured result
 * for that table. Awaiting the chain resolves to { data, error, count }.
 * `.single()` / `.maybeSingle()` resolve to the same value. `.update(arg)`,
 * `.insert(arg)`, `.delete()`, and `.in(_, ids)` are recorded on the FromCall
 * so tests can assert which writes were issued. Mirrors the helper used by
 * the leaders test, plus delete tracking for the hard-delete path here.
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
        updates: [],
        inserts: [],
        deletes: 0,
        inArgs: [],
      };
      tracker?.fromCalls.push(fromCall);

      const resolved = {
        data: result.data ?? null,
        error: result.error ?? null,
        count: result.count,
      };

      const proxyHandler: ProxyHandler<Record<string, unknown>> = {
        get(_t, prop) {
          if (prop === 'then') {
            return (resolve: (v: unknown) => void) => resolve(resolved);
          }
          if (prop === 'update') {
            return vi.fn((arg: unknown) => {
              fromCall.updates.push(arg);
              return new Proxy({}, proxyHandler);
            });
          }
          if (prop === 'insert') {
            return vi.fn((arg: unknown) => {
              fromCall.inserts.push(arg);
              return new Proxy({}, proxyHandler);
            });
          }
          if (prop === 'delete') {
            return vi.fn(() => {
              fromCall.deletes += 1;
              return new Proxy({}, proxyHandler);
            });
          }
          if (prop === 'in') {
            return vi.fn((_col: string, ids: unknown) => {
              fromCall.inArgs.push(ids);
              return new Proxy({}, proxyHandler);
            });
          }
          if (prop === 'single' || prop === 'maybeSingle') {
            return vi.fn(() => ({
              then: (resolve: (v: unknown) => void) => resolve(resolved),
            }));
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

const COMMUNITY_ROW = {
  id: COMMUNITY_ID,
  school_id: 1,
  generation_id: GENERATION_ID,
  name: 'Community A',
  max_teachers: 8,
  description: null,
};

// 8 zero-count tables (no blockers). Match the order expected by the handler;
// the actual order doesn't matter to buildSequencedClient since each table is
// keyed independently, but listing them keeps the intent explicit.
const NO_BLOCKER_COUNTS = {
  user_roles: [{ count: 0 }],
  consultor_sessions: [{ count: 0 }],
  consultant_assignments: [{ count: 0 }],
  community_workspaces: [{ count: 0 }],
  group_assignment_groups: [{ count: 0 }],
  assignment_instances: [{ count: 0 }],
  assignment_submission_shares: [{ count: 0 }],
  profiles: [{ count: 0 }],
};

describe('admin/growth-communities/[id] — PATCH', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('admin renaming community: 200, update payload contains only trimmed name', async () => {
    setupAdmin();
    const tracker = makeTracker();

    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildSequencedClient(
        {
          growth_communities: [
            { data: COMMUNITY_ROW },
            { data: { ...COMMUNITY_ROW, name: 'Renamed' } },
          ],
        },
        tracker,
      ),
    );

    const { req, res } = createMocks({
      method: 'PATCH',
      query: { id: COMMUNITY_ID },
      body: { name: '  Renamed  ' },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);
    expect(mockCreateServiceRoleClient).toHaveBeenCalledTimes(1);
    const updates = tracker.fromCalls
      .filter((c) => c.table === 'growth_communities')
      .flatMap((c) => c.updates);
    expect(updates).toEqual([{ name: 'Renamed' }]);
  });

  it('admin updating max_teachers + description: 200 and payload contains both fields', async () => {
    setupAdmin();
    const tracker = makeTracker();

    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildSequencedClient(
        {
          growth_communities: [
            { data: COMMUNITY_ROW },
            { data: { ...COMMUNITY_ROW, max_teachers: 10, description: 'New desc' } },
          ],
        },
        tracker,
      ),
    );

    const { req, res } = createMocks({
      method: 'PATCH',
      query: { id: COMMUNITY_ID },
      body: { max_teachers: 10, description: 'New desc' },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);
    const updates = tracker.fromCalls
      .filter((c) => c.table === 'growth_communities')
      .flatMap((c) => c.updates);
    expect(updates).toEqual([{ max_teachers: 10, description: 'New desc' }]);
  });

  it('body containing school_id: 400 school_id_immutable, no update issued', async () => {
    setupAdmin();
    const tracker = makeTracker();

    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildSequencedClient(
        { growth_communities: [{ data: COMMUNITY_ROW }] },
        tracker,
      ),
    );

    const { req, res } = createMocks({
      method: 'PATCH',
      query: { id: COMMUNITY_ID },
      body: { school_id: 2, name: 'Anything' },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(400);
    expect(JSON.parse(res._getData()).error).toBe('school_id_immutable');
    expect(tracker.fromCalls.flatMap((c) => c.updates)).toHaveLength(0);
  });

  it('empty body: 400 (no updatable field)', async () => {
    setupAdmin();
    const tracker = makeTracker();

    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildSequencedClient(
        { growth_communities: [{ data: COMMUNITY_ROW }] },
        tracker,
      ),
    );

    const { req, res } = createMocks({
      method: 'PATCH',
      query: { id: COMMUNITY_ID },
      body: {},
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(400);
    expect(tracker.fromCalls.flatMap((c) => c.updates)).toHaveLength(0);
  });

  it('empty/whitespace name: 400, no update', async () => {
    setupAdmin();
    const tracker = makeTracker();

    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildSequencedClient(
        { growth_communities: [{ data: COMMUNITY_ROW }] },
        tracker,
      ),
    );

    const { req, res } = createMocks({
      method: 'PATCH',
      query: { id: COMMUNITY_ID },
      body: { name: '   ' },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(400);
    expect(tracker.fromCalls.flatMap((c) => c.updates)).toHaveLength(0);
  });

  it('max_teachers=20 above the allowed range: 400, no update', async () => {
    setupAdmin();
    const tracker = makeTracker();

    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildSequencedClient(
        { growth_communities: [{ data: COMMUNITY_ROW }] },
        tracker,
      ),
    );

    const { req, res } = createMocks({
      method: 'PATCH',
      query: { id: COMMUNITY_ID },
      body: { max_teachers: 20 },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(400);
    expect(tracker.fromCalls.flatMap((c) => c.updates)).toHaveLength(0);
  });

  it('generation_id=null when school has_generations=true: 400 generation_required, no update', async () => {
    setupAdmin();
    const tracker = makeTracker();

    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildSequencedClient(
        {
          growth_communities: [{ data: COMMUNITY_ROW }],
          schools: [{ data: { has_generations: true } }],
        },
        tracker,
      ),
    );

    const { req, res } = createMocks({
      method: 'PATCH',
      query: { id: COMMUNITY_ID },
      body: { generation_id: null },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(400);
    expect(JSON.parse(res._getData()).error).toBe('generation_required');
    expect(tracker.fromCalls.flatMap((c) => c.updates)).toHaveLength(0);
  });

  it('generation belongs to a different school: 400 generation_invalid, no update', async () => {
    setupAdmin();
    const tracker = makeTracker();

    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildSequencedClient(
        {
          growth_communities: [{ data: COMMUNITY_ROW }],
          schools: [{ data: { has_generations: true } }],
          // generations lookup constrained by school_id returns nothing.
          generations: [{ data: null, error: { message: 'not found' } }],
        },
        tracker,
      ),
    );

    const { req, res } = createMocks({
      method: 'PATCH',
      query: { id: COMMUNITY_ID },
      body: { generation_id: OTHER_GENERATION_ID },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(400);
    expect(JSON.parse(res._getData()).error).toBe('generation_invalid');
    expect(tracker.fromCalls.flatMap((c) => c.updates)).toHaveLength(0);
  });

  it('generation change with conflicting member generations: 400 members_have_other_generation + conflicting_member_count, no update', async () => {
    setupAdmin();
    const tracker = makeTracker();

    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildSequencedClient(
        {
          growth_communities: [{ data: COMMUNITY_ROW }],
          schools: [{ data: { has_generations: true } }],
          generations: [{ data: { id: OTHER_GENERATION_ID } }],
          user_roles: [
            {
              data: [
                { generation_id: THIRD_GENERATION_ID },
                { generation_id: THIRD_GENERATION_ID },
                { generation_id: null }, // null is fine — wouldn't conflict
              ],
            },
          ],
        },
        tracker,
      ),
    );

    const { req, res } = createMocks({
      method: 'PATCH',
      query: { id: COMMUNITY_ID },
      body: { generation_id: OTHER_GENERATION_ID },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(400);
    const body = JSON.parse(res._getData());
    expect(body.error).toBe('members_have_other_generation');
    expect(body.conflicting_member_count).toBe(2);
    expect(tracker.fromCalls.flatMap((c) => c.updates)).toHaveLength(0);
  });

  it('generation change with no conflicts: 200 and member backfill update is issued', async () => {
    setupAdmin();
    const tracker = makeTracker();

    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildSequencedClient(
        {
          growth_communities: [
            { data: COMMUNITY_ROW },
            { data: { ...COMMUNITY_ROW, generation_id: OTHER_GENERATION_ID } },
          ],
          schools: [{ data: { has_generations: true } }],
          generations: [{ data: { id: OTHER_GENERATION_ID } }],
          user_roles: [
            // member-conflict check: only null-gen rows — no conflicts.
            // (The handler treats any non-null gen != new gen as conflicting,
            // including the old gen, so we keep this list strictly null-gen.)
            { data: [{ generation_id: null }, { generation_id: null }] },
            // backfill update succeeds
            { data: null, error: null },
          ],
        },
        tracker,
      ),
    );

    const { req, res } = createMocks({
      method: 'PATCH',
      query: { id: COMMUNITY_ID },
      body: { generation_id: OTHER_GENERATION_ID },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);
    // Two updates issued: community update + user_roles backfill.
    const communityUpdates = tracker.fromCalls
      .filter((c) => c.table === 'growth_communities')
      .flatMap((c) => c.updates);
    expect(communityUpdates).toEqual([{ generation_id: OTHER_GENERATION_ID }]);

    const userRolesUpdates = tracker.fromCalls
      .filter((c) => c.table === 'user_roles')
      .flatMap((c) => c.updates);
    expect(userRolesUpdates).toEqual([{ generation_id: OTHER_GENERATION_ID }]);
  });

  it('Postgres 23505 on update: 409 duplicate_name', async () => {
    setupAdmin();
    const tracker = makeTracker();

    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildSequencedClient(
        {
          growth_communities: [
            { data: COMMUNITY_ROW },
            { error: { code: '23505', message: 'duplicate key' } },
          ],
        },
        tracker,
      ),
    );

    const { req, res } = createMocks({
      method: 'PATCH',
      query: { id: COMMUNITY_ID },
      body: { name: 'Existing Name' },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(409);
    expect(JSON.parse(res._getData()).error).toBe('duplicate_name');
  });

  it('equipo_directivo in the same school can PATCH: 200', async () => {
    setupEquipoDirectivo(1);

    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildSequencedClient({
        growth_communities: [
          { data: COMMUNITY_ROW },
          { data: { ...COMMUNITY_ROW, name: 'ED Renamed' } },
        ],
      }),
    );

    const { req, res } = createMocks({
      method: 'PATCH',
      query: { id: COMMUNITY_ID },
      body: { name: 'ED Renamed' },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);
  });

  it('equipo_directivo in a different school cannot PATCH: 403, no update', async () => {
    setupEquipoDirectivo(999);
    const tracker = makeTracker();

    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildSequencedClient(
        { growth_communities: [{ data: COMMUNITY_ROW }] },
        tracker,
      ),
    );

    const { req, res } = createMocks({
      method: 'PATCH',
      query: { id: COMMUNITY_ID },
      body: { name: 'Should Not Apply' },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(403);
    expect(tracker.fromCalls.flatMap((c) => c.updates)).toHaveLength(0);
  });
});

describe('admin/growth-communities/[id] — DELETE', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('no confirm and no blockers: 200 { deletable: true, blockers: [] } and no delete call', async () => {
    setupAdmin();
    const tracker = makeTracker();

    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildSequencedClient(
        {
          growth_communities: [{ data: COMMUNITY_ROW }],
          ...NO_BLOCKER_COUNTS,
        },
        tracker,
      ),
    );

    const { req, res } = createMocks({
      method: 'DELETE',
      query: { id: COMMUNITY_ID },
      body: {},
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);
    expect(JSON.parse(res._getData())).toEqual({ deletable: true, blockers: [] });
    const deletes = tracker.fromCalls
      .filter((c) => c.table === 'growth_communities')
      .reduce((sum, c) => sum + c.deletes, 0);
    expect(deletes).toBe(0);
  });

  it('confirm: true and no blockers: 200 { deleted: true, id } and delete is called', async () => {
    setupAdmin();
    const tracker = makeTracker();

    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildSequencedClient(
        {
          growth_communities: [
            { data: COMMUNITY_ROW },
            { data: null, error: null }, // delete chain
          ],
          ...NO_BLOCKER_COUNTS,
        },
        tracker,
      ),
    );

    const { req, res } = createMocks({
      method: 'DELETE',
      query: { id: COMMUNITY_ID },
      body: { confirm: true },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);
    expect(JSON.parse(res._getData())).toEqual({ deleted: true, id: COMMUNITY_ID });
    const deletes = tracker.fromCalls
      .filter((c) => c.table === 'growth_communities')
      .reduce((sum, c) => sum + c.deletes, 0);
    expect(deletes).toBe(1);
  });

  it('active members/leaders blocker: 409 has_dependencies includes members_or_leaders, no delete', async () => {
    setupAdmin();
    const tracker = makeTracker();

    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildSequencedClient(
        {
          growth_communities: [{ data: COMMUNITY_ROW }],
          ...NO_BLOCKER_COUNTS,
          user_roles: [{ count: 3 }],
        },
        tracker,
      ),
    );

    const { req, res } = createMocks({
      method: 'DELETE',
      query: { id: COMMUNITY_ID },
      body: { confirm: true },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(409);
    const body = JSON.parse(res._getData());
    expect(body.error).toBe('has_dependencies');
    expect(body.blockers).toContainEqual({ kind: 'members_or_leaders', count: 3 });
    const deletes = tracker.fromCalls
      .filter((c) => c.table === 'growth_communities')
      .reduce((sum, c) => sum + c.deletes, 0);
    expect(deletes).toBe(0);
  });

  it('consultor sessions blocker: 409 has_dependencies includes sessions', async () => {
    setupAdmin();
    const tracker = makeTracker();

    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildSequencedClient(
        {
          growth_communities: [{ data: COMMUNITY_ROW }],
          ...NO_BLOCKER_COUNTS,
          consultor_sessions: [{ count: 2 }],
        },
        tracker,
      ),
    );

    const { req, res } = createMocks({
      method: 'DELETE',
      query: { id: COMMUNITY_ID },
      body: { confirm: true },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(409);
    const body = JSON.parse(res._getData());
    expect(body.error).toBe('has_dependencies');
    expect(body.blockers).toContainEqual({ kind: 'sessions', count: 2 });
  });

  it('multiple blocker kinds: 409 has_dependencies includes all non-zero kinds and no zero-count kinds', async () => {
    setupAdmin();
    const tracker = makeTracker();

    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildSequencedClient(
        {
          growth_communities: [{ data: COMMUNITY_ROW }],
          ...NO_BLOCKER_COUNTS,
          user_roles: [{ count: 1 }],
          consultor_sessions: [{ count: 4 }],
          assignment_instances: [{ count: 7 }],
        },
        tracker,
      ),
    );

    const { req, res } = createMocks({
      method: 'DELETE',
      query: { id: COMMUNITY_ID },
      body: { confirm: true },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(409);
    const body = JSON.parse(res._getData());
    expect(body.error).toBe('has_dependencies');

    const kinds = (body.blockers as Array<{ kind: string; count: number }>).map((b) => b.kind);
    expect(kinds).toEqual(
      expect.arrayContaining(['members_or_leaders', 'sessions', 'assignment_instances']),
    );
    // No zero-count kinds leak into the response.
    for (const blocker of body.blockers as Array<{ kind: string; count: number }>) {
      expect(blocker.count).toBeGreaterThan(0);
    }
    const deletes = tracker.fromCalls
      .filter((c) => c.table === 'growth_communities')
      .reduce((sum, c) => sum + c.deletes, 0);
    expect(deletes).toBe(0);
  });

  it('equipo_directivo in a different school cannot DELETE: 403', async () => {
    setupEquipoDirectivo(999);

    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildSequencedClient({
        growth_communities: [{ data: COMMUNITY_ROW }],
      }),
    );

    const { req, res } = createMocks({
      method: 'DELETE',
      query: { id: COMMUNITY_ID },
      body: { confirm: true },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(403);
  });
});

describe('admin/growth-communities/[id] — request-level guards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('invalid (non-UUID) id: 400', async () => {
    setupAdmin();

    const { req, res } = createMocks({
      method: 'PATCH',
      query: { id: 'not-a-uuid' },
      body: { name: 'X' },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(400);
    // The service-role client must not be needed before the UUID check.
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
  });

  it('GET method: 405 with Allow: PATCH, DELETE', async () => {
    const { req, res } = createMocks({
      method: 'GET',
      query: { id: COMMUNITY_ID },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(405);
    expect(res.getHeader('Allow')).toBe('PATCH, DELETE');
    // Auth and DB are never reached for an unsupported method.
    expect(mockCheckIsAdminOrEquipoDirectivo).not.toHaveBeenCalled();
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
  });
});
