// @vitest-environment node
/**
 * Unit tests for GET + PATCH /api/admin/bulk-tag-sessions
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';

const ADMIN_UUID = '550e8400-e29b-41d4-a716-446655440001';
const SESSION_UUID_1 = '550e8400-e29b-41d4-a716-446655440010';
const SESSION_UUID_2 = '550e8400-e29b-41d4-a716-446655440011';

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

import handler from '../../../pages/api/admin/bulk-tag-sessions';

function makeListChain(data: unknown) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: vi.fn().mockResolvedValue({ data, error: null, count: Array.isArray(data) ? data.length : 0 }),
    single: vi.fn().mockResolvedValue({ data: Array.isArray(data) ? data[0] : data, error: null }),
    update: vi.fn().mockReturnThis(),
  };
}

describe('GET /api/admin/bulk-tag-sessions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when unauthenticated', async () => {
    mockCheckIsAdmin.mockResolvedValue({ isAdmin: false, user: null, error: new Error('No session') });

    const { req, res } = createMocks({ method: 'GET' });
    await handler(req as never, res as never);
    expect(res._getStatusCode()).toBe(401);
  });

  it('returns 403 when non-admin calls GET', async () => {
    mockCheckIsAdmin.mockResolvedValue({ isAdmin: false, user: { id: 'user-1' }, error: null });

    const { req, res } = createMocks({ method: 'GET' });
    await handler(req as never, res as never);
    expect(res._getStatusCode()).toBe(403);
  });
});

describe('PATCH /api/admin/bulk-tag-sessions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when unauthenticated', async () => {
    mockCheckIsAdmin.mockResolvedValue({ isAdmin: false, user: null, error: new Error('No session') });

    const { req, res } = createMocks({ method: 'PATCH' });
    await handler(req as never, res as never);
    expect(res._getStatusCode()).toBe(401);
  });

  it('returns 403 when non-admin calls PATCH', async () => {
    mockCheckIsAdmin.mockResolvedValue({ isAdmin: false, user: { id: 'user-1' }, error: null });

    const { req, res } = createMocks({
      method: 'PATCH',
      body: { session_ids: [SESSION_UUID_1], hour_type_key: 'asesoria_tecnica_online' },
    });
    await handler(req as never, res as never);
    expect(res._getStatusCode()).toBe(403);
  });

  it('returns 200 with updated_count when admin PATCHes valid data', async () => {
    mockCheckIsAdmin.mockResolvedValue({ isAdmin: true, user: { id: ADMIN_UUID }, error: null });

    const updatedSessions = [{ id: SESSION_UUID_1 }, { id: SESSION_UUID_2 }];

    const mockClient = {
      from: vi.fn((table: string) => {
        if (table === 'hour_types') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: { id: 'ht-1', key: 'asesoria_tecnica_online' },
              error: null,
            }),
          };
        }
        if (table === 'consultor_sessions') {
          return {
            update: vi.fn().mockReturnThis(),
            in: vi.fn().mockReturnThis(),
            is: vi.fn().mockReturnThis(),
            select: vi.fn().mockResolvedValue({ data: updatedSessions, error: null }),
          };
        }
        return makeListChain([]);
      }),
    };
    mockCreateServiceRoleClient.mockReturnValue(mockClient);

    const { req, res } = createMocks({
      method: 'PATCH',
      body: {
        session_ids: [SESSION_UUID_1, SESSION_UUID_2],
        hour_type_key: 'asesoria_tecnica_online',
      },
    });
    await handler(req as never, res as never);
    expect(res._getStatusCode()).toBe(200);
    const body = res._getJSONData();
    expect(body.data?.updated_count).toBe(2);
  });

  it('returns 400 when hour_type_key does not exist', async () => {
    mockCheckIsAdmin.mockResolvedValue({ isAdmin: true, user: { id: ADMIN_UUID }, error: null });

    const mockClient = {
      from: vi.fn((table: string) => {
        if (table === 'hour_types') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } }),
          };
        }
        return makeListChain([]);
      }),
    };
    mockCreateServiceRoleClient.mockReturnValue(mockClient);

    const { req, res } = createMocks({
      method: 'PATCH',
      body: {
        session_ids: [SESSION_UUID_1],
        hour_type_key: 'nonexistent_key',
      },
    });
    await handler(req as never, res as never);
    expect(res._getStatusCode()).toBe(400);
    const body = res._getJSONData();
    expect(body.error).toMatch(/no existe/);
  });

  it('returns 0 updated_count when sessions are already tagged', async () => {
    mockCheckIsAdmin.mockResolvedValue({ isAdmin: true, user: { id: ADMIN_UUID }, error: null });

    const mockClient = {
      from: vi.fn((table: string) => {
        if (table === 'hour_types') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: { id: 'ht-1', key: 'asesoria_tecnica_online' },
              error: null,
            }),
          };
        }
        if (table === 'consultor_sessions') {
          return {
            update: vi.fn().mockReturnThis(),
            in: vi.fn().mockReturnThis(),
            is: vi.fn().mockReturnThis(),
            // Returns empty — all sessions already had hour_type_key set
            select: vi.fn().mockResolvedValue({ data: [], error: null }),
          };
        }
        return makeListChain([]);
      }),
    };
    mockCreateServiceRoleClient.mockReturnValue(mockClient);

    const { req, res } = createMocks({
      method: 'PATCH',
      body: {
        session_ids: [SESSION_UUID_1],
        hour_type_key: 'asesoria_tecnica_online',
      },
    });
    await handler(req as never, res as never);
    expect(res._getStatusCode()).toBe(200);
    const body = res._getJSONData();
    expect(body.data?.updated_count).toBe(0);
  });

  it('returns 400 when session_ids array is empty', async () => {
    mockCheckIsAdmin.mockResolvedValue({ isAdmin: true, user: { id: ADMIN_UUID }, error: null });

    const { req, res } = createMocks({
      method: 'PATCH',
      body: {
        session_ids: [],
        hour_type_key: 'asesoria_tecnica_online',
      },
    });
    await handler(req as never, res as never);
    expect(res._getStatusCode()).toBe(400);
    const body = res._getJSONData();
    expect(body.error).toBeTruthy();
  });
});
