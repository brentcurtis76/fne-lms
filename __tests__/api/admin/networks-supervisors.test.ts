// @vitest-environment node
/**
 * B2a — regression tests for /api/admin/networks/supervisors.
 *
 * This endpoint is the operator counterpart to the school-removal guard in
 * networks/schools.ts: when that guard fires with a 409, this is what an admin
 * uses to clear it.
 *
 * REMOVAL could never succeed — two independent defects, both hidden by
 * destructuring only `{ data }`:
 *   - `user_roles` has two FKs into `profiles`, so the bare `profiles(...)`
 *     embed was ambiguous (PGRST201);
 *   - it selected `redes_de_colegios(name)`, and that column is `nombre`.
 * Once the lookup was repaired, the deactivation STILL failed: it wrote an
 * `updated_at` column `user_roles` does not have (PGRST204), and never checked
 * whether the update matched a row.
 *
 * ASSIGNMENT could never succeed either: its network lookup also selected the
 * non-existent `name`, errored, and the discarded error made every request a
 * 404 "Red no encontrada". The same discarded errors meant a failed
 * duplicate/other-network lookup fell through — the
 * one-active-network-per-supervisor rule never fired on a degraded database.
 *
 * Both handlers also built their "admin" client from the auth-helpers factory
 * plus `supabaseKey`, which still sent the CALLER's JWT — see
 * networks-index.test.ts. The repair authenticates via checkIsAdmin() and
 * queries via createServiceRoleClient().
 *
 * Same testing rationale as networks-schools.test.ts: a mocked chain has no
 * schema and cannot produce a real PGRST201/PGRST204, so these assert the SHAPE
 * of the queries and payloads the handler builds and the ERROR BRANCHES; the
 * seeded local stack (tests/e2e/network-supervisors.spec.ts) proves the live
 * behavior.
 *
 * All fixture data is synthetic (Ley 21.719 — no student or staff PII).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';

const { mockCheckIsAdmin, mockCreateServiceRoleClient, mockAssignSupervisorRole } = vi.hoisted(
  () => ({
    mockCheckIsAdmin: vi.fn(),
    mockCreateServiceRoleClient: vi.fn(),
    mockAssignSupervisorRole: vi.fn(),
  }),
);

vi.mock('../../../lib/api-auth', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    checkIsAdmin: mockCheckIsAdmin,
    createServiceRoleClient: mockCreateServiceRoleClient,
  };
});

// Spread the real module: lib/api-auth imports other roleUtils exports at load
// time, and a factory that omitted them would break that import graph.
vi.mock('../../../utils/roleUtils', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    assignSupervisorRole: mockAssignSupervisorRole,
  };
});

import handler from '../../../pages/api/admin/networks/supervisors';

const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const NETWORK_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_NETWORK_ID = '55555555-5555-4555-8555-555555555555';
const SUPERVISOR_ID = '33333333-3333-4333-8333-333333333333';
const ROLE_ID = '44444444-4444-4444-8444-444444444444';

const PGRST201 = {
  code: 'PGRST201',
  message:
    "Could not embed because more than one relationship was found for 'user_roles' and 'profiles'",
};

const DB_DOWN = { code: 'PGRST301', message: 'connection to the database failed' };

const NETWORK_ROW = { id: NETWORK_ID, nombre: 'Red Sintética E2E' };

const CANDIDATE_PROFILE = {
  id: SUPERVISOR_ID,
  email: 'supervisor.sintetico@example.test',
  first_name: 'Ana',
  last_name: 'Sintética',
};

/** The role row as the fixed removal lookup returns it. */
const SUPERVISOR_ROLE_ROW = {
  id: ROLE_ID,
  redes_de_colegios: { nombre: 'Red Sintética Norte' },
  profiles: {
    first_name: 'Ana',
    last_name: 'Sintética',
    email: 'supervisor.sintetico@example.test',
  },
};

