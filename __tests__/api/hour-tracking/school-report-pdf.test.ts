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
  return chain;
}

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
    mockGetApiUser.mockResolvedValue({ user: { id: DIRECTIVO_UUID }, error: null });
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
  });

  it('returns 200 with application/pdf for equipo_directivo on own school', async () => {
    mockGetApiUser.mockResolvedValue({ user: { id: DIRECTIVO_UUID }, error: null });
    mockGetUserRoles.mockResolvedValue([{ role_type: 'equipo_directivo', school_id: SCHOOL_ID }]);
    mockGetHighestRole.mockReturnValue('equipo_directivo');

    const mockClient = makeEmptySchoolClient(SCHOOL_ID);
    mockCreateServiceRoleClient.mockReturnValue(mockClient);

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
    expect(res.getHeader('Content-Type')).toBe('application/pdf');
  });
});
