// @vitest-environment node
/**
 * Regression tests for DELETE /api/admin/networks/supervisors.
 *
 * This endpoint is the operator counterpart to the school-removal guard in
 * networks/schools.ts: when that guard fires with a 409, this is what an admin
 * uses to clear it. It could never succeed — two independent defects, both
 * hidden by destructuring only `{ data }`:
 *
 *   - `user_roles` has two FKs into `profiles`, so the bare `profiles(...)`
 *     embed was ambiguous (PGRST201);
 *   - it selected `redes_de_colegios(name)`, and that column is `nombre`.
 *
 * Either one alone makes the lookup error out, so `supervisorRole` was always
 * null and the handler always answered 404. Unlike the schools.ts bug this
 * failed CLOSED — nothing was wrongly deleted, the removal just never worked.
 *
 * Same testing rationale as networks-schools.test.ts: a mocked chain has no
 * schema and cannot produce a real PGRST201, so these assert the SHAPE of the
 * query the handler builds and the ERROR BRANCH, not mocked query results.
 *
 * All fixture data is synthetic (Ley 21.719 — no student or staff PII).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';

const { mockCreateServerSupabaseClient, mockHasAdminPrivileges, mockAssignSupervisorRole } =
  vi.hoisted(() => ({
    mockCreateServerSupabaseClient: vi.fn(),
    mockHasAdminPrivileges: vi.fn(),
    mockAssignSupervisorRole: vi.fn(),
  }));

vi.mock('@supabase/auth-helpers-nextjs', () => ({
  createServerSupabaseClient: mockCreateServerSupabaseClient,
}));

vi.mock('../../../utils/roleUtils', () => ({
  hasAdminPrivileges: mockHasAdminPrivileges,
  assignSupervisorRole: mockAssignSupervisorRole,
}));

import handler from '../../../pages/api/admin/networks/supervisors';

const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const NETWORK_ID = '22222222-2222-4222-8222-222222222222';
const SUPERVISOR_ID = '33333333-3333-4333-8333-333333333333';
const ROLE_ID = '44444444-4444-4444-8444-444444444444';

const PGRST201 = {
  code: 'PGRST201',
  message:
    "Could not embed because more than one relationship was found for 'user_roles' and 'profiles'",
};

/** The role row as the fixed lookup returns it. */
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
  updates: number;
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

function buildRecordingClient(resultsByTable: Record<string, TableResult[]>, tracker: Tracker) {
  const indices: Record<string, number> = {};

  return {
    from: vi.fn((table: string) => {
      const idx = indices[table] ?? 0;
      indices[table] = idx + 1;
      const result = resultsByTable[table]?.[idx] ?? { data: null, error: null };

      const fromCall: FromCall = { table, index: idx, updates: 0, selects: [], eqs: [] };
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
            return vi.fn(() => {
              fromCall.updates += 1;
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
      return Promise.resolve({ data: null, error: null });
    }),
  };
}

function setupAdmin(resultsByTable: Record<string, TableResult[]>, tracker: Tracker) {
  mockCreateServerSupabaseClient.mockReturnValueOnce({
    auth: {
      getSession: vi.fn(async () => ({
        data: { session: { user: { id: ADMIN_ID } } },
        error: null,
      })),
    },
  });
  mockCreateServerSupabaseClient.mockReturnValueOnce(
    buildRecordingClient(resultsByTable, tracker),
  );
  mockHasAdminPrivileges.mockResolvedValueOnce(true);
}

async function callDelete() {
  const { req, res } = createMocks({
    method: 'DELETE',
    body: { networkId: NETWORK_ID, userId: SUPERVISOR_ID },
  });
  await handler(req as never, res as never);
  return res;
}

/** Total UPDATE statements issued against user_roles — i.e. actual deactivations. */
function deactivations(tracker: Tracker) {
  return tracker.fromCalls
    .filter((c) => c.table === 'user_roles')
    .reduce((sum, c) => sum + c.updates, 0);
}

function lookupSelect(tracker: Tracker) {
  const call = tracker.fromCalls.find((c) => c.table === 'user_roles');
  return call?.selects[0] as string | undefined;
}

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

  it('deactivates the role and reports the network name on success', async () => {
    const tracker = makeTracker();
    setupAdmin(
      {
        user_roles: [
          { data: SUPERVISOR_ROLE_ROW, error: null },
          { data: null, error: null }, // the update
        ],
      },
      tracker,
    );

    const res = await callDelete();

    expect(res._getStatusCode()).toBe(200);
    expect(deactivations(tracker)).toBe(1);
    const body = JSON.parse(res._getData());
    expect(body.message).toContain('Ana Sintética');
    expect(body.message).toContain('Red Sintética Norte');
    // Cache refresh keeps the materialized view from serving the removed role.
    expect(tracker.rpcCalls).toContain('refresh_user_roles_cache');
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
          { data: null, error: null },
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
});