interface TableResult {
  data?: unknown;
  error?: unknown;
}

interface FromCall {
  table: string;
  index: number;
  updates: unknown[];
  inserts: unknown[];
  selects: unknown[];
  eqs: Array<{ col: string; val: unknown }>;
}

interface Tracker {
  fromCalls: FromCall[];
  rpcCalls: string[];
}

function makeTracker(): Tracker {
  return { fromCalls: [], rpcCalls: [] };
}

function buildRecordingClient(
  resultsByTable: Record<string, TableResult[]>,
  tracker: Tracker,
  rpcResult: TableResult = { data: null, error: null },
) {
  const indices: Record<string, number> = {};

  return {
    from: vi.fn((table: string) => {
      const idx = indices[table] ?? 0;
      indices[table] = idx + 1;
      const result = resultsByTable[table]?.[idx] ?? { data: null, error: null };

      const fromCall: FromCall = { table, index: idx, updates: [], inserts: [], selects: [], eqs: [] };
      tracker.fromCalls.push(fromCall);

      const resolved = { data: result.data ?? null, error: result.error ?? null };

      const proxyHandler: ProxyHandler<Record<string, unknown>> = {
        get(_t, prop) {
          if (prop === 'then') {
            return (resolve: (v: unknown) => void) => resolve(resolved);
          }
          if (prop === 'select') {
            return vi.fn((vals?: unknown) => {
              fromCall.selects.push(vals);
              return new Proxy({}, proxyHandler);
            });
          }
          if (prop === 'eq') {
            return vi.fn((col: string, val: unknown) => {
              fromCall.eqs.push({ col, val });
              return new Proxy({}, proxyHandler);
            });
          }
          if (prop === 'update') {
            return vi.fn((payload: unknown) => {
              fromCall.updates.push(payload);
              return new Proxy({}, proxyHandler);
            });
          }
          if (prop === 'insert') {
            return vi.fn((payload: unknown) => {
              fromCall.inserts.push(payload);
              return new Proxy({}, proxyHandler);
            });
          }
          if (prop === 'single' || prop === 'maybeSingle') {
            return vi.fn(() => new Proxy({}, proxyHandler));
          }
          return vi.fn(() => new Proxy({}, proxyHandler));
        },
      };
      return new Proxy({}, proxyHandler);
    }),
    rpc: vi.fn((fn: string) => {
      tracker.rpcCalls.push(fn);
      return Promise.resolve({ data: rpcResult.data ?? null, error: rpcResult.error ?? null });
    }),
  };
}

function setupAdmin(
  resultsByTable: Record<string, TableResult[]>,
  tracker: Tracker,
  rpcResult?: TableResult,
) {
  mockCheckIsAdmin.mockResolvedValueOnce({ isAdmin: true, user: { id: ADMIN_ID }, error: null });
  mockCreateServiceRoleClient.mockReturnValueOnce(
    buildRecordingClient(resultsByTable, tracker, rpcResult),
  );
}

async function callPost(body?: Record<string, unknown>) {
  const { req, res } = createMocks({
    method: 'POST',
    body: body ?? { networkId: NETWORK_ID, userId: SUPERVISOR_ID },
  });
  await handler(req as never, res as never);
  return res;
}

async function callDelete(body?: Record<string, unknown>) {
  const { req, res } = createMocks({
    method: 'DELETE',
    body: body ?? { networkId: NETWORK_ID, userId: SUPERVISOR_ID },
  });
  await handler(req as never, res as never);
  return res;
}

/** Total UPDATE statements issued against user_roles — i.e. actual deactivations. */
function deactivations(tracker: Tracker) {
  return tracker.fromCalls
    .filter((c) => c.table === 'user_roles')
    .reduce((sum, c) => sum + c.updates.length, 0);
}

function lookupSelect(tracker: Tracker) {
  const call = tracker.fromCalls.find((c) => c.table === 'user_roles');
  return call?.selects[0] as string | undefined;
}

