// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';

// Hoisted mock functions
const { mockGetApiUser, mockCreateServiceRoleClient, mockGetUserRoles, mockGetHighestRole } = vi.hoisted(() => ({
  mockGetApiUser: vi.fn(),
  mockCreateServiceRoleClient: vi.fn(),
  mockGetUserRoles: vi.fn(),
  mockGetHighestRole: vi.fn(),
}));

vi.mock('../../../lib/api-auth', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return {
    ...actual,
    getApiUser: mockGetApiUser,
    createServiceRoleClient: mockCreateServiceRoleClient,
  };
});

vi.mock('../../../utils/roleUtils', () => ({
  getUserRoles: mockGetUserRoles,
  getHighestRole: mockGetHighestRole,
}));

// Import handler AFTER mocks
import handler from '../../../pages/api/sessions/reports/analytics';

// Valid UUIDs for test data
const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const CONSULTOR_ID = '22222222-2222-4222-8222-222222222222';
const DOCENTE_ID = '33333333-3333-4333-8333-333333333333';
const SESSION_ID_1 = '44444444-4444-4444-8444-444444444444';
const SESSION_ID_2 = '55555555-5555-4555-8555-555555555555';
const GC_ID = '66666666-6666-4666-8666-666666666666';

// Helper to build a chainable Supabase mock query
function buildChainableQuery(data: unknown[] | null = [], error: unknown = null) {
  const result = { data, error };

  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  const methods = ['select', 'eq', 'in', 'gte', 'lte', 'single', 'maybeSingle', 'order', 'limit'];

  for (const method of methods) {
    chain[method] = vi.fn().mockReturnValue(chain);
  }

  // Terminal methods return the result
  chain.select = vi.fn().mockReturnValue(chain);
  chain.then = vi.fn().mockImplementation((resolve: (value: unknown) => void) => resolve(result));

  // Make the chain itself thenable and return the result when awaited
  const proxy = new Proxy(chain, {
    get(target, prop) {
      if (prop === 'then') {
        return (resolve: (value: unknown) => void) => resolve(result);
      }
      return target[prop as string] || vi.fn().mockReturnValue(target);
    },
  });

  return proxy;
}

function createMockSupabaseClient(overrides: Record<string, unknown> = {}) {
  const defaultSessions = [
    {
      id: SESSION_ID_1,
      title: 'Sesion 1',
      session_date: '2026-01-15',
      status: 'completada',
      modality: 'presencial',
      school_id: 1,
      growth_community_id: GC_ID,
      scheduled_duration_minutes: 120,
      actual_duration_minutes: 110,
    },
    {
      id: SESSION_ID_2,
      title: 'Sesion 2',
      session_date: '2026-01-20',
      status: 'cancelada',
      modality: 'online',
      school_id: 1,
      growth_community_id: GC_ID,
      scheduled_duration_minutes: 90,
      actual_duration_minutes: null,
    },
  ];

  const defaultAttendees = [
    { session_id: SESSION_ID_1, expected: true, attended: true },
    { session_id: SESSION_ID_1, expected: true, attended: true },
    { session_id: SESSION_ID_1, expected: true, attended: false },
  ];

  const defaultFacilitators = [
    { session_id: SESSION_ID_1, user_id: CONSULTOR_ID, is_lead: true },
  ];

  const defaultSchools = [{ id: 1, name: 'Escuela Test' }];
  const defaultGCs = [{ id: GC_ID, name: 'Comunidad Test' }];
  const defaultProfiles = [{ id: CONSULTOR_ID, first_name: 'Test', last_name: 'Consultor' }];

  const tableData: Record<string, { data: unknown[]; overrideEq?: Record<string, unknown[]> }> = {
    consultor_sessions: { data: (overrides.sessions as unknown[]) || defaultSessions },
    session_attendees: { data: (overrides.attendees as unknown[]) || defaultAttendees },
    session_facilitators: { data: (overrides.facilitators as unknown[]) || defaultFacilitators },
    schools: { data: (overrides.schools as unknown[]) || defaultSchools },
    growth_communities: { data: (overrides.gcs as unknown[]) || defaultGCs },
    profiles: { data: (overrides.profiles as unknown[]) || defaultProfiles },
  };

  return {
    from: vi.fn((table: string) => {
      const tData = tableData[table] || { data: [] };
      return buildChainableQuery(tData.data as unknown[]);
    }),
  };
}

