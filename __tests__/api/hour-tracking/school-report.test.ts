// @vitest-environment node
/**
 * Unit tests for GET /api/school-hours-report/[school_id]
 *
 * The handler does RBAC then delegates to fetchSchoolReportData (mocked here).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';

const ADMIN_UUID = '550e8400-e29b-41d4-a716-446655440001';
const DIRECTIVO_UUID = '550e8400-e29b-41d4-a716-446655440002';
const OTHER_UUID = '550e8400-e29b-41d4-a716-446655440003';
const SCHOOL_ID = 42;
const OTHER_SCHOOL_ID = 99;

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

// Mock the shared service
vi.mock('../../../lib/services/school-hours-report', () => ({
  fetchSchoolReportData: vi.fn(),
}));

import handler from '../../../pages/api/school-hours-report/[school_id]/index';
import { fetchSchoolReportData } from '../../../lib/services/school-hours-report';
const mockFetchSchoolReportData = fetchSchoolReportData as ReturnType<typeof vi.fn>;

// ============================================================
// Helpers
// ============================================================

function setupAuth(userId: string, roleType: string, schoolId: number | null = null) {
  mockGetApiUser.mockResolvedValue({ user: { id: userId }, error: null });
  mockGetUserRoles.mockResolvedValue([{ role_type: roleType, school_id: schoolId }]);
  mockGetHighestRole.mockReturnValue(roleType);
  mockCreateServiceRoleClient.mockReturnValue({});
}

function makeSchoolReport(schoolId: number, schoolName: string, programs: unknown[] = []) {
  return { school_id: schoolId, school_name: schoolName, programs };
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
    setupAuth(OTHER_UUID, 'docente', SCHOOL_ID);

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
    setupAuth(DIRECTIVO_UUID, 'equipo_directivo', SCHOOL_ID);

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
    setupAuth(DIRECTIVO_UUID, 'equipo_directivo', SCHOOL_ID);
    mockFetchSchoolReportData.mockResolvedValue(makeSchoolReport(SCHOOL_ID, 'Escuela Test'));

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
    setupAuth(ADMIN_UUID, 'admin');
    mockFetchSchoolReportData.mockResolvedValue(makeSchoolReport(OTHER_SCHOOL_ID, 'Otra Escuela'));

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
    setupAuth(ADMIN_UUID, 'admin');
    mockFetchSchoolReportData.mockResolvedValue(makeSchoolReport(SCHOOL_ID, 'Escuela Sin Contratos'));

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
    setupAuth(ADMIN_UUID, 'admin');

    const CONTRACT_UUID_1 = '550e8400-e29b-41d4-a716-446655440010';
    const CONTRACT_UUID_2 = '550e8400-e29b-41d4-a716-446655440011';
    const PROGRAMA_UUID = '550e8400-e29b-41d4-a716-446655440020';

    mockFetchSchoolReportData.mockResolvedValue(makeSchoolReport(SCHOOL_ID, 'Escuela Test', [
      {
        programa_id: PROGRAMA_UUID,
        programa_name: 'Programa Alpha',
        contracts: [
          {
            contrato_id: CONTRACT_UUID_1,
            numero_contrato: 'CT-001',
            is_annexo: false,
            total_contracted_hours: 100,
            total_reserved: 10,
            total_consumed: 30,
            total_available: 20,
            buckets: [{
              hour_type_key: 'asesoria_tecnica_presencial',
              display_name: 'Asesoría Técnica Presencial',
              allocated: 50,
              reserved: 10,
              consumed: 30,
              available: 20,
              is_fixed: false,
              annex_hours: 0,
              sessions: [],
            }],
          },
          {
            contrato_id: CONTRACT_UUID_2,
            numero_contrato: 'CT-002',
            is_annexo: true,
            total_contracted_hours: 20,
            total_reserved: 0,
            total_consumed: 0,
            total_available: 0,
            buckets: [],
          },
        ],
      },
    ]));

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
    setupAuth(ADMIN_UUID, 'admin');

    const PROGRAMA_UUID = '550e8400-e29b-41d4-a716-446655440020';

    mockFetchSchoolReportData.mockResolvedValue(makeSchoolReport(SCHOOL_ID, 'Escuela Test', [
      {
        programa_id: PROGRAMA_UUID,
        programa_name: 'Programa Beta',
        contracts: [{
          contrato_id: '550e8400-e29b-41d4-a716-446655440010',
          numero_contrato: 'CT-001',
          is_annexo: false,
          total_contracted_hours: 100,
          total_reserved: 20,
          total_consumed: 50,
          total_available: 30,
          buckets: [{
            hour_type_key: 'talleres_presenciales',
            display_name: 'Talleres Presenciales',
            allocated: 100,
            reserved: 20,
            consumed: 50,
            available: 30,
            is_fixed: false,
            annex_hours: 0,
            sessions: [],
          }],
        }],
      },
    ]));

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

  it('returns 404 when fetchSchoolReportData returns null', async () => {
    setupAuth(ADMIN_UUID, 'admin');
    mockFetchSchoolReportData.mockResolvedValue(null);

    const { req, res } = createMocks({
      method: 'GET',
      query: { school_id: String(SCHOOL_ID) },
    });

    await handler(req as never, res as never);
    expect(res._getStatusCode()).toBe(404);
  });
});