describe('admin/networks/supervisors — authorization boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  for (const method of ['POST', 'DELETE', 'GET'] as const) {
    it(`${method}: answers 401 to an unauthenticated caller and touches nothing`, async () => {
      mockCheckIsAdmin.mockResolvedValueOnce({
        isAdmin: false,
        user: null,
        error: new Error('No active session'),
      });

      const { req, res } = createMocks({
        method,
        body: { networkId: NETWORK_ID, userId: SUPERVISOR_ID },
        query: { networkId: NETWORK_ID },
      });
      await handler(req as never, res as never);

      expect(res._getStatusCode()).toBe(401);
      expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
      expect(mockAssignSupervisorRole).not.toHaveBeenCalled();
    });

    it(`${method}: answers 403 to an authenticated non-admin (supervisor_de_red included)`, async () => {
      mockCheckIsAdmin.mockResolvedValueOnce({
        isAdmin: false,
        user: { id: SUPERVISOR_ID },
        error: null,
      });

      const { req, res } = createMocks({
        method,
        body: { networkId: NETWORK_ID, userId: SUPERVISOR_ID },
        query: { networkId: NETWORK_ID },
      });
      await handler(req as never, res as never);

      expect(res._getStatusCode()).toBe(403);
      expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
      expect(mockAssignSupervisorRole).not.toHaveBeenCalled();
    });
  }
});

