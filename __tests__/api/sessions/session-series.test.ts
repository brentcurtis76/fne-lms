// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';

// Hoisted mock functions
const { mockGetApiUser, mockCreateServiceRoleClient, mockCheckIsAdmin } = vi.hoisted(() => ({
  mockGetApiUser: vi.fn(),
  mockCreateServiceRoleClient: vi.fn(),
  mockCheckIsAdmin: vi.fn(),
}));

vi.mock('../../../lib/api-auth', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    getApiUser: mockGetApiUser,
    createServiceRoleClient: mockCreateServiceRoleClient,
    checkIsAdmin: mockCheckIsAdmin,
  };
});

// Import handlers AFTER mocks
import getHandler from '../../../pages/api/sessions/series/[groupId]';
import cancelHandler from '../../../pages/api/sessions/series/[groupId]/cancel';

// Valid UUIDs for test data
const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const NON_ADMIN_ID = '22222222-2222-4222-8222-222222222222';
const GROUP_ID = '33333333-3333-4333-8333-333333333333';
const SESSION_ID_1 = '44444444-4444-4444-8444-444444444444';
const SESSION_ID_2 = '55555555-5555-4555-8555-555555555555';

/**
 * Build a chainable Supabase mock that properly handles .single()
 * When .single() is called, the resolved data is data[0] || null instead of the array
 */
function buildChainableQuery(data: unknown[] | null = [], error: unknown = null) {
  let useSingle = false;

  const getResult = () => {
    if (useSingle) {
      return { data: data && data.length > 0 ? data[0] : null, error };
    }
    return { data, error };
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
      // All other chainable methods return the proxy
      return vi.fn(() => new Proxy({}, handler));
    },
  };

  return new Proxy({}, handler);
}

interface SessionData {
  id: string;
  title: string;
  session_date: string;
  start_time: string;
  end_time: string;
  status: string;
  session_number: number;
  recurrence_group_id: string;
  schools: { name: string };
  growth_communities: { name: string };
  session_facilitators: unknown[];
}

const mockSession1: SessionData = {
  id: SESSION_ID_1,
  title: 'Test Session 1',
  session_date: '2026-03-01',
  start_time: '09:00:00',
  end_time: '10:00:00',
  status: 'programada',
  session_number: 1,
  recurrence_group_id: GROUP_ID,
  schools: { name: 'Test School' },
  growth_communities: { name: 'Test GC' },
  session_facilitators: [],
};

const mockSession2: SessionData = {
  id: SESSION_ID_2,
  title: 'Test Session 2',
  session_date: '2026-03-08',
  start_time: '09:00:00',
  end_time: '10:00:00',
  status: 'programada',
  session_number: 2,
  recurrence_group_id: GROUP_ID,
  schools: { name: 'Test School' },
  growth_communities: { name: 'Test GC' },
  session_facilitators: [],
};

describe('GET /api/sessions/series/[groupId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns sessions in group (200)', async () => {
    mockCheckIsAdmin.mockResolvedValue({
      isAdmin: true,
      user: { id: ADMIN_ID },
      error: null,
    });

    const mockClient = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(() => buildChainableQuery([mockSession1, mockSession2])),
            })),
          })),
        })),
      })),
    };

    mockCreateServiceRoleClient.mockReturnValue(mockClient);

    const { req, res } = createMocks({
      method: 'GET',
      query: { groupId: GROUP_ID },
    });

    await getHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const jsonData = res._getJSONData();
    expect(jsonData.data.recurrence_group_id).toBe(GROUP_ID);
    expect(jsonData.data.total_sessions).toBe(2);
    expect(jsonData.data.sessions).toHaveLength(2);
    expect(jsonData.data.stats.programada).toBe(2);
  });

  it('rejects non-UUID groupId (400)', async () => {
    const { req, res } = createMocks({
      method: 'GET',
      query: { groupId: 'invalid-uuid' },
    });

    await getHandler(req, res);

    expect(res._getStatusCode()).toBe(400);
    const jsonData = res._getJSONData();
    expect(jsonData.error).toContain('inválido');
  });

  it('rejects non-admin (403)', async () => {
    mockCheckIsAdmin.mockResolvedValue({
      isAdmin: false,
      user: { id: NON_ADMIN_ID },
      error: null,
    });

    const { req, res } = createMocks({
      method: 'GET',
      query: { groupId: GROUP_ID },
    });

    await getHandler(req, res);

    expect(res._getStatusCode()).toBe(403);
    const jsonData = res._getJSONData();
    expect(jsonData.error).toContain('administradores');
  });

  it('returns empty for non-existent group (200)', async () => {
    mockCheckIsAdmin.mockResolvedValue({
      isAdmin: true,
      user: { id: ADMIN_ID },
      error: null,
    });

    const mockClient = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(() => buildChainableQuery([])),
            })),
          })),
        })),
      })),
    };

    mockCreateServiceRoleClient.mockReturnValue(mockClient);

    const { req, res } = createMocks({
      method: 'GET',
      query: { groupId: GROUP_ID },
    });

    await getHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const jsonData = res._getJSONData();
    expect(jsonData.data.total_sessions).toBe(0);
    expect(jsonData.data.sessions).toHaveLength(0);
    expect(jsonData.data.stats.programada).toBe(0);
  });
});

