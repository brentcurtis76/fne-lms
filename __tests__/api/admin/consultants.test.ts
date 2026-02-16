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
const CONSULTANT_ID_3 = '44444444-4444-4444-8444-444444444444';
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

/**
 * Build a mock service client that returns different data depending on which
 * table is queried. After Task 5.4, only user_roles is queried (strict source).
 */
function buildMultiTableClient(
  roleData: unknown[] | null = [],
  facilitatorData: unknown[] | null = [], // Not used anymore (Source 2 removed)
  roleError: unknown = null,
  facilitatorError: unknown = null, // Not used anymore
) {
  return {
    from: vi.fn((table: string) => {
      if (table === 'user_roles') {
        return buildChainableQuery(roleData, roleError);
      }
      // All other tables return empty (Source 2 no longer queried)
      return buildChainableQuery([], null);
    }),
  };
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

    const mockServiceClient = buildMultiTableClient(
      // Role-based consultants
      [
        {
          user_id: CONSULTANT_ID_1,
          profiles: { id: CONSULTANT_ID_1, first_name: 'Juan', last_name: 'Pérez', email: 'juan@example.com' },
        },
        {
          user_id: CONSULTANT_ID_2,
          profiles: { id: CONSULTANT_ID_2, first_name: 'María', last_name: 'García', email: 'maria@example.com' },
        },
      ],
      // Facilitator-based (empty — all covered by roles)
      [],
    );

    mockCreateServiceRoleClient.mockReturnValueOnce(mockServiceClient);

    const { req, res } = createMocks({
      method: 'GET',
      query: {},
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data.data.consultants).toHaveLength(2);
    // Sorted by last_name: García < Pérez
    expect(data.data.consultants[0].last_name).toBe('García');
    expect(data.data.consultants[1].last_name).toBe('Pérez');
  });

  it('should return ONLY role-based consultants (strict source)', async () => {
    mockCheckIsAdmin.mockResolvedValueOnce({
      isAdmin: true,
      user: { id: ADMIN_ID },
      error: null,
    });

    const mockServiceClient = buildMultiTableClient(
      // Role-based: one consultant with active consultor role
      [
        {
          user_id: CONSULTANT_ID_1,
          profiles: { id: CONSULTANT_ID_1, first_name: 'Juan', last_name: 'Pérez', email: 'juan@example.com' },
        },
      ],
      // Facilitator-based: NOT queried anymore (Source 2 removed)
      [],
    );

    mockCreateServiceRoleClient.mockReturnValueOnce(mockServiceClient);

    const { req, res } = createMocks({
      method: 'GET',
      query: {},
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    // Should return ONLY the role-based consultant, NOT any facilitator-only users
    expect(data.data.consultants).toHaveLength(1);
    expect(data.data.consultants[0].last_name).toBe('Pérez');
  });

  it('should reject invalid school_id with 400', async () => {
    mockCheckIsAdmin.mockResolvedValueOnce({
      isAdmin: true,
      user: { id: ADMIN_ID },
      error: null,
    });

    const { req, res } = createMocks({
      method: 'GET',
      query: { school_id: 'abc' },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    const data = JSON.parse(res._getData());
    expect(data.error).toContain('school_id');
  });

  it('should filter consultants by school_id when provided', async () => {
    mockCheckIsAdmin.mockResolvedValueOnce({
      isAdmin: true,
      user: { id: ADMIN_ID },
      error: null,
    });

    const mockServiceClient = buildMultiTableClient(
      [
        {
          user_id: CONSULTANT_ID_1,
          profiles: { id: CONSULTANT_ID_1, first_name: 'Juan', last_name: 'Pérez', email: 'juan@example.com' },
        },
      ],
      [], // No additional facilitators when school_id narrows results (consultor_sessions returns empty)
    );

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

  it('should deduplicate consultants by user_id across both sources', async () => {
    mockCheckIsAdmin.mockResolvedValueOnce({
      isAdmin: true,
      user: { id: ADMIN_ID },
      error: null,
    });

    const mockServiceClient = buildMultiTableClient(
      // Role-based
      [
        {
          user_id: CONSULTANT_ID_1,
          profiles: { id: CONSULTANT_ID_1, first_name: 'Juan', last_name: 'Pérez', email: 'juan@example.com' },
        },
        {
          user_id: CONSULTANT_ID_1, // duplicate in roles
          profiles: { id: CONSULTANT_ID_1, first_name: 'Juan', last_name: 'Pérez', email: 'juan@example.com' },
        },
        {
          user_id: CONSULTANT_ID_2,
          profiles: { id: CONSULTANT_ID_2, first_name: 'María', last_name: 'García', email: 'maria@example.com' },
        },
      ],
      // Facilitator-based: same user_id already in roles
      [
        {
          user_id: CONSULTANT_ID_1,
          profiles: { id: CONSULTANT_ID_1, first_name: 'Juan', last_name: 'Pérez', email: 'juan@example.com' },
        },
      ],
    );

    mockCreateServiceRoleClient.mockReturnValueOnce(mockServiceClient);

    const { req, res } = createMocks({
      method: 'GET',
      query: {},
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data.data.consultants).toHaveLength(2); // Deduplicated
  });

  it('should handle role query API errors gracefully', async () => {
    mockCheckIsAdmin.mockResolvedValueOnce({
      isAdmin: true,
      user: { id: ADMIN_ID },
      error: null,
    });

    const mockServiceClient = buildMultiTableClient(
      null,
      [],
      { message: 'Database error' },
      null,
    );

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

    const mockServiceClient = buildMultiTableClient(
      [
        {
          user_id: CONSULTANT_ID_1,
          profiles: { id: CONSULTANT_ID_1, first_name: 'Juan', last_name: 'Pérez', email: 'juan@example.com' },
        },
        {
          user_id: CONSULTANT_ID_2,
          profiles: null, // Missing profile
        },
      ],
      [],
    );

    mockCreateServiceRoleClient.mockReturnValueOnce(mockServiceClient);

    const { req, res } = createMocks({
      method: 'GET',
      query: {},
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data.data.consultants).toHaveLength(1);
  });

  it('should return stable alphabetical order by last name then first name', async () => {
    mockCheckIsAdmin.mockResolvedValueOnce({
      isAdmin: true,
      user: { id: ADMIN_ID },
      error: null,
    });

    const mockServiceClient = buildMultiTableClient(
      [
        {
          user_id: CONSULTANT_ID_2,
          profiles: { id: CONSULTANT_ID_2, first_name: 'María', last_name: 'Zúñiga', email: 'z@example.com' },
        },
        {
          user_id: CONSULTANT_ID_1,
          profiles: { id: CONSULTANT_ID_1, first_name: 'Ana', last_name: 'Álvarez', email: 'a@example.com' },
        },
        {
          user_id: CONSULTANT_ID_3,
          profiles: { id: CONSULTANT_ID_3, first_name: 'Pedro', last_name: 'Álvarez', email: 'pa@example.com' },
        },
      ],
      [],
    );

    mockCreateServiceRoleClient.mockReturnValueOnce(mockServiceClient);

    const { req, res } = createMocks({
      method: 'GET',
      query: {},
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data.data.consultants).toHaveLength(3);
    // Ana Álvarez < Pedro Álvarez < María Zúñiga
    expect(data.data.consultants[0].first_name).toBe('Ana');
    expect(data.data.consultants[1].first_name).toBe('Pedro');
    expect(data.data.consultants[2].first_name).toBe('María');
  });
});
