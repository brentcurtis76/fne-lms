// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';
import handler from '../../../pages/api/sessions/edit-requests/[eid]';

// Mock dependencies
vi.mock('../../../lib/api-auth', () => ({
  checkIsAdmin: vi.fn(),
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

describe('/api/sessions/edit-requests/[eid]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET', () => {
    it('should return 400 if edit request ID is invalid', async () => {
      const { req, res } = createMocks({
        method: 'GET',
        query: { eid: 'invalid-uuid' },
      });

      await handler(req as any, res as any);

      expect(res._getStatusCode()).toBe(400);
      const data = JSON.parse(res._getData());
      expect(data.error).toContain('inválido');
    });

    it('should return 403 if user is not admin', async () => {
      const { checkIsAdmin } = await import('../../../lib/api-auth');
      (checkIsAdmin as any).mockResolvedValue({
        isAdmin: false,
        user: null,
        error: null,
      });

      const { req, res } = createMocks({
        method: 'GET',
        query: { eid: '123e4567-e89b-12d3-a456-426614174000' },
      });

      await handler(req as any, res as any);

      expect(res._getStatusCode()).toBe(403);
    });

    it('should return edit request detail for admin', async () => {
      const { checkIsAdmin, createServiceRoleClient } = await import('../../../lib/api-auth');

      (checkIsAdmin as any).mockResolvedValue({
        isAdmin: true,
        user: { id: 'admin-123' },
        error: null,
      });

      const mockClient = {
        from: vi.fn(() => ({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: {
              id: 'req-123',
              session_id: 'session-123',
              status: 'pending',
            },
            error: null,
          }),
        })),
      };

      (createServiceRoleClient as any).mockReturnValue(mockClient);

      const { req, res } = createMocks({
        method: 'GET',
        query: { eid: '123e4567-e89b-12d3-a456-426614174000' },
      });

      await handler(req as any, res as any);

      expect(res._getStatusCode()).toBe(200);
    });
  });

  describe('PUT', () => {
    it('should return 403 if user is not admin', async () => {
      const { checkIsAdmin } = await import('../../../lib/api-auth');
      (checkIsAdmin as any).mockResolvedValue({
        isAdmin: false,
        user: null,
        error: null,
      });

      const { req, res } = createMocks({
        method: 'PUT',
        query: { eid: '123e4567-e89b-12d3-a456-426614174000' },
        body: { action: 'approve' },
      });

      await handler(req as any, res as any);

      expect(res._getStatusCode()).toBe(403);
    });

    it('should return 400 if action is invalid', async () => {
      const { checkIsAdmin, createServiceRoleClient } = await import('../../../lib/api-auth');

      (checkIsAdmin as any).mockResolvedValue({
        isAdmin: true,
        user: { id: 'admin-123' },
        error: null,
      });

      const mockClient = {
        from: vi.fn(() => ({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: { id: 'req-123', status: 'pending' },
            error: null,
          }),
        })),
      };

      (createServiceRoleClient as any).mockReturnValue(mockClient);

      const { req, res } = createMocks({
        method: 'PUT',
        query: { eid: '123e4567-e89b-12d3-a456-426614174000' },
        body: { action: 'invalid_action' },
      });

      await handler(req as any, res as any);

      expect(res._getStatusCode()).toBe(400);
      const data = JSON.parse(res._getData());
      expect(data.error).toContain('inválida');
    });

    it('should return 409 if edit request status is not pending (race condition)', async () => {
      const { checkIsAdmin, createServiceRoleClient } = await import('../../../lib/api-auth');

      (checkIsAdmin as any).mockResolvedValue({
        isAdmin: true,
        user: { id: 'admin-123' },
        error: null,
      });

      const mockClient = {
        from: vi.fn(() => ({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: {
              id: 'req-123',
              session_id: 'session-123',
              status: 'approved', // Already processed
              changes: {},
            },
            error: null,
          }),
        })),
      };

      (createServiceRoleClient as any).mockReturnValue(mockClient);

      const { req, res } = createMocks({
        method: 'PUT',
        query: { eid: '123e4567-e89b-12d3-a456-426614174000' },
        body: { action: 'approve' },
      });

      await handler(req as any, res as any);

      expect(res._getStatusCode()).toBe(409);
      const data = JSON.parse(res._getData());
      expect(data.error).toContain('procesada');
    });

    it('should approve edit request and update session', async () => {
      const { checkIsAdmin, createServiceRoleClient } = await import('../../../lib/api-auth');

      (checkIsAdmin as any).mockResolvedValue({
        isAdmin: true,
        user: { id: 'admin-123' },
        error: null,
      });

      const mockClient = {
        from: vi.fn((table: string) => {
          if (table === 'session_edit_requests') {
            return {
              select: vi.fn().mockReturnThis(),
              update: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({
                data: {
                  id: 'req-123',
                  session_id: 'session-123',
                  status: 'pending',
                  changes: { session_date: { old: '2026-03-01', new: '2026-03-02' } },
                },
                error: null,
              }),
            };
          }
          if (table === 'consultor_sessions') {
            return {
              select: vi.fn().mockReturnThis(),
              update: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({
                data: { id: 'session-123', session_date: '2026-03-01' },
                error: null,
              }),
            };
          }
          if (table === 'session_activity_log') {
            return {
              insert: vi.fn().mockResolvedValue({
                error: null,
              }),
            };
          }
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
          };
        }),
      };

      (createServiceRoleClient as any).mockReturnValue(mockClient);

      const { req, res } = createMocks({
        method: 'PUT',
        query: { eid: '123e4567-e89b-12d3-a456-426614174000' },
        body: { action: 'approve', review_notes: 'Approved' },
      });

      await handler(req as any, res as any);

      expect(res._getStatusCode()).toBe(200);
    });

    it('should reject edit request without updating session', async () => {
      const { checkIsAdmin, createServiceRoleClient } = await import('../../../lib/api-auth');

      (checkIsAdmin as any).mockResolvedValue({
        isAdmin: true,
        user: { id: 'admin-123' },
        error: null,
      });

      const mockClient = {
        from: vi.fn((table: string) => {
          if (table === 'session_edit_requests') {
            return {
              select: vi.fn().mockReturnThis(),
              update: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({
                data: {
                  id: 'req-123',
                  session_id: 'session-123',
                  status: 'pending',
                  changes: { session_date: { old: '2026-03-01', new: '2026-03-02' } },
                },
                error: null,
              }),
            };
          }
          if (table === 'session_activity_log') {
            return {
              insert: vi.fn().mockResolvedValue({
                error: null,
              }),
            };
          }
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
          };
        }),
      };

      (createServiceRoleClient as any).mockReturnValue(mockClient);

      const { req, res } = createMocks({
        method: 'PUT',
        query: { eid: '123e4567-e89b-12d3-a456-426614174000' },
        body: { action: 'reject', review_notes: 'Not necessary' },
      });

      await handler(req as any, res as any);

      expect(res._getStatusCode()).toBe(200);
    });
  });
});
