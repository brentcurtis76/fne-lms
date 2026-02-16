// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';

const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const CONSULTANT_ID_1 = '22222222-2222-4222-8222-222222222222';
const SESSION_ID = '55555555-5555-4555-8555-555555555555';
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

import handler from '../../../pages/api/sessions/[id]/approve';

/**
 * Build a chainable Supabase query mock.
 * When `single()` is called, resolves with `{ data: singleItem, error }`.
 * When awaited without `single()`, resolves with `{ data: arrayData, error }`.
 */
function buildChainableQuery(
  data: unknown[] | null = [],
  error: unknown = null,
  singleData: unknown = null,
) {
  const proxyHandler: ProxyHandler<Record<string, unknown>> = {
    get(_target, prop) {
      if (prop === 'then') {
        return (resolve: (value: unknown) => void) => resolve({ data, error });
      }
      if (prop === 'single') {
        return vi.fn(async () => ({
          data: singleData !== null ? singleData : (data && data.length > 0 ? data[0] : null),
          error,
        }));
      }
      return vi.fn(() => new Proxy({}, proxyHandler));
    },
  };

  return new Proxy({}, proxyHandler);
}

function buildApproveClient(options: {
  sessionData?: Record<string, unknown>;
  sessionError?: unknown;
  facilitatorData?: unknown[];
  facilitatorError?: unknown;
  updateData?: Record<string, unknown>;
  updateError?: unknown;
}) {
  const {
    sessionData = { id: SESSION_ID, status: 'borrador', school_id: SCHOOL_ID },
    sessionError = null,
    facilitatorData = [{ user_id: CONSULTANT_ID_1, is_lead: true, facilitator_role: 'consultor_externo' }],
    facilitatorError = null,
    updateData = { id: SESSION_ID, status: 'programada', school_id: SCHOOL_ID },
    updateError = null,
  } = options;

  let sessionCallCount = 0;
  return {
    from: vi.fn((table: string) => {
      if (table === 'consultor_sessions') {
        sessionCallCount++;
        if (sessionCallCount === 1) {
          // First call: fetch session via .select('*').eq('id', id).single()
          return buildChainableQuery(
            sessionData ? [sessionData] : null,
            sessionError,
            sessionData
          );
        } else {
          // Second call: update via .update({}).eq('id', id).select('*').single()
          return buildChainableQuery(
            updateData ? [updateData] : null,
            updateError,
            updateData
          );
        }
      }
      if (table === 'session_facilitators') {
        return buildChainableQuery(facilitatorData, facilitatorError);
      }
      if (table === 'session_activity_log') {
        const insertHandler: ProxyHandler<Record<string, unknown>> = {
          get(_target, prop) {
            if (prop === 'then') {
              return (resolve: (v: unknown) => void) => resolve({ data: null, error: null });
            }
            return vi.fn(() => new Proxy({}, insertHandler));
          },
        };
        return new Proxy({}, insertHandler);
      }
      return buildChainableQuery([], null);
    }),
  };
}

describe('POST /api/sessions/[id]/approve — Facilitator Validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should reject approval when session has zero facilitators', async () => {
    mockCheckIsAdmin.mockResolvedValueOnce({
      isAdmin: true,
      user: { id: ADMIN_ID },
      error: null,
    });

    mockValidateFacilitatorIntegrity.mockResolvedValueOnce({
      valid: false,
      errors: ['Debe asignar al menos un facilitador a la sesión'],
    });

    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildApproveClient({ facilitatorData: [] })
    );

    const { req, res } = createMocks({
      method: 'POST',
      query: { id: SESSION_ID },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    const data = JSON.parse(res._getData());
    expect(data.error).toContain('No se puede aprobar la sesión');
    expect(data.error).toContain('facilitador');
  });

  it('should reject approval when facilitator lacks consultor role', async () => {
    mockCheckIsAdmin.mockResolvedValueOnce({
      isAdmin: true,
      user: { id: ADMIN_ID },
      error: null,
    });

    mockValidateFacilitatorIntegrity.mockResolvedValueOnce({
      valid: false,
      errors: [`El usuario ${CONSULTANT_ID_1} no tiene un rol activo de consultor para esta escuela`],
    });

    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildApproveClient({})
    );

    const { req, res } = createMocks({
      method: 'POST',
      query: { id: SESSION_ID },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    const data = JSON.parse(res._getData());
    expect(data.error).toContain('No se puede aprobar la sesión');
    expect(data.error).toContain('consultor');
  });

  it('should allow approval when facilitator validation passes', async () => {
    mockCheckIsAdmin.mockResolvedValueOnce({
      isAdmin: true,
      user: { id: ADMIN_ID },
      error: null,
    });

    mockValidateFacilitatorIntegrity.mockResolvedValueOnce({
      valid: true,
      errors: [],
    });

    const updatedSession = { id: SESSION_ID, status: 'programada', school_id: SCHOOL_ID };
    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildApproveClient({ updateData: updatedSession })
    );

    const { req, res } = createMocks({
      method: 'POST',
      query: { id: SESSION_ID },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data.data.session).toBeDefined();
  });

  it('should reject approval when session is not in approvable status', async () => {
    mockCheckIsAdmin.mockResolvedValueOnce({
      isAdmin: true,
      user: { id: ADMIN_ID },
      error: null,
    });

    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildApproveClient({
        sessionData: { id: SESSION_ID, status: 'completada', school_id: SCHOOL_ID },
      })
    );

    const { req, res } = createMocks({
      method: 'POST',
      query: { id: SESSION_ID },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    const data = JSON.parse(res._getData());
    expect(data.error).toContain('borrador');
  });
});
