// @vitest-environment node
/**
 * Unit tests for PATCH /api/contracts/[id]/hours/reallocate
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

import handler from '../../../pages/api/contracts/[id]/hours/reallocate';

const HOUR_TYPES = [
  { id: 'ht-coaching_individual', key: 'coaching_individual' },
  { id: 'ht-coaching_grupal', key: 'coaching_grupal' },
  { id: 'ht-online_learning', key: 'online_learning' },
];

const ALLOCATIONS = [
  { id: 'alloc-ci', hour_type_id: 'ht-coaching_individual', allocated_hours: 20 },
  { id: 'alloc-cg', hour_type_id: 'ht-coaching_grupal', allocated_hours: 10 },
];

const BUCKET_SUMMARY = [
  {
    hour_type_key: 'coaching_individual',
    display_name: 'Coaching Individual',
    allocated_hours: 20,
    reserved_hours: 0,
    consumed_hours: 0,
    available_hours: 20,
    is_fixed_allocation: false,
    annex_hours: 0,
  },
  {
    hour_type_key: 'coaching_grupal',
    display_name: 'Coaching Grupal',
    allocated_hours: 10,
    reserved_hours: 0,
    consumed_hours: 0,
    available_hours: 10,
    is_fixed_allocation: false,
    annex_hours: 0,
  },
];

function buildMockClient(
  hourTypesResult = HOUR_TYPES,
  allocationsResult = ALLOCATIONS,
  bucketSummaryResult = BUCKET_SUMMARY,
  updateFromError: { message: string } | null = null,
  updateToError: { message: string } | null = null
) {
  // Shared counter for update calls — must be outside the from() closure
  let updateCallCount = 0;

  const updateChainEq = vi.fn().mockImplementation(() => {
    updateCallCount++;
    const err = updateCallCount === 1 ? updateFromError : updateToError;
    return Promise.resolve({ data: null, error: err });
  });

  return {
    from: vi.fn((table: string) => {
      if (table === 'hour_types') {
        return {
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockResolvedValue({ data: hourTypesResult, error: null }),
        };
      }
      if (table === 'contract_hour_allocations') {
        const updateChain = {
          eq: updateChainEq,
        };
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockResolvedValue({ data: allocationsResult, error: null }),
          update: vi.fn().mockReturnValue(updateChain),
        };
      }
      if (table === 'contract_hour_reallocation_log') {
        return {
          insert: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
    }),
    rpc: vi.fn().mockResolvedValue({ data: bucketSummaryResult, error: null }),
  };
}

describe('PATCH /api/contracts/[id]/hours/reallocate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 403 when user is not admin', async () => {
    mockCheckIsAdmin.mockResolvedValue({ isAdmin: false, user: null, error: null });

    const { req, res } = createMocks({
      method: 'PATCH',
      query: { id: CONTRACT_UUID },
      body: {
        from_hour_type_key: 'coaching_individual',
        to_hour_type_key: 'coaching_grupal',
        hours: 5,
        reason: 'Ajuste por necesidades del programa',
      },
    });

    await handler(req as never, res as never);
    expect(res._getStatusCode()).toBe(403);
  });

  it('returns 200 with updated bucket summary on valid reallocation', async () => {
    mockCheckIsAdmin.mockResolvedValue({ isAdmin: true, user: { id: ADMIN_UUID }, error: null });
    mockCreateServiceRoleClient.mockReturnValue(buildMockClient());

    const { req, res } = createMocks({
      method: 'PATCH',
      query: { id: CONTRACT_UUID },
      body: {
        from_hour_type_key: 'coaching_individual',
        to_hour_type_key: 'coaching_grupal',
        hours: 5,
        reason: 'Ajuste por necesidades del programa',
      },
    });

    await handler(req as never, res as never);
    expect(res._getStatusCode()).toBe(200);
    const body = res._getJSONData();
    expect(body.data).toHaveProperty('buckets');
  });

  it('returns 400 when from bucket available hours < requested hours', async () => {
    mockCheckIsAdmin.mockResolvedValue({ isAdmin: true, user: { id: ADMIN_UUID }, error: null });

    // Bucket with only 2 hours available
    const lowAvailBuckets = [
      { ...BUCKET_SUMMARY[0], available_hours: 2 },
      BUCKET_SUMMARY[1],
    ];
    mockCreateServiceRoleClient.mockReturnValue(buildMockClient(HOUR_TYPES, ALLOCATIONS, lowAvailBuckets));

    const { req, res } = createMocks({
      method: 'PATCH',
      query: { id: CONTRACT_UUID },
      body: {
        from_hour_type_key: 'coaching_individual',
        to_hour_type_key: 'coaching_grupal',
        hours: 5, // requesting 5 but only 2 available
        reason: 'Ajuste por necesidades del programa',
      },
    });

    await handler(req as never, res as never);
    expect(res._getStatusCode()).toBe(400);
    const body = res._getJSONData();
    expect(body.error).toMatch(/No hay suficientes horas disponibles/);
  });

  it('returns 400 when trying to reallocate from or to online_learning', async () => {
    mockCheckIsAdmin.mockResolvedValue({ isAdmin: true, user: { id: ADMIN_UUID }, error: null });
    mockCreateServiceRoleClient.mockReturnValue(buildMockClient());

    const { req, res } = createMocks({
      method: 'PATCH',
      query: { id: CONTRACT_UUID },
      body: {
        from_hour_type_key: 'online_learning',
        to_hour_type_key: 'coaching_individual',
        hours: 5,
        reason: 'Ajuste por necesidades del programa',
      },
    });

    await handler(req as never, res as never);
    expect(res._getStatusCode()).toBe(400);
    const body = res._getJSONData();
    expect(body.error).toMatch(/Cursos Online \(LMS\)/);
  });

  it('returns 400 when from equals to', async () => {
    mockCheckIsAdmin.mockResolvedValue({ isAdmin: true, user: { id: ADMIN_UUID }, error: null });
    mockCreateServiceRoleClient.mockReturnValue(buildMockClient());

    const { req, res } = createMocks({
      method: 'PATCH',
      query: { id: CONTRACT_UUID },
      body: {
        from_hour_type_key: 'coaching_individual',
        to_hour_type_key: 'coaching_individual',
        hours: 5,
        reason: 'Ajuste por necesidades del programa',
      },
    });

    await handler(req as never, res as never);
    expect(res._getStatusCode()).toBe(400);
    const body = res._getJSONData();
    expect(body.error).toMatch(/origen y destino deben ser diferentes/);
  });

  it('creates a log entry when reallocation succeeds', async () => {
    mockCheckIsAdmin.mockResolvedValue({ isAdmin: true, user: { id: ADMIN_UUID }, error: null });

    const logInsertMock = vi.fn().mockResolvedValue({ data: null, error: null });
    const customClient = {
      from: vi.fn((table: string) => {
        if (table === 'hour_types') {
          return {
            select: vi.fn().mockReturnThis(),
            in: vi.fn().mockResolvedValue({ data: HOUR_TYPES, error: null }),
          };
        }
        if (table === 'contract_hour_allocations') {
          const updateChain = {
            update: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ data: null, error: null }),
          };
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            in: vi.fn().mockResolvedValue({ data: ALLOCATIONS, error: null }),
            update: vi.fn().mockReturnValue(updateChain),
          };
        }
        if (table === 'contract_hour_reallocation_log') {
          return { insert: logInsertMock };
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
      }),
      rpc: vi.fn().mockResolvedValue({ data: BUCKET_SUMMARY, error: null }),
    };

    mockCreateServiceRoleClient.mockReturnValue(customClient);

    const { req, res } = createMocks({
      method: 'PATCH',
      query: { id: CONTRACT_UUID },
      body: {
        from_hour_type_key: 'coaching_individual',
        to_hour_type_key: 'coaching_grupal',
        hours: 5,
        reason: 'Ajuste por necesidades del programa educativo',
      },
    });

    await handler(req as never, res as never);
    expect(res._getStatusCode()).toBe(200);
    // Verify the log insert was called
    expect(logInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        contrato_id: CONTRACT_UUID,
        from_hour_type_id: 'ht-coaching_individual',
        to_hour_type_id: 'ht-coaching_grupal',
        hours: 5,
        reason: 'Ajuste por necesidades del programa educativo',
        created_by: ADMIN_UUID,
      })
    );
  });
});
