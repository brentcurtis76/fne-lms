// @vitest-environment node
/**
 * Unit tests for GET /api/school-hours-report/[school_id]/pdf
 *
 * PDF generation itself is mocked — we test RBAC and response headers.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';

const ADMIN_UUID = '550e8400-e29b-41d4-a716-446655440001';
const DIRECTIVO_UUID = '550e8400-e29b-41d4-a716-446655440002';
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

// Mock jsPDF and jspdf-autotable to avoid canvas/browser dependencies in Node tests
vi.mock('jspdf', () => {
  const mockDoc = {
    internal: {
      pageSize: { getWidth: () => 210, getHeight: () => 297 },
    },
    getNumberOfPages: () => 1,
    setFillColor: vi.fn(),
    setTextColor: vi.fn(),
    setFontSize: vi.fn(),
    setFont: vi.fn(),
    rect: vi.fn(),
    text: vi.fn(),
    addImage: vi.fn(),
    autoTable: vi.fn(),
    setPage: vi.fn(),
    output: vi.fn().mockReturnValue(new ArrayBuffer(100)),
    lastAutoTable: { finalY: 50 },
  };
  return {
    default: vi.fn().mockReturnValue(mockDoc),
  };
});

vi.mock('jspdf-autotable', () => ({}));

// Mock fs.readFileSync to avoid reading actual logo file in tests
vi.mock('fs', () => {
  const mockFs = {
    readFileSync: vi.fn().mockReturnValue(Buffer.from('fake-logo-data')),
  };
  return { ...mockFs, default: mockFs };
});

import handler from '../../../pages/api/school-hours-report/[school_id]/pdf';
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

describe('GET /api/school-hours-report/[school_id]/pdf', () => {
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

  it('returns 403 when equipo_directivo requests another school PDF', async () => {
    setupAuth(DIRECTIVO_UUID, 'equipo_directivo', SCHOOL_ID);

    const { req, res } = createMocks({
      method: 'GET',
      query: { school_id: String(OTHER_SCHOOL_ID) },
    });

    await handler(req as never, res as never);
    expect(res._getStatusCode()).toBe(403);
  });

  it('returns 200 with application/pdf for equipo_directivo on own school', async () => {
    setupAuth(DIRECTIVO_UUID, 'equipo_directivo', SCHOOL_ID);
    mockFetchSchoolReportData.mockResolvedValue(makeSchoolReport(SCHOOL_ID, 'Escuela Test'));

    const { req, res } = createMocks({
      method: 'GET',
      query: { school_id: String(SCHOOL_ID) },
    });

    await handler(req as never, res as never);
    expect(res._getStatusCode()).toBe(200);
    expect(res.getHeader('Content-Type')).toBe('application/pdf');
    const disposition = res.getHeader('Content-Disposition') as string;
    expect(disposition).toContain('attachment');
    expect(disposition).toContain('reporte-horas-');
    expect(disposition).toContain('.pdf');
  });

  it('returns application/pdf for admin on any school', async () => {
    setupAuth(ADMIN_UUID, 'admin');
    mockFetchSchoolReportData.mockResolvedValue(makeSchoolReport(OTHER_SCHOOL_ID, 'Otra Escuela'));

    const { req, res } = createMocks({
      method: 'GET',
      query: { school_id: String(OTHER_SCHOOL_ID) },
    });

    await handler(req as never, res as never);
    expect(res._getStatusCode()).toBe(200);
    expect(res.getHeader('Content-Type')).toBe('application/pdf');
  });
});
