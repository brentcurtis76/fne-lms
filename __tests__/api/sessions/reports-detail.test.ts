// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';
import handler from '../../../pages/api/sessions/[id]/reports/[rid]';

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

describe('/api/sessions/[id]/reports/[rid]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 405 for unsupported methods', async () => {
    const { req, res } = createMocks({
      method: 'DELETE',
      query: {
        id: '123e4567-e89b-12d3-a456-426614174000',
        rid: '223e4567-e89b-12d3-a456-426614174000',
      },
    });

    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(405);
  });

  it('should return 400 if session ID is invalid', async () => {
    const { req, res } = createMocks({
      method: 'GET',
      query: { id: 'invalid-uuid', rid: '223e4567-e89b-12d3-a456-426614174000' },
    });

    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(400);
    const data = JSON.parse(res._getData());
    expect(data.error).toContain('sesión inválido');
  });

  it('should return 400 if report ID is invalid', async () => {
    const { req, res } = createMocks({
      method: 'GET',
      query: { id: '123e4567-e89b-12d3-a456-426614174000', rid: 'invalid-uuid' },
    });

    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(400);
    const data = JSON.parse(res._getData());
    expect(data.error).toContain('informe inválido');
  });

  it('should return 401 if user is not authenticated', async () => {
    const { getApiUser } = await import('../../../lib/api-auth');
    (getApiUser as any).mockResolvedValue({ user: null, error: new Error('Not authenticated') });

    const { req, res } = createMocks({
      method: 'GET',
      query: {
        id: '123e4567-e89b-12d3-a456-426614174000',
        rid: '223e4567-e89b-12d3-a456-426614174000',
      },
    });

    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(401);
  });

  it('should return 403 on PUT if session is completada', async () => {
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
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: { id: 'session-123', status: 'completada' },
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
      method: 'PUT',
      query: {
        id: '123e4567-e89b-12d3-a456-426614174000',
        rid: '223e4567-e89b-12d3-a456-426614174000',
      },
      body: { content: 'Updated content' },
    });

    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(403);
    const data = JSON.parse(res._getData());
    expect(data.error).toContain('completadas o canceladas');
  });

  it('should return 400 on PUT if no content or visibility provided', async () => {
    const { getApiUser } = await import('../../../lib/api-auth');

    (getApiUser as any).mockResolvedValue({
      user: { id: 'user-123' },
      error: null,
    });

    const { req, res } = createMocks({
      method: 'PUT',
      query: {
        id: '123e4567-e89b-12d3-a456-426614174000',
        rid: '223e4567-e89b-12d3-a456-426614174000',
      },
      body: {},
    });

    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(400);
    const data = JSON.parse(res._getData());
    expect(data.error).toContain('contenido o visibilidad');
  });

  it('should return 403 on GET if user has no access to session', async () => {
    const { getApiUser, createServiceRoleClient } = await import('../../../lib/api-auth');
    const { getUserRoles, getHighestRole } = await import('../../../utils/roleUtils');

    (getApiUser as any).mockResolvedValue({
      user: { id: 'user-123' },
      error: null,
    });

    (getUserRoles as any).mockResolvedValue([{ role_type: 'docente', school_id: 99 }]);
    (getHighestRole as any).mockReturnValue('docente');

    const mockClient = {
      from: vi.fn((table: string) => {
        if (table === 'consultor_sessions') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: {
                      id: 'session-123',
                      growth_community_id: 'gc-1',
                      school_id: 1,
                    },
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        if (table === 'session_reports') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: {
                      id: 'report-1',
                      visibility: 'all_participants',
                      author_id: 'author-1',
                    },
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
      method: 'GET',
      query: {
        id: '123e4567-e89b-12d3-a456-426614174000',
        rid: '223e4567-e89b-12d3-a456-426614174000',
      },
    });

    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(403);
    const data = JSON.parse(res._getData());
    expect(data.error).toContain('Acceso denegado');
  });
});
