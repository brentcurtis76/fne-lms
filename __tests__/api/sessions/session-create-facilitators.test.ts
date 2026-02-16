// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';

const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const CONSULTANT_ID_1 = '22222222-2222-4222-8222-222222222222';
const CONSULTANT_ID_2 = '33333333-3333-4333-8333-333333333333';
const GROWTH_COMMUNITY_ID = '44444444-4444-4444-8444-444444444444';
const SCHOOL_ID = 1;

const {
  mockCheckIsAdmin,
  mockCreateServiceRoleClient,
  mockValidateFacilitatorIntegrity,
} = vi.hoisted(() => ({
  mockCheckIsAdmin: vi.fn(),
  mockCreateServiceRoleClient: vi.fn(),
  mockValidateFacilitatorIntegrity: vi.fn(),
}));

vi.mock('../../../lib/api-auth', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    checkIsAdmin: mockCheckIsAdmin,
    createServiceRoleClient: mockCreateServiceRoleClient,
  };
});

vi.mock('../../../lib/utils/facilitator-validation', () => ({
  validateFacilitatorIntegrity: mockValidateFacilitatorIntegrity,
}));

import handler from '../../../pages/api/sessions/index';

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

function buildMockServiceClient(
  gcCheckData: unknown = { id: GROWTH_COMMUNITY_ID },
  gcCheckError: unknown = null,
  insertSessionsData: unknown[] | null = [{ id: 'session-1', school_id: SCHOOL_ID }],
  insertSessionsError: unknown = null,
) {
  return {
    from: vi.fn((table: string) => {
      if (table === 'growth_communities') {
        return buildChainableQuery(gcCheckData ? [gcCheckData] : null, gcCheckError);
      }
      if (table === 'consultor_sessions') {
        return buildChainableQuery(insertSessionsData, insertSessionsError);
      }
      if (table === 'session_facilitators') {
        return buildChainableQuery([], null);
      }
      if (table === 'session_activity_log') {
        return buildChainableQuery([], null);
      }
      return buildChainableQuery([], null);
    }),
  };
}

describe('POST /api/sessions — Facilitator Validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should reject creation when facilitators array is missing', async () => {
    mockCheckIsAdmin.mockResolvedValueOnce({
      isAdmin: true,
      user: { id: ADMIN_ID },
      error: null,
    });

    mockValidateFacilitatorIntegrity.mockResolvedValueOnce({
      valid: false,
      errors: ['Debe asignar al menos un facilitador a la sesión'],
    });

    mockCreateServiceRoleClient.mockReturnValueOnce(buildMockServiceClient());

    const { req, res } = createMocks({
      method: 'POST',
      body: {
        school_id: SCHOOL_ID,
        growth_community_id: GROWTH_COMMUNITY_ID,
        title: 'Test Session',
        session_date: '2026-03-15',
        start_time: '09:00:00',
        end_time: '10:00:00',
        modality: 'presencial',
        location: 'Sala 1',
        // No facilitators
      },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    const data = JSON.parse(res._getData());
    expect(data.error).toContain('facilitador');
  });

  it('should reject creation when facilitators array is empty', async () => {
    mockCheckIsAdmin.mockResolvedValueOnce({
      isAdmin: true,
      user: { id: ADMIN_ID },
      error: null,
    });

    mockValidateFacilitatorIntegrity.mockResolvedValueOnce({
      valid: false,
      errors: ['Debe asignar al menos un facilitador a la sesión'],
    });

    mockCreateServiceRoleClient.mockReturnValueOnce(buildMockServiceClient());

    const { req, res } = createMocks({
      method: 'POST',
      body: {
        school_id: SCHOOL_ID,
        growth_community_id: GROWTH_COMMUNITY_ID,
        title: 'Test Session',
        session_date: '2026-03-15',
        start_time: '09:00:00',
        end_time: '10:00:00',
        modality: 'presencial',
        location: 'Sala 1',
        facilitators: [],
      },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    const data = JSON.parse(res._getData());
    expect(data.error).toContain('facilitador');
  });

  it('should reject creation when lead count is not exactly 1', async () => {
    mockCheckIsAdmin.mockResolvedValueOnce({
      isAdmin: true,
      user: { id: ADMIN_ID },
      error: null,
    });

    mockValidateFacilitatorIntegrity.mockResolvedValueOnce({
      valid: false,
      errors: ['Debe haber exactamente un facilitador principal (is_lead: true)'],
    });

    mockCreateServiceRoleClient.mockReturnValueOnce(buildMockServiceClient());

    const { req, res } = createMocks({
      method: 'POST',
      body: {
        school_id: SCHOOL_ID,
        growth_community_id: GROWTH_COMMUNITY_ID,
        title: 'Test Session',
        session_date: '2026-03-15',
        start_time: '09:00:00',
        end_time: '10:00:00',
        modality: 'presencial',
        location: 'Sala 1',
        facilitators: [
          { user_id: CONSULTANT_ID_1, is_lead: false },
          { user_id: CONSULTANT_ID_2, is_lead: false },
        ],
      },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    const data = JSON.parse(res._getData());
    expect(data.error).toContain('principal');
  });

  it('should reject creation when facilitator lacks consultor role', async () => {
    mockCheckIsAdmin.mockResolvedValueOnce({
      isAdmin: true,
      user: { id: ADMIN_ID },
      error: null,
    });

    mockValidateFacilitatorIntegrity.mockResolvedValueOnce({
      valid: false,
      errors: [`El usuario ${CONSULTANT_ID_2} no tiene un rol activo de consultor para esta escuela`],
    });

    mockCreateServiceRoleClient.mockReturnValueOnce(buildMockServiceClient());

    const { req, res } = createMocks({
      method: 'POST',
      body: {
        school_id: SCHOOL_ID,
        growth_community_id: GROWTH_COMMUNITY_ID,
        title: 'Test Session',
        session_date: '2026-03-15',
        start_time: '09:00:00',
        end_time: '10:00:00',
        modality: 'presencial',
        location: 'Sala 1',
        facilitators: [
          { user_id: CONSULTANT_ID_1, is_lead: true, facilitator_role: 'consultor_externo' },
          { user_id: CONSULTANT_ID_2, is_lead: false, facilitator_role: 'consultor_externo' },
        ],
      },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    const data = JSON.parse(res._getData());
    expect(data.error).toContain('consultor');
  });

  it('should allow creation when facilitator validation passes', async () => {
    mockCheckIsAdmin.mockResolvedValueOnce({
      isAdmin: true,
      user: { id: ADMIN_ID },
      error: null,
    });

    mockValidateFacilitatorIntegrity.mockResolvedValueOnce({
      valid: true,
      errors: [],
    });

    const mockSession = { id: 'session-1', school_id: SCHOOL_ID };
    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildMockServiceClient({ id: GROWTH_COMMUNITY_ID }, null, [mockSession], null)
    );

    const { req, res } = createMocks({
      method: 'POST',
      body: {
        school_id: SCHOOL_ID,
        growth_community_id: GROWTH_COMMUNITY_ID,
        title: 'Test Session',
        session_date: '2026-03-15',
        start_time: '09:00:00',
        end_time: '10:00:00',
        modality: 'presencial',
        location: 'Sala 1',
        facilitators: [
          { user_id: CONSULTANT_ID_1, is_lead: true, facilitator_role: 'consultor_externo' },
        ],
      },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(201);
    const data = JSON.parse(res._getData());
    expect(data.data.sessions).toBeDefined();
    expect(data.data.sessions.length).toBe(1);
  });
});
