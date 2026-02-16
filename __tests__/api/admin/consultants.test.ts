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
 * table is queried. After Task 5.5, uses two-step pattern: user_roles → profiles.
 */
function buildMultiTableClient(
  roleData: unknown[] | null = [],
  profileData: unknown[] | null = [],
  roleError: unknown = null,
  profileError: unknown = null,
) {
  return {
    from: vi.fn((table: string) => {
      if (table === 'user_roles') {
        return buildChainableQuery(roleData, roleError);
      }
      if (table === 'profiles') {
        return buildChainableQuery(profileData, profileError);
      }
      // All other tables return empty
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

    // Two-step query: Step 1 returns user IDs, Step 2 returns profiles
    const mockServiceClient = buildMultiTableClient(
      // Step 1: user_roles query — returns user_id only
      [
        { user_id: CONSULTANT_ID_1 },
        { user_id: CONSULTANT_ID_2 },
      ],
      // Step 2: profiles query — returns profile data
      [
        { id: CONSULTANT_ID_1, first_name: 'Juan', last_name: 'Pérez', email: 'juan@example.com' },
        { id: CONSULTANT_ID_2, first_name: 'María', last_name: 'García', email: 'maria@example.com' },
      ],
      null,
      null,
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
      // Step 1: user_roles returns one consultant
      [{ user_id: CONSULTANT_ID_1 }],
      // Step 2: profiles returns the profile data
      [{ id: CONSULTANT_ID_1, first_name: 'Juan', last_name: 'Pérez', email: 'juan@example.com' }],
      null,
      null,
    );

    mockCreateServiceRoleClient.mockReturnValueOnce(mockServiceClient);

    const { req, res } = createMocks({
      method: 'GET',
      query: {},
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    // Should return ONLY the role-based consultant
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
      // Step 1: user_roles filtered by school_id
      [{ user_id: CONSULTANT_ID_1 }],
      // Step 2: profiles
      [{ id: CONSULTANT_ID_1, first_name: 'Juan', last_name: 'Pérez', email: 'juan@example.com' }],
      null,
      null,
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

  it('should deduplicate consultants by user_id from roles query', async () => {
    mockCheckIsAdmin.mockResolvedValueOnce({
      isAdmin: true,
      user: { id: ADMIN_ID },
      error: null,
    });

    const mockServiceClient = buildMultiTableClient(
      // Step 1: user_roles may have duplicates (but we extract unique IDs)
      [
        { user_id: CONSULTANT_ID_1 },
        { user_id: CONSULTANT_ID_1 }, // duplicate
        { user_id: CONSULTANT_ID_2 },
      ],
      // Step 2: profiles returns data for unique IDs
      [
        { id: CONSULTANT_ID_1, first_name: 'Juan', last_name: 'Pérez', email: 'juan@example.com' },
        { id: CONSULTANT_ID_2, first_name: 'María', last_name: 'García', email: 'maria@example.com' },
      ],
      null,
      null,
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
      null, // roleData error
      [],
      { message: 'Database error' }, // roleError
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
      // Step 1: user_roles returns both users
      [
        { user_id: CONSULTANT_ID_1 },
        { user_id: CONSULTANT_ID_2 },
      ],
      // Step 2: profiles returns only one (missing profile for CONSULTANT_ID_2)
      [
        { id: CONSULTANT_ID_1, first_name: 'Juan', last_name: 'Pérez', email: 'juan@example.com' },
      ],
      null,
      null,
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
      // Step 1: user_roles returns IDs (order doesn't matter)
      [
        { user_id: CONSULTANT_ID_2 },
        { user_id: CONSULTANT_ID_1 },
        { user_id: CONSULTANT_ID_3 },
      ],
      // Step 2: profiles returns profile data (will be sorted by endpoint)
      [
        { id: CONSULTANT_ID_2, first_name: 'María', last_name: 'Zúñiga', email: 'z@example.com' },
        { id: CONSULTANT_ID_1, first_name: 'Ana', last_name: 'Álvarez', email: 'a@example.com' },
        { id: CONSULTANT_ID_3, first_name: 'Pedro', last_name: 'Álvarez', email: 'pa@example.com' },
      ],
      null,
      null,
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

  it('should include globally-scoped consultants when filtering by school_id', async () => {
    mockCheckIsAdmin.mockResolvedValueOnce({
      isAdmin: true,
      user: { id: ADMIN_ID },
      error: null,
    });

    const GLOBAL_CONSULTANT_ID = '55555555-5555-4555-8555-555555555555';

    const mockServiceClient = buildMultiTableClient(
      // Step 1: user_roles returns school-scoped + global-scoped (school_id IS NULL)
      [
        { user_id: CONSULTANT_ID_1 }, // school-scoped
        { user_id: GLOBAL_CONSULTANT_ID }, // global-scoped (school_id is null in DB)
      ],
      // Step 2: profiles returns both
      [
        { id: CONSULTANT_ID_1, first_name: 'Juan', last_name: 'Pérez', email: 'juan@example.com' },
        { id: GLOBAL_CONSULTANT_ID, first_name: 'Carlos', last_name: 'Rodríguez', email: 'carlos@example.com' },
      ],
      null,
      null,
    );

    mockCreateServiceRoleClient.mockReturnValueOnce(mockServiceClient);

    const { req, res } = createMocks({
      method: 'GET',
      query: { school_id: SCHOOL_ID.toString() },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    // Should include both school-scoped and global consultants
    expect(data.data.consultants).toHaveLength(2);
    const lastNames = data.data.consultants.map((c: any) => c.last_name);
    expect(lastNames).toContain('Pérez');
    expect(lastNames).toContain('Rodríguez');
  });

  it('should return empty list when no consultants match', async () => {
    mockCheckIsAdmin.mockResolvedValueOnce({
      isAdmin: true,
      user: { id: ADMIN_ID },
      error: null,
    });

    const mockServiceClient = buildMultiTableClient(
      // Step 1: user_roles returns empty
      [],
      // Step 2: profiles not called
      [],
      null,
      null,
    );

    mockCreateServiceRoleClient.mockReturnValueOnce(mockServiceClient);

    const { req, res } = createMocks({
      method: 'GET',
      query: { school_id: '999' },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data.data.consultants).toHaveLength(0);
  });
});
