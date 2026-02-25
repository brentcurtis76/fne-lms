// @vitest-environment node
/**
 * Unit tests for GET /api/contracts/[id]/hours/ledger/csv
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';

const ADMIN_UUID = '550e8400-e29b-41d4-a716-446655440001';
const CONTRACT_UUID = '550e8400-e29b-41d4-a716-446655440002';
const ED_USER_UUID = '550e8400-e29b-41d4-a716-446655440003';

// Hoisted mocks
const { mockGetApiUser, mockCreateServiceRoleClient } = vi.hoisted(() => ({
  mockGetApiUser: vi.fn(),
  mockCreateServiceRoleClient: vi.fn(),
}));

vi.mock('../../../lib/api-auth', () => ({
  getApiUser: mockGetApiUser,
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

vi.mock('../../../utils/roleUtils', () => ({
  getUserRoles: vi.fn(),
  getHighestRole: vi.fn(),
}));

import handler from '../../../pages/api/contracts/[id]/hours/ledger/csv';
import { getUserRoles, getHighestRole } from '../../../utils/roleUtils';

const mockGetUserRoles = getUserRoles as ReturnType<typeof vi.fn>;
const mockGetHighestRole = getHighestRole as ReturnType<typeof vi.fn>;

function makeChain(resolvedValue: unknown) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(resolvedValue),
    order: vi.fn().mockResolvedValue(resolvedValue),
  };
  return chain;
}

describe('GET /api/contracts/[id]/hours/ledger/csv', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when unauthenticated', async () => {
    mockGetApiUser.mockResolvedValue({ user: null, error: new Error('No session') });

    const { req, res } = createMocks({
      method: 'GET',
      query: { id: CONTRACT_UUID },
    });

    await handler(req as never, res as never);
    expect(res._getStatusCode()).toBe(401);
  });

  it('returns 405 for non-GET method', async () => {
    const { req, res } = createMocks({
      method: 'POST',
      query: { id: CONTRACT_UUID },
    });

    await handler(req as never, res as never);
    expect(res._getStatusCode()).toBe(405);
  });

  it('returns 403 when user role is not admin, consultor, or equipo_directivo', async () => {
    mockGetApiUser.mockResolvedValue({ user: { id: 'other-user' }, error: null });
    mockGetUserRoles.mockResolvedValue([{ role: 'estudiante' }]);
    mockGetHighestRole.mockReturnValue('estudiante');

    const mockClient = {
      from: vi.fn().mockReturnValue(makeChain({ data: null, error: null })),
      rpc: vi.fn(),
    };
    mockCreateServiceRoleClient.mockReturnValue(mockClient);

    const { req, res } = createMocks({
      method: 'GET',
      query: { id: CONTRACT_UUID },
    });

    await handler(req as never, res as never);
    expect(res._getStatusCode()).toBe(403);
  });

  it('returns 400 for invalid contract UUID', async () => {
    mockGetApiUser.mockResolvedValue({ user: { id: ADMIN_UUID }, error: null });

    const { req, res } = createMocks({
      method: 'GET',
      query: { id: 'not-a-uuid' },
    });

    await handler(req as never, res as never);
    expect(res._getStatusCode()).toBe(400);
  });

  it('admin gets CSV with correct content-type header', async () => {
    mockGetApiUser.mockResolvedValue({ user: { id: ADMIN_UUID }, error: null });
    mockGetUserRoles.mockResolvedValue([{ role: 'admin' }]);
    mockGetHighestRole.mockReturnValue('admin');

    const allocations = [
      { id: 'alloc-1', hour_types: { display_name: 'Asesoría Técnica Online' } },
    ];
    const ledgerData = [
      {
        allocation_id: 'alloc-1',
        session_id: 'sess-1',
        hours: 2.5,
        status: 'consumida',
        session_date: '2026-02-01',
        is_manual: false,
        consultor_sessions: {
          title: 'Sesión de prueba',
          session_facilitators: [
            { profiles: { first_name: 'Juan', last_name: 'Pérez' } },
          ],
        },
      },
    ];

    let fromCallCount = 0;
    const mockClient = {
      from: vi.fn((table: string) => {
        if (table === 'contract_hour_allocations') {
          fromCallCount++;
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ data: allocations, error: null }),
          };
        }
        // ledger query
        return {
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: ledgerData, error: null }),
        };
      }),
    };
    mockCreateServiceRoleClient.mockReturnValue(mockClient);

    const { req, res } = createMocks({
      method: 'GET',
      query: { id: CONTRACT_UUID },
    });

    await handler(req as never, res as never);
    expect(res._getStatusCode()).toBe(200);
    expect(res.getHeader('Content-Type')).toContain('text/csv');
  });

  it('equipo_directivo user gets 200 for own school contract', async () => {
    mockGetApiUser.mockResolvedValue({ user: { id: ED_USER_UUID }, error: null });
    mockGetUserRoles.mockResolvedValue([{ role: 'equipo_directivo', school_id: 99 }]);
    mockGetHighestRole.mockReturnValue('equipo_directivo');

    const mockClient = {
      from: vi.fn((table: string) => {
        if (table === 'contratos') {
          // Returns a contract with school_id=99 (matching user's school)
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: { clientes: { school_id: 99 } },
              error: null,
            }),
          };
        }
        if (table === 'contract_hour_allocations') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ data: [], error: null }),
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      }),
    };
    mockCreateServiceRoleClient.mockReturnValue(mockClient);

    const { req, res } = createMocks({
      method: 'GET',
      query: { id: CONTRACT_UUID },
    });

    await handler(req as never, res as never);
    expect(res._getStatusCode()).toBe(200);
    expect(res.getHeader('Content-Type')).toContain('text/csv');
  });

  it('CSV output contains correct column headers', async () => {
    mockGetApiUser.mockResolvedValue({ user: { id: ADMIN_UUID }, error: null });
    mockGetUserRoles.mockResolvedValue([{ role: 'admin' }]);
    mockGetHighestRole.mockReturnValue('admin');

    const mockClient = {
      from: vi.fn((table: string) => {
        if (table === 'contract_hour_allocations') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ data: [], error: null }),
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      }),
    };
    mockCreateServiceRoleClient.mockReturnValue(mockClient);

    const { req, res } = createMocks({
      method: 'GET',
      query: { id: CONTRACT_UUID },
    });

    await handler(req as never, res as never);
    expect(res._getStatusCode()).toBe(200);
    const body = res._getData() as string;
    // Should contain headers (may have BOM prefix)
    expect(body).toContain('Fecha');
    expect(body).toContain('Sesión');
    expect(body).toContain('Tipo de Hora');
    expect(body).toContain('Consultor');
    expect(body).toContain('Horas');
    expect(body).toContain('Estado');
  });
});
