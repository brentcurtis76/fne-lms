// @vitest-environment node
/**
 * Unit tests for GET /api/admin/consultant-rates/csv
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';

const ADMIN_UUID = '550e8400-e29b-41d4-a716-446655440001';

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

import handler from '../../../pages/api/admin/consultant-rates/csv';
import { getUserRoles, getHighestRole } from '../../../utils/roleUtils';

const mockGetUserRoles = getUserRoles as ReturnType<typeof vi.fn>;
const mockGetHighestRole = getHighestRole as ReturnType<typeof vi.fn>;

describe('GET /api/admin/consultant-rates/csv', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when unauthenticated', async () => {
    mockGetApiUser.mockResolvedValue({ user: null, error: new Error('No session') });

    const { req, res } = createMocks({ method: 'GET' });
    await handler(req as never, res as never);
    expect(res._getStatusCode()).toBe(401);
  });

  it('returns 403 when user is not admin', async () => {
    mockGetApiUser.mockResolvedValue({ user: { id: 'consultor-id' }, error: null });
    mockGetUserRoles.mockResolvedValue([{ role: 'consultor' }]);
    mockGetHighestRole.mockReturnValue('consultor');

    const mockClient = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
    };
    mockCreateServiceRoleClient.mockReturnValue(mockClient);

    const { req, res } = createMocks({ method: 'GET' });
    await handler(req as never, res as never);
    expect(res._getStatusCode()).toBe(403);
  });

  it('admin gets CSV with correct content-type and column headers', async () => {
    mockGetApiUser.mockResolvedValue({ user: { id: ADMIN_UUID }, error: null });
    mockGetUserRoles.mockResolvedValue([{ role: 'admin' }]);
    mockGetHighestRole.mockReturnValue('admin');

    const ratesData = [
      {
        rate_eur: 85.0,
        effective_from: '2026-01-01',
        effective_to: null,
        profiles: { first_name: 'Ana', last_name: 'García' },
        hour_types: { display_name: 'Asesoría Técnica Online' },
      },
    ];

    const mockClient = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: ratesData, error: null }),
      }),
    };
    mockCreateServiceRoleClient.mockReturnValue(mockClient);

    const { req, res } = createMocks({ method: 'GET' });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);
    expect(res.getHeader('Content-Type')).toContain('text/csv');

    const body = res._getData() as string;
    expect(body).toContain('Consultor');
    expect(body).toContain('Tipo de Hora');
    expect(body).toContain('Tarifa EUR');
    expect(body).toContain('Vigente Desde');
    expect(body).toContain('Vigente Hasta');
    // Data row check
    expect(body).toContain('Ana García');
    expect(body).toContain('85.00');
  });
});
