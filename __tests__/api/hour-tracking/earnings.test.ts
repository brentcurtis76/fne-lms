// @vitest-environment node
/**
 * Unit tests for GET /api/consultant-earnings/[consultant_id]
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';

const ADMIN_UUID = '550e8400-e29b-41d4-a716-446655440001';
const CONSULTOR_UUID = '550e8400-e29b-41d4-a716-446655440002';
const OTHER_UUID = '550e8400-e29b-41d4-a716-446655440003';

// Hoisted mocks
const { mockGetApiUser, mockCreateServiceRoleClient, mockGetUserRoles, mockGetHighestRole } =
  vi.hoisted(() => ({
    mockGetApiUser: vi.fn(),
    mockCreateServiceRoleClient: vi.fn(),
    mockGetUserRoles: vi.fn(),
    mockGetHighestRole: vi.fn(),
  }));

vi.mock('../../../lib/api-auth', () => ({
  getApiUser: mockGetApiUser,
  createServiceRoleClient: mockCreateServiceRoleClient,
  sendAuthError: vi.fn(
    (res: { status: (code: number) => { json: (data: unknown) => void } }, msg?: string, status?: number) => {
      res.status(status || 401).json({ error: msg || 'Error' });
    }
  ),
  sendApiResponse: vi.fn(
    (res: { status: (code: number) => { json: (data: unknown) => void } }, data: unknown, status?: number) => {
      res.status(status || 200).json({ data });
    }
  ),
  logApiRequest: vi.fn(),
  handleMethodNotAllowed: vi.fn(
    (res: { status: (code: number) => { json: (data: unknown) => void } }) => {
      res.status(405).json({ error: 'Method not allowed' });
    }
  ),
}));

vi.mock('../../../utils/roleUtils', () => ({
  getUserRoles: mockGetUserRoles,
  getHighestRole: mockGetHighestRole,
}));

// Mock the getLatestFxRate service function
vi.mock('../../../lib/services/hour-tracking', () => ({
  getLatestFxRate: vi.fn().mockResolvedValue({
    rate_clp_per_eur: 1050,
    fetched_at: '2026-02-24T00:00:00Z',
    is_stale: false,
    source: 'api',
  }),
}));

// Helper to build a chainable Supabase query mock
function makeChain(result: unknown) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  const methods = ['select', 'eq', 'in', 'gte', 'lte', 'order', 'limit'];
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain.single = vi.fn().mockResolvedValue(result);
  chain.maybeSingle = vi.fn().mockResolvedValue(result);
  return chain;
}

function makeEarningsClient(earningsRows: unknown[], ledgerRows: unknown[]) {
  return {
    from: vi.fn((table: string) => {
      if (table === 'contract_hours_ledger') {
        // The handler chains: select → in → gte → lte → eq (final resolves)
        const chain = makeChain({ data: null, error: null });
        chain.eq = vi.fn().mockResolvedValue({ data: ledgerRows, error: null });
        return chain;
      }
      if (table === 'hour_types') {
        return {
          select: vi.fn().mockResolvedValue({
            data: [
              { id: 'ht-1', key: 'asesoria_tecnica_online' },
              { id: 'ht-2', key: 'asesoria_tecnica_presencial' },
            ],
            error: null,
          }),
        };
      }
      return makeChain({ data: null, error: null });
    }),
    rpc: vi.fn().mockResolvedValue({ data: earningsRows, error: null }),
  };
}

import handler from '../../../pages/api/consultant-earnings/[consultant_id]';

// ============================================================
// Auth tests
// ============================================================

describe('GET /api/consultant-earnings/[consultant_id] — auth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when unauthenticated', async () => {
    mockGetApiUser.mockResolvedValue({ user: null, error: new Error('Unauthorized') });

    const { req, res } = createMocks({
      method: 'GET',
      query: { consultant_id: CONSULTOR_UUID, from: '2026-01-01', to: '2026-03-31' },
    });
    await handler(req as never, res as never);
    expect(res._getStatusCode()).toBe(401);
  });

  it('returns 405 for non-GET method', async () => {
    const { req, res } = createMocks({
      method: 'POST',
      query: { consultant_id: CONSULTOR_UUID },
    });
    await handler(req as never, res as never);
    expect(res._getStatusCode()).toBe(405);
  });

  it('returns 400 for invalid UUID', async () => {
    mockGetApiUser.mockResolvedValue({ user: { id: ADMIN_UUID }, error: null });

    const { req, res } = createMocks({
      method: 'GET',
      query: { consultant_id: 'not-a-uuid', from: '2026-01-01', to: '2026-03-31' },
    });
    await handler(req as never, res as never);
    expect(res._getStatusCode()).toBe(400);
  });

  it('consultant GETs own earnings — returns 200', async () => {
    mockGetApiUser.mockResolvedValue({ user: { id: CONSULTOR_UUID }, error: null });
    mockGetUserRoles.mockResolvedValue([{ role_type: 'consultor' }]);
    mockGetHighestRole.mockReturnValue('consultor');

    const earningsRows = [
      {
        hour_type_key: 'asesoria_tecnica_online',
        display_name: 'Asesoria Tecnica Online',
        total_hours: 8,
        rate_eur: 45,
        total_eur: 360,
      },
    ];

    const mockClient = makeEarningsClient(earningsRows, []);
    mockCreateServiceRoleClient.mockReturnValue(mockClient);

    const { req, res } = createMocks({
      method: 'GET',
      query: { consultant_id: CONSULTOR_UUID, from: '2026-01-01', to: '2026-03-31' },
    });
    await handler(req as never, res as never);
    expect(res._getStatusCode()).toBe(200);
    const body = res._getJSONData();
    expect(body.data.rows).toHaveLength(1);
    expect(body.data.totals.total_eur).toBe(360);
  });

  it('consultant GETs other consultant earnings — returns 403', async () => {
    mockGetApiUser.mockResolvedValue({ user: { id: CONSULTOR_UUID }, error: null });
    mockGetUserRoles.mockResolvedValue([{ role_type: 'consultor' }]);
    mockGetHighestRole.mockReturnValue('consultor');
    mockCreateServiceRoleClient.mockReturnValue(makeEarningsClient([], []));

    const { req, res } = createMocks({
      method: 'GET',
      query: { consultant_id: OTHER_UUID, from: '2026-01-01', to: '2026-03-31' },
    });
    await handler(req as never, res as never);
    expect(res._getStatusCode()).toBe(403);
  });

  it('admin GETs any consultant earnings — returns 200', async () => {
    mockGetApiUser.mockResolvedValue({ user: { id: ADMIN_UUID }, error: null });
    mockGetUserRoles.mockResolvedValue([{ role_type: 'admin' }]);
    mockGetHighestRole.mockReturnValue('admin');

    const earningsRows = [
      {
        hour_type_key: 'asesoria_tecnica_presencial',
        display_name: 'Asesoria Tecnica Presencial',
        total_hours: 4,
        rate_eur: 50,
        total_eur: 200,
      },
    ];

    const mockClient = makeEarningsClient(earningsRows, []);
    mockCreateServiceRoleClient.mockReturnValue(mockClient);

    const { req, res } = createMocks({
      method: 'GET',
      query: { consultant_id: CONSULTOR_UUID, from: '2026-01-01', to: '2026-03-31' },
    });
    await handler(req as never, res as never);
    expect(res._getStatusCode()).toBe(200);
    const body = res._getJSONData();
    expect(body.data.totals.total_eur).toBe(200);
  });
});

// ============================================================
// Validation tests
// ============================================================

describe('GET /api/consultant-earnings/[consultant_id] — validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when "from" param is missing', async () => {
    mockGetApiUser.mockResolvedValue({ user: { id: CONSULTOR_UUID }, error: null });
    mockGetUserRoles.mockResolvedValue([{ role_type: 'consultor' }]);
    mockGetHighestRole.mockReturnValue('consultor');
    mockCreateServiceRoleClient.mockReturnValue(makeEarningsClient([], []));

    const { req, res } = createMocks({
      method: 'GET',
      query: { consultant_id: CONSULTOR_UUID, to: '2026-03-31' },
    });
    await handler(req as never, res as never);
    expect(res._getStatusCode()).toBe(400);
    const body = res._getJSONData();
    expect(body.error).toMatch(/from/i);
  });

  it('returns 400 when "to" param is missing', async () => {
    mockGetApiUser.mockResolvedValue({ user: { id: CONSULTOR_UUID }, error: null });
    mockGetUserRoles.mockResolvedValue([{ role_type: 'consultor' }]);
    mockGetHighestRole.mockReturnValue('consultor');
    mockCreateServiceRoleClient.mockReturnValue(makeEarningsClient([], []));

    const { req, res } = createMocks({
      method: 'GET',
      query: { consultant_id: CONSULTOR_UUID, from: '2026-01-01' },
    });
    await handler(req as never, res as never);
    expect(res._getStatusCode()).toBe(400);
    const body = res._getJSONData();
    expect(body.error).toMatch(/to/i);
  });
});

// ============================================================
// Business logic tests
// ============================================================

describe('GET /api/consultant-earnings/[consultant_id] — business logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns zero totals when no earnings exist', async () => {
    mockGetApiUser.mockResolvedValue({ user: { id: ADMIN_UUID }, error: null });
    mockGetUserRoles.mockResolvedValue([{ role_type: 'admin' }]);
    mockGetHighestRole.mockReturnValue('admin');

    const mockClient = makeEarningsClient([], []);
    mockCreateServiceRoleClient.mockReturnValue(mockClient);

    const { req, res } = createMocks({
      method: 'GET',
      query: { consultant_id: CONSULTOR_UUID, from: '2026-01-01', to: '2026-03-31' },
    });
    await handler(req as never, res as never);
    expect(res._getStatusCode()).toBe(200);
    const body = res._getJSONData();
    expect(body.data.rows).toHaveLength(0);
    expect(body.data.totals.total_hours).toBe(0);
    expect(body.data.totals.total_eur).toBe(0);
  });

  it('includes FX conversion in response', async () => {
    mockGetApiUser.mockResolvedValue({ user: { id: ADMIN_UUID }, error: null });
    mockGetUserRoles.mockResolvedValue([{ role_type: 'admin' }]);
    mockGetHighestRole.mockReturnValue('admin');

    const earningsRows = [
      {
        hour_type_key: 'asesoria_tecnica_online',
        display_name: 'Asesoria Tecnica Online',
        total_hours: 2,
        rate_eur: 45,
        total_eur: 90,
      },
    ];

    const mockClient = makeEarningsClient(earningsRows, []);
    mockCreateServiceRoleClient.mockReturnValue(mockClient);

    const { req, res } = createMocks({
      method: 'GET',
      query: { consultant_id: CONSULTOR_UUID, from: '2026-01-01', to: '2026-03-31' },
    });
    await handler(req as never, res as never);
    expect(res._getStatusCode()).toBe(200);
    const body = res._getJSONData();

    // FX rate from mock is 1050 CLP/EUR
    // 90 EUR * 1050 = 94500 CLP
    expect(body.data.fx_rate.rate_clp_per_eur).toBe(1050);
    expect(body.data.totals.total_clp).toBe(94500);
    expect(body.data.rows[0].total_clp).toBe(94500);
  });

  it('includes penalized hours in totals breakdown', async () => {
    mockGetApiUser.mockResolvedValue({ user: { id: ADMIN_UUID }, error: null });
    mockGetUserRoles.mockResolvedValue([{ role_type: 'admin' }]);
    mockGetHighestRole.mockReturnValue('admin');

    const earningsRows = [
      {
        hour_type_key: 'asesoria_tecnica_online',
        display_name: 'Asesoria Tecnica Online',
        total_hours: 5,
        rate_eur: 45,
        total_eur: 225,
      },
    ];

    // Ledger with both consumida and penalizada entries
    const ledgerRows = [
      {
        status: 'consumida',
        hours: 3,
        contract_hour_allocations: { hour_type_id: 'ht-1' },
      },
      {
        status: 'penalizada',
        hours: 2,
        contract_hour_allocations: { hour_type_id: 'ht-1' },
      },
    ];

    const mockClient = makeEarningsClient(earningsRows, ledgerRows);
    mockCreateServiceRoleClient.mockReturnValue(mockClient);

    const { req, res } = createMocks({
      method: 'GET',
      query: { consultant_id: CONSULTOR_UUID, from: '2026-01-01', to: '2026-03-31' },
    });
    await handler(req as never, res as never);
    expect(res._getStatusCode()).toBe(200);
    const body = res._getJSONData();

    expect(body.data.rows[0].total_hours).toBe(5);
    expect(body.data.rows[0].executed_hours).toBe(3);
    expect(body.data.rows[0].penalized_hours).toBe(2);
    expect(body.data.totals.total_eur).toBe(225);
  });
});
