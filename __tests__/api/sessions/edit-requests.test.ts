// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';
import handler from '../../../pages/api/sessions/[id]/edit-requests';

// Mock dependencies
vi.mock('../../../lib/api-auth', () => ({
  getApiUser: vi.fn(),
  createServiceRoleClient: vi.fn(),
  sendAuthError: vi.fn((res, message, status) => {
    res.status(status).json({ error: message });
  }),
  sendApiResponse: vi.fn((res, data, status = 200) => {
    res.status(status).json({ data });
  }),
  logApiRequest: vi.fn(),
  handleMethodNotAllowed: vi.fn((res) => {
    res.status(405).json({ error: 'Method not allowed' });
  }),
}));

vi.mock('../../../utils/roleUtils', () => ({
  getUserRoles: vi.fn(),
  getHighestRole: vi.fn(),
}));

describe('/api/sessions/[id]/edit-requests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST', () => {
    it('should return 400 if session ID is invalid', async () => {
      const { req, res } = createMocks({
        method: 'POST',
        query: { id: 'invalid-uuid' },
      });

      await handler(req as any, res as any);

      expect(res._getStatusCode()).toBe(400);
      const data = JSON.parse(res._getData());
      expect(data.error).toContain('inválido');
    });

    it('should return 401 if user is not authenticated', async () => {
      const { getApiUser } = await import('../../../lib/api-auth');
      (getApiUser as any).mockResolvedValue({ user: null, error: new Error('Not authenticated') });

      const { req, res } = createMocks({
        method: 'POST',
        query: { id: '123e4567-e89b-12d3-a456-426614174000' },
        body: { changes: {}, reason: '' },
      });

      await handler(req as any, res as any);

      expect(res._getStatusCode()).toBe(401);
    });

    it('should return 403 if user is not a facilitator', async () => {
      const { getApiUser, createServiceRoleClient } = await import('../../../lib/api-auth');

      (getApiUser as any).mockResolvedValue({
        user: { id: 'user-123' },
        error: null,
      });

      const mockClient = {
        from: vi.fn((table: string) => {
          if (table === 'consultor_sessions') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: {
                      id: 'session-123',
                      status: 'programada',
                      session_date: '2026-03-01',
                    },
                    error: null,
                  }),
                }),
              }),
            };
          }
          if (table === 'session_facilitators') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({
                      data: null, // Not a facilitator
                      error: null,
                    }),
                  }),
                }),
              }),
            };
          }
          return { select: vi.fn() };
        }),
      };

      (createServiceRoleClient as any).mockReturnValue(mockClient);

      const { req, res } = createMocks({
        method: 'POST',
        query: { id: '123e4567-e89b-12d3-a456-426614174000' },
        body: { changes: { session_date: { old: '2026-03-01', new: '2026-03-02' } }, reason: 'test' },
      });

      await handler(req as any, res as any);

      expect(res._getStatusCode()).toBe(403);
      const data = JSON.parse(res._getData());
      expect(data.error).toContain('facilitadores asignados');
    });

    it('should return 400 if session is completada', async () => {
      const { getApiUser, createServiceRoleClient } = await import('../../../lib/api-auth');

      (getApiUser as any).mockResolvedValue({
        user: { id: 'user-123' },
        error: null,
      });

      const mockClient = {
        from: vi.fn((table: string) => {
          if (table === 'consultor_sessions') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: {
                      id: 'session-123',
                      status: 'completada',
                    },
                    error: null,
                  }),
                }),
              }),
            };
          }
          if (table === 'session_facilitators') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({
                      data: { id: 'fac-1' },
                      error: null,
                    }),
                  }),
                }),
              }),
            };
          }
          return { select: vi.fn() };
        }),
      };

      (createServiceRoleClient as any).mockReturnValue(mockClient);

      const { req, res } = createMocks({
        method: 'POST',
        query: { id: '123e4567-e89b-12d3-a456-426614174000' },
        body: { changes: { session_date: { old: '2026-03-01', new: '2026-03-02' } } },
      });

      await handler(req as any, res as any);

      expect(res._getStatusCode()).toBe(400);
      const data = JSON.parse(res._getData());
      expect(data.error).toContain('completada');
    });

    it('should return 400 if changes contain non-structural fields', async () => {
      const { getApiUser, createServiceRoleClient } = await import('../../../lib/api-auth');

      (getApiUser as any).mockResolvedValue({
        user: { id: 'user-123' },
        error: null,
      });

      const mockClient = {
        from: vi.fn((table: string) => {
          if (table === 'consultor_sessions') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: {
                      id: 'session-123',
                      status: 'programada',
                      title: 'Old title',
                    },
                    error: null,
                  }),
                }),
              }),
            };
          }
          if (table === 'session_facilitators') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({
                      data: { id: 'fac-1' },
                      error: null,
                    }),
                  }),
                }),
              }),
            };
          }
          return { select: vi.fn() };
        }),
      };

      (createServiceRoleClient as any).mockReturnValue(mockClient);

      const { req, res } = createMocks({
        method: 'POST',
        query: { id: '123e4567-e89b-12d3-a456-426614174000' },
        body: { changes: { title: { old: 'Old title', new: 'New title' } } },
      });

      await handler(req as any, res as any);

      expect(res._getStatusCode()).toBe(400);
      const data = JSON.parse(res._getData());
      expect(data.error).toContain('estructurales');
    });

    it('should return 400 if old value does not match current session', async () => {
      const { getApiUser, createServiceRoleClient } = await import('../../../lib/api-auth');

      (getApiUser as any).mockResolvedValue({
        user: { id: 'user-123' },
        error: null,
      });

      const mockClient = {
        from: vi.fn((table: string) => {
          if (table === 'consultor_sessions') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: {
                      id: 'session-123',
                      status: 'programada',
                      session_date: '2026-03-01',
                    },
                    error: null,
                  }),
                }),
              }),
            };
          }
          if (table === 'session_facilitators') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({
                      data: { id: 'fac-1' },
                      error: null,
                    }),
                  }),
                }),
              }),
            };
          }
          return { select: vi.fn() };
        }),
      };

      (createServiceRoleClient as any).mockReturnValue(mockClient);

      const { req, res } = createMocks({
        method: 'POST',
        query: { id: '123e4567-e89b-12d3-a456-426614174000' },
        body: {
          changes: {
            session_date: { old: '2026-03-10', new: '2026-03-02' }, // Wrong old value
          },
        },
      });

      await handler(req as any, res as any);

      expect(res._getStatusCode()).toBe(400);
      const data = JSON.parse(res._getData());
      expect(data.error).toContain('no coincide');
    });

    it('should return 409 if pending request already exists', async () => {
      const { getApiUser, createServiceRoleClient } = await import('../../../lib/api-auth');

      (getApiUser as any).mockResolvedValue({
        user: { id: 'user-123' },
        error: null,
      });

      const mockClient = {
        from: vi.fn((table: string) => {
          if (table === 'consultor_sessions') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: {
                      id: 'session-123',
                      status: 'programada',
                      session_date: '2026-03-01',
                    },
                    error: null,
                  }),
                }),
              }),
            };
          }
          if (table === 'session_facilitators') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({
                      data: { id: 'fac-1' },
                      error: null,
                    }),
                  }),
                }),
              }),
            };
          }
          if (table === 'session_edit_requests') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                      maybeSingle: vi.fn().mockResolvedValue({
                        data: { id: 'existing-request' }, // Pending request exists
                        error: null,
                      }),
                    }),
                  }),
                }),
              }),
            };
          }
          return { select: vi.fn() };
        }),
      };

      (createServiceRoleClient as any).mockReturnValue(mockClient);

      const { req, res } = createMocks({
        method: 'POST',
        query: { id: '123e4567-e89b-12d3-a456-426614174000' },
        body: {
          changes: {
            session_date: { old: '2026-03-01', new: '2026-03-02' },
          },
        },
      });

      await handler(req as any, res as any);

      expect(res._getStatusCode()).toBe(409);
      const data = JSON.parse(res._getData());
      expect(data.error).toContain('pendiente');
    });
  });

  describe('GET', () => {
    it('should return 401 if user is not authenticated', async () => {
      const { getApiUser } = await import('../../../lib/api-auth');
      (getApiUser as any).mockResolvedValue({ user: null, error: new Error('Not authenticated') });

      const { req, res } = createMocks({
        method: 'GET',
        query: { id: '123e4567-e89b-12d3-a456-426614174000' },
      });

      await handler(req as any, res as any);

      expect(res._getStatusCode()).toBe(401);
    });

    it('should filter requests for non-admin users', async () => {
      const { getApiUser, createServiceRoleClient } = await import('../../../lib/api-auth');
      const { getUserRoles, getHighestRole } = await import('../../../utils/roleUtils');

      (getApiUser as any).mockResolvedValue({
        user: { id: 'user-123' },
        error: null,
      });

      (getUserRoles as any).mockResolvedValue([{ role_type: 'consultor' }]);
      (getHighestRole as any).mockReturnValue('consultor');

      const mockClient = {
        from: vi.fn(() => ({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({
            data: [{ id: 'req-1', requested_by: 'user-123' }],
            error: null,
          }),
        })),
      };

      (createServiceRoleClient as any).mockReturnValue(mockClient);

      const { req, res } = createMocks({
        method: 'GET',
        query: { id: '123e4567-e89b-12d3-a456-426614174000' },
      });

      await handler(req as any, res as any);

      expect(res._getStatusCode()).toBe(200);
    });
  });
});
