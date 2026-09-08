// @vitest-environment node
/**
 * B2a — regression tests for /api/admin/networks (network listing).
 *
 * The defects these pin, all live before the repair:
 *
 *   - The handler built its "admin" client with the auth-helpers factory plus
 *     `supabaseKey`, which still sent the CALLER's session JWT as the bearer —
 *     PostgREST resolved `authenticated`, and RLS on `user_roles` (no
 *     admin-read policy) emptied every supervisor read. The repair
 *     authenticates via checkIsAdmin() and queries via
 *     createServiceRoleClient(), the genuinely server-only client.
 *   - The per-network supervisor query discarded `error`, so ANY failed lookup
 *     became supervisors: [] / supervisor_count: 0 — a fake-empty success.
 *     A failed lookup must be a 500.
 *
 * Same testing rationale as networks-supervisors.test.ts: a mocked chain has no
 * schema, so these assert the SHAPE of the queries the handler builds and its
 * error branches; the seeded local stack (tests/e2e/network-supervisors.spec.ts)
 * proves the live behavior.
 *
 * All fixture data is synthetic (Ley 21.719 — no student or staff PII).
 */
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

import handler from '../../../pages/api/admin/networks/index';

const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const NON_ADMIN_ID = '99999999-9999-4999-8999-999999999999';
const PRIMARY_NETWORK_ID = '22222222-2222-4222-8222-222222222222';
const SECONDARY_NETWORK_ID = '55555555-5555-4555-8555-555555555555';
const SUPERVISOR_ID = '33333333-3333-4333-8333-333333333333';

const PRIMARY_NETWORK_ROW = {
  id: PRIMARY_NETWORK_ID,
  nombre: 'Red Sintética E2E',
  descripcion: 'Red sintética de prueba',
  created_by: ADMIN_ID,
  last_updated_by: ADMIN_ID,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  red_escuelas: [
    {
      school_id: 990001,
      fecha_agregada: '2026-01-01T00:00:00.000Z',
      agregado_por: ADMIN_ID,
      schools: { id: 990001, name: 'Colegio Sintético E2E' },
    },
  ],
};

const SECONDARY_NETWORK_ROW = {
  id: SECONDARY_NETWORK_ID,
  nombre: 'Red Sintética E2E Norte',
  descripcion: 'Segunda red sintética, sin supervisor',
  created_by: ADMIN_ID,
  last_updated_by: ADMIN_ID,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  red_escuelas: [
    {
      school_id: 990002,
      fecha_agregada: '2026-01-01T00:00:00.000Z',
      agregado_por: ADMIN_ID,
      schools: { id: 990002, name: 'Colegio Sintético E2E Norte' },
    },
  ],
};

const SUPERVISOR_ROW = {
  user_id: SUPERVISOR_ID,
  red_id: PRIMARY_NETWORK_ID,
  created_at: '2026-02-01T00:00:00.000Z',
  profiles: {
    id: SUPERVISOR_ID,
    email: 'supervisora.sintetica@example.test',
    first_name: 'Supervisora',
    last_name: 'Sintética',
  },
};

interface TableResult {
  data?: unknown;
  error?: unknown;
}

interface FromCall {
  table: string;
  index: number;
  selects: unknown[];
  eqs: Array<{ col: string; val: unknown }>;
  ins: Array<{ col: string; vals: unknown }>;
  orders: unknown[];
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

      const fromCall: FromCall = { table, index: idx, selects: [], eqs: [], ins: [], orders: [] };
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
          if (prop === 'in') {
            return vi.fn((col: string, vals: unknown) => {
              fromCall.ins.push({ col, vals });
              return new Proxy({}, proxyHandler);
            });
          }
          if (prop === 'order') {
            return vi.fn((arg: unknown) => {
              fromCall.orders.push(arg);
              return new Proxy({}, proxyHandler);
            });
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
  mockCheckIsAdmin.mockResolvedValueOnce({ isAdmin: true, user: { id: ADMIN_ID }, error: null });
  mockCreateServiceRoleClient.mockReturnValueOnce(buildRecordingClient(resultsByTable, tracker));
}

async function callGet() {
  const { req, res } = createMocks({ method: 'GET' });
  await handler(req as never, res as never);
  return res;
}

describe('admin/networks — authorization boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('answers 401 to an unauthenticated caller and never builds a privileged client', async () => {
    mockCheckIsAdmin.mockResolvedValueOnce({
      isAdmin: false,
      user: null,
      error: new Error('No active session'),
    });

    const res = await callGet();

    expect(res._getStatusCode()).toBe(401);
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
  });

  it('answers 403 to an authenticated non-admin (supervisor_de_red included)', async () => {
    mockCheckIsAdmin.mockResolvedValueOnce({
      isAdmin: false,
      user: { id: NON_ADMIN_ID },
      error: null,
    });

    const res = await callGet();

    expect(res._getStatusCode()).toBe(403);
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
  });
});

