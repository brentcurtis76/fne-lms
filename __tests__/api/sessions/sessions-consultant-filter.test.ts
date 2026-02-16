// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';

// Hoisted mock functions
const {
  mockGetApiUser,
  mockCreateServiceRoleClient,
  mockGetUserRoles,
  mockGetHighestRole,
} = vi.hoisted(() => ({
  mockGetApiUser: vi.fn(),
  mockCreateServiceRoleClient: vi.fn(),
  mockGetUserRoles: vi.fn(),
  mockGetHighestRole: vi.fn(),
}));

vi.mock('../../../lib/api-auth', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    getApiUser: mockGetApiUser,
    createServiceRoleClient: mockCreateServiceRoleClient,
  };
});

vi.mock('../../../utils/roleUtils', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    getUserRoles: mockGetUserRoles,
    getHighestRole: mockGetHighestRole,
  };
});

import handler from '../../../pages/api/sessions/index';

const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const CONSULTANT_ID = '22222222-2222-4222-8222-222222222222';
const SESSION_ID_1 = '44444444-4444-4444-8444-444444444444';
const SESSION_ID_2 = '55555555-5555-4555-8555-555555555555';
const SESSION_ID_3 = '66666666-6666-4666-8666-666666666666';
const SCHOOL_ID = 1;

function buildChainableQuery(data: unknown[] | null = [], error: unknown = null) {
  let useSingle = false;
  let count = Array.isArray(data) ? data.length : 0;

  const getResult = () => {
    if (useSingle) {
      return { data: data && Array.isArray(data) && data.length > 0 ? data[0] : null, error };
    }
    return { data, error, count };
  };

  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_target, prop) {
      if (prop === 'then') {
        return (resolve: (value: unknown) => void) => resolve(getResult());
      }
      if (prop === 'single') {
        return vi.fn(() => {
          useSingle = true;
          return new Proxy({}, handler);
        });
      }
      if (prop === 'maybeSingle') {
        return vi.fn(() => {
          useSingle = true;
          return new Proxy({}, handler);
        });
      }
      return vi.fn(() => new Proxy({}, handler));
    },
  };

  return new Proxy({}, handler);
}

const mockSession1 = {
  id: SESSION_ID_1,
  title: 'Sesión con Consultor 1',
  description: 'Descripción 1',
  session_date: '2026-03-15',
  start_time: '09:00:00',
  end_time: '10:00:00',
  status: 'programada',
  school_id: SCHOOL_ID,
  growth_community_id: 'gc-1',
  is_active: true,
  session_facilitators: [{ user_id: CONSULTANT_ID }],
  schools: { name: 'School 1' },
  growth_communities: { name: 'GC 1' },
};

const mockSession2 = {
  id: SESSION_ID_2,
  title: 'Sesión sin este Consultor',
  description: 'Descripción 2',
  session_date: '2026-03-16',
  start_time: '11:00:00',
  end_time: '12:00:00',
  status: 'completada',
  school_id: SCHOOL_ID,
  growth_community_id: 'gc-1',
  is_active: true,
  session_facilitators: [{ user_id: 'other-consultant-id' }],
  schools: { name: 'School 1' },
  growth_communities: { name: 'GC 1' },
};

const mockSession3 = {
  id: SESSION_ID_3,
  title: 'Otra Sesión con Consultor',
  description: 'Descripción 3',
  session_date: '2026-03-17',
  start_time: '13:00:00',
  end_time: '14:00:00',
  status: 'programada',
  school_id: SCHOOL_ID,
  growth_community_id: 'gc-1',
  is_active: true,
  session_facilitators: [{ user_id: CONSULTANT_ID }],
  schools: { name: 'School 1' },
  growth_communities: { name: 'GC 1' },
};

