// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';

// Hoisted mock functions
const {
  mockGetApiUser,
  mockCreateServiceRoleClient,
  mockCheckIsAdmin,
  mockGetUserRoles,
  mockGetHighestRole,
} = vi.hoisted(() => ({
  mockGetApiUser: vi.fn(),
  mockCreateServiceRoleClient: vi.fn(),
  mockCheckIsAdmin: vi.fn(),
  mockGetUserRoles: vi.fn(),
  mockGetHighestRole: vi.fn(),
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

vi.mock('../../../utils/roleUtils', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    getUserRoles: mockGetUserRoles,
    getHighestRole: mockGetHighestRole,
  };
});

// Import handlers AFTER mocks
import singleHandler from '../../../pages/api/sessions/[id]/ical';
import batchHandler from '../../../pages/api/sessions/ical';
import seriesHandler from '../../../pages/api/sessions/series/[groupId]/ical';

// Valid UUIDs for test data
const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const CONSULTANT_ID = '22222222-2222-4222-8222-222222222222';
const SESSION_ID = '44444444-4444-4444-8444-444444444444';
const SESSION_ID_2 = '55555555-5555-4555-8555-555555555555';
const GROUP_ID = '66666666-6666-4666-8666-666666666666';
const SCHOOL_ID = 1;
const GC_ID = '77777777-7777-4777-8777-777777777777';

/**
 * Build a chainable Supabase mock
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
      return vi.fn(() => new Proxy({}, handler));
    },
  };

  return new Proxy({}, handler);
}

const mockSession1 = {
  id: SESSION_ID,
  title: 'Sesion de Prueba',
  description: 'Descripcion de sesion',
  objectives: 'Objetivos principales',
  session_date: '2026-03-15',
  start_time: '09:00:00',
  end_time: '10:00:00',
  location: 'Sala A',
  meeting_link: null,
  status: 'programada',
  school_id: SCHOOL_ID,
  growth_community_id: GC_ID,
  is_active: true,
  schools: { name: 'Escuela Test' },
  growth_communities: { name: 'Comunidad Test' },
  session_facilitators: [],
};

const mockSession2 = {
  id: SESSION_ID_2,
  title: 'Sesion Online',
  description: null,
  objectives: null,
  session_date: '2026-03-22',
  start_time: '14:00:00',
  end_time: '15:00:00',
  location: null,
  meeting_link: 'https://meet.google.com/abc-def',
  status: 'en_progreso',
  school_id: SCHOOL_ID,
  growth_community_id: GC_ID,
  is_active: true,
  schools: { name: 'Escuela Test' },
  growth_communities: { name: 'Comunidad Test' },
  session_facilitators: [],
};

describe('GET /api/sessions/[id]/ical', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 with calendar content for authorized admin', async () => {
    mockGetApiUser.mockResolvedValue({
      user: { id: ADMIN_ID },
      error: null,
    });

    mockGetUserRoles.mockResolvedValue([
      { role_type: 'admin', community_id: null, school_id: null },
    ]);
    mockGetHighestRole.mockReturnValue('admin');

    const mockClient = {
      from: vi.fn((table: string) => {
        if (table === 'consultor_sessions') {
          return buildChainableQuery([mockSession1]);
        }
        if (table === 'session_facilitators') {
          return buildChainableQuery([]);
        }
        return buildChainableQuery([]);
      }),
    };

    mockCreateServiceRoleClient.mockReturnValue(mockClient);

    const { req, res } = createMocks({
      method: 'GET',
      query: { id: SESSION_ID },
    });

    await singleHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const content = res._getData();
    expect(typeof content).toBe('string');
    expect(content).toContain('BEGIN:VCALENDAR');
    expect(content).toContain('END:VCALENDAR');
  });

  it('returns 400 for invalid UUID', async () => {
    const { req, res } = createMocks({
      method: 'GET',
      query: { id: 'not-a-uuid' },
    });

    await singleHandler(req, res);

    expect(res._getStatusCode()).toBe(400);
  });

  it('returns 401 for unauthenticated user', async () => {
    mockGetApiUser.mockResolvedValue({
      user: null,
      error: new Error('No session'),
    });

    const { req, res } = createMocks({
      method: 'GET',
      query: { id: SESSION_ID },
    });

    await singleHandler(req, res);

    expect(res._getStatusCode()).toBe(401);
  });

  it('returns 404 for inactive session (filtered by is_active)', async () => {
    mockGetApiUser.mockResolvedValue({
      user: { id: ADMIN_ID },
      error: null,
    });

    mockGetUserRoles.mockResolvedValue([
      { role_type: 'admin', community_id: null, school_id: null },
    ]);
    mockGetHighestRole.mockReturnValue('admin');

    // .eq('is_active', true).single() returns null because session is inactive
    const mockClient = {
      from: vi.fn(() => buildChainableQuery([])), // empty = no session found
    };

    mockCreateServiceRoleClient.mockReturnValue(mockClient);

    const { req, res } = createMocks({
      method: 'GET',
      query: { id: SESSION_ID },
    });

    await singleHandler(req, res);

    expect(res._getStatusCode()).toBe(404);
  });

  it('returns 405 for non-GET request', async () => {
    const { req, res } = createMocks({
      method: 'POST',
      query: { id: SESSION_ID },
    });

    await singleHandler(req, res);

    expect(res._getStatusCode()).toBe(405);
  });
});

describe('GET /api/sessions/ical', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 with batch calendar content for admin', async () => {
    mockGetApiUser.mockResolvedValue({
      user: { id: ADMIN_ID },
      error: null,
    });

    mockGetUserRoles.mockResolvedValue([
      { role_type: 'admin', community_id: null, school_id: null },
    ]);
    mockGetHighestRole.mockReturnValue('admin');

    const mockClient = {
      from: vi.fn(() => buildChainableQuery([mockSession1, mockSession2])),
    };

    mockCreateServiceRoleClient.mockReturnValue(mockClient);

    const { req, res } = createMocks({
      method: 'GET',
      query: {},
    });

    await batchHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const content = res._getData();
    expect(typeof content).toBe('string');
    expect(content).toContain('BEGIN:VCALENDAR');
  });

  it('returns 400 when result count exceeds 100', async () => {
    mockGetApiUser.mockResolvedValue({
      user: { id: ADMIN_ID },
      error: null,
    });

    mockGetUserRoles.mockResolvedValue([
      { role_type: 'admin', community_id: null, school_id: null },
    ]);
    mockGetHighestRole.mockReturnValue('admin');

    // Create 101 mock sessions
    const tooManySessions = Array.from({ length: 101 }, (_, i) => ({
      ...mockSession1,
      id: `${String(i).padStart(8, '0')}-0000-4000-8000-000000000000`,
      title: `Sesion ${i}`,
    }));

    const mockClient = {
      from: vi.fn(() => buildChainableQuery(tooManySessions)),
    };

    mockCreateServiceRoleClient.mockReturnValue(mockClient);

    const { req, res } = createMocks({
      method: 'GET',
      query: {},
    });

    await batchHandler(req, res);

    expect(res._getStatusCode()).toBe(400);
  });

  it('returns 401 for unauthenticated user', async () => {
    mockGetApiUser.mockResolvedValue({
      user: null,
      error: new Error('No session'),
    });

    const { req, res } = createMocks({
      method: 'GET',
      query: {},
    });

    await batchHandler(req, res);

    expect(res._getStatusCode()).toBe(401);
  });

  it('returns 405 for non-GET request', async () => {
    const { req, res } = createMocks({
      method: 'POST',
      query: {},
    });

    await batchHandler(req, res);

    expect(res._getStatusCode()).toBe(405);
  });
});

describe('GET /api/sessions/series/[groupId]/ical', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 with series calendar for admin', async () => {
    mockCheckIsAdmin.mockResolvedValue({
      isAdmin: true,
      user: { id: ADMIN_ID },
      error: null,
    });

    const seriesSession1 = { ...mockSession1, recurrence_group_id: GROUP_ID, session_number: 1 };
    const seriesSession2 = { ...mockSession2, recurrence_group_id: GROUP_ID, session_number: 2 };

    const mockClient = {
      from: vi.fn(() => buildChainableQuery([seriesSession1, seriesSession2])),
    };

    mockCreateServiceRoleClient.mockReturnValue(mockClient);

    const { req, res } = createMocks({
      method: 'GET',
      query: { groupId: GROUP_ID },
    });

    await seriesHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const content = res._getData();
    expect(typeof content).toBe('string');
    expect(content).toContain('BEGIN:VCALENDAR');
  });

  it('returns 403 for non-admin user', async () => {
    mockCheckIsAdmin.mockResolvedValue({
      isAdmin: false,
      user: { id: CONSULTANT_ID },
      error: null,
    });

    const { req, res } = createMocks({
      method: 'GET',
      query: { groupId: GROUP_ID },
    });

    await seriesHandler(req, res);

    expect(res._getStatusCode()).toBe(403);
  });

  it('returns 400 for invalid groupId UUID', async () => {
    const { req, res } = createMocks({
      method: 'GET',
      query: { groupId: 'not-a-uuid' },
    });

    await seriesHandler(req, res);

    expect(res._getStatusCode()).toBe(400);
  });

  it('returns 200 with empty calendar for empty series', async () => {
    mockCheckIsAdmin.mockResolvedValue({
      isAdmin: true,
      user: { id: ADMIN_ID },
      error: null,
    });

    const mockClient = {
      from: vi.fn(() => buildChainableQuery([])),
    };

    mockCreateServiceRoleClient.mockReturnValue(mockClient);

    const { req, res } = createMocks({
      method: 'GET',
      query: { groupId: GROUP_ID },
    });

    await seriesHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const content = res._getData();
    expect(typeof content).toBe('string');
    expect(content).toContain('BEGIN:VCALENDAR');
  });

  it('returns 405 for non-GET request', async () => {
    const { req, res } = createMocks({
      method: 'POST',
      query: { groupId: GROUP_ID },
    });

    await seriesHandler(req, res);

    expect(res._getStatusCode()).toBe(405);
  });
});