describe('admin/networks GET — supervisor listing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns each network\'s active supervisors and a count derived from that list', async () => {
    const tracker = makeTracker();
    setupAdmin(
      {
        redes_de_colegios: [{ data: [PRIMARY_NETWORK_ROW, SECONDARY_NETWORK_ROW], error: null }],
        user_roles: [{ data: [SUPERVISOR_ROW], error: null }],
      },
      tracker,
    );

    const res = await callGet();

    expect(res._getStatusCode()).toBe(200);
    const body = JSON.parse(res._getData());
    expect(body.networks).toHaveLength(2);

    const primary = body.networks.find((n: { id: string }) => n.id === PRIMARY_NETWORK_ID);
    const secondary = body.networks.find((n: { id: string }) => n.id === SECONDARY_NETWORK_ID);

    expect(primary.supervisors).toEqual([
      {
        user_id: SUPERVISOR_ID,
        email: 'supervisora.sintetica@example.test',
        first_name: 'Supervisora',
        last_name: 'Sintética',
        assigned_at: '2026-02-01T00:00:00.000Z',
      },
    ]);
    expect(primary.supervisor_count).toBe(1);

    // The unsupervised network reports an EMPTY list because the query
    // SUCCEEDED and found nothing — never because a failure was swallowed.
    expect(secondary.supervisors).toEqual([]);
    expect(secondary.supervisor_count).toBe(0);

    for (const network of body.networks) {
      expect(network.supervisor_count).toBe(network.supervisors.length);
    }
  });

  it('queries supervisors once, filtered to active supervisor_de_red rows, with a disambiguated profiles embed', async () => {
    const tracker = makeTracker();
    setupAdmin(
      {
        redes_de_colegios: [{ data: [PRIMARY_NETWORK_ROW, SECONDARY_NETWORK_ROW], error: null }],
        user_roles: [{ data: [SUPERVISOR_ROW], error: null }],
      },
      tracker,
    );

    await callGet();

    const roleCalls = tracker.fromCalls.filter((c) => c.table === 'user_roles');
    expect(roleCalls).toHaveLength(1);

    const call = roleCalls[0];
    const select = call.selects[0] as string;
    // user_roles has two FKs into profiles; the embed must name the relationship.
    expect(select).toContain('profiles:user_id');
    expect(select).not.toMatch(/(^|[\s,])profiles\s*\(/);

    expect(call.eqs).toContainEqual({ col: 'role_type', val: 'supervisor_de_red' });
    expect(call.eqs).toContainEqual({ col: 'is_active', val: true });
    expect(call.ins).toContainEqual({
      col: 'red_id',
      vals: [PRIMARY_NETWORK_ID, SECONDARY_NETWORK_ID],
    });
  });

  it('turns a failed supervisor query into a 500 — never into supervisors: []', async () => {
    const tracker = makeTracker();
    setupAdmin(
      {
        redes_de_colegios: [{ data: [PRIMARY_NETWORK_ROW, SECONDARY_NETWORK_ROW], error: null }],
        user_roles: [
          {
            data: null,
            error: { code: 'PGRST301', message: 'connection to the database failed' },
          },
        ],
      },
      tracker,
    );

    const res = await callGet();

    expect(res._getStatusCode()).toBe(500);
    const body = JSON.parse(res._getData());
    expect(body.error).toBe('Error al obtener los supervisores de las redes');
    // The fake-empty success is the defect: no network list may accompany a
    // failed supervisor lookup.
    expect(body.networks).toBeUndefined();
  });

  it('turns a failed networks query into a 500', async () => {
    const tracker = makeTracker();
    setupAdmin(
      {
        redes_de_colegios: [
          { data: null, error: { code: 'PGRST301', message: 'connection to the database failed' } },
        ],
      },
      tracker,
    );

    const res = await callGet();

    expect(res._getStatusCode()).toBe(500);
    expect(JSON.parse(res._getData()).error).toBe('Error al obtener redes');
  });

  it('skips the supervisor query entirely when there are no networks', async () => {
    const tracker = makeTracker();
    setupAdmin({ redes_de_colegios: [{ data: [], error: null }] }, tracker);

    const res = await callGet();

    expect(res._getStatusCode()).toBe(200);
    expect(JSON.parse(res._getData()).networks).toEqual([]);
    expect(tracker.fromCalls.filter((c) => c.table === 'user_roles')).toHaveLength(0);
  });

  it('rejects unsupported methods with 405', async () => {
    mockCheckIsAdmin.mockResolvedValueOnce({ isAdmin: true, user: { id: ADMIN_ID }, error: null });
    mockCreateServiceRoleClient.mockReturnValueOnce(buildRecordingClient({}, makeTracker()));

    const { req, res } = createMocks({ method: 'PATCH' });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(405);
  });
});
