// @vitest-environment node
/**
 * Unit tests for GET /api/school-hours-report/[school_id]
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';

const ADMIN_UUID = '550e8400-e29b-41d4-a716-446655440001';
const DIRECTIVO_UUID = '550e8400-e29b-41d4-a716-446655440002';
const OTHER_UUID = '550e8400-e29b-41d4-a716-446655440003';
const SCHOOL_ID = 42;
const OTHER_SCHOOL_ID = 99;
const CLIENTE_UUID = '550e8400-e29b-41d4-a716-446655440030';

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

import handler from '../../../pages/api/school-hours-report/[school_id]/index';

// ============================================================
// Chain helpers
// ============================================================

function makeChain(result: unknown) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  const methods = ['select', 'eq', 'in', 'order', 'limit'];
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain.single = vi.fn().mockResolvedValue(result);
  chain.maybeSingle = vi.fn().mockResolvedValue(result);
  return chain;
}

/**
 * Build a mock client that:
 * - schools: returns { id: schoolId, name: schoolName }
 * - clientes: returns empty (no clients → returns empty programs)
 * - contratos: not reached
 */
function makeEmptySchoolClient(schoolId = SCHOOL_ID, schoolName = 'Escuela Test') {
  return {
    from: vi.fn((table: string) => {
      if (table === 'schools') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { id: schoolId, name: schoolName }, error: null }),
        };
      }
      if (table === 'clientes') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      }
      if (table === 'contratos') {
        return {
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      }
      return makeChain({ data: null, error: null });
    }),
    rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
  };
}

// ============================================================
// Tests
// ============================================================