describe('POST /api/sessions/series/[groupId]/cancel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('cancels future sessions (200)', async () => {
    mockCheckIsAdmin.mockResolvedValue({
      isAdmin: true,
      user: { id: ADMIN_ID },
      error: null,
    });

    const mockClient = {
      from: vi.fn((table: string) => {
        if (table === 'consultor_sessions') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  not: vi.fn(() => ({
                    gte: vi.fn(() => buildChainableQuery([mockSession1, mockSession2])),
                  })),
                })),
              })),
            })),
            update: vi.fn(() => ({
              in: vi.fn(() => ({
                select: vi.fn(() => buildChainableQuery([{ ...mockSession1, status: 'cancelada' }, { ...mockSession2, status: 'cancelada' }])),
              })),
            })),
          };
        }
        if (table === 'session_activity_log') {
          return {
            insert: vi.fn(() => buildChainableQuery([])),
          };
        }
        return {};
      }),
    };

    mockCreateServiceRoleClient.mockReturnValue(mockClient);

    const { req, res } = createMocks({
      method: 'POST',
      query: { groupId: GROUP_ID },
      body: {
        cancellation_reason: 'Test cancellation',
        scope: 'all_future',
      },
    });

    await cancelHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const jsonData = res._getJSONData();
    expect(jsonData.data.cancelled_count).toBe(2);
  });

  it('skips completed/cancelled sessions', async () => {
    mockCheckIsAdmin.mockResolvedValue({
      isAdmin: true,
      user: { id: ADMIN_ID },
      error: null,
    });

    const completedSession = { ...mockSession1, status: 'completada' };

    const mockClient = {
      from: vi.fn((table: string) => {
        if (table === 'consultor_sessions') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  not: vi.fn(() => ({
                    gte: vi.fn(() => buildChainableQuery([mockSession2])), // Only session 2, session 1 is completed
                  })),
                })),
              })),
            })),
            update: vi.fn(() => ({
              in: vi.fn(() => ({
                select: vi.fn(() => buildChainableQuery([{ ...mockSession2, status: 'cancelada' }])),
              })),
            })),
          };
        }
        if (table === 'session_activity_log') {
          return {
            insert: vi.fn(() => buildChainableQuery([])),
          };
        }
        return {};
      }),
    };

    mockCreateServiceRoleClient.mockReturnValue(mockClient);

    const { req, res } = createMocks({
      method: 'POST',
      query: { groupId: GROUP_ID },
      body: {
        cancellation_reason: 'Test cancellation',
        scope: 'all_future',
      },
    });

    await cancelHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const jsonData = res._getJSONData();
    expect(jsonData.data.cancelled_count).toBe(1);
  });

  it('rejects missing cancellation_reason (400)', async () => {
    mockCheckIsAdmin.mockResolvedValue({
      isAdmin: true,
      user: { id: ADMIN_ID },
      error: null,
    });

    const { req, res } = createMocks({
      method: 'POST',
      query: { groupId: GROUP_ID },
      body: {
        scope: 'all_future',
      },
    });

    await cancelHandler(req, res);

    expect(res._getStatusCode()).toBe(400);
    const jsonData = res._getJSONData();
    expect(jsonData.error).toContain('razón');
  });

  it('rejects non-admin (403)', async () => {
    mockCheckIsAdmin.mockResolvedValue({
      isAdmin: false,
      user: { id: NON_ADMIN_ID },
      error: null,
    });

    const { req, res } = createMocks({
      method: 'POST',
      query: { groupId: GROUP_ID },
      body: {
        cancellation_reason: 'Test cancellation',
        scope: 'all_future',
      },
    });

    await cancelHandler(req, res);

    expect(res._getStatusCode()).toBe(403);
    const jsonData = res._getJSONData();
    expect(jsonData.error).toContain('administradores');
  });

  it('returns 404 for empty group', async () => {
    mockCheckIsAdmin.mockResolvedValue({
      isAdmin: true,
      user: { id: ADMIN_ID },
      error: null,
    });

    const mockClient = {
      from: vi.fn((table: string) => {
        if (table === 'consultor_sessions') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  not: vi.fn(() => ({
                    gte: vi.fn(() => buildChainableQuery([])), // No sessions found
                  })),
                })),
              })),
            })),
          };
        }
        return {};
      }),
    };

    mockCreateServiceRoleClient.mockReturnValue(mockClient);

    const { req, res } = createMocks({
      method: 'POST',
      query: { groupId: GROUP_ID },
      body: {
        cancellation_reason: 'Test cancellation',
        scope: 'all_future',
      },
    });

    await cancelHandler(req, res);

    expect(res._getStatusCode()).toBe(404);
    const jsonData = res._getJSONData();
    expect(jsonData.error).toContain('No se encontraron');
  });
});
