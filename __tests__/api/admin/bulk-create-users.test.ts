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

    // Reset all mocks - DON'T use vi.resetModules() as it breaks mock imports
    vi.clearAllMocks();

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

      // Mock user_roles to return empty (no admin role)
      mockFrom.mockImplementation((table: string) => {
        if (table === 'user_roles') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({
              data: [], // No admin role found
              error: null
            })
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: null, error: null })
        };
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
    beforeEach(() => {
      // Setup valid admin auth
      mockAuth.getUser.mockResolvedValue({
        data: { user: { id: 'admin-123' } },
        error: null
      });

      // Add RPC mock for cache refresh
      mockSupabaseAdmin.rpc = vi.fn().mockResolvedValue({ data: null, error: null });

      // CRITICAL: Ensure validatePassword mock is set for User Creation tests
      (validatePassword as any).mockReturnValue({ valid: true, errors: [] });

      // Mock insert for all tables
      const mockInsert = vi.fn().mockResolvedValue({
        data: null,
        error: null
      });

      const mockUpdate = vi.fn().mockReturnThis();

      mockFrom.mockImplementation((table: string) => {
        if (table === 'user_roles') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({
              data: [{ role_type: 'admin', is_active: true }],
              error: null
            }),
            insert: vi.fn().mockResolvedValue({ data: null, error: null })
          };
        }
        if (table === 'audit_logs') {
          return { insert: mockInsert };
        }
        if (table === 'profiles') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: null,
              error: { code: 'PGRST116' } // Not found error
            }),
            insert: mockInsert,
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: null, error: null })
            })
          };
        }
        if (table === 'schools') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: { id: 5, name: 'Test School', has_generations: false },
              error: null
            })
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
          insert: mockInsert,
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: null, error: null })
          })
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
          password: 'TestPass123!',
          school_id: 5 // docente requires school
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
      // Reduced user count to avoid long test duration (1 second delay between users)
      const users = Array.from({ length: 3 }, (_, i) => ({
        email: `user${i}@example.com`,
        firstName: `User${i}`,
        lastName: 'Test',
        role: 'docente',
        password: `Pass${i}123!`,
        school_id: 5 // docente requires school
      }));

      (parseBulkUserData as any).mockReturnValue({
        valid: users,
        invalid: [],
        warnings: [],
        summary: { total: 3, valid: 3, invalid: 0, hasWarnings: 0 }
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
        total: 3,
        succeeded: 3,
        failed: 0
      });
      expect(response.results).toHaveLength(3);

      // Verify all users were created
      expect(mockAuth.admin.createUser).toHaveBeenCalledTimes(3);
    }, 15000); // 15 second timeout for multiple users with delays

    it('should handle existing users gracefully', async () => {
      (parseBulkUserData as any).mockReturnValue({
        valid: [{
          email: 'existing@example.com',
          firstName: 'Existing',
          lastName: 'User',
          role: 'docente',
          password: 'TestPass123!',
          school_id: 5
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
          password: 'weak',
          school_id: 5
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
          password: 'ValidPass123!',
          school_id: 5
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

      // Add RPC mock for cache refresh
      mockSupabaseAdmin.rpc = vi.fn().mockResolvedValue({ data: null, error: null });

      (parseBulkUserData as any).mockReturnValue({
        valid: [{
          email: 'test@example.com',
          firstName: 'Test',
          lastName: 'User',
          role: 'docente',
          password: 'TestPass123!',
          school_id: 5
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
      const mockInsertFail = vi.fn().mockResolvedValue({
        data: null,
        error: new Error('Profile creation failed')
      });

      mockFrom.mockImplementation((table: string) => {
        if (table === 'user_roles') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({
              data: [{ role_type: 'admin', is_active: true }],
              error: null
            }),
            insert: vi.fn().mockResolvedValue({ data: null, error: null })
          };
        }
        if (table === 'profiles') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
            insert: mockInsertFail,
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: null, error: null })
            })
          };
        }
        if (table === 'schools') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: { id: 5, name: 'Test School', has_generations: false },
              error: null
            })
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
          insert: vi.fn().mockResolvedValue({ data: null, error: null }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: null, error: null })
          })
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

      // CRITICAL: Ensure validatePassword mock is set for Error Handling tests
      (validatePassword as any).mockReturnValue({ valid: true, errors: [] });

      // Add RPC mock for cache refresh
      mockSupabaseAdmin.rpc = vi.fn().mockResolvedValue({ data: null, error: null });

      mockFrom.mockImplementation((table: string) => {
        if (table === 'user_roles') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({
              data: [{ role_type: 'admin', is_active: true }],
              error: null
            }),
            insert: vi.fn().mockResolvedValue({ data: null, error: null })
          };
        }
        if (table === 'profiles') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
            insert: vi.fn().mockResolvedValue({ data: null, error: null }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: null, error: null })
            })
          };
        }
        if (table === 'schools') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: { id: 5, name: 'Test School', has_generations: false },
              error: null
            })
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
          insert: vi.fn().mockResolvedValue({ data: null, error: null }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: null, error: null })
          })
        };
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

  describe('Organizational Assignment and user_roles Creation', () => {
    let mockInsert: any;
    let mockRpc: any;
    let userRolesInsertCalls: any[];
    let profilesInsertCalls: any[];

    beforeEach(() => {
      // Reset tracking arrays
      userRolesInsertCalls = [];
      profilesInsertCalls = [];

      // Setup valid admin auth
      mockAuth.getUser.mockResolvedValue({
        data: { user: { id: 'admin-123' } },
        error: null
      });

      // CRITICAL: Ensure validatePassword mock is set for these tests
      (validatePassword as any).mockReturnValue({ valid: true, errors: [] });

      // Mock RPC for cache refresh
      mockRpc = vi.fn().mockResolvedValue({ data: null, error: null });

      // Create mock insert that tracks calls
      mockInsert = vi.fn().mockImplementation(() => ({
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { id: 'new-community-uuid' }, error: null })
      }));

      // Track insert calls per table
      mockFrom.mockImplementation((table: string) => {
        if (table === 'user_roles') {
          const adminCheckMock = {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: [{ role_type: 'admin', is_active: true }],
              error: null
            })
          };

          // Check if this is admin role check (has limit) or insert
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({
              data: [{ role_type: 'admin', is_active: true }],
              error: null
            }),
            insert: vi.fn().mockImplementation((data) => {
              userRolesInsertCalls.push(data);
              return Promise.resolve({ data: null, error: null });
            })
          };
        }
        if (table === 'profiles') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
            insert: vi.fn().mockImplementation((data) => {
              profilesInsertCalls.push(data);
              return Promise.resolve({ data: null, error: null });
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: null, error: null })
            })
          };
        }
        if (table === 'schools') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: { id: 5, name: 'Test School', has_generations: false },
              error: null
            })
          };
        }
        if (table === 'growth_communities') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
            insert: mockInsert
          };
        }
        if (table === 'audit_logs') {
          return {
            insert: vi.fn().mockResolvedValue({ data: null, error: null })
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
          insert: vi.fn().mockResolvedValue({ data: null, error: null }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: null, error: null })
          })
        };
      });

      // Add RPC mock
      mockSupabaseAdmin.rpc = mockRpc;
    });

    it('should create user with school_id from organizational scope', async () => {
      (parseBulkUserData as any).mockReturnValue({
        valid: [{
          email: 'teacher@school.com',
          firstName: 'Teacher',
          lastName: 'One',
          role: 'docente',
          password: 'TestPass123!',
          school_id: 5,
          generation_id: undefined,
          community_id: undefined
        }],
        invalid: [],
        warnings: [],
        summary: { total: 1, valid: 1, invalid: 0, hasWarnings: 0 }
      });

      mockAuth.admin.createUser.mockResolvedValue({
        data: {
          user: {
            id: 'new-teacher-123',
            email: 'teacher@school.com'
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
          csvData: 'test-csv',
          options: {
            organizationalScope: {
              globalSchoolId: 5
            }
          }
        }
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const response = JSON.parse(res._getData());

      expect(response.success).toBe(true);
      expect(response.results[0].success).toBe(true);

      // Verify profile was created with school_id
      expect(profilesInsertCalls.length).toBeGreaterThan(0);
      const profileData = profilesInsertCalls[0];
      expect(profileData.school_id).toBe(5);
    });

    it('should create user_roles entry with organizational assignments', async () => {
      (parseBulkUserData as any).mockReturnValue({
        valid: [{
          email: 'leader@school.com',
          firstName: 'Leader',
          lastName: 'Test',
          role: 'lider_generacion',
          password: 'TestPass123!',
          school_id: 7,
          generation_id: 'gen-uuid-456',
          community_id: 'comm-uuid-789'
        }],
        invalid: [],
        warnings: [],
        summary: { total: 1, valid: 1, invalid: 0, hasWarnings: 0 }
      });

      mockAuth.admin.createUser.mockResolvedValue({
        data: {
          user: {
            id: 'new-leader-123',
            email: 'leader@school.com'
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

      // Verify user_roles entry was created with correct data
      expect(userRolesInsertCalls.length).toBeGreaterThan(0);
      const roleData = userRolesInsertCalls[0];
      expect(roleData.user_id).toBe('new-leader-123');
      expect(roleData.role_type).toBe('lider_generacion');
      expect(roleData.school_id).toBe(7);
      expect(roleData.generation_id).toBe('gen-uuid-456');
      expect(roleData.community_id).toBe('comm-uuid-789');
      expect(roleData.is_active).toBe(true);
      expect(roleData.assigned_by).toBe('admin-123');
    });

    it('should refresh user_roles cache after successful imports', async () => {
      (parseBulkUserData as any).mockReturnValue({
        valid: [{
          email: 'test@example.com',
          firstName: 'Test',
          lastName: 'User',
          role: 'docente',
          password: 'TestPass123!',
          school_id: 1
        }],
        invalid: [],
        warnings: [],
        summary: { total: 1, valid: 1, invalid: 0, hasWarnings: 0 }
      });

      mockAuth.admin.createUser.mockResolvedValue({
        data: {
          user: { id: 'user-123', email: 'test@example.com' }
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

      // Verify cache refresh was called
      expect(mockRpc).toHaveBeenCalledWith('refresh_user_roles_cache');
    });

    it('should fail validation for roles requiring school without school_id', async () => {
      (parseBulkUserData as any).mockReturnValue({
        valid: [{
          email: 'consultant@example.com',
          firstName: 'Consultant',
          lastName: 'Test',
          role: 'consultor',
          password: 'TestPass123!',
          school_id: undefined, // Missing required school
          generation_id: undefined,
          community_id: undefined
        }],
        invalid: [],
        warnings: [],
        summary: { total: 1, valid: 1, invalid: 0, hasWarnings: 0 }
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

      // Should fail because consultor requires school
      expect(response.results[0].success).toBe(false);
      expect(response.results[0].error).toContain('requires a school assignment');
    });

    it('should allow admin role without school requirement', async () => {
      (parseBulkUserData as any).mockReturnValue({
        valid: [{
          email: 'admin@example.com',
          firstName: 'Admin',
          lastName: 'Test',
          role: 'admin',
          password: 'TestPass123!',
          school_id: undefined, // Admin doesn't require school
          generation_id: undefined,
          community_id: undefined
        }],
        invalid: [],
        warnings: [],
        summary: { total: 1, valid: 1, invalid: 0, hasWarnings: 0 }
      });

      mockAuth.admin.createUser.mockResolvedValue({
        data: {
          user: { id: 'admin-user-123', email: 'admin@example.com' }
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

      expect(response.results[0].success).toBe(true);
    });

    it('should handle multiple users with different organizational scopes', async () => {
      (parseBulkUserData as any).mockReturnValue({
        valid: [
          {
            email: 'docente1@school.com',
            firstName: 'Docente',
            lastName: 'One',
            role: 'docente',
            password: 'TestPass123!',
            school_id: 1,
            generation_id: 'gen-1',
            community_id: 'comm-1'
          },
          {
            email: 'docente2@school.com',
            firstName: 'Docente',
            lastName: 'Two',
            role: 'docente',
            password: 'TestPass123!',
            school_id: 2,
            generation_id: undefined,
            community_id: undefined
          },
          {
            email: 'admin@example.com',
            firstName: 'Admin',
            lastName: 'User',
            role: 'admin',
            password: 'TestPass123!',
            school_id: undefined,
            generation_id: undefined,
            community_id: undefined
          }
        ],
        invalid: [],
        warnings: [],
        summary: { total: 3, valid: 3, invalid: 0, hasWarnings: 0 }
      });

      let userCounter = 0;
      mockAuth.admin.createUser.mockImplementation(({ email }) => {
        userCounter++;
        return Promise.resolve({
          data: {
            user: { id: `user-${userCounter}`, email }
          },
          error: null
        });
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

      expect(response.success).toBe(true);
      expect(response.summary.succeeded).toBe(3);
      expect(response.summary.failed).toBe(0);
    });
  });
});