describe('Session Reports Analytics API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ============================================================
  // Test 1: Unauthenticated request returns 401
  // ============================================================
  it('should return 401 for unauthenticated request', async () => {
    mockGetApiUser.mockResolvedValue({ user: null, error: new Error('No session') });

    const { req, res } = createMocks({ method: 'GET' });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(401);
    const data = res._getJSONData();
    expect(data.error).toContain('Autenticacion requerida');
  });

  // ============================================================
  // Test 2: Non-admin/non-consultor role returns 403
  // ============================================================
  it('should return 403 for unauthorized role (docente)', async () => {
    mockGetApiUser.mockResolvedValue({
      user: { id: DOCENTE_ID, email: 'docente@test.com' },
      error: null,
    });
    mockCreateServiceRoleClient.mockReturnValue(createMockSupabaseClient());
    mockGetUserRoles.mockResolvedValue([{ role_type: 'docente' }]);
    mockGetHighestRole.mockReturnValue('docente');

    const { req, res } = createMocks({ method: 'GET' });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(403);
    const data = res._getJSONData();
    expect(data.error).toContain('Acceso denegado');
  });

  // ============================================================
  // Test 3: Admin gets full analytics including top_consultants
  // ============================================================
  it('should return full analytics for admin including top_consultants', async () => {
    mockGetApiUser.mockResolvedValue({
      user: { id: ADMIN_ID, email: 'admin@test.com' },
      error: null,
    });
    mockCreateServiceRoleClient.mockReturnValue(createMockSupabaseClient());
    mockGetUserRoles.mockResolvedValue([{ role_type: 'admin' }]);
    mockGetHighestRole.mockReturnValue('admin');

    const { req, res } = createMocks({ method: 'GET' });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data.data).toBeDefined();
    expect(data.data.kpis).toBeDefined();
    expect(data.data.kpis.total_sessions).toBe(2);
    expect(data.data.kpis.completed_sessions).toBe(1);
    expect(data.data.kpis.cancelled_sessions).toBe(1);
    expect(data.data.status_distribution).toBeDefined();
    expect(data.data.modality_distribution).toBeDefined();
    expect(data.data.sessions_by_month).toBeDefined();
    expect(data.data.sessions_by_school).toBeDefined();
    expect(data.data.attendance_trends).toBeDefined();
    expect(data.data.top_consultants).toBeDefined();
    expect(data.data.recent_sessions).toBeDefined();
  });

  // ============================================================
  // Test 4: Consultant gets filtered analytics, no top_consultants
  // ============================================================
  it('should return filtered analytics for consultor without top_consultants', async () => {
    const mockClient = createMockSupabaseClient({
      facilitators: [{ session_id: SESSION_ID_1, user_id: CONSULTOR_ID, is_lead: true }],
    });
    mockGetApiUser.mockResolvedValue({
      user: { id: CONSULTOR_ID, email: 'consultor@test.com' },
      error: null,
    });
    mockCreateServiceRoleClient.mockReturnValue(mockClient);
    mockGetUserRoles.mockResolvedValue([{ role_type: 'consultor' }]);
    mockGetHighestRole.mockReturnValue('consultor');

    const { req, res } = createMocks({ method: 'GET' });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data.data).toBeDefined();
    expect(data.data.kpis).toBeDefined();
    // Consultant should NOT have top_consultants
    expect(data.data.top_consultants).toBeUndefined();
  });

  // ============================================================
  // Test 5: School filter works correctly
  // ============================================================
  it('should accept school_id filter parameter', async () => {
    mockGetApiUser.mockResolvedValue({
      user: { id: ADMIN_ID, email: 'admin@test.com' },
      error: null,
    });
    const mockClient = createMockSupabaseClient();
    mockCreateServiceRoleClient.mockReturnValue(mockClient);
    mockGetUserRoles.mockResolvedValue([{ role_type: 'admin' }]);
    mockGetHighestRole.mockReturnValue('admin');

    const { req, res } = createMocks({
      method: 'GET',
      query: { school_id: '1' },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);
    // The query was built with school_id filter - mock returns same data regardless
    // but the handler accepted the parameter without error
    expect(mockClient.from).toHaveBeenCalled();
  });

  // ============================================================
  // Test 6: Date range filter works correctly
  // ============================================================
  it('should accept date range filter parameters', async () => {
    mockGetApiUser.mockResolvedValue({
      user: { id: ADMIN_ID, email: 'admin@test.com' },
      error: null,
    });
    const mockClient = createMockSupabaseClient();
    mockCreateServiceRoleClient.mockReturnValue(mockClient);
    mockGetUserRoles.mockResolvedValue([{ role_type: 'admin' }]);
    mockGetHighestRole.mockReturnValue('admin');

    const { req, res } = createMocks({
      method: 'GET',
      query: { date_from: '2026-01-01', date_to: '2026-12-31' },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data.data.kpis).toBeDefined();
  });

  // ============================================================
  // Test 7: Empty result set returns zero-valued KPIs
  // ============================================================
  it('should return zero-valued KPIs for empty results', async () => {
    mockGetApiUser.mockResolvedValue({
      user: { id: ADMIN_ID, email: 'admin@test.com' },
      error: null,
    });
    const emptyClient = createMockSupabaseClient({ sessions: [] });
    mockCreateServiceRoleClient.mockReturnValue(emptyClient);
    mockGetUserRoles.mockResolvedValue([{ role_type: 'admin' }]);
    mockGetHighestRole.mockReturnValue('admin');

    const { req, res } = createMocks({ method: 'GET' });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data.data.kpis.total_sessions).toBe(0);
    expect(data.data.kpis.completed_sessions).toBe(0);
    expect(data.data.kpis.cancelled_sessions).toBe(0);
    expect(data.data.kpis.completion_rate).toBe(0);
    expect(data.data.kpis.total_hours_scheduled).toBe(0);
    expect(data.data.kpis.total_hours_actual).toBe(0);
    expect(data.data.kpis.avg_attendance_rate).toBe(0);
    expect(data.data.kpis.sessions_pending_report).toBe(0);
    expect(data.data.kpis.upcoming_sessions).toBe(0);
    expect(data.data.status_distribution).toEqual([]);
    expect(data.data.sessions_by_month).toEqual([]);
    expect(data.data.recent_sessions).toEqual([]);
  });

  // ============================================================
  // Test 8: Invalid school_id returns 400
  // ============================================================
  it('should return 400 for invalid school_id', async () => {
    mockGetApiUser.mockResolvedValue({
      user: { id: ADMIN_ID, email: 'admin@test.com' },
      error: null,
    });
    mockCreateServiceRoleClient.mockReturnValue(createMockSupabaseClient());
    mockGetUserRoles.mockResolvedValue([{ role_type: 'admin' }]);
    mockGetHighestRole.mockReturnValue('admin');

    const { req, res } = createMocks({
      method: 'GET',
      query: { school_id: 'not-a-number' },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(400);
    const data = res._getJSONData();
    expect(data.error).toContain('school_id debe ser un entero valido');
  });

  // ============================================================
  // Test 9: Method not allowed for POST
  // ============================================================
  it('should return 405 for POST method', async () => {
    const { req, res } = createMocks({ method: 'POST' });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(405);
  });

  // ============================================================
  // Test 10: Invalid growth_community_id UUID returns 400
  // ============================================================
  it('should return 400 for invalid growth_community_id UUID', async () => {
    mockGetApiUser.mockResolvedValue({
      user: { id: ADMIN_ID, email: 'admin@test.com' },
      error: null,
    });
    mockCreateServiceRoleClient.mockReturnValue(createMockSupabaseClient());
    mockGetUserRoles.mockResolvedValue([{ role_type: 'admin' }]);
    mockGetHighestRole.mockReturnValue('admin');

    const { req, res } = createMocks({
      method: 'GET',
      query: { growth_community_id: 'not-a-uuid' },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(400);
    const data = res._getJSONData();
    expect(data.error).toContain('growth_community_id debe ser un UUID valido');
  });

  // ============================================================
  // Test 11: Consultant cannot use consultant_id filter
  // ============================================================
  it('should return 403 when consultor tries to use consultant_id filter', async () => {
    mockGetApiUser.mockResolvedValue({
      user: { id: CONSULTOR_ID, email: 'consultor@test.com' },
      error: null,
    });
    mockCreateServiceRoleClient.mockReturnValue(createMockSupabaseClient());
    mockGetUserRoles.mockResolvedValue([{ role_type: 'consultor' }]);
    mockGetHighestRole.mockReturnValue('consultor');

    const { req, res } = createMocks({
      method: 'GET',
      query: { consultant_id: ADMIN_ID },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(403);
    const data = res._getJSONData();
    expect(data.error).toContain('Solo administradores pueden filtrar por consultant_id');
  });
});