describe('admin/networks/supervisors POST — assignment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssignSupervisorRole.mockResolvedValue({ success: true });
  });

  // ---- the shape of the queries the handler builds -------------------------

  it('selects nombre (not name) from redes_de_colegios and from the conflict embed', async () => {
    const tracker = makeTracker();
    setupAdmin(
      {
        redes_de_colegios: [{ data: NETWORK_ROW, error: null }],
        profiles: [{ data: CANDIDATE_PROFILE, error: null }],
        user_roles: [{ data: [], error: null }],
      },
      tracker,
    );

    await callPost();

    const networkSelect = tracker.fromCalls.find((c) => c.table === 'redes_de_colegios')
      ?.selects[0] as string;
    // redes_de_colegios has no `name` column — selecting it errors the whole
    // query, and the discarded error turned every assignment into a 404.
    expect(networkSelect).toContain('nombre');
    expect(networkSelect).not.toMatch(/\bname\b/);

    const rolesSelect = lookupSelect(tracker) as string;
    expect(rolesSelect).toContain('redes_de_colegios');
    expect(rolesSelect).toContain('nombre');
    expect(rolesSelect).not.toMatch(/\bname\b/);
  });

  // ---- success ------------------------------------------------------------

  it('assigns via the role helper and reports the real network name', async () => {
    const tracker = makeTracker();
    setupAdmin(
      {
        redes_de_colegios: [{ data: NETWORK_ROW, error: null }],
        profiles: [{ data: CANDIDATE_PROFILE, error: null }],
        user_roles: [{ data: [], error: null }],
      },
      tracker,
    );

    const res = await callPost();

    expect(res._getStatusCode()).toBe(201);
    const body = JSON.parse(res._getData());
    expect(body.message).toContain('Ana Sintética');
    expect(body.message).toContain('Red Sintética E2E');

    expect(mockAssignSupervisorRole).toHaveBeenCalledTimes(1);
    const [, targetUserId, networkId, assignedBy] = mockAssignSupervisorRole.mock.calls[0];
    expect(targetUserId).toBe(SUPERVISOR_ID);
    expect(networkId).toBe(NETWORK_ID);
    expect(assignedBy).toBe(ADMIN_ID);

    // Grant paths refresh the degraded-path cache, like remove-role/assign-role.
    expect(tracker.rpcCalls).toContain('refresh_user_roles_cache');
  });

  it('still answers 201 when the cache refresh fails — the grant already happened', async () => {
    const tracker = makeTracker();
    setupAdmin(
      {
        redes_de_colegios: [{ data: NETWORK_ROW, error: null }],
        profiles: [{ data: CANDIDATE_PROFILE, error: null }],
        user_roles: [{ data: [], error: null }],
      },
      tracker,
      { data: null, error: { message: 'refresh failed' } },
    );

    const res = await callPost();

    expect(res._getStatusCode()).toBe(201);
  });

  // ---- the one-active-network-per-supervisor rule --------------------------

  it('rejects a duplicate assignment to the same network with 409 and the network name', async () => {
    const tracker = makeTracker();
    setupAdmin(
      {
        redes_de_colegios: [{ data: NETWORK_ROW, error: null }],
        profiles: [{ data: CANDIDATE_PROFILE, error: null }],
        user_roles: [
          {
            data: [
              { id: ROLE_ID, red_id: NETWORK_ID, redes_de_colegios: { nombre: 'Red Sintética E2E' } },
            ],
            error: null,
          },
        ],
      },
      tracker,
    );

    const res = await callPost();

    expect(res._getStatusCode()).toBe(409);
    const body = JSON.parse(res._getData());
    expect(body.error).toContain('ya es supervisor de la red "Red Sintética E2E"');
    expect(mockAssignSupervisorRole).not.toHaveBeenCalled();
  });

  it('rejects assignment while the user actively supervises ANOTHER network, naming it', async () => {
    const tracker = makeTracker();
    setupAdmin(
      {
        redes_de_colegios: [{ data: NETWORK_ROW, error: null }],
        profiles: [{ data: CANDIDATE_PROFILE, error: null }],
        user_roles: [
          {
            data: [
              {
                id: ROLE_ID,
                red_id: OTHER_NETWORK_ID,
                redes_de_colegios: { nombre: 'Red Sintética Norte' },
              },
            ],
            error: null,
          },
        ],
      },
      tracker,
    );

    const res = await callPost();

    expect(res._getStatusCode()).toBe(409);
    const body = JSON.parse(res._getData());
    expect(body.error).toContain('"Red Sintética Norte"');
    expect(body.error).toContain('una red a la vez');
    expect(mockAssignSupervisorRole).not.toHaveBeenCalled();
  });

  // ---- fail closed: not-found vs failed query ------------------------------

  it('keeps a genuinely missing network as 404', async () => {
    const tracker = makeTracker();
    setupAdmin({ redes_de_colegios: [{ data: null, error: null }] }, tracker);

    const res = await callPost();

    expect(res._getStatusCode()).toBe(404);
    expect(mockAssignSupervisorRole).not.toHaveBeenCalled();
  });

  it('turns a failed network lookup into a 500, not a 404', async () => {
    const tracker = makeTracker();
    setupAdmin({ redes_de_colegios: [{ data: null, error: DB_DOWN }] }, tracker);

    const res = await callPost();

    expect(res._getStatusCode()).toBe(500);
    expect(mockAssignSupervisorRole).not.toHaveBeenCalled();
  });

  it('keeps a genuinely missing user as 404, and a failed user lookup as 500', async () => {
    const missingTracker = makeTracker();
    setupAdmin(
      {
        redes_de_colegios: [{ data: NETWORK_ROW, error: null }],
        profiles: [{ data: null, error: null }],
      },
      missingTracker,
    );
    expect((await callPost())._getStatusCode()).toBe(404);

    const failedTracker = makeTracker();
    setupAdmin(
      {
        redes_de_colegios: [{ data: NETWORK_ROW, error: null }],
        profiles: [{ data: null, error: DB_DOWN }],
      },
      failedTracker,
    );
    expect((await callPost())._getStatusCode()).toBe(500);
    expect(mockAssignSupervisorRole).not.toHaveBeenCalled();
  });

  it('does NOT assign when the existing-roles lookup fails — 500, fail closed', async () => {
    const tracker = makeTracker();
    setupAdmin(
      {
        redes_de_colegios: [{ data: NETWORK_ROW, error: null }],
        profiles: [{ data: CANDIDATE_PROFILE, error: null }],
        user_roles: [{ data: null, error: DB_DOWN }],
      },
      tracker,
    );

    const res = await callPost();

    expect(res._getStatusCode()).toBe(500);
    expect(mockAssignSupervisorRole).not.toHaveBeenCalled();
  });

  it('maps helper failures onto honest statuses (500 for lookups, 409 for conflicts)', async () => {
    const cases: Array<{ failure: string; status: number }> = [
      { failure: 'network_lookup_failed', status: 500 },
      { failure: 'role_lookup_failed', status: 500 },
      { failure: 'insert_failed', status: 500 },
      { failure: 'unexpected', status: 500 },
      { failure: 'network_not_found', status: 404 },
      { failure: 'duplicate', status: 409 },
      { failure: 'other_network', status: 409 },
      { failure: 'not_admin', status: 403 },
    ];

    for (const { failure, status } of cases) {
      const tracker = makeTracker();
      setupAdmin(
        {
          redes_de_colegios: [{ data: NETWORK_ROW, error: null }],
          profiles: [{ data: CANDIDATE_PROFILE, error: null }],
          user_roles: [{ data: [], error: null }],
        },
        tracker,
      );
      mockAssignSupervisorRole.mockResolvedValueOnce({
        success: false,
        failure,
        error: `synthetic ${failure}`,
      });

      const res = await callPost();
      expect(res._getStatusCode(), failure).toBe(status);
    }
  });

  // ---- validation ----------------------------------------------------------

  it('rejects missing ids with 400 before touching the database', async () => {
    const tracker = makeTracker();
    setupAdmin({}, tracker);

    const res = await callPost({ networkId: NETWORK_ID });

    expect(res._getStatusCode()).toBe(400);
    expect(tracker.fromCalls).toHaveLength(0);
  });

  it('rejects malformed uuids with 400 before touching the database', async () => {
    const tracker = makeTracker();
    setupAdmin({}, tracker);

    const res = await callPost({ networkId: 'not-a-uuid', userId: SUPERVISOR_ID });

    expect(res._getStatusCode()).toBe(400);
    expect(tracker.fromCalls).toHaveLength(0);
    expect(mockAssignSupervisorRole).not.toHaveBeenCalled();
  });
});

