import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextApiRequest, NextApiResponse } from 'next';
import handler from '../../../pages/api/admin/user-roles';
import { checkIsAdmin, createServiceRoleClient, validateRequestBody } from '../../../lib/api-auth';

// Mock the api-auth module
vi.mock('../../../lib/api-auth', () => ({
  checkIsAdmin: vi.fn(),
  createServiceRoleClient: vi.fn(),
  sendAuthError: vi.fn((res, message, code) => {
    res.status(code || 401).json({ error: message });
  }),
  sendApiResponse: vi.fn((res, data, code) => {
    res.status(code || 200).json(data);
  }),
  validateRequestBody: vi.fn(),
  logApiRequest: vi.fn()
}));

describe('/api/admin/user-roles', () => {
  let req: Partial<NextApiRequest>;
  let res: Partial<NextApiResponse>;
  let mockSupabaseAdmin: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    req = {
      method: 'GET',
      query: {},
      body: {},
      headers: {}
    };
    
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis()
    };

    // Mock Supabase admin client
    mockSupabaseAdmin = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      auth: {
        admin: {
          updateUserById: vi.fn()
        }
      }
    };

    vi.mocked(createServiceRoleClient).mockReturnValue(mockSupabaseAdmin);
  });

  describe('Authentication', () => {
    it('should reject unauthenticated requests', async () => {
      vi.mocked(checkIsAdmin).mockResolvedValue({
        isAdmin: false,
        user: null,
        error: 'Not authenticated'
      });

      await handler(req as NextApiRequest, res as NextApiResponse);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Authentication required' });
    });

    it('should reject non-admin users', async () => {
      vi.mocked(checkIsAdmin).mockResolvedValue({
        isAdmin: false,
        user: { id: 'user-123' },
        error: null
      });

      await handler(req as NextApiRequest, res as NextApiResponse);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Admin access required' });
    });
  });

  describe('GET /api/admin/user-roles', () => {
    beforeEach(() => {
      vi.mocked(checkIsAdmin).mockResolvedValue({
        isAdmin: true,
        user: { id: 'admin-123' },
        error: null
      });
    });

    it('should fetch user roles successfully and create audit log', async () => {
      req.method = 'GET';
      req.query = { userId: 'user-456' };

      const mockRoles = [
        {
          id: 'role-1',
          user_id: 'user-456',
          role_type: 'consultor',
          school_id: 'school-1',
          school: { id: 'school-1', name: 'Test School' }
        }
      ];

      // Mock fetching roles
      mockSupabaseAdmin.from.mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: mockRoles,
              error: null
            })
          })
        })
      });

      // Mock audit log insertion
      const mockAuditLogInsert = vi.fn().mockResolvedValue({
        data: null,
        error: null
      });
      
      mockSupabaseAdmin.from.mockReturnValueOnce({
        insert: mockAuditLogInsert
      });

      await handler(req as NextApiRequest, res as NextApiResponse);

      // Verify roles were fetched
      expect(mockSupabaseAdmin.from).toHaveBeenNthCalledWith(1, 'user_roles');
      
      // CRITICAL: Verify audit log was created
      expect(mockSupabaseAdmin.from).toHaveBeenNthCalledWith(2, 'audit_logs');
      expect(mockAuditLogInsert).toHaveBeenCalledWith({
        user_id: 'admin-123',
        action: 'roles_viewed',
        details: {
          target_user_id: 'user-456',
          role_count: 1,
          timestamp: expect.any(String)
        }
      });
      
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        roles: mockRoles
      });
    });

    it('should reject requests without userId', async () => {
      req.method = 'GET';
      req.query = {};

      await handler(req as NextApiRequest, res as NextApiResponse);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ 
        error: 'Missing or invalid userId parameter' 
      });
    });
  });

  describe('POST /api/admin/user-roles', () => {
    beforeEach(() => {
      vi.mocked(checkIsAdmin).mockResolvedValue({
        isAdmin: true,
        user: { id: 'admin-123' },
        error: null
      });

      vi.mocked(validateRequestBody).mockReturnValue({
        valid: true,
        missing: []
      });
    });

    it('should assign a role successfully', async () => {
      req.method = 'POST';
      req.body = {
        targetUserId: 'user-456',
        roleType: 'consultor',
        organizationalScope: {
          schoolId: 'school-1'
        }
      };

      // Mock user lookup
      mockSupabaseAdmin.from.mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { 
                id: 'user-456', 
                email: 'test@example.com',
                first_name: 'Test',
                last_name: 'User'
              },
              error: null
            })
          })
        })
      });

      // Mock duplicate check - create a chainable mock
      const mockChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: null,
          error: { code: 'PGRST116' } // Not found
        })
      };
      mockChain.eq.mockReturnValue(mockChain); // Make eq chainable
      
      mockSupabaseAdmin.from.mockReturnValueOnce(mockChain);

      // Mock role insertion
      const newRole = {
        id: 'role-new',
        user_id: 'user-456',
        role_type: 'consultor',
        school_id: 'school-1'
      };

      mockSupabaseAdmin.from.mockReturnValueOnce({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: newRole,
              error: null
            })
          })
        })
      });

      // Mock fetching all roles for priority check
      mockSupabaseAdmin.from.mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            data: [{ role_type: 'consultor' }],
            error: null
          })
        })
      });

      // Mock profile update
      mockSupabaseAdmin.from.mockReturnValueOnce({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            data: null,
            error: null
          })
        })
      });

      // Mock JWT update
      mockSupabaseAdmin.auth.admin.updateUserById.mockResolvedValue({
        error: null
      });

      // Mock audit log insertion
      const mockAuditLogInsert = vi.fn().mockResolvedValue({
        data: null,
        error: null
      });
      
      mockSupabaseAdmin.from.mockReturnValueOnce({
        insert: mockAuditLogInsert
      });

      await handler(req as NextApiRequest, res as NextApiResponse);

      // CRITICAL: Verify audit log was created
      expect(mockAuditLogInsert).toHaveBeenCalledWith({
        user_id: 'admin-123',
        action: 'role_assigned',
        details: {
          target_user_id: 'user-456',
          target_email: 'test@example.com',
          role_type: 'consultor',
          organizational_scope: {
            schoolId: 'school-1'
          },
          community_created: false,
          timestamp: expect.any(String)
        }
      });

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Role consultor assigned successfully',
        role: newRole,
        communityCreated: false
      });
    });

    it('should validate role type', async () => {
      req.method = 'POST';
      req.body = {
        targetUserId: 'user-456',
        roleType: 'invalid_role'
      };

      await handler(req as NextApiRequest, res as NextApiResponse);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: expect.stringContaining('Invalid role type')
      });
    });

    it('should prevent duplicate role assignments', async () => {
      req.method = 'POST';
      req.body = {
        targetUserId: 'user-456',
        roleType: 'consultor',
        organizationalScope: {
          schoolId: 'school-1'
        }
      };

      // Mock user lookup
      mockSupabaseAdmin.from.mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: 'user-456', email: 'test@example.com' },
              error: null
            })
          })
        })
      });

      // Mock duplicate check - role already exists
      const mockDuplicateChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { id: 'existing-role' },
          error: null
        })
      };
      mockDuplicateChain.eq.mockReturnValue(mockDuplicateChain); // Make eq chainable
      
      mockSupabaseAdmin.from.mockReturnValueOnce(mockDuplicateChain);

      await handler(req as NextApiRequest, res as NextApiResponse);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({
        error: 'User already has this role with the same organizational scope'
      });
    });
  });

  describe('DELETE /api/admin/user-roles', () => {
    beforeEach(() => {
      vi.mocked(checkIsAdmin).mockResolvedValue({
        isAdmin: true,
        user: { id: 'admin-123' },
        error: null
      });
    });

    it('should remove a role successfully and create audit log', async () => {
      req.method = 'DELETE';
      req.body = { roleId: 'role-123' };

      // Mock fetching role to delete
      mockSupabaseAdmin.from.mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                id: 'role-123',
                user_id: 'user-456',
                role_type: 'consultor',
                profiles: { email: 'test@example.com' }
              },
              error: null
            })
          })
        })
      });

      // Mock role deletion
      const mockDelete = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          error: null
        })
      });
      
      mockSupabaseAdmin.from.mockReturnValueOnce({
        delete: mockDelete
      });

      // Mock fetching remaining roles
      mockSupabaseAdmin.from.mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            data: [{ role_type: 'docente' }],
            error: null
          })
        })
      });

      // Mock profile update
      const mockProfileUpdate = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: null,
          error: null
        })
      });
      
      mockSupabaseAdmin.from.mockReturnValueOnce({
        update: mockProfileUpdate
      });

      // Mock JWT update
      mockSupabaseAdmin.auth.admin.updateUserById.mockResolvedValue({
        error: null
      });

      // Mock audit log insertion
      const mockAuditLogInsert = vi.fn().mockResolvedValue({
        data: null,
        error: null
      });
      
      mockSupabaseAdmin.from.mockReturnValueOnce({
        insert: mockAuditLogInsert
      });

      await handler(req as NextApiRequest, res as NextApiResponse);

      // Verify the role was deleted
      expect(mockDelete).toHaveBeenCalled();
      
      // Verify profile was updated
      expect(mockProfileUpdate).toHaveBeenCalledWith({ role: 'docente' });
      
      // CRITICAL: Verify audit log was created
      expect(mockSupabaseAdmin.from).toHaveBeenLastCalledWith('audit_logs');
      expect(mockAuditLogInsert).toHaveBeenCalledWith({
        user_id: 'admin-123',
        action: 'role_removed',
        details: {
          target_user_id: 'user-456',
          target_email: 'test@example.com',
          role_type: 'consultor',
          role_id: 'role-123',
          timestamp: expect.any(String)
        }
      });

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Role consultor removed successfully',
        removedRole: {
          id: 'role-123',
          role_type: 'consultor',
          user_id: 'user-456'
        }
      });
    });

    it('should prevent removing the last admin role', async () => {
      req.method = 'DELETE';
      req.body = { roleId: 'admin-role-123' };

      // Mock fetching role to delete
      mockSupabaseAdmin.from.mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                id: 'admin-role-123',
                user_id: 'user-456',
                role_type: 'admin'
              },
              error: null
            })
          })
        })
      });

      // Mock admin count check
      mockSupabaseAdmin.from.mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            data: [{ id: 'admin-role-123' }], // Only one admin
            error: null
          })
        })
      });

      await handler(req as NextApiRequest, res as NextApiResponse);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Cannot remove the last admin role'
      });
    });
  });

  describe('Audit Log Error Handling', () => {
    beforeEach(() => {
      vi.mocked(checkIsAdmin).mockResolvedValue({
        isAdmin: true,
        user: { id: 'admin-123' },
        error: null
      });
    });

    it('should still complete operation even if audit log fails', async () => {
      req.method = 'GET';
      req.query = { userId: 'user-456' };

      const mockRoles = [
        {
          id: 'role-1',
          user_id: 'user-456',
          role_type: 'consultor'
        }
      ];

      // Mock fetching roles
      mockSupabaseAdmin.from.mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: mockRoles,
              error: null
            })
          })
        })
      });

      // Mock audit log insertion FAILURE
      mockSupabaseAdmin.from.mockReturnValueOnce({
        insert: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'Audit log failed' }
        })
      });

      await handler(req as NextApiRequest, res as NextApiResponse);

      // Should still return roles even if audit log failed
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        roles: mockRoles
      });
    });
  });

  describe('Method validation', () => {
    it('should reject unsupported methods', async () => {
      req.method = 'PUT';

      vi.mocked(checkIsAdmin).mockResolvedValue({
        isAdmin: true,
        user: { id: 'admin-123' },
        error: null
      });

      await handler(req as NextApiRequest, res as NextApiResponse);

      expect(res.status).toHaveBeenCalledWith(405);
      expect(res.json).toHaveBeenCalledWith({ error: 'Method not allowed' });
    });
  });
});