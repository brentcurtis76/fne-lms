// @vitest-environment node
/**
 * Unit tests for POST /api/contracts/[id]/hours/allocate
 * and DELETE /api/contracts/[id]/hours/allocate
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';

const ADMIN_UUID = '550e8400-e29b-41d4-a716-446655440001';
const CONTRACT_UUID = '550e8400-e29b-41d4-a716-446655440002';

// Hoisted mocks
const { mockCheckIsAdmin, mockCreateServiceRoleClient } = vi.hoisted(() => ({
  mockCheckIsAdmin: vi.fn(),
  mockCreateServiceRoleClient: vi.fn(),
}));

vi.mock('../../../lib/api-auth', () => ({
  checkIsAdmin: mockCheckIsAdmin,
  createServiceRoleClient: mockCreateServiceRoleClient,
  sendAuthError: vi.fn((res: { status: (code: number) => { json: (data: unknown) => void } }, msg?: string, status?: number) => {
    res.status(status || 401).json({ error: msg || 'Authentication required' });
  }),
  sendApiResponse: vi.fn((res: { status: (code: number) => { json: (data: unknown) => void } }, data: unknown, status?: number) => {
    res.status(status || 200).json({ data });
  }),
  logApiRequest: vi.fn(),
  handleMethodNotAllowed: vi.fn((res: { status: (code: number) => { json: (data: unknown) => void } }) => {
    res.status(405).json({ error: 'Method not allowed' });
  }),
}));

import handler from '../../../pages/api/contracts/[id]/hours/allocate';

// Helper to build a chainable Supabase query mock
function makeChain(result: unknown) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(result),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(result),
  };
  return chain;
}

function makeServiceClient(tableMap: Record<string, unknown>) {
  return {
    from: vi.fn((table: string) => {
      const result = tableMap[table] ?? { data: null, error: null };
      return makeChain(result);
    }),
    rpc: vi.fn(),
  };
}

const validAllocations = [
  { hour_type_key: 'coaching_individual', hours: 10, is_fixed: false },
  { hour_type_key: 'coaching_grupal', hours: 10, is_fixed: false },
  { hour_type_key: 'talleres_presenciales', hours: 10, is_fixed: false },
  { hour_type_key: 'talleres_online', hours: 10, is_fixed: false },
  { hour_type_key: 'visitas_aula', hours: 10, is_fixed: false },
  { hour_type_key: 'reunion_equipo', hours: 10, is_fixed: false },
  { hour_type_key: 'seguimiento_directivo', hours: 10, is_fixed: false },
  { hour_type_key: 'planificacion', hours: 10, is_fixed: false },
  { hour_type_key: 'online_learning', hours: 10, is_fixed: false },
];
// Total = 90 hours, matches horas_contratadas=90

describe('POST /api/contracts/[id]/hours/allocate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 403 when user is not admin', async () => {
    mockCheckIsAdmin.mockResolvedValue({ isAdmin: false, user: null, error: null });

    const { req, res } = createMocks({
      method: 'POST',
      query: { id: CONTRACT_UUID },
      body: { allocations: validAllocations },
    });

    await handler(req as never, res as never);
    expect(res._getStatusCode()).toBe(403);
  });

  it('returns 201 with valid allocation across 9 buckets', async () => {
    mockCheckIsAdmin.mockResolvedValue({ isAdmin: true, user: { id: ADMIN_UUID }, error: null });

    const insertedRows = validAllocations.map((a) => ({
      id: `alloc-${a.hour_type_key}`,
      contrato_id: CONTRACT_UUID,
      hour_type_id: `ht-${a.hour_type_key}`,
      allocated_hours: a.hours,
      is_fixed_allocation: a.is_fixed,
      created_by: ADMIN_UUID,
    }));

    const hourTypeRows = validAllocations.map((a) => ({
      id: `ht-${a.hour_type_key}`,
      key: a.hour_type_key,
      is_active: true,
    }));

    const mockClient = {
      from: vi.fn((table: string) => {
        if (table === 'contratos') {
          return {
            ...makeChain({ data: { id: CONTRACT_UUID, estado: 'activo', horas_contratadas: 90 }, error: null }),
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: { id: CONTRACT_UUID, estado: 'activo', horas_contratadas: 90 }, error: null }),
          };
        }
        if (table === 'contract_hour_allocations') {
          // First call: check existing (returns empty), second call: insert
          const chain = {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            in: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
            insert: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
          };
          // Override insert chain to return inserted rows
          const insertChain = {
            select: vi.fn().mockResolvedValue({ data: insertedRows, error: null }),
          };
          chain.insert = vi.fn().mockReturnValue(insertChain);
          return chain;
        }
        if (table === 'hour_types') {
          return {
            select: vi.fn().mockReturnThis(),
            in: vi.fn().mockResolvedValue({ data: hourTypeRows, error: null }),
          };
        }
        return makeChain({ data: null, error: null });
      }),
      rpc: vi.fn(),
    };

    mockCreateServiceRoleClient.mockReturnValue(mockClient);

    const { req, res } = createMocks({
      method: 'POST',
      query: { id: CONTRACT_UUID },
      body: { allocations: validAllocations },
    });

    await handler(req as never, res as never);
    expect(res._getStatusCode()).toBe(201);
  });

  it('returns 400 when sum of hours does not match horas_contratadas', async () => {
    mockCheckIsAdmin.mockResolvedValue({ isAdmin: true, user: { id: ADMIN_UUID }, error: null });

    const mockClient = {
      from: vi.fn((table: string) => {
        if (table === 'contratos') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: { id: CONTRACT_UUID, estado: 'activo', horas_contratadas: 100 }, error: null }),
          };
        }
        return makeChain({ data: [], error: null });
      }),
    };
    mockCreateServiceRoleClient.mockReturnValue(mockClient);

    // Total = 90 but horas_contratadas = 100
    const { req, res } = createMocks({
      method: 'POST',
      query: { id: CONTRACT_UUID },
      body: { allocations: validAllocations },
    });

    await handler(req as never, res as never);
    expect(res._getStatusCode()).toBe(400);
    const body = res._getJSONData();
    expect(body.error).toMatch(/no coincide con las horas contratadas/);
  });

  it('returns 400 when duplicate hour_type_keys provided', async () => {
    mockCheckIsAdmin.mockResolvedValue({ isAdmin: true, user: { id: ADMIN_UUID }, error: null });

    const mockClient = {
      from: vi.fn((table: string) => {
        if (table === 'contratos') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: { id: CONTRACT_UUID, estado: 'activo', horas_contratadas: 20 }, error: null }),
          };
        }
        if (table === 'contract_hour_allocations') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          };
        }
        return makeChain({ data: null, error: null });
      }),
    };
    mockCreateServiceRoleClient.mockReturnValue(mockClient);

    // Duplicate key: coaching_individual appears twice
    const { req, res } = createMocks({
      method: 'POST',
      query: { id: CONTRACT_UUID },
      body: {
        allocations: [
          { hour_type_key: 'coaching_individual', hours: 10, is_fixed: false },
          { hour_type_key: 'coaching_individual', hours: 10, is_fixed: false },
        ],
      },
    });

    await handler(req as never, res as never);
    expect(res._getStatusCode()).toBe(400);
    const body = res._getJSONData();
    expect(body.error).toMatch(/solo puede aparecer una vez/);
  });

  it('returns 400 when contract is not activo', async () => {
    mockCheckIsAdmin.mockResolvedValue({ isAdmin: true, user: { id: ADMIN_UUID }, error: null });

    const mockClient = {
      from: vi.fn((table: string) => {
        if (table === 'contratos') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: { id: CONTRACT_UUID, estado: 'pendiente', horas_contratadas: 90 }, error: null }),
          };
        }
        return makeChain({ data: null, error: null });
      }),
    };
    mockCreateServiceRoleClient.mockReturnValue(mockClient);

    const { req, res } = createMocks({
      method: 'POST',
      query: { id: CONTRACT_UUID },
      body: { allocations: validAllocations },
    });

    await handler(req as never, res as never);
    expect(res._getStatusCode()).toBe(400);
    const body = res._getJSONData();
    expect(body.error).toMatch(/contratos activos/);
  });

  it('returns 400 when contract already has allocations', async () => {
    mockCheckIsAdmin.mockResolvedValue({ isAdmin: true, user: { id: ADMIN_UUID }, error: null });

    const mockClient = {
      from: vi.fn((table: string) => {
        if (table === 'contratos') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: { id: CONTRACT_UUID, estado: 'activo', horas_contratadas: 90 }, error: null }),
          };
        }
        if (table === 'contract_hour_allocations') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({ data: [{ id: 'existing-alloc' }], error: null }),
          };
        }
        return makeChain({ data: null, error: null });
      }),
    };
    mockCreateServiceRoleClient.mockReturnValue(mockClient);

    const { req, res } = createMocks({
      method: 'POST',
      query: { id: CONTRACT_UUID },
      body: { allocations: validAllocations },
    });

    await handler(req as never, res as never);
    expect(res._getStatusCode()).toBe(400);
    const body = res._getJSONData();
    expect(body.error).toMatch(/ya tiene horas asignadas/);
  });

  it('returns 400 when is_fixed is used for non-online_learning key', async () => {
    mockCheckIsAdmin.mockResolvedValue({ isAdmin: true, user: { id: ADMIN_UUID }, error: null });

    const hourTypeRows = [
      { id: 'ht-coaching_individual', key: 'coaching_individual', is_active: true },
    ];

    const mockClient = {
      from: vi.fn((table: string) => {
        if (table === 'contratos') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: { id: CONTRACT_UUID, estado: 'activo', horas_contratadas: 10 }, error: null }),
          };
        }
        if (table === 'contract_hour_allocations') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          };
        }
        if (table === 'hour_types') {
          return {
            select: vi.fn().mockReturnThis(),
            in: vi.fn().mockResolvedValue({ data: hourTypeRows, error: null }),
          };
        }
        return makeChain({ data: null, error: null });
      }),
    };
    mockCreateServiceRoleClient.mockReturnValue(mockClient);

    const { req, res } = createMocks({
      method: 'POST',
      query: { id: CONTRACT_UUID },
      body: {
        allocations: [
          { hour_type_key: 'coaching_individual', hours: 10, is_fixed: true }, // is_fixed invalid here
        ],
      },
    });

    await handler(req as never, res as never);
    expect(res._getStatusCode()).toBe(400);
    const body = res._getJSONData();
    expect(body.error).toMatch(/fijo.*solo es válida/);
  });
});

describe('DELETE /api/contracts/[id]/hours/allocate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 when allocations deleted successfully', async () => {
    mockCheckIsAdmin.mockResolvedValue({ isAdmin: true, user: { id: ADMIN_UUID }, error: null });

    const allocations = [{ id: 'alloc-1' }, { id: 'alloc-2' }];

    const mockClient = {
      from: vi.fn((table: string) => {
        if (table === 'contract_hour_allocations') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            delete: vi.fn().mockReturnThis(),
            // resolve to the allocations list for select, then void for delete
            then: undefined,
            _selectResult: allocations,
          };
        }
        if (table === 'contract_hours_ledger') {
          return {
            select: vi.fn().mockReturnThis(),
            in: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          };
        }
        return makeChain({ data: null, error: null });
      }),
    };

    // Override: allocation select returns list, delete returns success
    const allocChainSelect = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: allocations, error: null }),
    };
    const allocChainDelete = {
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: null, error: null }),
    };

    let allocCallCount = 0;
    mockClient.from = vi.fn((table: string) => {
      if (table === 'contract_hour_allocations') {
        allocCallCount++;
        if (allocCallCount === 1) return allocChainSelect as unknown as ReturnType<typeof makeChain>;
        return allocChainDelete as unknown as ReturnType<typeof makeChain>;
      }
      if (table === 'contract_hours_ledger') {
        return {
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      }
      return makeChain({ data: null, error: null });
    });

    mockCreateServiceRoleClient.mockReturnValue(mockClient);

    const { req, res } = createMocks({
      method: 'DELETE',
      query: { id: CONTRACT_UUID },
    });

    await handler(req as never, res as never);
    expect(res._getStatusCode()).toBe(200);
  });

  it('returns 409 when ledger entries exist (blocked deletion)', async () => {
    mockCheckIsAdmin.mockResolvedValue({ isAdmin: true, user: { id: ADMIN_UUID }, error: null });

    const allocations = [{ id: 'alloc-1' }];

    const allocChainSelect = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: allocations, error: null }),
    };

    const mockClient = {
      from: vi.fn((table: string) => {
        if (table === 'contract_hour_allocations') {
          return allocChainSelect;
        }
        if (table === 'contract_hours_ledger') {
          return {
            select: vi.fn().mockReturnThis(),
            in: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({ data: [{ id: 'ledger-1' }], error: null }),
          };
        }
        return makeChain({ data: null, error: null });
      }),
    };

    mockCreateServiceRoleClient.mockReturnValue(mockClient);

    const { req, res } = createMocks({
      method: 'DELETE',
      query: { id: CONTRACT_UUID },
    });

    await handler(req as never, res as never);
    expect(res._getStatusCode()).toBe(409);
    const body = res._getJSONData();
    expect(body.error).toMatch(/libro de horas/);
  });
});
