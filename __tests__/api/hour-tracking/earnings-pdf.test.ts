// @vitest-environment node
/**
 * Unit tests for GET /api/consultant-earnings/[consultant_id]/pdf
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

vi.mock('../../../lib/services/hour-tracking', () => ({
  getLatestFxRate: vi.fn().mockResolvedValue({
    rate_clp_per_eur: 1050,
    fetched_at: '2026-02-24T00:00:00Z',
    is_stale: false,
    source: 'api',
  }),
}));

// Mock jsPDF + autotable
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
  return { default: vi.fn().mockReturnValue(mockDoc) };
});

vi.mock('jspdf-autotable', () => ({}));

vi.mock('fs', () => {
  const mockFs = {
    readFileSync: vi.fn().mockReturnValue(Buffer.from('fake-logo-data')),
  };
  return { ...mockFs, default: mockFs };
});

import handler from '../../../pages/api/consultant-earnings/[consultant_id]/pdf';

// ============================================================
// Helpers
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

function makeConsultorClient() {
  return {
    from: vi.fn((table: string) => {
      if (table === 'profiles') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: { first_name: 'Juan', last_name: 'Pérez' },
            error: null,
          }),
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

describe('GET /api/consultant-earnings/[consultant_id]/pdf', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 for unauthenticated requests', async () => {
    mockGetApiUser.mockResolvedValue({ user: null, error: new Error('No session') });

    const { req, res } = createMocks({
      method: 'GET',
      query: { consultant_id: CONSULTOR_UUID, from: '2026-01-01', to: '2026-03-31' },
    });

    await handler(req as never, res as never);
    expect(res._getStatusCode()).toBe(401);
  });

  it('returns 403 when consultor requests another consultant PDF', async () => {
    mockGetApiUser.mockResolvedValue({ user: { id: CONSULTOR_UUID }, error: null });
    mockGetUserRoles.mockResolvedValue([{ role_type: 'consultor', school_id: null }]);
    mockGetHighestRole.mockReturnValue('consultor');

    const mockClient = makeConsultorClient();
    mockCreateServiceRoleClient.mockReturnValue(mockClient);

    const { req, res } = createMocks({
      method: 'GET',
      query: { consultant_id: OTHER_UUID, from: '2026-01-01', to: '2026-03-31' },
    });

    await handler(req as never, res as never);
    expect(res._getStatusCode()).toBe(403);
    const body = res._getJSONData();
    expect(body.error).toMatch(/propias/);
  });

  it('returns 200 with application/pdf for consultor viewing own earnings', async () => {
    mockGetApiUser.mockResolvedValue({ user: { id: CONSULTOR_UUID }, error: null });
    mockGetUserRoles.mockResolvedValue([{ role_type: 'consultor', school_id: null }]);
    mockGetHighestRole.mockReturnValue('consultor');

    const mockClient = makeConsultorClient();
    mockCreateServiceRoleClient.mockReturnValue(mockClient);

    const { req, res } = createMocks({
      method: 'GET',
      query: { consultant_id: CONSULTOR_UUID, from: '2026-01-01', to: '2026-03-31' },
    });

    await handler(req as never, res as never);
    expect(res._getStatusCode()).toBe(200);
    expect(res.getHeader('Content-Type')).toBe('application/pdf');
    const disposition = res.getHeader('Content-Disposition') as string;
    expect(disposition).toContain('attachment');
    expect(disposition).toContain('ganancias-');
    expect(disposition).toContain('.pdf');
  });

  it('returns 200 with application/pdf for admin viewing any consultant', async () => {
    mockGetApiUser.mockResolvedValue({ user: { id: ADMIN_UUID }, error: null });
    mockGetUserRoles.mockResolvedValue([{ role_type: 'admin', school_id: null }]);
    mockGetHighestRole.mockReturnValue('admin');

    const mockClient = makeConsultorClient();
    mockCreateServiceRoleClient.mockReturnValue(mockClient);

    const { req, res } = createMocks({
      method: 'GET',
      query: { consultant_id: CONSULTOR_UUID, from: '2026-01-01', to: '2026-03-31' },
    });

    await handler(req as never, res as never);
    expect(res._getStatusCode()).toBe(200);
    expect(res.getHeader('Content-Type')).toBe('application/pdf');
  });

  it('returns 400 for invalid consultant_id (not UUID)', async () => {
    mockGetApiUser.mockResolvedValue({ user: { id: ADMIN_UUID }, error: null });

    const { req, res } = createMocks({
      method: 'GET',
      query: { consultant_id: 'not-a-uuid', from: '2026-01-01', to: '2026-03-31' },
    });

    await handler(req as never, res as never);
    expect(res._getStatusCode()).toBe(400);
    const body = res._getJSONData();
    expect(body.error).toMatch(/UUID/);
  });
});
