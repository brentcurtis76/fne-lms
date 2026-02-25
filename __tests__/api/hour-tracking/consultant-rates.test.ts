// @vitest-environment node
/**
 * Unit tests for consultant-rates API routes
 * GET/POST /api/admin/consultant-rates
 * GET/PATCH/DELETE /api/admin/consultant-rates/[id]
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';

const ADMIN_UUID = '550e8400-e29b-41d4-a716-446655440001';
const CONSULTOR_UUID = '550e8400-e29b-41d4-a716-446655440002';
const RATE_UUID = '550e8400-e29b-41d4-a716-446655440003';
const HOUR_TYPE_UUID = '550e8400-e29b-41d4-a716-446655440004';
const OTHER_UUID = '550e8400-e29b-41d4-a716-446655440005';

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

// Helper to build a chainable Supabase query mock
function makeChain(result: unknown) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  const methods = ['select', 'eq', 'in', 'insert', 'update', 'delete', 'order', 'or', 'gte', 'lte', 'limit'];
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain.single = vi.fn().mockResolvedValue(result);
  chain.maybeSingle = vi.fn().mockResolvedValue(result);
  return chain;
}

function makeServiceClient() {
  return {
    from: vi.fn(() => makeChain({ data: null, error: null })),
    rpc: vi.fn(),
  };
}

import indexHandler from '../../../pages/api/admin/consultant-rates/index';
import idHandler from '../../../pages/api/admin/consultant-rates/[id]';

// ============================================================
// GET /api/admin/consultant-rates
// ============================================================

describe('GET /api/admin/consultant-rates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when unauthenticated', async () => {
    mockGetApiUser.mockResolvedValue({ user: null, error: new Error('Unauthorized') });

    const { req, res } = createMocks({ method: 'GET' });
    await indexHandler(req as never, res as never);
    expect(res._getStatusCode()).toBe(401);
  });

  it('returns 403 when non-admin user tries to list all rates', async () => {
    mockGetApiUser.mockResolvedValue({ user: { id: CONSULTOR_UUID }, error: null });
    mockGetUserRoles.mockResolvedValue([{ role_type: 'consultor' }]);
    mockGetHighestRole.mockReturnValue('consultor');
    mockCreateServiceRoleClient.mockReturnValue(makeServiceClient());

    const { req, res } = createMocks({ method: 'GET' });
    await indexHandler(req as never, res as never);
    expect(res._getStatusCode()).toBe(403);
  });

  it('returns 200 with rates list for admin', async () => {
    mockGetApiUser.mockResolvedValue({ user: { id: ADMIN_UUID }, error: null });
    mockGetUserRoles.mockResolvedValue([{ role_type: 'admin' }]);
    mockGetHighestRole.mockReturnValue('admin');

    const fakeRates = [
      {
        id: RATE_UUID,
        consultant_id: CONSULTOR_UUID,
        hour_type_id: HOUR_TYPE_UUID,
        rate_eur: 45.0,
        effective_from: '2026-01-01',
        effective_to: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        created_by: ADMIN_UUID,
        profiles: { id: CONSULTOR_UUID, first_name: 'Juan', last_name: 'Perez' },
        hour_types: { id: HOUR_TYPE_UUID, key: 'asesoria_tecnica_online', display_name: 'Asesoria Tecnica Online' },
      },
    ];

    // The handler ends the chain with .order() which returns the final result
    const chain = makeChain({ data: fakeRates, error: null });
    chain.order = vi.fn().mockResolvedValue({ data: fakeRates, error: null });

    const mockClient = {
      from: vi.fn((table: string) => {
        if (table === 'consultant_rates') return chain;
        return makeChain({ data: null, error: null });
      }),
      rpc: vi.fn(),
    };
    mockCreateServiceRoleClient.mockReturnValue(mockClient);

    const { req, res } = createMocks({ method: 'GET' });
    await indexHandler(req as never, res as never);
    expect(res._getStatusCode()).toBe(200);
    const body = res._getJSONData();
    expect(body.data.rates).toHaveLength(1);
    expect(body.data.rates[0].rate_eur).toBe(45.0);
  });

  it('returns 405 for unsupported method', async () => {
    const { req, res } = createMocks({ method: 'DELETE' });
    await indexHandler(req as never, res as never);
    expect(res._getStatusCode()).toBe(405);
  });
});

// ============================================================
// POST /api/admin/consultant-rates
// ============================================================

describe('POST /api/admin/consultant-rates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 403 when non-admin tries to create rate', async () => {
    mockGetApiUser.mockResolvedValue({ user: { id: CONSULTOR_UUID }, error: null });
    mockGetUserRoles.mockResolvedValue([{ role_type: 'consultor' }]);
    mockGetHighestRole.mockReturnValue('consultor');
    mockCreateServiceRoleClient.mockReturnValue(makeServiceClient());

    const { req, res } = createMocks({
      method: 'POST',
      body: {
        consultant_id: CONSULTOR_UUID,
        hour_type_key: 'asesoria_tecnica_online',
        rate_eur: 45,
        effective_from: '2026-01-01',
      },
    });
    await indexHandler(req as never, res as never);
    expect(res._getStatusCode()).toBe(403);
  });

  it('returns 201 when admin creates a new rate', async () => {
    mockGetApiUser.mockResolvedValue({ user: { id: ADMIN_UUID }, error: null });
    mockGetUserRoles.mockResolvedValue([{ role_type: 'admin' }]);
    mockGetHighestRole.mockReturnValue('admin');

    const newRate = {
      id: RATE_UUID,
      consultant_id: CONSULTOR_UUID,
      hour_type_id: HOUR_TYPE_UUID,
      rate_eur: 45.0,
      effective_from: '2026-01-01',
      effective_to: null,
      created_at: '2026-02-24T00:00:00Z',
      updated_at: '2026-02-24T00:00:00Z',
      created_by: ADMIN_UUID,
    };

    const mockClient = {
      from: vi.fn((table: string) => {
        if (table === 'hour_types') {
          const chain = makeChain({ data: null, error: null });
          chain.single = vi.fn().mockResolvedValue({
            data: { id: HOUR_TYPE_UUID, key: 'asesoria_tecnica_online', is_active: true },
            error: null,
          });
          return chain;
        }
        if (table === 'profiles') {
          const chain = makeChain({ data: null, error: null });
          chain.single = vi.fn().mockResolvedValue({
            data: { id: CONSULTOR_UUID },
            error: null,
          });
          return chain;
        }
        if (table === 'consultant_rates') {
          // insert().select().single() chain
          const insertResult = makeChain({ data: null, error: null });
          insertResult.single = vi.fn().mockResolvedValue({ data: newRate, error: null });
          const outer = makeChain({ data: null, error: null });
          outer.insert = vi.fn().mockReturnValue(insertResult);
          return outer;
        }
        return makeChain({ data: null, error: null });
      }),
      rpc: vi.fn(),
    };
    mockCreateServiceRoleClient.mockReturnValue(mockClient);

    const { req, res } = createMocks({
      method: 'POST',
      body: {
        consultant_id: CONSULTOR_UUID,
        hour_type_key: 'asesoria_tecnica_online',
        rate_eur: 45,
        effective_from: '2026-01-01',
      },
    });
    await indexHandler(req as never, res as never);
    expect(res._getStatusCode()).toBe(201);
    const body = res._getJSONData();
    expect(body.data.rate.rate_eur).toBe(45.0);
  });

  it('returns 409 when overlapping rate range exists', async () => {
    mockGetApiUser.mockResolvedValue({ user: { id: ADMIN_UUID }, error: null });
    mockGetUserRoles.mockResolvedValue([{ role_type: 'admin' }]);
    mockGetHighestRole.mockReturnValue('admin');

    const mockClient = {
      from: vi.fn((table: string) => {
        if (table === 'hour_types') {
          const chain = makeChain({ data: null, error: null });
          chain.single = vi.fn().mockResolvedValue({
            data: { id: HOUR_TYPE_UUID, key: 'asesoria_tecnica_online', is_active: true },
            error: null,
          });
          return chain;
        }
        if (table === 'profiles') {
          const chain = makeChain({ data: null, error: null });
          chain.single = vi.fn().mockResolvedValue({
            data: { id: CONSULTOR_UUID },
            error: null,
          });
          return chain;
        }
        if (table === 'consultant_rates') {
          // Simulate exclusion constraint violation
          const insertResult = makeChain({ data: null, error: null });
          insertResult.single = vi.fn().mockResolvedValue({
            data: null,
            error: { code: '23P01', message: 'conflicting key value violates exclusion constraint' },
          });
          const outer = makeChain({ data: null, error: null });
          outer.insert = vi.fn().mockReturnValue(insertResult);
          return outer;
        }
        return makeChain({ data: null, error: null });
      }),
      rpc: vi.fn(),
    };
    mockCreateServiceRoleClient.mockReturnValue(mockClient);

    const { req, res } = createMocks({
      method: 'POST',
      body: {
        consultant_id: CONSULTOR_UUID,
        hour_type_key: 'asesoria_tecnica_online',
        rate_eur: 50,
        effective_from: '2025-06-01',
      },
    });
    await indexHandler(req as never, res as never);
    expect(res._getStatusCode()).toBe(409);
    const body = res._getJSONData();
    expect(body.error).toMatch(/tarifa activa|superponerse/i);
  });

  it('returns 400 when invalid hour_type_key is provided', async () => {
    mockGetApiUser.mockResolvedValue({ user: { id: ADMIN_UUID }, error: null });
    mockGetUserRoles.mockResolvedValue([{ role_type: 'admin' }]);
    mockGetHighestRole.mockReturnValue('admin');

    const mockClient = {
      from: vi.fn((table: string) => {
        if (table === 'hour_types') {
          const chain = makeChain({ data: null, error: null });
          chain.single = vi.fn().mockResolvedValue({
            data: null,
            error: { message: 'Not found' },
          });
          return chain;
        }
        return makeChain({ data: null, error: null });
      }),
      rpc: vi.fn(),
    };
    mockCreateServiceRoleClient.mockReturnValue(mockClient);

    const { req, res } = createMocks({
      method: 'POST',
      body: {
        consultant_id: CONSULTOR_UUID,
        hour_type_key: 'tipo_inexistente',
        rate_eur: 45,
        effective_from: '2026-01-01',
      },
    });
    await indexHandler(req as never, res as never);
    expect(res._getStatusCode()).toBe(400);
    const body = res._getJSONData();
    expect(body.error).toMatch(/tipo de hora/i);
  });
});

// ============================================================
// GET /api/admin/consultant-rates/[id]
// ============================================================

describe('GET /api/admin/consultant-rates/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 for invalid UUID', async () => {
    mockGetApiUser.mockResolvedValue({ user: { id: ADMIN_UUID }, error: null });

    const { req, res } = createMocks({ method: 'GET', query: { id: 'not-a-uuid' } });
    await idHandler(req as never, res as never);
    expect(res._getStatusCode()).toBe(400);
  });

  it('consultant GETs own rates — returns 200', async () => {
    mockGetApiUser.mockResolvedValue({ user: { id: CONSULTOR_UUID }, error: null });
    mockGetUserRoles.mockResolvedValue([{ role_type: 'consultor' }]);
    mockGetHighestRole.mockReturnValue('consultor');

    const fakeRates = [
      {
        id: RATE_UUID,
        consultant_id: CONSULTOR_UUID,
        rate_eur: 45.0,
        effective_from: '2026-01-01',
        effective_to: null,
        hour_types: { id: HOUR_TYPE_UUID, key: 'asesoria_tecnica_online', display_name: 'Asesoria Tecnica Online' },
      },
    ];

    const chain = makeChain({ data: fakeRates, error: null });
    chain.order = vi.fn().mockResolvedValue({ data: fakeRates, error: null });

    const mockClient = {
      from: vi.fn((table: string) => {
        if (table === 'consultant_rates') return chain;
        return makeChain({ data: null, error: null });
      }),
      rpc: vi.fn(),
    };
    mockCreateServiceRoleClient.mockReturnValue(mockClient);

    const { req, res } = createMocks({ method: 'GET', query: { id: CONSULTOR_UUID } });
    await idHandler(req as never, res as never);
    expect(res._getStatusCode()).toBe(200);
    const body = res._getJSONData();
    expect(body.data.rates).toHaveLength(1);
  });

  it('consultant GETs other consultant rates — returns 403', async () => {
    mockGetApiUser.mockResolvedValue({ user: { id: CONSULTOR_UUID }, error: null });
    mockGetUserRoles.mockResolvedValue([{ role_type: 'consultor' }]);
    mockGetHighestRole.mockReturnValue('consultor');
    mockCreateServiceRoleClient.mockReturnValue(makeServiceClient());

    const { req, res } = createMocks({ method: 'GET', query: { id: OTHER_UUID } });
    await idHandler(req as never, res as never);
    expect(res._getStatusCode()).toBe(403);
  });
});

// ============================================================
// PATCH /api/admin/consultant-rates/[id]
// ============================================================

describe('PATCH /api/admin/consultant-rates/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 409 when ledger entries exist for this consultant + hour_type', async () => {
    mockGetApiUser.mockResolvedValue({ user: { id: ADMIN_UUID }, error: null });
    mockGetUserRoles.mockResolvedValue([{ role_type: 'admin' }]);
    mockGetHighestRole.mockReturnValue('admin');

    let ratesCallCount = 0;

    const mockClient = {
      from: vi.fn((table: string) => {
        if (table === 'consultant_rates') {
          ratesCallCount++;
          if (ratesCallCount === 1) {
            // First call: verify rate exists
            const chain = makeChain({ data: null, error: null });
            chain.single = vi.fn().mockResolvedValue({
              data: {
                id: RATE_UUID,
                consultant_id: CONSULTOR_UUID,
                hour_type_id: HOUR_TYPE_UUID,
                effective_from: '2026-01-01',
              },
              error: null,
            });
            return chain;
          }
          return makeChain({ data: null, error: null });
        }
        if (table === 'contract_hours_ledger') {
          // Single scoped query returns entries → triggers 409
          const chain = makeChain({ data: null, error: null });
          chain.limit = vi.fn().mockResolvedValue({ data: [{ id: 'ledger-1' }], error: null });
          return chain;
        }
        return makeChain({ data: null, error: null });
      }),
      rpc: vi.fn(),
    };
    mockCreateServiceRoleClient.mockReturnValue(mockClient);

    const { req, res } = createMocks({
      method: 'PATCH',
      query: { id: RATE_UUID },
      body: { rate_eur: 60 },
    });
    await idHandler(req as never, res as never);
    expect(res._getStatusCode()).toBe(409);
  });
});

// ============================================================
// DELETE /api/admin/consultant-rates/[id]
// ============================================================

describe('DELETE /api/admin/consultant-rates/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('soft-deletes rate by setting effective_to to today', async () => {
    mockGetApiUser.mockResolvedValue({ user: { id: ADMIN_UUID }, error: null });
    mockGetUserRoles.mockResolvedValue([{ role_type: 'admin' }]);
    mockGetHighestRole.mockReturnValue('admin');

    const today = new Date().toISOString().slice(0, 10);
    let ratesCallCount = 0;

    const mockClient = {
      from: vi.fn((table: string) => {
        if (table === 'consultant_rates') {
          ratesCallCount++;
          if (ratesCallCount === 1) {
            // First call: verify rate exists (effective_to is null → active)
            const chain = makeChain({ data: null, error: null });
            chain.single = vi.fn().mockResolvedValue({
              data: { id: RATE_UUID, effective_to: null },
              error: null,
            });
            return chain;
          }
          // Second call: update → return deactivated rate
          const chain = makeChain({ data: null, error: null });
          chain.single = vi.fn().mockResolvedValue({
            data: { id: RATE_UUID, effective_to: today },
            error: null,
          });
          chain.update = vi.fn().mockReturnValue(chain);
          return chain;
        }
        return makeChain({ data: null, error: null });
      }),
      rpc: vi.fn(),
    };
    mockCreateServiceRoleClient.mockReturnValue(mockClient);

    const { req, res } = createMocks({
      method: 'DELETE',
      query: { id: RATE_UUID },
    });
    await idHandler(req as never, res as never);
    expect(res._getStatusCode()).toBe(200);
    const body = res._getJSONData();
    expect(body.data.rate.effective_to).toBe(today);
  });

  it('returns 403 when non-admin tries to delete', async () => {
    mockGetApiUser.mockResolvedValue({ user: { id: CONSULTOR_UUID }, error: null });
    mockGetUserRoles.mockResolvedValue([{ role_type: 'consultor' }]);
    mockGetHighestRole.mockReturnValue('consultor');
    mockCreateServiceRoleClient.mockReturnValue(makeServiceClient());

    const { req, res } = createMocks({ method: 'DELETE', query: { id: RATE_UUID } });
    await idHandler(req as never, res as never);
    expect(res._getStatusCode()).toBe(403);
  });
});
