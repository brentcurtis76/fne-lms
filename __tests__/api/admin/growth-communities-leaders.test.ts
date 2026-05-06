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

import handler from '../../../pages/api/admin/growth-communities/[id]/leaders';

const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const ED_ID = '99999999-9999-4999-8999-999999999999';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const COMMUNITY_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_COMMUNITY_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const GENERATION_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const OTHER_GENERATION_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const FORBIDDEN_ERROR =
  'No tienes permiso para gestionar líderes de esta comunidad';

interface TableResult {
  data?: unknown;
  error?: unknown;
  count?: number;
}

interface FromCall {
  table: string;
  updates: unknown[];
  inserts: unknown[];
  inArgs: unknown[];
}

interface RpcCall {
  name: string;
  args: unknown;
}

interface Tracker {
  fromCalls: FromCall[];
  rpcCalls: RpcCall[];
}

function makeTracker(): Tracker {
  return { fromCalls: [], rpcCalls: [] };
}

/**
 * Mock Supabase client: each `from(table)` call consumes the next configured
 * result for that table; the chain proxy supports await (resolves to
 * { data, error, count }), .single() / .maybeSingle(), and records every
 * .insert(arg) and .update(arg) so tests can assert which writes were issued.
 * `rpc(name)` consumes results from `rpcResultsByName[name]` and records the
 * call so tests can verify whether `refresh_user_roles_cache` ran.
 *
 * Mirrors the helper in growth-communities-members.test.ts; extended with
 * insert tracking and rpc support for this route.
 */