describe('admin/networks/supervisors DELETE — role lookup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---- the shape of the query the handler builds ---------------------------

  it('disambiguates the profiles embed and selects nombre, not name', async () => {
    const tracker = makeTracker();
    setupAdmin({ user_roles: [{ data: SUPERVISOR_ROLE_ROW, error: null }] }, tracker);

    await callDelete();

    const select = lookupSelect(tracker);
    expect(select).toBeDefined();
    // user_roles has two FKs into profiles; the embed must name the relationship.
    expect(select).toContain('profiles:user_id');
    expect(select).not.toMatch(/(^|[\s,])profiles\s*\(/);
    // redes_de_colegios has no `name` column — selecting it errors the whole query.
    expect(select).toContain('nombre');
    expect(select).not.toMatch(/\bname\b/);
  });

  // ---- the error branch ----------------------------------------------------

  it('does NOT deactivate when the role lookup returns PGRST201', async () => {
    const tracker = makeTracker();
    setupAdmin({ user_roles: [{ data: null, error: PGRST201 }] }, tracker);

    const res = await callDelete();

    expect(res._getStatusCode()).toBe(500);
    expect(deactivations(tracker)).toBe(0);
  });

  it('keeps a genuine miss as 404, not 500', async () => {
    const tracker = makeTracker();
    // maybeSingle() reports "no rows" as data:null with no error.
    setupAdmin({ user_roles: [{ data: null, error: null }] }, tracker);

    const res = await callDelete();

    expect(res._getStatusCode()).toBe(404);
    expect(deactivations(tracker)).toBe(0);
  });

  // ---- anti-vacuity: removal must actually work now ------------------------

  it('deactivates with EXACTLY { is_active: false } — user_roles has no updated_at', async () => {
    const tracker = makeTracker();
    setupAdmin(
      {
        user_roles: [
          { data: SUPERVISOR_ROLE_ROW, error: null },
          { data: [{ id: ROLE_ID }], error: null }, // the update read-back
        ],
      },
      tracker,
    );

    const res = await callDelete();

    expect(res._getStatusCode()).toBe(200);
    expect(deactivations(tracker)).toBe(1);

    // Writing any column user_roles does not have (updated_at included) makes
    // PostgREST reject the whole update with PGRST204 — the defect that kept
    // removal broken after the lookup was repaired.
    const updatePayload = tracker.fromCalls
      .filter((c) => c.table === 'user_roles')
      .flatMap((c) => c.updates)[0] as Record<string, unknown>;
    expect(updatePayload).toEqual({ is_active: false });
    expect(Object.keys(updatePayload)).toEqual(['is_active']);

    const body = JSON.parse(res._getData());
    expect(body.message).toContain('Ana Sintética');
    expect(body.message).toContain('Red Sintética Norte');
    // Cache refresh keeps the materialized view from serving the removed role.
    expect(tracker.rpcCalls).toContain('refresh_user_roles_cache');
  });

  it('fails CLOSED when the deactivation errors', async () => {
    const tracker = makeTracker();
    setupAdmin(
      {
        user_roles: [
          { data: SUPERVISOR_ROLE_ROW, error: null },
          { data: null, error: { code: 'PGRST204', message: "column 'updated_at' does not exist" } },
        ],
      },
      tracker,
    );

    const res = await callDelete();

    expect(res._getStatusCode()).toBe(500);
    expect(JSON.parse(res._getData()).error).toBe('Error al remover supervisor');
  });

  it('fails CLOSED when the deactivation matches no rows', async () => {
    const tracker = makeTracker();
    setupAdmin(
      {
        user_roles: [
          { data: SUPERVISOR_ROLE_ROW, error: null },
          { data: [], error: null }, // update succeeded but touched nothing
        ],
      },
      tracker,
    );

    const res = await callDelete();

    expect(res._getStatusCode()).toBe(500);
  });

  it('still answers 200 when the cache refresh fails — the removal already happened', async () => {
    const tracker = makeTracker();
    setupAdmin(
      {
        user_roles: [
          { data: SUPERVISOR_ROLE_ROW, error: null },
          { data: [{ id: ROLE_ID }], error: null },
        ],
      },
      tracker,
      { data: null, error: { message: 'refresh failed' } },
    );

    const res = await callDelete();

    expect(res._getStatusCode()).toBe(200);
  });

  it('still reports success when the embeds come back missing or array-shaped', async () => {
    const tracker = makeTracker();
    setupAdmin(
      {
        user_roles: [
          {
            data: {
              id: ROLE_ID,
              redes_de_colegios: [{ nombre: 'Red Sintética Sur' }],
              profiles: null,
            },
            error: null,
          },
          { data: [{ id: ROLE_ID }], error: null },
        ],
      },
      tracker,
    );

    const res = await callDelete();

    // The role was already deactivated — a missing embed must not turn a
    // successful removal into a 500.
    expect(res._getStatusCode()).toBe(200);
    expect(deactivations(tracker)).toBe(1);
    expect(JSON.parse(res._getData()).message).toContain('Red Sintética Sur');
  });

  // ---- validation ----------------------------------------------------------

  it('rejects malformed uuids with 400 before touching the database', async () => {
    const tracker = makeTracker();
    setupAdmin({}, tracker);

    const res = await callDelete({ networkId: NETWORK_ID, userId: 'not-a-uuid' });

    expect(res._getStatusCode()).toBe(400);
    expect(tracker.fromCalls).toHaveLength(0);
  });
});
