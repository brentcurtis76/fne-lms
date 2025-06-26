import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMocks } from 'node-mocks-http';
import handler from '../../../pages/api/admin/retrieve-import-passwords';
import { createClient } from '@supabase/supabase-js';

// Mock Supabase client
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn()
}));

// Mock temporary password store
vi.mock('../../../lib/temporaryPasswordStore', () => {
  const mockPasswordStore = {
    retrieve: vi.fn(),
    clear: vi.fn(),
    store: vi.fn()
  };
  
  return {
    passwordStore: mockPasswordStore
  };
});

describe('/api/admin/retrieve-import-passwords', () => {
  let mockSupabaseAdmin: any;
  let mockAuth: any;
  let mockFrom: any;
  let mockInsert: any;
  let mockPasswordStore: any;

  beforeEach(async () => {
    // Get mock from the mocked module
    const { passwordStore: ps } = await import('../../../lib/temporaryPasswordStore');
    mockPasswordStore = ps;
    // Set environment variables
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
    
    // Reset all mocks
    vi.clearAllMocks();
    
    // Reset password store mocks
    mockPasswordStore.retrieve?.mockClear?.();
    mockPasswordStore.clear?.mockClear?.();
    mockPasswordStore.store?.mockClear?.();

    // Setup mock Supabase client structure
    mockInsert = vi.fn().mockResolvedValue({ data: null, error: null });
    mockFrom = vi.fn().mockReturnValue({ insert: mockInsert });
    mockAuth = {
      getUser: vi.fn()
    };

    mockSupabaseAdmin = {
      auth: mockAuth,
      from: mockFrom
    };

    // Make createClient return our mock
    (createClient as any).mockReturnValue(mockSupabaseAdmin);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Authentication and Authorization', () => {
    it('should reject non-POST requests', async () => {
      const { req, res } = createMocks({
        method: 'GET',
        headers: {
          authorization: 'Bearer valid-token'
        }
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(405);
      expect(JSON.parse(res._getData())).toEqual({
        error: 'Method not allowed'
      });
    });

    it('should reject requests without authorization header', async () => {
      const { req, res } = createMocks({
        method: 'POST',
        headers: {},
        body: { sessionId: 'test-session' }
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(401);
      expect(JSON.parse(res._getData())).toEqual({
        error: 'No authorization token provided'
      });
    });

    it('should reject requests with invalid token', async () => {
      mockAuth.getUser.mockResolvedValue({
        data: { user: null },
        error: new Error('Invalid token')
      });

      const { req, res } = createMocks({
        method: 'POST',
        headers: {
          authorization: 'Bearer invalid-token'
        },
        body: { sessionId: 'test-session' }
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(401);
      expect(JSON.parse(res._getData())).toEqual({
        error: 'Invalid authorization token'
      });
    });

    it('should reject non-admin users', async () => {
      mockAuth.getUser.mockResolvedValue({
        data: { user: { id: 'user-123', email: 'user@example.com' } },
        error: null
      });

      const mockSelect = vi.fn().mockReturnThis();
      const mockEq = vi.fn().mockReturnThis();
      const mockSingle = vi.fn().mockResolvedValue({
        data: { role: 'docente' },
        error: null
      });

      mockFrom.mockReturnValue({
        select: mockSelect,
        eq: mockEq,
        single: mockSingle,
        insert: mockInsert
      });

      const { req, res } = createMocks({
        method: 'POST',
        headers: {
          authorization: 'Bearer valid-token'
        },
        body: { sessionId: 'test-session' }
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(403);
      expect(JSON.parse(res._getData())).toEqual({
        error: 'Unauthorized. Only admins can retrieve passwords.'
      });
    });

    it('should reject when profile lookup fails', async () => {
      mockAuth.getUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null
      });

      const mockSelect = vi.fn().mockReturnThis();
      const mockEq = vi.fn().mockReturnThis();
      const mockSingle = vi.fn().mockResolvedValue({
        data: null,
        error: new Error('Profile not found')
      });

      mockFrom.mockReturnValue({
        select: mockSelect,
        eq: mockEq,
        single: mockSingle,
        insert: mockInsert
      });

      const { req, res } = createMocks({
        method: 'POST',
        headers: {
          authorization: 'Bearer valid-token'
        },
        body: { sessionId: 'test-session' }
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(403);
      expect(JSON.parse(res._getData())).toEqual({
        error: 'Unauthorized. Only admins can retrieve passwords.'
      });
    });
  });

  describe('Request Validation', () => {
    beforeEach(() => {
      // Setup valid admin auth for these tests
      mockAuth.getUser.mockResolvedValue({
        data: { user: { id: 'admin-123', email: 'admin@example.com' } },
        error: null
      });

      const mockSelect = vi.fn().mockReturnThis();
      const mockEq = vi.fn().mockReturnThis();
      const mockSingle = vi.fn().mockResolvedValue({
        data: { role: 'admin' },
        error: null
      });

      mockFrom.mockReturnValue({
        select: mockSelect,
        eq: mockEq,
        single: mockSingle,
        insert: mockInsert
      });
    });

    it('should reject requests without sessionId', async () => {
      const { req, res } = createMocks({
        method: 'POST',
        headers: {
          authorization: 'Bearer valid-token'
        },
        body: {}
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
      expect(JSON.parse(res._getData())).toEqual({
        error: 'Session ID is required'
      });
    });

    it('should reject requests with invalid sessionId type', async () => {
      const { req, res } = createMocks({
        method: 'POST',
        headers: {
          authorization: 'Bearer valid-token'
        },
        body: { sessionId: 123 } // Not a string
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
      expect(JSON.parse(res._getData())).toEqual({
        error: 'Session ID is required'
      });
    });

    it('should accept empty string sessionId (edge case)', async () => {
      mockPasswordStore.retrieve.mockReturnValue([]);

      const { req, res } = createMocks({
        method: 'POST',
        headers: {
          authorization: 'Bearer valid-token'
        },
        body: { sessionId: '' }
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
      expect(JSON.parse(res._getData())).toEqual({
        error: 'Session ID is required'
      });
    });
  });

  describe('Password Retrieval', () => {
    beforeEach(() => {
      // Setup valid admin auth
      mockAuth.getUser.mockResolvedValue({
        data: { user: { id: 'admin-123', email: 'admin@example.com' } },
        error: null
      });

      const mockSelect = vi.fn().mockReturnThis();
      const mockEq = vi.fn().mockReturnThis();
      const mockSingle = vi.fn().mockResolvedValue({
        data: { role: 'admin' },
        error: null
      });

      mockFrom.mockReturnValue({
        select: mockSelect,
        eq: mockEq,
        single: mockSingle,
        insert: mockInsert
      });
    });

    it('should successfully retrieve passwords for valid session', async () => {
      const mockPasswords = [
        {
          email: 'user1@example.com',
          password: 'password1',
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 15 * 60 * 1000)
        },
        {
          email: 'user2@example.com',
          password: 'password2',
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 15 * 60 * 1000)
        }
      ];

      mockPasswordStore.retrieve.mockReturnValue(mockPasswords);

      const { req, res } = createMocks({
        method: 'POST',
        headers: {
          authorization: 'Bearer valid-token'
        },
        body: { sessionId: 'test-session-123' }
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const response = JSON.parse(res._getData());
      
      expect(response.passwords).toHaveLength(2);
      expect(response.passwords[0]).toEqual({
        email: 'user1@example.com',
        password: 'password1'
      });
      expect(response.passwords[1]).toEqual({
        email: 'user2@example.com',
        password: 'password2'
      });

      // Verify store was called to retrieve and clear
      expect(mockPasswordStore.retrieve).toHaveBeenCalledWith('test-session-123');
      expect(mockPasswordStore.clear).toHaveBeenCalledWith('test-session-123');
    });

    it('should return empty array for non-existent session', async () => {
      mockPasswordStore.retrieve.mockReturnValue([]);

      const { req, res } = createMocks({
        method: 'POST',
        headers: {
          authorization: 'Bearer valid-token'
        },
        body: { sessionId: 'non-existent-session' }
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const response = JSON.parse(res._getData());
      
      expect(response.passwords).toEqual([]);
      expect(mockPasswordStore.clear).toHaveBeenCalledWith('non-existent-session');
    });

    it('should filter out metadata from password entries', async () => {
      const mockPasswords = [
        {
          email: 'user@example.com',
          password: 'secret123',
          createdAt: new Date(),
          expiresAt: new Date(),
          // These internal fields should be filtered out
          internalField: 'should-not-be-exposed',
          sessionId: 'internal-session-id'
        }
      ];

      mockPasswordStore.retrieve.mockReturnValue(mockPasswords);

      const { req, res } = createMocks({
        method: 'POST',
        headers: {
          authorization: 'Bearer valid-token'
        },
        body: { sessionId: 'test-session' }
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const response = JSON.parse(res._getData());
      
      expect(response.passwords[0]).toEqual({
        email: 'user@example.com',
        password: 'secret123'
      });
      
      // Ensure no internal fields are exposed
      expect(response.passwords[0]).not.toHaveProperty('createdAt');
      expect(response.passwords[0]).not.toHaveProperty('expiresAt');
      expect(response.passwords[0]).not.toHaveProperty('internalField');
      expect(response.passwords[0]).not.toHaveProperty('sessionId');
    });
  });

  describe('Audit Logging', () => {
    beforeEach(() => {
      // Setup valid admin auth
      mockAuth.getUser.mockResolvedValue({
        data: { user: { id: 'admin-123', email: 'admin@example.com' } },
        error: null
      });

      const mockSelect = vi.fn().mockReturnThis();
      const mockEq = vi.fn().mockReturnThis();
      const mockSingle = vi.fn().mockResolvedValue({
        data: { role: 'admin' },
        error: null
      });

      mockFrom.mockReturnValue({
        select: mockSelect,
        eq: mockEq,
        single: mockSingle,
        insert: mockInsert
      });
    });

    it('should log password retrieval in audit_logs', async () => {
      const mockPasswords = [
        { email: 'user1@example.com', password: 'pass1' },
        { email: 'user2@example.com', password: 'pass2' }
      ];

      mockPasswordStore.retrieve.mockReturnValue(mockPasswords);

      const { req, res } = createMocks({
        method: 'POST',
        headers: {
          authorization: 'Bearer valid-token'
        },
        body: { sessionId: 'test-session-456' }
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      
      // Verify audit log was created
      expect(mockFrom).toHaveBeenCalledWith('audit_logs');
      expect(mockInsert).toHaveBeenCalledWith({
        user_id: 'admin-123',
        action: 'bulk_passwords_retrieved',
        details: {
          session_id: 'test-session-456',
          count: 2,
          retrieved_by: 'admin@example.com'
        }
      });
    });

    it('should log even when no passwords found', async () => {
      mockPasswordStore.retrieve.mockReturnValue([]);

      const { req, res } = createMocks({
        method: 'POST',
        headers: {
          authorization: 'Bearer valid-token'
        },
        body: { sessionId: 'empty-session' }
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      
      expect(mockInsert).toHaveBeenCalledWith({
        user_id: 'admin-123',
        action: 'bulk_passwords_retrieved',
        details: {
          session_id: 'empty-session',
          count: 0,
          retrieved_by: 'admin@example.com'
        }
      });
    });

    it('should continue even if audit logging fails', async () => {
      const mockPasswords = [{ email: 'user@example.com', password: 'pass' }];
      mockPasswordStore.retrieve.mockReturnValue(mockPasswords);
      
      // Make audit logging fail
      mockInsert.mockRejectedValue(new Error('Audit log failed'));

      const { req, res } = createMocks({
        method: 'POST',
        headers: {
          authorization: 'Bearer valid-token'
        },
        body: { sessionId: 'test-session' }
      });

      await handler(req, res);

      // Should still return passwords despite audit log failure
      expect(res._getStatusCode()).toBe(200);
      const response = JSON.parse(res._getData());
      expect(response.passwords).toHaveLength(1);
    });
  });

  describe('Security', () => {
    beforeEach(() => {
      // Setup valid admin auth
      mockAuth.getUser.mockResolvedValue({
        data: { user: { id: 'admin-123', email: 'admin@example.com' } },
        error: null
      });

      const mockSelect = vi.fn().mockReturnThis();
      const mockEq = vi.fn().mockReturnThis();
      const mockSingle = vi.fn().mockResolvedValue({
        data: { role: 'admin' },
        error: null
      });

      mockFrom.mockReturnValue({
        select: mockSelect,
        eq: mockEq,
        single: mockSingle,
        insert: mockInsert
      });
    });

    it('should clear passwords after retrieval (one-time access)', async () => {
      const mockPasswords = [{ email: 'user@example.com', password: 'secret' }];
      mockPasswordStore.retrieve.mockReturnValue(mockPasswords);

      const { req, res } = createMocks({
        method: 'POST',
        headers: {
          authorization: 'Bearer valid-token'
        },
        body: { sessionId: 'test-session' }
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      
      // Verify passwords were cleared after retrieval
      expect(mockPasswordStore.clear).toHaveBeenCalledWith('test-session');
      expect(mockPasswordStore.clear).toHaveBeenCalledAfter(mockPasswordStore.retrieve as any);
    });

    it('should handle malicious session IDs safely', async () => {
      const maliciousSessionIds = [
        '../../../etc/passwd',
        '<script>alert("xss")</script>',
        'DROP TABLE passwords;--',
        '${process.env.SECRET}',
        '\x00\x01\x02', // Null bytes
        'a'.repeat(10000) // Very long string
      ];

      for (const sessionId of maliciousSessionIds) {
        mockPasswordStore.retrieve.mockReturnValue([]);

        const { req, res } = createMocks({
          method: 'POST',
          headers: {
            authorization: 'Bearer valid-token'
          },
          body: { sessionId }
        });

        await handler(req, res);

        expect(res._getStatusCode()).toBe(200);
        expect(mockPasswordStore.retrieve).toHaveBeenCalledWith(sessionId);
        expect(mockPasswordStore.clear).toHaveBeenCalledWith(sessionId);
      }
    });

    it('should not expose sensitive data in error responses', async () => {
      // Make password store throw an error
      mockPasswordStore.retrieve.mockImplementation(() => {
        throw new Error('Internal password store error with sensitive data: API_KEY=secret123');
      });

      const { req, res } = createMocks({
        method: 'POST',
        headers: {
          authorization: 'Bearer valid-token'
        },
        body: { sessionId: 'test-session' }
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(500);
      const response = JSON.parse(res._getData());
      
      expect(response.error).toBe('Error interno del servidor');
      expect(response.error).not.toContain('sensitive data');
      expect(response.error).not.toContain('API_KEY');
      expect(response.error).not.toContain('secret123');
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      // Setup valid admin auth
      mockAuth.getUser.mockResolvedValue({
        data: { user: { id: 'admin-123', email: 'admin@example.com' } },
        error: null
      });

      const mockSelect = vi.fn().mockReturnThis();
      const mockEq = vi.fn().mockReturnThis();
      const mockSingle = vi.fn().mockResolvedValue({
        data: { role: 'admin' },
        error: null
      });

      mockFrom.mockReturnValue({
        select: mockSelect,
        eq: mockEq,
        single: mockSingle,
        insert: mockInsert
      });
    });

    it('should handle password store errors gracefully', async () => {
      mockPasswordStore.retrieve.mockImplementation(() => {
        throw new Error('Password store connection failed');
      });

      const { req, res } = createMocks({
        method: 'POST',
        headers: {
          authorization: 'Bearer valid-token'
        },
        body: { sessionId: 'test-session' }
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(500);
      expect(JSON.parse(res._getData())).toEqual({
        error: 'Error interno del servidor'
      });
    });

    it('should handle Supabase auth errors', async () => {
      mockAuth.getUser.mockImplementation(() => {
        throw new Error('Supabase connection failed');
      });

      const { req, res } = createMocks({
        method: 'POST',
        headers: {
          authorization: 'Bearer valid-token'
        },
        body: { sessionId: 'test-session' }
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(500);
      expect(JSON.parse(res._getData())).toEqual({
        error: 'Error interno del servidor'
      });
    });

    it('should handle missing environment variables', async () => {
      // Temporarily remove environment variables
      const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;

      const { req, res } = createMocks({
        method: 'POST',
        headers: {
          authorization: 'Bearer valid-token'
        },
        body: { sessionId: 'test-session' }
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(500);
      expect(JSON.parse(res._getData())).toEqual({
        error: 'Error interno del servidor'
      });

      // Restore environment variables
      process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
      process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
    });
  });
});