// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';

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

vi.mock('../../../lib/utils/facilitator-validation', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    validateFacilitatorIntegrity: vi.fn(),
  };
});

import handler from '../../../pages/api/sessions/[id]/facilitators';
import { validateFacilitatorIntegrity } from '../../../lib/utils/facilitator-validation';

const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const SESSION_ID = '22222222-2222-4222-8222-222222222222';
const CONSULTANT_ID_1 = '33333333-3333-4333-8333-333333333333';
const CONSULTANT_ID_2 = '44444444-4444-4444-8444-444444444444';
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

function buildMockServiceClient(sessionData: any = null, sessionError: any = null) {
  return {
    from: vi.fn((table: string) => {
      if (table === 'consultor_sessions') {
        return buildChainableQuery(sessionData, sessionError);
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

describe('PUT /api/sessions/[id]/facilitators', () => {
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
      method: 'PUT',
      query: { id: SESSION_ID },
      body: { facilitators: [] },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(403);
    const data = JSON.parse(res._getData());
    expect(data.error).toContain('administradores');
  });

  it('should reject invalid session ID', async () => {
    const { req, res } = createMocks({
      method: 'PUT',
      query: { id: 'not-a-uuid' },
      body: { facilitators: [] },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    const data = JSON.parse(res._getData());
    expect(data.error).toContain('ID de sesión inválido');
  });

  it('should reject missing facilitators array', async () => {
    mockCheckIsAdmin.mockResolvedValueOnce({
      isAdmin: true,
      user: { id: ADMIN_ID },
      error: null,
    });

    const { req, res } = createMocks({
      method: 'PUT',
      query: { id: SESSION_ID },
      body: {},
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    const data = JSON.parse(res._getData());
    expect(data.error).toContain('array de consultores');
  });

  it('should reject invalid user_id in facilitators', async () => {
    mockCheckIsAdmin.mockResolvedValueOnce({
      isAdmin: true,
      user: { id: ADMIN_ID },
      error: null,
    });

    const { req, res } = createMocks({
      method: 'PUT',
      query: { id: SESSION_ID },
      body: {
        facilitators: [
          {
            user_id: 'invalid',
            is_lead: true,
            facilitator_role: 'consultor_externo',
          },
        ],
      },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    const data = JSON.parse(res._getData());
    expect(data.error).toContain('user_id');
  });

  it('should reject invalid facilitator_role', async () => {
    mockCheckIsAdmin.mockResolvedValueOnce({
      isAdmin: true,
      user: { id: ADMIN_ID },
      error: null,
    });

    const { req, res } = createMocks({
      method: 'PUT',
      query: { id: SESSION_ID },
      body: {
        facilitators: [
          {
            user_id: CONSULTANT_ID_1,
            is_lead: true,
            facilitator_role: 'invalid_role',
          },
        ],
      },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    const data = JSON.parse(res._getData());
    expect(data.error).toContain('facilitator_role');
  });

  it('should reject when session not found', async () => {
    mockCheckIsAdmin.mockResolvedValueOnce({
      isAdmin: true,
      user: { id: ADMIN_ID },
      error: null,
    });

    const mockServiceClient = buildMockServiceClient(null, { message: 'Not found' });
    mockCreateServiceRoleClient.mockReturnValueOnce(mockServiceClient);

    const { req, res } = createMocks({
      method: 'PUT',
      query: { id: SESSION_ID },
      body: {
        facilitators: [
          {
            user_id: CONSULTANT_ID_1,
            is_lead: true,
            facilitator_role: 'consultor_externo',
          },
        ],
      },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(404);
    const data = JSON.parse(res._getData());
    expect(data.error).toContain('Sesión no encontrada');
  });

  it('should reject when session is completada', async () => {
    mockCheckIsAdmin.mockResolvedValueOnce({
      isAdmin: true,
      user: { id: ADMIN_ID },
      error: null,
    });

    const mockServiceClient = buildMockServiceClient(
      { id: SESSION_ID, school_id: SCHOOL_ID, status: 'completada' },
      null
    );
    mockCreateServiceRoleClient.mockReturnValueOnce(mockServiceClient);

    const { req, res } = createMocks({
      method: 'PUT',
      query: { id: SESSION_ID },
      body: {
        facilitators: [
          {
            user_id: CONSULTANT_ID_1,
            is_lead: true,
            facilitator_role: 'consultor_externo',
          },
        ],
      },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(403);
    const data = JSON.parse(res._getData());
    expect(data.error).toContain('completadas');
  });

  it('should reject when validation fails', async () => {
    mockCheckIsAdmin.mockResolvedValueOnce({
      isAdmin: true,
      user: { id: ADMIN_ID },
      error: null,
    });

    const mockServiceClient = buildMockServiceClient(
      { id: SESSION_ID, school_id: SCHOOL_ID, status: 'programada' },
      null
    );
    mockCreateServiceRoleClient.mockReturnValueOnce(mockServiceClient);

    (validateFacilitatorIntegrity as any).mockResolvedValueOnce({
      valid: false,
      errors: ['Debe haber exactamente un facilitador principal'],
    });

    const { req, res } = createMocks({
      method: 'PUT',
      query: { id: SESSION_ID },
      body: {
        facilitators: [
          {
            user_id: CONSULTANT_ID_1,
            is_lead: false, // No lead specified
            facilitator_role: 'consultor_externo',
          },
        ],
      },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    const data = JSON.parse(res._getData());
    expect(data.error).toContain('Validación de consultores fallida');
  });

  it('should successfully replace facilitators', async () => {
    mockCheckIsAdmin.mockResolvedValueOnce({
      isAdmin: true,
      user: { id: ADMIN_ID },
      error: null,
    });

    const mockServiceClient = buildMockServiceClient(
      { id: SESSION_ID, school_id: SCHOOL_ID, status: 'programada' },
      null
    );
    mockCreateServiceRoleClient.mockReturnValueOnce(mockServiceClient);

    (validateFacilitatorIntegrity as any).mockResolvedValueOnce({
      valid: true,
      errors: [],
    });

    const { req, res } = createMocks({
      method: 'PUT',
      query: { id: SESSION_ID },
      body: {
        facilitators: [
          {
            user_id: CONSULTANT_ID_1,
            is_lead: true,
            facilitator_role: 'consultor_externo',
          },
          {
            user_id: CONSULTANT_ID_2,
            is_lead: false,
            facilitator_role: 'equipo_interno',
          },
        ],
      },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data.data.facilitators).toBeDefined();
  });

  it('should rollback facilitators when insert fails after delete', async () => {
    mockCheckIsAdmin.mockResolvedValueOnce({
      isAdmin: true,
      user: { id: ADMIN_ID },
      error: null,
    });

    // Track operations on session_facilitators to differentiate select/delete/insert
    const facilitatorOps: string[] = [];
    const existingSnapshot = [
      { session_id: SESSION_ID, user_id: CONSULTANT_ID_1, facilitator_role: 'consultor_externo', is_lead: true, created_at: '2026-01-01T00:00:00Z' },
    ];

    const mockServiceClient = {
      from: vi.fn((table: string) => {
        if (table === 'consultor_sessions') {
          return buildChainableQuery(
            { id: SESSION_ID, school_id: SCHOOL_ID, status: 'programada' },
            null
          );
        }
        if (table === 'session_facilitators') {
          // Return a proxy that tracks which operation was called
          const opHandler: ProxyHandler<Record<string, unknown>> = {
            get(_target, prop) {
              if (prop === 'select') {
                facilitatorOps.push('select');
                // Snapshot select — return existing facilitators
                return vi.fn(() => {
                  const eqHandler: ProxyHandler<Record<string, unknown>> = {
                    get(_t, p) {
                      if (p === 'then') return (resolve: (v: unknown) => void) => resolve({ data: existingSnapshot, error: null });
                      return vi.fn(() => new Proxy({}, eqHandler));
                    },
                  };
                  return new Proxy({}, eqHandler);
                });
              }
              if (prop === 'delete') {
                facilitatorOps.push('delete');
                // Delete succeeds
                return vi.fn(() => {
                  const eqHandler: ProxyHandler<Record<string, unknown>> = {
                    get(_t, p) {
                      if (p === 'then') return (resolve: (v: unknown) => void) => resolve({ data: null, error: null });
                      return vi.fn(() => new Proxy({}, eqHandler));
                    },
                  };
                  return new Proxy({}, eqHandler);
                });
              }
              if (prop === 'insert') {
                facilitatorOps.push('insert');
                // First insert call: new facilitators — FAIL
                // Second insert call: rollback — SUCCEED
                const insertCount = facilitatorOps.filter((o) => o === 'insert').length;
                return vi.fn(() => {
                  const selectHandler: ProxyHandler<Record<string, unknown>> = {
                    get(_t, p) {
                      if (p === 'then') {
                        if (insertCount === 1) {
                          // First insert fails
                          return (resolve: (v: unknown) => void) => resolve({ data: null, error: { message: 'Insert constraint violation' } });
                        }
                        // Rollback insert succeeds
                        return (resolve: (v: unknown) => void) => resolve({ data: existingSnapshot, error: null });
                      }
                      return vi.fn(() => new Proxy({}, selectHandler));
                    },
                  };
                  return new Proxy({}, selectHandler);
                });
              }
              if (prop === 'then') {
                return (resolve: (v: unknown) => void) => resolve({ data: [], error: null });
              }
              return vi.fn(() => new Proxy({}, opHandler));
            },
          };
          return new Proxy({}, opHandler);
        }
        if (table === 'session_activity_log') {
          return buildChainableQuery([], null);
        }
        return buildChainableQuery([], null);
      }),
    };

    mockCreateServiceRoleClient.mockReturnValueOnce(mockServiceClient);

    (validateFacilitatorIntegrity as any).mockResolvedValueOnce({
      valid: true,
      errors: [],
    });

    const { req, res } = createMocks({
      method: 'PUT',
      query: { id: SESSION_ID },
      body: {
        facilitators: [
          {
            user_id: CONSULTANT_ID_2,
            is_lead: true,
            facilitator_role: 'consultor_externo',
          },
        ],
      },
    });

    await handler(req, res);

    // Should return 500 error
    expect(res._getStatusCode()).toBe(500);
    const data = JSON.parse(res._getData());
    expect(data.error).toContain('restaurados');

    // Verify rollback insert was attempted (2 inserts: failed new + rollback)
    const insertOps = facilitatorOps.filter((o) => o === 'insert');
    expect(insertOps.length).toBe(2);
  });

  it('should return critical error when rollback also fails', async () => {
    mockCheckIsAdmin.mockResolvedValueOnce({
      isAdmin: true,
      user: { id: ADMIN_ID },
      error: null,
    });

    const facilitatorOps: string[] = [];
    const existingSnapshot = [
      { session_id: SESSION_ID, user_id: CONSULTANT_ID_1, facilitator_role: 'consultor_externo', is_lead: true, created_at: '2026-01-01T00:00:00Z' },
    ];

    const mockServiceClient = {
      from: vi.fn((table: string) => {
        if (table === 'consultor_sessions') {
          return buildChainableQuery(
            { id: SESSION_ID, school_id: SCHOOL_ID, status: 'programada' },
            null
          );
        }
        if (table === 'session_facilitators') {
          const opHandler: ProxyHandler<Record<string, unknown>> = {
            get(_target, prop) {
              if (prop === 'select') {
                facilitatorOps.push('select');
                return vi.fn(() => {
                  const eqHandler: ProxyHandler<Record<string, unknown>> = {
                    get(_t, p) {
                      if (p === 'then') return (resolve: (v: unknown) => void) => resolve({ data: existingSnapshot, error: null });
                      return vi.fn(() => new Proxy({}, eqHandler));
                    },
                  };
                  return new Proxy({}, eqHandler);
                });
              }
              if (prop === 'delete') {
                facilitatorOps.push('delete');
                return vi.fn(() => {
                  const eqHandler: ProxyHandler<Record<string, unknown>> = {
                    get(_t, p) {
                      if (p === 'then') return (resolve: (v: unknown) => void) => resolve({ data: null, error: null });
                      return vi.fn(() => new Proxy({}, eqHandler));
                    },
                  };
                  return new Proxy({}, eqHandler);
                });
              }
              if (prop === 'insert') {
                facilitatorOps.push('insert');
                const insertCount = facilitatorOps.filter((o) => o === 'insert').length;
                return vi.fn(() => {
                  const selectHandler: ProxyHandler<Record<string, unknown>> = {
                    get(_t, p) {
                      if (p === 'then') {
                        if (insertCount === 1) {
                          // First insert (new facilitators) fails
                          return (resolve: (v: unknown) => void) => resolve({ data: null, error: { message: 'Insert constraint violation' } });
                        }
                        // Rollback insert ALSO fails
                        return (resolve: (v: unknown) => void) => resolve({ data: null, error: { message: 'Rollback constraint error' } });
                      }
                      return vi.fn(() => new Proxy({}, selectHandler));
                    },
                  };
                  return new Proxy({}, selectHandler);
                });
              }
              if (prop === 'then') {
                return (resolve: (v: unknown) => void) => resolve({ data: [], error: null });
              }
              return vi.fn(() => new Proxy({}, opHandler));
            },
          };
          return new Proxy({}, opHandler);
        }
        if (table === 'session_activity_log') {
          return buildChainableQuery([], null);
        }
        return buildChainableQuery([], null);
      }),
    };

    mockCreateServiceRoleClient.mockReturnValueOnce(mockServiceClient);

    (validateFacilitatorIntegrity as any).mockResolvedValueOnce({
      valid: true,
      errors: [],
    });

    const { req, res } = createMocks({
      method: 'PUT',
      query: { id: SESSION_ID },
      body: {
        facilitators: [
          { user_id: CONSULTANT_ID_2, is_lead: true, facilitator_role: 'consultor_externo' },
        ],
      },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(500);
    const data = JSON.parse(res._getData());
    // Must NOT claim successful restoration — should say CRITICAL
    expect(data.error).toContain('CRÍTICO');
    expect(data.error).not.toContain('fueron restaurados correctamente');
  });

  it('should handle method not allowed', async () => {
    const { req, res } = createMocks({
      method: 'GET',
      query: { id: SESSION_ID },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(405);
  });
});