describe('GET /api/sessions with consultant_id filter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should filter sessions by consultant_id using two-step pattern', async () => {
    mockGetApiUser.mockResolvedValueOnce({
      user: { id: ADMIN_ID },
      error: null,
    });

    mockGetUserRoles.mockResolvedValueOnce([
      { role_type: 'admin', school_id: null, community_id: null },
    ]);

    mockGetHighestRole.mockReturnValueOnce('admin');

    const mockServiceClient = {
      from: vi.fn((tableName: string) => {
        if (tableName === 'session_facilitators') {
          // First step: return session IDs for the consultant
          return buildChainableQuery([
            { session_id: SESSION_ID_1 },
            { session_id: SESSION_ID_3 },
          ]);
        }
        // Second step: return sessions filtered by those IDs
        return buildChainableQuery([mockSession1, mockSession3]);
      }),
    };

    mockCreateServiceRoleClient.mockReturnValueOnce(mockServiceClient);

    const { req, res } = createMocks({
      method: 'GET',
      query: { consultant_id: CONSULTANT_ID, page: '1', limit: '20' },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data.data.sessions).toHaveLength(2);
    expect(data.data.sessions[0].id).toBe(SESSION_ID_1);
    expect(data.data.sessions[1].id).toBe(SESSION_ID_3);
  });

  it('should return empty list when consultant has no sessions', async () => {
    mockGetApiUser.mockResolvedValueOnce({
      user: { id: ADMIN_ID },
      error: null,
    });

    mockGetUserRoles.mockResolvedValueOnce([
      { role_type: 'admin', school_id: null, community_id: null },
    ]);

    mockGetHighestRole.mockReturnValueOnce('admin');

    const mockServiceClient = {
      from: vi.fn((tableName: string) => {
        if (tableName === 'session_facilitators') {
          return buildChainableQuery([]);
        }
        return buildChainableQuery([]);
      }),
    };

    mockCreateServiceRoleClient.mockReturnValueOnce(mockServiceClient);

    const { req, res } = createMocks({
      method: 'GET',
      query: { consultant_id: CONSULTANT_ID, page: '1', limit: '20' },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data.data.sessions).toHaveLength(0);
    expect(data.data.total).toBe(0);
  });

  it('should validate consultant_id as UUID format', async () => {
    mockGetApiUser.mockResolvedValueOnce({
      user: { id: ADMIN_ID },
      error: null,
    });

    mockGetUserRoles.mockResolvedValueOnce([
      { role_type: 'admin', school_id: null, community_id: null },
    ]);

    mockGetHighestRole.mockReturnValueOnce('admin');

    const mockServiceClient = {
      from: vi.fn(() => buildChainableQuery([mockSession1, mockSession2, mockSession3])),
    };

    mockCreateServiceRoleClient.mockReturnValueOnce(mockServiceClient);

    const { req, res } = createMocks({
      method: 'GET',
      query: { consultant_id: 'invalid-uuid', page: '1', limit: '20' },
    });

    await handler(req, res);

    // Should still return results without filtering by consultant (invalid UUID ignored)
    expect(res._getStatusCode()).toBe(200);
  });

  it('should combine consultant_id filter with other filters', async () => {
    mockGetApiUser.mockResolvedValueOnce({
      user: { id: ADMIN_ID },
      error: null,
    });

    mockGetUserRoles.mockResolvedValueOnce([
      { role_type: 'admin', school_id: null, community_id: null },
    ]);

    mockGetHighestRole.mockReturnValueOnce('admin');

    const mockServiceClient = {
      from: vi.fn((tableName: string) => {
        if (tableName === 'session_facilitators') {
          return buildChainableQuery([
            { session_id: SESSION_ID_1 },
            { session_id: SESSION_ID_3 },
          ]);
        }
        return buildChainableQuery([mockSession1]); // Only programada sessions
      }),
    };

    mockCreateServiceRoleClient.mockReturnValueOnce(mockServiceClient);

    const { req, res } = createMocks({
      method: 'GET',
      query: {
        consultant_id: CONSULTANT_ID,
        status: 'programada',
        page: '1',
        limit: '20',
      },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data.data.sessions).toHaveLength(1);
    expect(data.data.sessions[0].status).toBe('programada');
  });

  it('should handle database error when filtering by consultant', async () => {
    mockGetApiUser.mockResolvedValueOnce({
      user: { id: ADMIN_ID },
      error: null,
    });

    mockGetUserRoles.mockResolvedValueOnce([
      { role_type: 'admin', school_id: null, community_id: null },
    ]);

    mockGetHighestRole.mockReturnValueOnce('admin');

    const mockServiceClient = {
      from: vi.fn((tableName: string) => {
        if (tableName === 'session_facilitators') {
          return buildChainableQuery(null, { message: 'Database error' });
        }
        return buildChainableQuery([]);
      }),
    };

    mockCreateServiceRoleClient.mockReturnValueOnce(mockServiceClient);

    const { req, res } = createMocks({
      method: 'GET',
      query: { consultant_id: CONSULTANT_ID, page: '1', limit: '20' },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(500);
    const data = JSON.parse(res._getData());
    expect(data.error).toContain('filtrar por consultor');
  });
});
