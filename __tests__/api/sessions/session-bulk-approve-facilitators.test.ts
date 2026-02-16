// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';

const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const CONSULTANT_ID_1 = '22222222-2222-4222-8222-222222222222';
const SESSION_ID_1 = '55555555-5555-4555-8555-555555555555';
const SESSION_ID_2 = '66666666-6666-4666-8666-666666666666';
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

import handler from '../../../pages/api/sessions/bulk-approve';

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
  sessionsData: unknown[] | null = [],
  sessionsError: unknown = null,
  facilitatorData: unknown[] | null = [],
  facilitatorError: unknown = null,
) {
  return {
    from: vi.fn((table: string) => {
      if (table === 'consultor_sessions') {
        return buildChainableQuery(sessionsData, sessionsError);
      }
      if (table === 'session_facilitators') {
        return buildChainableQuery(facilitatorData, facilitatorError);
      }
      if (table === 'session_activity_log') {
        return buildChainableQuery([], null);
      }
      return buildChainableQuery([], null);
    }),
  };
}

describe('POST /api/sessions/bulk-approve — Facilitator Validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should reject bulk approval when any session has zero facilitators (atomic)', async () => {
    mockCheckIsAdmin.mockResolvedValueOnce({
      isAdmin: true,
      user: { id: ADMIN_ID },
      error: null,
    });

    // First session passes, second fails
    mockValidateFacilitatorIntegrity
      .mockResolvedValueOnce({ valid: true, errors: [] })
      .mockResolvedValueOnce({
        valid: false,
        errors: ['Debe asignar al menos un facilitador a la sesión'],
      });

    const sessionsData = [
      { id: SESSION_ID_1, status: 'borrador', school_id: SCHOOL_ID },
      { id: SESSION_ID_2, status: 'borrador', school_id: SCHOOL_ID },
    ];

    const facilitatorData = [
      { session_id: SESSION_ID_1, user_id: CONSULTANT_ID_1, is_lead: true, facilitator_role: 'consultor_externo' },
      // SESSION_ID_2 has no facilitators
    ];

    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildMockServiceClient(sessionsData, null, facilitatorData, null)
    );

    const { req, res } = createMocks({
      method: 'POST',
      body: {
        session_ids: [SESSION_ID_1, SESSION_ID_2],
      },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    const data = JSON.parse(res._getData());
    expect(data.error).toContain('No se pueden aprobar las sesiones');
    expect(data.error).toContain(SESSION_ID_2);
  });

  it('should reject bulk approval when any session lacks facilitator consultor role', async () => {
    mockCheckIsAdmin.mockResolvedValueOnce({
      isAdmin: true,
      user: { id: ADMIN_ID },
      error: null,
    });

    mockValidateFacilitatorIntegrity
      .mockResolvedValueOnce({ valid: true, errors: [] })
      .mockResolvedValueOnce({
        valid: false,
        errors: [`El usuario ${CONSULTANT_ID_1} no tiene un rol activo de consultor para esta escuela`],
      });

    const sessionsData = [
      { id: SESSION_ID_1, status: 'borrador', school_id: SCHOOL_ID },
      { id: SESSION_ID_2, status: 'borrador', school_id: SCHOOL_ID },
    ];

    const facilitatorData = [
      { session_id: SESSION_ID_1, user_id: CONSULTANT_ID_1, is_lead: true, facilitator_role: 'consultor_externo' },
      { session_id: SESSION_ID_2, user_id: CONSULTANT_ID_1, is_lead: true, facilitator_role: 'consultor_externo' },
    ];

    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildMockServiceClient(sessionsData, null, facilitatorData, null)
    );

    const { req, res } = createMocks({
      method: 'POST',
      body: {
        session_ids: [SESSION_ID_1, SESSION_ID_2],
      },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    const data = JSON.parse(res._getData());
    expect(data.error).toContain('No se pueden aprobar las sesiones');
    expect(data.error).toContain(SESSION_ID_2);
  });

  it('should allow bulk approval when all sessions have valid facilitators', async () => {
    mockCheckIsAdmin.mockResolvedValueOnce({
      isAdmin: true,
      user: { id: ADMIN_ID },
      error: null,
    });

    mockValidateFacilitatorIntegrity
      .mockResolvedValueOnce({ valid: true, errors: [] })
      .mockResolvedValueOnce({ valid: true, errors: [] });

    const sessionsData = [
      { id: SESSION_ID_1, status: 'borrador', school_id: SCHOOL_ID },
      { id: SESSION_ID_2, status: 'borrador', school_id: SCHOOL_ID },
    ];

    const facilitatorData = [
      { session_id: SESSION_ID_1, user_id: CONSULTANT_ID_1, is_lead: true, facilitator_role: 'consultor_externo' },
      { session_id: SESSION_ID_2, user_id: CONSULTANT_ID_1, is_lead: true, facilitator_role: 'consultor_externo' },
    ];

    const mockClient = buildMockServiceClient(sessionsData, null, facilitatorData, null);

    // Override update behavior
    mockClient.from = vi.fn((table: string) => {
      if (table === 'consultor_sessions') {
        return {
          select: vi.fn(() => ({
            in: vi.fn(() => ({
              in: vi.fn(async () => ({
                data: sessionsData,
                error: null,
              })),
            })),
          })),
          update: vi.fn(() => ({
            in: vi.fn(() => ({
              select: vi.fn(async () => ({
                data: [
                  { id: SESSION_ID_1, status: 'programada', school_id: SCHOOL_ID },
                  { id: SESSION_ID_2, status: 'programada', school_id: SCHOOL_ID },
                ],
                error: null,
              })),
            })),
          })),
        };
      }
      if (table === 'session_facilitators') {
        return {
          select: vi.fn(() => ({
            in: vi.fn(async () => ({
              data: facilitatorData,
              error: null,
            })),
          })),
        };
      }
      if (table === 'session_activity_log') {
        return {
          insert: vi.fn(async () => ({
            data: null,
            error: null,
          })),
        };
      }
      return { select: vi.fn(() => ({ in: vi.fn(async () => ({ data: [], error: null })) })) };
    });

    mockCreateServiceRoleClient.mockReturnValueOnce(mockClient);

    const { req, res } = createMocks({
      method: 'POST',
      body: {
        session_ids: [SESSION_ID_1, SESSION_ID_2],
      },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data.data.approved_count).toBe(2);
  });

  it('should not approve any sessions if validation fails (atomic rejection)', async () => {
    mockCheckIsAdmin.mockResolvedValueOnce({
      isAdmin: true,
      user: { id: ADMIN_ID },
      error: null,
    });

    mockValidateFacilitatorIntegrity
      .mockResolvedValueOnce({ valid: true, errors: [] })
      .mockResolvedValueOnce({
        valid: false,
        errors: ['Debe asignar al menos un facilitador a la sesión'],
      });

    const sessionsData = [
      { id: SESSION_ID_1, status: 'borrador', school_id: SCHOOL_ID },
      { id: SESSION_ID_2, status: 'borrador', school_id: SCHOOL_ID },
    ];

    const facilitatorData = [
      { session_id: SESSION_ID_1, user_id: CONSULTANT_ID_1, is_lead: true, facilitator_role: 'consultor_externo' },
    ];

    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildMockServiceClient(sessionsData, null, facilitatorData, null)
    );

    const { req, res } = createMocks({
      method: 'POST',
      body: {
        session_ids: [SESSION_ID_1, SESSION_ID_2],
      },
    });

    await handler(req, res);

    // Should fail at validation, before any update is attempted
    expect(res._getStatusCode()).toBe(400);
    const data = JSON.parse(res._getData());
    expect(data.error).toContain('No se pueden aprobar las sesiones');
  });
});