describe('GET /api/school-hours-report/[school_id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 for unauthenticated requests', async () => {
    mockGetApiUser.mockResolvedValue({ user: null, error: new Error('No session') });

    const { req, res } = createMocks({
      method: 'GET',
      query: { school_id: String(SCHOOL_ID) },
    });

    await handler(req as never, res as never);
    expect(res._getStatusCode()).toBe(401);
  });

  it('returns 400 for non-numeric school_id', async () => {
    mockGetApiUser.mockResolvedValue({ user: { id: ADMIN_UUID }, error: null });
    mockGetUserRoles.mockResolvedValue([{ role_type: 'admin', school_id: null }]);
    mockGetHighestRole.mockReturnValue('admin');

    const { req, res } = createMocks({
      method: 'GET',
      query: { school_id: 'not-a-number' },
    });

    await handler(req as never, res as never);
    expect(res._getStatusCode()).toBe(400);
    const body = res._getJSONData();
    expect(body.error).toMatch(/inválido/);
  });

  it('returns 405 for non-GET methods', async () => {
    const { req, res } = createMocks({
      method: 'POST',
      query: { school_id: String(SCHOOL_ID) },
    });

    await handler(req as never, res as never);
    expect(res._getStatusCode()).toBe(405);
  });

  it('returns 403 for unauthorized roles (docente)', async () => {
    mockGetApiUser.mockResolvedValue({ user: { id: OTHER_UUID }, error: null });
    mockGetUserRoles.mockResolvedValue([{ role_type: 'docente', school_id: SCHOOL_ID }]);
    mockGetHighestRole.mockReturnValue('docente');

    const mockClient = makeEmptySchoolClient();
    mockCreateServiceRoleClient.mockReturnValue(mockClient);

    const { req, res } = createMocks({
      method: 'GET',
      query: { school_id: String(SCHOOL_ID) },
    });

    await handler(req as never, res as never);
    expect(res._getStatusCode()).toBe(403);
    const body = res._getJSONData();
    expect(body.error).toMatch(/[Dd]enegado/);
  });

  it('returns 403 when equipo_directivo tries to view another school', async () => {
    mockGetApiUser.mockResolvedValue({ user: { id: DIRECTIVO_UUID }, error: null });
    // User is directivo of school 42, not school 99
    mockGetUserRoles.mockResolvedValue([{ role_type: 'equipo_directivo', school_id: SCHOOL_ID }]);
    mockGetHighestRole.mockReturnValue('equipo_directivo');

    const mockClient = makeEmptySchoolClient(OTHER_SCHOOL_ID);
    mockCreateServiceRoleClient.mockReturnValue(mockClient);

    const { req, res } = createMocks({
      method: 'GET',
      query: { school_id: String(OTHER_SCHOOL_ID) },
    });

    await handler(req as never, res as never);
    expect(res._getStatusCode()).toBe(403);
    const body = res._getJSONData();
    expect(body.error).toMatch(/permisos/);
  });

  it('returns 200 when equipo_directivo views their own school', async () => {
    mockGetApiUser.mockResolvedValue({ user: { id: DIRECTIVO_UUID }, error: null });
    mockGetUserRoles.mockResolvedValue([{ role_type: 'equipo_directivo', school_id: SCHOOL_ID }]);
    mockGetHighestRole.mockReturnValue('equipo_directivo');

    const mockClient = makeEmptySchoolClient(SCHOOL_ID, 'Escuela Test');
    mockCreateServiceRoleClient.mockReturnValue(mockClient);

    const { req, res } = createMocks({
      method: 'GET',
      query: { school_id: String(SCHOOL_ID) },
    });

    await handler(req as never, res as never);
    expect(res._getStatusCode()).toBe(200);
    const body = res._getJSONData();
    expect(body.data).toBeDefined();
    expect(body.data.school_id).toBe(SCHOOL_ID);
    expect(body.data.school_name).toBe('Escuela Test');
    expect(Array.isArray(body.data.programs)).toBe(true);
  });

  it('returns 200 when admin views any school', async () => {
    mockGetApiUser.mockResolvedValue({ user: { id: ADMIN_UUID }, error: null });
    mockGetUserRoles.mockResolvedValue([{ role_type: 'admin', school_id: null }]);
    mockGetHighestRole.mockReturnValue('admin');

    const mockClient = makeEmptySchoolClient(OTHER_SCHOOL_ID, 'Otra Escuela');
    mockCreateServiceRoleClient.mockReturnValue(mockClient);

    const { req, res } = createMocks({
      method: 'GET',
      query: { school_id: String(OTHER_SCHOOL_ID) },
    });

    await handler(req as never, res as never);
    expect(res._getStatusCode()).toBe(200);
    const body = res._getJSONData();
    expect(body.data.school_id).toBe(OTHER_SCHOOL_ID);
  });

  it('returns empty programs array when school has no active contracts', async () => {
    mockGetApiUser.mockResolvedValue({ user: { id: ADMIN_UUID }, error: null });
    mockGetUserRoles.mockResolvedValue([{ role_type: 'admin', school_id: null }]);
    mockGetHighestRole.mockReturnValue('admin');

    const mockClient = makeEmptySchoolClient(SCHOOL_ID, 'Escuela Sin Contratos');
    mockCreateServiceRoleClient.mockReturnValue(mockClient);

    const { req, res } = createMocks({
      method: 'GET',
      query: { school_id: String(SCHOOL_ID) },
    });

    await handler(req as never, res as never);
    expect(res._getStatusCode()).toBe(200);
    const body = res._getJSONData();
    expect(body.data.programs).toEqual([]);
  });

  it('groups contracts by programa_id correctly', async () => {
    mockGetApiUser.mockResolvedValue({ user: { id: ADMIN_UUID }, error: null });
    mockGetUserRoles.mockResolvedValue([{ role_type: 'admin', school_id: null }]);
    mockGetHighestRole.mockReturnValue('admin');

    const CONTRACT_UUID_1 = '550e8400-e29b-41d4-a716-446655440010';
    const CONTRACT_UUID_2 = '550e8400-e29b-41d4-a716-446655440011';
    const PROGRAMA_UUID = '550e8400-e29b-41d4-a716-446655440020';

    const mockContratos = [
      {
        id: CONTRACT_UUID_1,
        numero_contrato: 'CT-001',
        is_annexo: false,
        horas_contratadas: 100,
        programa_id: PROGRAMA_UUID,
        programas: { id: PROGRAMA_UUID, nombre: 'Programa Alpha' },
      },
      {
        id: CONTRACT_UUID_2,
        numero_contrato: 'CT-002',
        is_annexo: true,
        horas_contratadas: 20,
        programa_id: PROGRAMA_UUID,
        programas: { id: PROGRAMA_UUID, nombre: 'Programa Alpha' },
      },
    ];

    const mockBuckets = [
      {
        hour_type_key: 'asesoria_tecnica_presencial',
        display_name: 'Asesoría Técnica Presencial',
        allocated_hours: 50,
        reserved_hours: 10,
        consumed_hours: 30,
        available_hours: 20,
        is_fixed_allocation: false,
        annex_hours: 0,
      },
    ];

    const mockClient = {
      from: vi.fn((table: string) => {
        if (table === 'schools') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: { id: SCHOOL_ID, name: 'Escuela Test' }, error: null }),
          };
        }
        if (table === 'clientes') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ data: [{ id: CLIENTE_UUID }], error: null }),
          };
        }
        if (table === 'contratos') {
          return {
            select: vi.fn().mockReturnThis(),
            in: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ data: mockContratos, error: null }),
          };
        }
        if (table === 'consultor_sessions') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          };
        }
        return makeChain({ data: null, error: null });
      }),
      rpc: vi.fn().mockResolvedValue({ data: mockBuckets, error: null }),
    };
    mockCreateServiceRoleClient.mockReturnValue(mockClient);

    const { req, res } = createMocks({
      method: 'GET',
      query: { school_id: String(SCHOOL_ID) },
    });

    await handler(req as never, res as never);
    expect(res._getStatusCode()).toBe(200);
    const body = res._getJSONData();
    expect(body.data.programs).toHaveLength(1);
    expect(body.data.programs[0].programa_name).toBe('Programa Alpha');
    expect(body.data.programs[0].contracts).toHaveLength(2);
  });

  it('bucket summaries include correct consumed/reserved/available', async () => {
    mockGetApiUser.mockResolvedValue({ user: { id: ADMIN_UUID }, error: null });
    mockGetUserRoles.mockResolvedValue([{ role_type: 'admin', school_id: null }]);
    mockGetHighestRole.mockReturnValue('admin');

    const CONTRACT_UUID = '550e8400-e29b-41d4-a716-446655440010';
    const PROGRAMA_UUID = '550e8400-e29b-41d4-a716-446655440020';

    const mockContratos = [
      {
        id: CONTRACT_UUID,
        numero_contrato: 'CT-001',
        is_annexo: false,
        horas_contratadas: 100,
        programa_id: PROGRAMA_UUID,
        programas: { id: PROGRAMA_UUID, nombre: 'Programa Beta' },
      },
    ];

    const mockBuckets = [
      {
        hour_type_key: 'talleres_presenciales',
        display_name: 'Talleres Presenciales',
        allocated_hours: 100,
        reserved_hours: 20,
        consumed_hours: 50,
        available_hours: 30,
        is_fixed_allocation: false,
        annex_hours: 0,
      },
    ];

    const mockClient = {
      from: vi.fn((table: string) => {
        if (table === 'schools') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: { id: SCHOOL_ID, name: 'Escuela Test' }, error: null }),
          };
        }
        if (table === 'clientes') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ data: [{ id: CLIENTE_UUID }], error: null }),
          };
        }
        if (table === 'contratos') {
          return {
            select: vi.fn().mockReturnThis(),
            in: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ data: mockContratos, error: null }),
          };
        }
        if (table === 'consultor_sessions') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          };
        }
        return makeChain({ data: null, error: null });
      }),
      rpc: vi.fn().mockResolvedValue({ data: mockBuckets, error: null }),
    };
    mockCreateServiceRoleClient.mockReturnValue(mockClient);

    const { req, res } = createMocks({
      method: 'GET',
      query: { school_id: String(SCHOOL_ID) },
    });

    await handler(req as never, res as never);
    expect(res._getStatusCode()).toBe(200);
    const body = res._getJSONData();
    const contract = body.data.programs[0].contracts[0];
    expect(contract.buckets).toHaveLength(1);
    expect(contract.buckets[0].consumed).toBe(50);
    expect(contract.buckets[0].reserved).toBe(20);
    expect(contract.buckets[0].available).toBe(30);
  });
});
