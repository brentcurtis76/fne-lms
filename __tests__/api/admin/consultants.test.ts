// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';

// Hoisted mock functions
const {
  mockCheckIsAdmin,
  mockCreateServiceRoleClient,
} = vi.hoisted(() => ({
  mockCheckIsAdmin: vi.fn(),
  mockCreateServiceRoleClient: vi.fn(),
}));

vi.mock('../../../lib/api-auth', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    checkIsAdmin: mockCheckIsAdmin,
    createServiceRoleClient: mockCreateServiceRoleClient,
  };
});

import handler from '../../../pages/api/admin/consultants';

const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const CONSULTANT_ID_1 = '22222222-2222-4222-8222-222222222222';
const CONSULTANT_ID_2 = '33333333-3333-4333-8333-333333333333';
const SCHOOL_ID = 1;

function buildChainableQuery(data: unknown[] | null = [], error: unknown = null) {
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_target, prop) {
      if (prop === 'then') {
        return (resolve: (value: unknown) => void) => resolve({ data, error });
      }
      return vi.fn(() => new Proxy({}, handler));
    },
  };

  return new Proxy({}, handler);
}

describe('GET /api/admin/consultants', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should reject non-admin users', async () => {
    mockCheckIsAdmin.mockResolvedValueOnce({
      isAdmin: false,
      user: { id: 'user-123' },
      error: null,
    });

    const { req, res } = createMocks({
      method: 'GET',
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(403);
    const data = JSON.parse(res._getData());
    expect(data.error).toContain('administradores');
  });

  it('should return all consultants when school_id is not provided', async () => {
    mockCheckIsAdmin.mockResolvedValueOnce({
      isAdmin: true,
      user: { id: ADMIN_ID },
      error: null,
    });

    const mockServiceClient = {
      from: vi.fn(() => buildChainableQuery([
        {
          user_id: CONSULTANT_ID_1,
          profiles: { id: CONSULTANT_ID_1, first_name: 'Juan', last_name: 'Pérez', email: 'juan@example.com' },
        },
        {
          user_id: CONSULTANT_ID_2,
          profiles: { id: CONSULTANT_ID_2, first_name: 'María', last_name: 'García', email: 'maria@example.com' },
        },
      ])),
    };

    mockCreateServiceRoleClient.mockReturnValueOnce(mockServiceClient);

    const { req, res } = createMocks({
      method: 'GET',
      query: {},
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data.data.consultants).toHaveLength(2);
    expect(data.data.consultants[0].first_name).toBe('Juan');
    expect(data.data.consultants[1].first_name).toBe('María');
  });

  it('should filter consultants by school_id when provided', async () => {
    mockCheckIsAdmin.mockResolvedValueOnce({
      isAdmin: true,
      user: { id: ADMIN_ID },
      error: null,
    });

    const mockServiceClient = {
      from: vi.fn(() => buildChainableQuery([
        {
          user_id: CONSULTANT_ID_1,
          profiles: { id: CONSULTANT_ID_1, first_name: 'Juan', last_name: 'Pérez', email: 'juan@example.com' },
        },
      ])),
    };

    mockCreateServiceRoleClient.mockReturnValueOnce(mockServiceClient);

    const { req, res } = createMocks({
      method: 'GET',
      query: { school_id: SCHOOL_ID.toString() },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data.data.consultants).toHaveLength(1);
  });

  it('should deduplicate consultants by user_id', async () => {
    mockCheckIsAdmin.mockResolvedValueOnce({
      isAdmin: true,
      user: { id: ADMIN_ID },
      error: null,
    });

    const mockServiceClient = {
      from: vi.fn(() => buildChainableQuery([
        {
          user_id: CONSULTANT_ID_1,
          profiles: { id: CONSULTANT_ID_1, first_name: 'Juan', last_name: 'Pérez', email: 'juan@example.com' },
        },
        {
          user_id: CONSULTANT_ID_1, // Same user, different school role
          profiles: { id: CONSULTANT_ID_1, first_name: 'Juan', last_name: 'Pérez', email: 'juan@example.com' },
        },
        {
          user_id: CONSULTANT_ID_2,
          profiles: { id: CONSULTANT_ID_2, first_name: 'María', last_name: 'García', email: 'maria@example.com' },
        },
      ])),
    };

    mockCreateServiceRoleClient.mockReturnValueOnce(mockServiceClient);

    const { req, res } = createMocks({
      method: 'GET',
      query: {},
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data.data.consultants).toHaveLength(2); // Should be deduplicated to 2
  });

  it('should handle API errors gracefully', async () => {
    mockCheckIsAdmin.mockResolvedValueOnce({
      isAdmin: true,
      user: { id: ADMIN_ID },
      error: null,
    });

    const mockServiceClient = {
      from: vi.fn(() => buildChainableQuery(null, { message: 'Database error' })),
    };

    mockCreateServiceRoleClient.mockReturnValueOnce(mockServiceClient);

    const { req, res } = createMocks({
      method: 'GET',
      query: {},
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(500);
    const data = JSON.parse(res._getData());
    expect(data.error).toContain('Error al consultar facilitadores');
  });

  it('should filter out consultants with missing profile data', async () => {
    mockCheckIsAdmin.mockResolvedValueOnce({
      isAdmin: true,
      user: { id: ADMIN_ID },
      error: null,
    });

    const mockServiceClient = {
      from: vi.fn(() => buildChainableQuery([
        {
          user_id: CONSULTANT_ID_1,
          profiles: { id: CONSULTANT_ID_1, first_name: 'Juan', last_name: 'Pérez', email: 'juan@example.com' },
        },
        {
          user_id: CONSULTANT_ID_2,
          profiles: null, // Missing profile
        },
      ])),
    };

    mockCreateServiceRoleClient.mockReturnValueOnce(mockServiceClient);

    const { req, res } = createMocks({
      method: 'GET',
      query: {},
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data.data.consultants).toHaveLength(1); // Only valid consultant
  });
});
