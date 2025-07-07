/**
 * Unit tests for roleUtils dev impersonation features
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { 
  isDevUser, 
  isGlobalAdmin, 
  hasAdminPrivileges,
  getUserRoles 
} from '../utils/roleUtils';
import { supabase } from '../lib/supabase-wrapper';
import { devRoleService } from '../lib/services/devRoleService';

// Mock modules
vi.mock('../lib/supabase-wrapper', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn()
  }
}));

vi.mock('../lib/services/devRoleService', () => ({
  devRoleService: {
    getActiveImpersonation: vi.fn()
  }
}));

describe('roleUtils - Dev Features', () => {
  const mockUserId = 'user-123';
  const mockDevUserId = 'dev-456';
  
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('isDevUser', () => {
    it('should check dev_users table', async () => {
      const mockFrom = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({
                data: [{ id: 'dev-record' }],
                error: null
              })
            })
          })
        })
      });
      
      vi.mocked(supabase.from).mockImplementation(mockFrom);
      
      const result = await isDevUser(mockDevUserId);
      
      expect(result).toBe(true);
      expect(mockFrom).toHaveBeenCalledWith('dev_users');
    });

    it('should return false if not a dev user', async () => {
      const mockFrom = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({
                data: [],
                error: null
              })
            })
          })
        })
      });
      
      vi.mocked(supabase.from).mockImplementation(mockFrom);
      
      const result = await isDevUser(mockUserId);
      
      expect(result).toBe(false);
    });
  });

  describe('isGlobalAdmin with dev impersonation', () => {
    it('should return true if dev is impersonating admin', async () => {
      // Mock isDevUser to return true
      const mockFrom = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({
                data: [{ id: 'dev-record' }],
                error: null
              })
            })
          })
        })
      });
      
      vi.mocked(supabase.from).mockImplementation(mockFrom);
      
      // Mock active impersonation as admin
      vi.mocked(devRoleService.getActiveImpersonation).mockResolvedValue({
        id: 'session-123',
        dev_user_id: mockDevUserId,
        impersonated_role: 'admin',
        session_token: 'token',
        is_active: true,
        started_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 3600000).toISOString(),
        created_at: new Date().toISOString()
      });
      
      const result = await isGlobalAdmin(mockDevUserId);
      
      expect(result).toBe(true);
    });

    it('should check actual admin role if not impersonating', async () => {
      // First call for isDevUser returns false
      const mockFromDevUsers = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({
                data: [],
                error: null
              })
            })
          })
        })
      });
      
      // Second call for user_roles
      const mockFromUserRoles = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({
                  data: [{ id: 'admin-role' }],
                  error: null
                })
              })
            })
          })
        })
      });
      
      vi.mocked(supabase.from)
        .mockImplementationOnce(mockFromDevUsers)
        .mockImplementationOnce(mockFromUserRoles);
      
      const result = await isGlobalAdmin(mockUserId);
      
      expect(result).toBe(true);
    });
  });

  describe('getUserRoles with dev impersonation', () => {
    it('should return synthetic role when impersonating', async () => {
      // Mock isDevUser
      const mockFromDev = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({
                data: [{ id: 'dev-record' }],
                error: null
              })
            })
          })
        })
      });
      
      vi.mocked(supabase.from).mockImplementation(mockFromDev);
      
      // Mock active impersonation
      const mockImpersonation = {
        id: 'session-123',
        dev_user_id: mockDevUserId,
        impersonated_role: 'consultor' as const,
        school_id: '123',
        generation_id: '456',
        session_token: 'token',
        is_active: true,
        started_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 3600000).toISOString(),
        created_at: new Date().toISOString()
      };
      
      vi.mocked(devRoleService.getActiveImpersonation).mockResolvedValue(mockImpersonation);
      
      const roles = await getUserRoles(supabase, mockDevUserId);
      
      expect(roles).toHaveLength(1);
      expect(roles[0]).toMatchObject({
        id: 'dev-impersonation',
        user_id: mockDevUserId,
        role_type: 'consultor',
        school_id: '123',
        generation_id: '456',
        is_active: true
      });
    });

    it('should return actual roles when not impersonating', async () => {
      // Mock isDevUser returns false
      const mockFromDev = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({
                data: [],
                error: null
              })
            })
          })
        })
      });
      
      // Mock actual user roles
      const mockFromRoles = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: [{
                  id: 'role-123',
                  user_id: mockUserId,
                  role_type: 'docente',
                  is_active: true
                }],
                error: null
              })
            })
          })
        })
      });
      
      vi.mocked(supabase.from)
        .mockImplementationOnce(mockFromDev)
        .mockImplementationOnce(mockFromRoles);
      
      const roles = await getUserRoles(supabase, mockUserId);
      
      expect(roles).toHaveLength(1);
      expect(roles[0].role_type).toBe('docente');
    });
  });

  describe('hasAdminPrivileges with dev impersonation', () => {
    it('should use isGlobalAdmin which checks impersonation', async () => {
      // Mock dev user with admin impersonation
      const mockFromDev = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({
                data: [{ id: 'dev-record' }],
                error: null
              })
            })
          })
        })
      });
      
      vi.mocked(supabase.from).mockImplementation(mockFromDev);
      
      vi.mocked(devRoleService.getActiveImpersonation).mockResolvedValue({
        id: 'session-123',
        dev_user_id: mockDevUserId,
        impersonated_role: 'admin',
        session_token: 'token',
        is_active: true,
        started_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 3600000).toISOString(),
        created_at: new Date().toISOString()
      });
      
      const result = await hasAdminPrivileges(supabase, mockDevUserId);
      
      expect(result).toBe(true);
    });

    it('should check legacy admin role as fallback', async () => {
      // Not a dev user
      const mockFromDev = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({
                data: [],
                error: null
              })
            })
          })
        })
      });
      
      // Not admin in new system
      const mockFromUserRoles = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({
                  data: [],
                  error: null
                })
              })
            })
          })
        })
      });
      
      // Has legacy admin role
      const mockFromProfiles = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { role: 'admin' },
              error: null
            })
          })
        })
      });
      
      vi.mocked(supabase.from)
        .mockImplementationOnce(mockFromDev)
        .mockImplementationOnce(mockFromUserRoles)
        .mockImplementationOnce(mockFromProfiles);
      
      const result = await hasAdminPrivileges(supabase, mockUserId);
      
      expect(result).toBe(true);
    });
  });
});