function buildSequencedClient(
  resultsByTable: Record<string, TableResult[]>,
  tracker?: Tracker,
  rpcResultsByName?: Record<string, { error?: unknown }[]>,
) {
  const indices: Record<string, number> = {};
  const rpcIndices: Record<string, number> = {};

  return {
    from: vi.fn((table: string) => {
      const idx = indices[table] ?? 0;
      indices[table] = idx + 1;
      const result = resultsByTable[table]?.[idx] ?? { data: null };

      const fromCall: FromCall = { table, updates: [], inserts: [], inArgs: [] };
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
    rpc: vi.fn((name: string, args?: unknown) => {
      const idx = rpcIndices[name] ?? 0;
      rpcIndices[name] = idx + 1;
      const result = rpcResultsByName?.[name]?.[idx] ?? { error: null };
      tracker?.rpcCalls.push({ name, args });
      return Promise.resolve({ data: null, error: result.error ?? null });
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
};

interface RoleRowOverrides {
  id?: string;
  user_id?: string;
  role_type?: string;
  school_id?: number | string | null;
  generation_id?: string | null;
  community_id?: string | null;
  is_active?: boolean;
}

function makeRoleRow(overrides: RoleRowOverrides = {}) {
  return {
    id: 'role-1',
    user_id: USER_ID,
    role_type: 'docente',
    school_id: 1,
    generation_id: GENERATION_ID,
    community_id: null,
    is_active: true,
    ...overrides,
  };
}

describe('admin/growth-communities/[id]/leaders — POST', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // F-fix: userId arrives in the request body and must pass UUID_REGEX before
  // any DB read/write — guards against malformed clients and SQL identifier
  // confusion. Auth + community fetch run first, so the helper still needs
  // a valid community row available.
  it('400 when userId is not a UUID — no insert, no RPC', async () => {
    setupAdmin();
    const tracker = makeTracker();

    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildSequencedClient(
        { growth_communities: [{ data: COMMUNITY_ROW }] },
        tracker,
      ),
    );

    const { req, res } = createMocks({
      method: 'POST',
      query: { id: COMMUNITY_ID },
      body: { userId: 'not-a-uuid' },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(400);
    expect(tracker.fromCalls.flatMap((c) => c.inserts)).toHaveLength(0);
    expect(tracker.fromCalls.flatMap((c) => c.updates)).toHaveLength(0);
    expect(tracker.rpcCalls).toEqual([]);
  });

  it('409 already_leader when an active leader row already exists for this community', async () => {
    setupAdmin();
    const tracker = makeTracker();

    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildSequencedClient(
        {
          growth_communities: [{ data: COMMUNITY_ROW }],
          user_roles: [{ data: [{ id: 'existing-leader' }] }],
        },
        tracker,
      ),
    );

    const { req, res } = createMocks({
      method: 'POST',
      query: { id: COMMUNITY_ID },
      body: { userId: USER_ID },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(409);
    expect(JSON.parse(res._getData()).error).toBe('already_leader');
    expect(tracker.fromCalls.flatMap((c) => c.inserts)).toHaveLength(0);
    expect(tracker.rpcCalls).toEqual([]);
  });

  it('400 no_eligible_role_in_school when the user has no candidate row in the school', async () => {
    setupAdmin();
    const tracker = makeTracker();

    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildSequencedClient(
        {
          growth_communities: [{ data: COMMUNITY_ROW }],
          user_roles: [
            { data: [] }, // existing-leader check: none
            { data: [] }, // school roles: none
          ],
        },
        tracker,
      ),
    );

    const { req, res } = createMocks({
      method: 'POST',
      query: { id: COMMUNITY_ID },
      body: { userId: USER_ID },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(400);
    expect(JSON.parse(res._getData()).error).toBe('no_eligible_role_in_school');
    expect(tracker.fromCalls.flatMap((c) => c.inserts)).toHaveLength(0);
    expect(tracker.rpcCalls).toEqual([]);
  });

  it('400 generation_mismatch when chosen non-leader row has another (non-null) generation', async () => {
    setupAdmin();
    const tracker = makeTracker();

    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildSequencedClient(
        {
          growth_communities: [{ data: COMMUNITY_ROW }],
          user_roles: [
            { data: [] },
            { data: [makeRoleRow({ id: 'r-d', generation_id: OTHER_GENERATION_ID })] },
          ],
        },
        tracker,
      ),
    );

    const { req, res } = createMocks({
      method: 'POST',
      query: { id: COMMUNITY_ID },
      body: { userId: USER_ID },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(400);
    expect(JSON.parse(res._getData()).error).toBe('generation_mismatch');
    expect(tracker.fromCalls.flatMap((c) => c.inserts)).toHaveLength(0);
    expect(tracker.rpcCalls).toEqual([]);
  });

  it('inserts a fresh lider_comunidad row with the right payload, returns 200, and refreshes the role cache', async () => {
    setupAdmin();
    const tracker = makeTracker();

    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildSequencedClient(
        {
          growth_communities: [{ data: COMMUNITY_ROW }],
          user_roles: [
            { data: [] },                                     // no existing leader
            { data: [makeRoleRow({ id: 'role-d' })] },        // school roles
            { data: { id: 'new-leader-id' } },                // insert ... .select('id').single()
          ],
        },
        tracker,
      ),
    );

    const { req, res } = createMocks({
      method: 'POST',
      query: { id: COMMUNITY_ID },
      body: { userId: USER_ID },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);
    expect(JSON.parse(res._getData())).toEqual({
      assigned: 1,
      leader_user_roles_id: 'new-leader-id',
    });

    // Promotion is insert-only: never mutate the chosen non-leader row.
    const inserts = tracker.fromCalls.flatMap((c) => c.inserts);
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({
      user_id: USER_ID,
      role_type: 'lider_comunidad',
      school_id: 1,
      generation_id: GENERATION_ID,
      community_id: COMMUNITY_ID,
      is_active: true,
      assigned_by: ADMIN_ID,
    });
    expect(tracker.fromCalls.flatMap((c) => c.updates)).toHaveLength(0);
    expect(tracker.rpcCalls.map((r) => r.name)).toEqual(['refresh_user_roles_cache']);
  });

  it('insert returning Postgres 23505 conflict maps to 409 already_leader and skips the cache refresh', async () => {
    setupAdmin();
    const tracker = makeTracker();

    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildSequencedClient(
        {
          growth_communities: [{ data: COMMUNITY_ROW }],
          user_roles: [
            { data: [] },
            { data: [makeRoleRow({ id: 'role-d' })] },
            { error: { code: '23505', message: 'duplicate key' } },
          ],
        },
        tracker,
      ),
    );

    const { req, res } = createMocks({
      method: 'POST',
      query: { id: COMMUNITY_ID },
      body: { userId: USER_ID },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(409);
    expect(JSON.parse(res._getData()).error).toBe('already_leader');
    expect(tracker.rpcCalls).toEqual([]);
  });

  it('insert errors with a non-23505 code return 500 and skip the cache refresh', async () => {
    setupAdmin();
    const tracker = makeTracker();

    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildSequencedClient(
        {
          growth_communities: [{ data: COMMUNITY_ROW }],
          user_roles: [
            { data: [] },
            { data: [makeRoleRow({ id: 'role-d' })] },
            { error: { code: '42P01', message: 'relation missing' } },
          ],
        },
        tracker,
      ),
    );

    const { req, res } = createMocks({
      method: 'POST',
      query: { id: COMMUNITY_ID },
      body: { userId: USER_ID },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(500);
    expect(tracker.rpcCalls).toEqual([]);
  });
});

describe('admin/growth-communities/[id]/leaders — DELETE', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // F-fix: same UUID guard as POST — applies to body.userId on DELETE too.
  it('400 when userId is not a UUID — no updates, no RPC', async () => {
    setupAdmin();
    const tracker = makeTracker();

    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildSequencedClient(
        { growth_communities: [{ data: COMMUNITY_ROW }] },
        tracker,
      ),
    );

    const { req, res } = createMocks({
      method: 'DELETE',
      query: { id: COMMUNITY_ID },
      body: { userId: 'not-a-uuid', mode: 'demote_to_member' },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(400);
    expect(tracker.fromCalls.flatMap((c) => c.updates)).toHaveLength(0);
    expect(tracker.rpcCalls).toEqual([]);
  });

  it('400 when mode is neither demote_to_member nor remove_from_community', async () => {
    setupAdmin();
    const tracker = makeTracker();

    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildSequencedClient(
        { growth_communities: [{ data: COMMUNITY_ROW }] },
        tracker,
      ),
    );

    const { req, res } = createMocks({
      method: 'DELETE',
      query: { id: COMMUNITY_ID },
      body: { userId: USER_ID, mode: 'something_else' },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(400);
    expect(tracker.fromCalls.flatMap((c) => c.updates)).toHaveLength(0);
    expect(tracker.rpcCalls).toEqual([]);
  });

  it('404 not_a_leader when the user has no active leader row for this community — no updates, no RPC', async () => {
    setupAdmin();
    const tracker = makeTracker();

    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildSequencedClient(
        {
          growth_communities: [{ data: COMMUNITY_ROW }],
          user_roles: [{ data: [] }], // leader-row lookup: empty
        },
        tracker,
      ),
    );

    const { req, res } = createMocks({
      method: 'DELETE',
      query: { id: COMMUNITY_ID },
      body: { userId: USER_ID, mode: 'demote_to_member' },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(404);
    expect(JSON.parse(res._getData()).error).toBe('not_a_leader');
    expect(tracker.fromCalls.flatMap((c) => c.updates)).toHaveLength(0);
    expect(tracker.rpcCalls).toEqual([]);
  });

  it('500 when the leader-deactivation update itself fails — no compensation needed, no RPC', async () => {
    setupAdmin();
    const tracker = makeTracker();

    const leaderRow = { id: 'leader-row', user_id: USER_ID, role_type: 'lider_comunidad' };

    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildSequencedClient(
        {
          growth_communities: [{ data: COMMUNITY_ROW }],
          user_roles: [
            { data: [leaderRow] },
            { error: { message: 'deactivate failed' } }, // the deactivate update
          ],
        },
        tracker,
      ),
    );

    const { req, res } = createMocks({
      method: 'DELETE',
      query: { id: COMMUNITY_ID },
      body: { userId: USER_ID, mode: 'remove_from_community' },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(500);
    // Only one update was attempted — the failing deactivate. Nothing to undo.
    expect(tracker.fromCalls.flatMap((c) => c.updates)).toEqual([
      { is_active: false },
    ]);
    expect(tracker.rpcCalls).toEqual([]);
  });

  it('mode=remove_from_community: deactivates the leader row, nulls community_id on the user’s rows, and refreshes the cache', async () => {
    setupAdmin();
    const tracker = makeTracker();

    const leaderRow = { id: 'leader-row', user_id: USER_ID, role_type: 'lider_comunidad' };

    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildSequencedClient(
        {
          growth_communities: [{ data: COMMUNITY_ROW }],
          user_roles: [
            { data: [leaderRow] },
            { data: null, error: null }, // deactivate
            { data: null, error: null }, // null community_id
          ],
        },
        tracker,
      ),
    );

    const { req, res } = createMocks({
      method: 'DELETE',
      query: { id: COMMUNITY_ID },
      body: { userId: USER_ID, mode: 'remove_from_community' },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);
    expect(JSON.parse(res._getData())).toEqual({
      demoted: 1,
      mode: 'remove_from_community',
    });
    expect(tracker.fromCalls.flatMap((c) => c.updates)).toEqual([
      { is_active: false },
      { community_id: null },
    ]);
    expect(tracker.rpcCalls.map((r) => r.name)).toEqual(['refresh_user_roles_cache']);
  });

  it('mode=remove_from_community: when the null-community update fails, the leader row is reactivated (compensation succeeds) and 500 is returned without refreshing cache', async () => {
    setupAdmin();
    const tracker = makeTracker();

    const leaderRow = { id: 'leader-row', user_id: USER_ID, role_type: 'lider_comunidad' };

    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildSequencedClient(
        {
          growth_communities: [{ data: COMMUNITY_ROW }],
          user_roles: [
            { data: [leaderRow] },
            { data: null, error: null },             // deactivate ok
            { error: { message: 'null failed' } },   // null community_id fails
            { data: null, error: null },             // reactivate compensation ok
          ],
        },
        tracker,
      ),
    );

    const { req, res } = createMocks({
      method: 'DELETE',
      query: { id: COMMUNITY_ID },
      body: { userId: USER_ID, mode: 'remove_from_community' },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(500);
    // Three updates in order: deactivate, failed null update, reactivation.
    expect(tracker.fromCalls.flatMap((c) => c.updates)).toEqual([
      { is_active: false },
      { community_id: null },
      { is_active: true },
    ]);
    // Compensation path must NOT refresh the cache — DB is back to pre-state.
    expect(tracker.rpcCalls).toEqual([]);
  });

  // F-fix: when the compensating reactivation update itself fails, the original
  // 500 message hides a worse problem — the leader row is left deactivated AND
  // the user's roles are unchanged. The fix is to surface a distinct
  // `compensation_failed` so the caller knows manual intervention is required.
  it('mode=remove_from_community: F-fix — if compensation itself fails, returns 500 compensation_failed (no RPC)', async () => {
    setupAdmin();
    const tracker = makeTracker();

    const leaderRow = { id: 'leader-row', user_id: USER_ID, role_type: 'lider_comunidad' };

    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildSequencedClient(
        {
          growth_communities: [{ data: COMMUNITY_ROW }],
          user_roles: [
            { data: [leaderRow] },
            { data: null, error: null },                  // deactivate ok
            { error: { message: 'null failed' } },        // null update fails
            { error: { message: 'reactivation failed' } },// compensation also fails
          ],
        },
        tracker,
      ),
    );

    const { req, res } = createMocks({
      method: 'DELETE',
      query: { id: COMMUNITY_ID },
      body: { userId: USER_ID, mode: 'remove_from_community' },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(500);
    expect(JSON.parse(res._getData()).error).toBe('compensation_failed');
    expect(tracker.rpcCalls).toEqual([]);
  });

  it('mode=demote_to_member: rebinds an unbound chosen row to this community (and fills generation_id when null) and refreshes cache', async () => {
    setupAdmin();
    const tracker = makeTracker();

    const leaderRow = { id: 'leader-row', user_id: USER_ID, role_type: 'lider_comunidad' };
    // Chosen row is unbound (community_id null) and generation-less. The demote
    // path must fill BOTH community_id and generation_id on the rebind update.
    const chosenRow = makeRoleRow({
      id: 'chosen-row',
      role_type: 'docente',
      community_id: null,
      generation_id: null,
    });

    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildSequencedClient(
        {
          growth_communities: [{ data: COMMUNITY_ROW }],
          user_roles: [
            { data: [leaderRow] },
            { data: null, error: null }, // deactivate ok
            { data: [chosenRow] },        // school roles
            { data: null, error: null }, // rebind update ok
          ],
        },
        tracker,
      ),
    );

    const { req, res } = createMocks({
      method: 'DELETE',
      query: { id: COMMUNITY_ID },
      body: { userId: USER_ID, mode: 'demote_to_member' },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);
    expect(JSON.parse(res._getData())).toEqual({
      demoted: 1,
      mode: 'demote_to_member',
    });
    expect(tracker.fromCalls.flatMap((c) => c.updates)).toEqual([
      { is_active: false },
      { community_id: COMMUNITY_ID, generation_id: GENERATION_ID },
    ]);
    expect(tracker.rpcCalls.map((r) => r.name)).toEqual(['refresh_user_roles_cache']);
  });

  it('mode=demote_to_member: 409 generation_mismatch_on_demote; leader is reactivated, no rebind, no RPC', async () => {
    setupAdmin();
    const tracker = makeTracker();

    const leaderRow = { id: 'leader-row', user_id: USER_ID, role_type: 'lider_comunidad' };
    const chosenRow = makeRoleRow({
      id: 'chosen-mismatch',
      role_type: 'docente',
      generation_id: OTHER_GENERATION_ID,
    });

    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildSequencedClient(
        {
          growth_communities: [{ data: COMMUNITY_ROW }],
          user_roles: [
            { data: [leaderRow] },
            { data: null, error: null }, // deactivate
            { data: [chosenRow] },        // school roles
            { data: null, error: null }, // reactivation
          ],
        },
        tracker,
      ),
    );

    const { req, res } = createMocks({
      method: 'DELETE',
      query: { id: COMMUNITY_ID },
      body: { userId: USER_ID, mode: 'demote_to_member' },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(409);
    expect(JSON.parse(res._getData()).error).toBe('generation_mismatch_on_demote');
    expect(tracker.fromCalls.flatMap((c) => c.updates)).toEqual([
      { is_active: false },
      { is_active: true }, // compensation
    ]);
    expect(tracker.rpcCalls).toEqual([]);
  });

  it('mode=demote_to_member: 409 no_eligible_role_to_demote_to when no non-leader candidate exists; leader reactivated, no RPC', async () => {
    setupAdmin();
    const tracker = makeTracker();

    const leaderRow = { id: 'leader-row', user_id: USER_ID, role_type: 'lider_comunidad' };

    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildSequencedClient(
        {
          growth_communities: [{ data: COMMUNITY_ROW }],
          user_roles: [
            { data: [leaderRow] },
            { data: null, error: null }, // deactivate
            { data: [] },                 // school roles: empty
            { data: null, error: null }, // reactivation
          ],
        },
        tracker,
      ),
    );

    const { req, res } = createMocks({
      method: 'DELETE',
      query: { id: COMMUNITY_ID },
      body: { userId: USER_ID, mode: 'demote_to_member' },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(409);
    expect(JSON.parse(res._getData()).error).toBe('no_eligible_role_to_demote_to');
    expect(tracker.fromCalls.flatMap((c) => c.updates)).toEqual([
      { is_active: false },
      { is_active: true },
    ]);
    expect(tracker.rpcCalls).toEqual([]);
  });

  // F-fix: the user's only non-leader row already lives in *another* community.
  // Rebinding that row to this community would silently yank their docente
  // assignment out of the community where it actually belongs. The fix rejects
  // the demote, reactivates the leader row, and leaves the chosen row alone.
  it('mode=demote_to_member: F-fix — refuses to rebind a row already bound to a different community; leader reactivated, no rebind, no RPC', async () => {
    setupAdmin();
    const tracker = makeTracker();

    const leaderRow = { id: 'leader-row', user_id: USER_ID, role_type: 'lider_comunidad' };
    const chosenRow = makeRoleRow({
      id: 'chosen-elsewhere',
      role_type: 'docente',
      community_id: OTHER_COMMUNITY_ID,
    });

    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildSequencedClient(
        {
          growth_communities: [{ data: COMMUNITY_ROW }],
          user_roles: [
            { data: [leaderRow] },
            { data: null, error: null }, // deactivate
            { data: [chosenRow] },        // school roles
            { data: null, error: null }, // reactivation (compensation)
          ],
        },
        tracker,
      ),
    );

    const { req, res } = createMocks({
      method: 'DELETE',
      query: { id: COMMUNITY_ID },
      body: { userId: USER_ID, mode: 'demote_to_member' },
    });
    await handler(req as never, res as never);

    // Some rejection in the 4xx range — the precise code is not load-bearing,
    // but the *behavior* is: no rebind on the chosen row, leader reactivated.
    expect(res._getStatusCode()).toBeGreaterThanOrEqual(400);
    expect(res._getStatusCode()).toBeLessThan(500);
    expect(tracker.fromCalls.flatMap((c) => c.updates)).toEqual([
      { is_active: false },
      { is_active: true }, // compensation
    ]);
    expect(tracker.rpcCalls).toEqual([]);
  });
});

describe('admin/growth-communities/[id]/leaders — equipo_directivo school scope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('POST by equipo_directivo in same school promotes successfully', async () => {
    setupEquipoDirectivo(1);

    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildSequencedClient({
        growth_communities: [{ data: COMMUNITY_ROW }],
        user_roles: [
          { data: [] },
          { data: [makeRoleRow({ id: 'role-d' })] },
          { data: { id: 'leader-id-ed' } },
        ],
      }),
    );

    const { req, res } = createMocks({
      method: 'POST',
      query: { id: COMMUNITY_ID },
      body: { userId: USER_ID },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);
    expect(JSON.parse(res._getData())).toEqual({
      assigned: 1,
      leader_user_roles_id: 'leader-id-ed',
    });
  });

  it('POST by equipo_directivo from a different school is forbidden — no inserts, no RPC', async () => {
    setupEquipoDirectivo(999);
    const tracker = makeTracker();

    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildSequencedClient(
        { growth_communities: [{ data: COMMUNITY_ROW }] },
        tracker,
      ),
    );

    const { req, res } = createMocks({
      method: 'POST',
      query: { id: COMMUNITY_ID },
      body: { userId: USER_ID },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(403);
    expect(JSON.parse(res._getData())).toEqual({ error: FORBIDDEN_ERROR });
    expect(tracker.fromCalls.flatMap((c) => c.inserts)).toHaveLength(0);
    expect(tracker.rpcCalls).toEqual([]);
  });

  it('DELETE by equipo_directivo from a different school is forbidden', async () => {
    setupEquipoDirectivo(999);

    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildSequencedClient({
        growth_communities: [{ data: COMMUNITY_ROW }],
      }),
    );

    const { req, res } = createMocks({
      method: 'DELETE',
      query: { id: COMMUNITY_ID },
      body: { userId: USER_ID, mode: 'demote_to_member' },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(403);
    expect(JSON.parse(res._getData())).toEqual({ error: FORBIDDEN_ERROR });
  });
});
