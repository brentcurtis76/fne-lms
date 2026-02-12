// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';
import handler from '../../../pages/api/sessions/[id]/attendees';

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

describe('/api/sessions/[id]/attendees', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET', () => {
    it('should return 400 if session ID is invalid', async () => {
      const { req, res } = createMocks({
        method: 'GET',
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
        method: 'GET',
        query: { id: '123e4567-e89b-12d3-a456-426614174000' },
      });

      await handler(req as any, res as any);

      expect(res._getStatusCode()).toBe(401);
    });
  });

  describe('PUT', () => {
    it('should return 400 if attendees array is missing', async () => {
      const { getApiUser } = await import('../../../lib/api-auth');
      (getApiUser as any).mockResolvedValue({
        user: { id: 'user-123' },
        error: null,
      });

      const { req, res } = createMocks({
        method: 'PUT',
        query: { id: '123e4567-e89b-12d3-a456-426614174000' },
        body: {},
      });

      await handler(req as any, res as any);

      expect(res._getStatusCode()).toBe(400);
      const data = JSON.parse(res._getData());
      expect(data.error).toContain('array de asistentes');
    });

    it('should return 400 if attended is not boolean', async () => {
      const { getApiUser } = await import('../../../lib/api-auth');
      (getApiUser as any).mockResolvedValue({
        user: { id: 'user-123' },
        error: null,
      });

      const { req, res } = createMocks({
        method: 'PUT',
        query: { id: '123e4567-e89b-12d3-a456-426614174000' },
        body: {
          attendees: [
            {
              user_id: '123e4567-e89b-12d3-a456-426614174001',
              attended: 'yes', // Invalid - should be boolean
            },
          ],
        },
      });

      await handler(req as any, res as any);

      expect(res._getStatusCode()).toBe(400);
      const data = JSON.parse(res._getData());
      expect(data.error).toContain('booleano');
    });
  });

  describe('Method handling', () => {
    it('should return 405 for unsupported methods', async () => {
      const { req, res } = createMocks({
        method: 'DELETE',
        query: { id: '123e4567-e89b-12d3-a456-426614174000' },
      });

      await handler(req as any, res as any);

      expect(res._getStatusCode()).toBe(405);
    });
  });
});
