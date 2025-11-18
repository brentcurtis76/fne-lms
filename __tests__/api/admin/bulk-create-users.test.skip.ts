import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMocks } from 'node-mocks-http';
import handler from '../../../pages/api/admin/bulk-create-users';
import { createClient } from '@supabase/supabase-js';

// Mock Supabase client
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn()
}));

// Mock utilities
vi.mock('../../../utils/bulkUserParser', () => ({
  parseBulkUserData: vi.fn()
}));

vi.mock('../../../utils/passwordGenerator', () => ({
  validatePassword: vi.fn()
}));

vi.mock('../../../lib/temporaryPasswordStore', () => ({
  passwordStore: {
    store: vi.fn(),
    retrieve: vi.fn(),
    clear: vi.fn()
  },
  generateSessionId: vi.fn(() => 'test-session-id')
}));

import { parseBulkUserData } from '../../../utils/bulkUserParser';
import { validatePassword } from '../../../utils/passwordGenerator';

describe('/api/admin/bulk-create-users', () => {
  let mockSupabaseAdmin: any;
  let mockAuth: any;
  let mockFrom: any;

  beforeEach(() => {
    // Set environment variables
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
    
    // Reset all mocks
    vi.clearAllMocks();
    
    // Clear rate limit store by accessing the module internals
    // This is a hack for testing - in production we'd use dependency injection
    vi.resetModules();

    // Setup mock Supabase client structure
    mockFrom = vi.fn();
    mockAuth = {
      getUser: vi.fn(),
      admin: {
        createUser: vi.fn(),
        deleteUser: vi.fn()
      }
    };

    mockSupabaseAdmin = {
      auth: mockAuth,
      from: mockFrom
    };

    // Make createClient return our mock
    (createClient as any).mockReturnValue(mockSupabaseAdmin);

    // Default mock implementations
    (validatePassword as any).mockReturnValue({ valid: true, errors: [] });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Authentication and Authorization', () => {
    it('should reject requests without authorization header', async () => {
      const { req, res } = createMocks({
        method: 'POST',
        headers: {},
        body: { csvData: 'test' }
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
        body: { csvData: 'test' }
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(401);
      expect(JSON.parse(res._getData())).toEqual({
        error: 'Invalid authorization token'
      });
    });

    it('should reject non-admin users', async () => {
      mockAuth.getUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
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
        single: mockSingle
      });

      const { req, res } = createMocks({
        method: 'POST',
        headers: {
          authorization: 'Bearer valid-token'
        },
        body: { csvData: 'test' }
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(403);
      expect(JSON.parse(res._getData())).toEqual({
        error: 'Unauthorized. Only admins can bulk create users.'
      });
    });
  });

  describe('Request Validation', () => {
    beforeEach(() => {
      // Setup valid admin auth
      mockAuth.getUser.mockResolvedValue({
        data: { user: { id: 'admin-123' } },
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
        single: mockSingle
      });
    });

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

    it('should reject requests without CSV data', async () => {
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
        error: 'CSV data is required'
      });
    });

    it('should reject invalid CSV data type', async () => {
      const { req, res } = createMocks({
        method: 'POST',
        headers: {
          authorization: 'Bearer valid-token'
        },
        body: { csvData: 123 } // Not a string
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
      expect(JSON.parse(res._getData())).toEqual({
        error: 'CSV data is required'
      });
    });
  });

  describe('User Creation', () => {
    let profileCallCount: number;

    beforeEach(() => {
      // Setup valid admin auth
      mockAuth.getUser.mockResolvedValue({
        data: { user: { id: 'admin-123' } },
        error: null
      });

      // Mock profile check
      const mockSelect = vi.fn().mockReturnThis();
      const mockEq = vi.fn().mockReturnThis();
      const mockSingle = vi.fn();
      const mockUpdate = vi.fn().mockReturnThis();

      // First call for auth check
      mockSingle.mockResolvedValueOnce({
        data: { role: 'admin' },
        error: null
      });

      // Mock insert for audit logs and profiles
      const mockInsert = vi.fn().mockResolvedValue({
        data: null,
        error: null
      });

      profileCallCount = 0;
      mockFrom.mockImplementation((table: string) => {
        if (table === 'audit_logs') {
          return { insert: mockInsert };
        }
        if (table === 'profiles') {
          profileCallCount++;
          // First call is always for admin auth check
          if (profileCallCount === 1) {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({ 
                data: { role: 'admin' }, 
                error: null
              })
            };
          }
          // Subsequent calls are for profile operations
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ 
              data: null, 
              error: { code: 'PGRST116' } // Not found error
            }),
            insert: mockInsert,
            update: mockUpdate
          };
        }
        return {
          select: mockSelect,
          eq: mockEq,
          single: mockSingle,
          insert: mockInsert,
          update: mockUpdate
        };
      });
    });

    it('should successfully create single user', async () => {
      (parseBulkUserData as any).mockReturnValue({
        valid: [{
          email: 'test@example.com',
          firstName: 'Test',
          lastName: 'User',
          role: 'docente',
          password: 'TestPass123!'
        }],
        invalid: [],
        warnings: [],
        summary: { total: 1, valid: 1, invalid: 0, hasWarnings: 0 }
      });

      mockAuth.admin.createUser.mockResolvedValue({
        data: {
          user: {
            id: 'new-user-123',
            email: 'test@example.com'
          }
        },
        error: null
      });

      const { req, res } = createMocks({
        method: 'POST',
        headers: {
          authorization: 'Bearer valid-token'
        },
        body: {
          csvData: 'email,firstName,lastName,role\ntest@example.com,Test,User,docente'
        }
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const response = JSON.parse(res._getData());
      
      expect(response.success).toBe(true);
      expect(response.summary).toEqual({
        total: 1,
        succeeded: 1,
        failed: 0
      });
      expect(response.results[0]).toMatchObject({
        email: 'test@example.com',
        success: true,
        userId: 'new-user-123'
        // Password should not be in response
      });
      expect(response.results[0].password).toBeUndefined();
      expect(response.sessionId).toBe('test-session-id');
    });

    it('should handle multiple users in batches', async () => {
      const users = Array.from({ length: 25 }, (_, i) => ({
        email: `user${i}@example.com`,
        firstName: `User${i}`,
        lastName: 'Test',
        role: 'docente',
        password: `Pass${i}123!`
      }));

      (parseBulkUserData as any).mockReturnValue({
        valid: users,
        invalid: [],
        warnings: [],
        summary: { total: 25, valid: 25, invalid: 0, hasWarnings: 0 }
      });

      mockAuth.admin.createUser.mockImplementation(({ email }) => ({
        data: {
          user: {
            id: `user-${email}`,
            email
          }
        },
        error: null
      }));

      const { req, res } = createMocks({
        method: 'POST',
        headers: {
          authorization: 'Bearer valid-token'
        },
        body: {
          csvData: 'test-csv-data'
        }
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const response = JSON.parse(res._getData());
      
      expect(response.success).toBe(true);
      expect(response.summary).toEqual({
        total: 25,
        succeeded: 25,
        failed: 0
      });
      expect(response.results).toHaveLength(25);
      
      // Verify batching (should be called 25 times, processed in batches of 10)
      expect(mockAuth.admin.createUser).toHaveBeenCalledTimes(25);
    });

    it('should handle existing users gracefully', async () => {
      (parseBulkUserData as any).mockReturnValue({
        valid: [{
          email: 'existing@example.com',
          firstName: 'Existing',
          lastName: 'User',
          role: 'docente',
          password: 'TestPass123!'
        }],
        invalid: [],
        warnings: [],
        summary: { total: 1, valid: 1, invalid: 0, hasWarnings: 0 }
      });

      mockAuth.admin.createUser.mockResolvedValue({
        data: null,
        error: new Error('User already registered')
      });

      const { req, res } = createMocks({
        method: 'POST',
        headers: {
          authorization: 'Bearer valid-token'
        },
        body: {
          csvData: 'email,firstName,lastName,role\nexisting@example.com,Existing,User,docente'
        }
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const response = JSON.parse(res._getData());
      
      expect(response.success).toBe(false);
      expect(response.summary.failed).toBe(1);
      expect(response.results[0]).toMatchObject({
        email: 'existing@example.com',
        success: false,
        error: 'Este email ya está registrado'
      });
    });

    it('should validate passwords', async () => {
      (parseBulkUserData as any).mockReturnValue({
        valid: [{
          email: 'test@example.com',
          firstName: 'Test',
          lastName: 'User',
          role: 'docente',
          password: 'weak'
        }],
        invalid: [],
        warnings: [],
        summary: { total: 1, valid: 1, invalid: 0, hasWarnings: 0 }
      });

      (validatePassword as any).mockReturnValue({
        valid: false,
        errors: ['Password too short', 'Missing uppercase letter']
      });

      const { req, res } = createMocks({
        method: 'POST',
        headers: {
          authorization: 'Bearer valid-token'
        },
        body: {
          csvData: 'test-csv'
        }
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const response = JSON.parse(res._getData());
      
      expect(response.success).toBe(false);
      expect(response.results[0]).toMatchObject({
        email: 'test@example.com',
        success: false,
        error: 'La contraseña no cumple con los requisitos'
      });
    });

    it('should include invalid users in results', async () => {
      (parseBulkUserData as any).mockReturnValue({
        valid: [{
          email: 'valid@example.com',
          firstName: 'Valid',
          lastName: 'User',
          role: 'docente',
          password: 'ValidPass123!'
        }],
        invalid: [{
          email: 'invalid-email',
          errors: ['Invalid email format'],
          warnings: ['Missing name']
        }],
        warnings: [],
        summary: { total: 2, valid: 1, invalid: 1, hasWarnings: 1 }
      });

      mockAuth.admin.createUser.mockResolvedValue({
        data: {
          user: {
            id: 'valid-user-123',
            email: 'valid@example.com'
          }
        },
        error: null
      });

      const { req, res } = createMocks({
        method: 'POST',
        headers: {
          authorization: 'Bearer valid-token'
        },
        body: {
          csvData: 'test-csv'
        }
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const response = JSON.parse(res._getData());
      
      expect(response.success).toBe(false);
      expect(response.summary).toEqual({
        total: 2,
        succeeded: 1,
        failed: 1
      });
      expect(response.results).toHaveLength(2);
      expect(response.results[1]).toMatchObject({
        email: 'invalid-email',
        success: false,
        error: 'Invalid email format'
      });
    });

    it('should handle profile creation errors', async () => {
      // Reset the default admin auth setup for this test
      mockAuth.getUser.mockResolvedValue({
        data: { user: { id: 'admin-123' } },
        error: null
      });

      (parseBulkUserData as any).mockReturnValue({
        valid: [{
          email: 'test@example.com',
          firstName: 'Test',
          lastName: 'User',
          role: 'docente',
          password: 'TestPass123!'
        }],
        invalid: [],
        warnings: [],
        summary: { total: 1, valid: 1, invalid: 0, hasWarnings: 0 }
      });

      mockAuth.admin.createUser.mockResolvedValue({
        data: {
          user: {
            id: 'new-user-123',
            email: 'test@example.com'
          }
        },
        error: null
      });

      // Mock profile creation failure
      const mockInsert = vi.fn().mockResolvedValue({
        data: null,
        error: new Error('Profile creation failed')
      });

      let isFirstProfileCall = true;
      mockFrom.mockImplementation((table: string) => {
        if (table === 'profiles') {
          // First call is for admin auth check
          if (isFirstProfileCall) {
            isFirstProfileCall = false;
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({ data: { role: 'admin' }, error: null })
            };
          }
          // Subsequent calls are for profile operations
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
            insert: mockInsert
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { role: 'admin' }, error: null }),
          insert: vi.fn().mockResolvedValue({ data: null, error: null })
        };
      });

      const { req, res } = createMocks({
        method: 'POST',
        headers: {
          authorization: 'Bearer valid-token'
        },
        body: {
          csvData: 'test-csv'
        }
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const response = JSON.parse(res._getData());
      
      expect(response.success).toBe(false);
      expect(response.results[0]).toMatchObject({
        email: 'test@example.com',
        success: false,
        error: 'Error al crear usuario'
      });
      
      // Verify cleanup - auth user should be deleted
      expect(mockAuth.admin.deleteUser).toHaveBeenCalledWith('new-user-123');
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      // Setup valid admin auth
      mockAuth.getUser.mockResolvedValue({
        data: { user: { id: 'admin-123' } },
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
        single: mockSingle
      });
    });

    it('should handle parsing errors', async () => {
      (parseBulkUserData as any).mockImplementation(() => {
        throw new Error('CSV parsing failed');
      });

      const { req, res } = createMocks({
        method: 'POST',
        headers: {
          authorization: 'Bearer valid-token'
        },
        body: {
          csvData: 'invalid-csv'
        }
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(500);
      expect(JSON.parse(res._getData())).toEqual({
        error: 'Error interno del servidor. Por favor, intente más tarde.'
      });
    });

    it('should handle no valid users scenario', async () => {
      (parseBulkUserData as any).mockReturnValue({
        valid: [],
        invalid: [{
          email: 'bad-email',
          errors: ['Invalid email']
        }],
        warnings: [],
        summary: { total: 1, valid: 0, invalid: 1, hasWarnings: 0 }
      });

      const { req, res } = createMocks({
        method: 'POST',
        headers: {
          authorization: 'Bearer valid-token'
        },
        body: {
          csvData: 'test-csv'
        }
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
      const response = JSON.parse(res._getData());
      
      expect(response.error).toBe('No valid users found in the provided data');
      expect(response.success).toBe(false);
      expect(response.results).toHaveLength(1);
      expect(response.summary.failed).toBe(1);
    });
  });
});