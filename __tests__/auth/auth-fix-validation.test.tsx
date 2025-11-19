/**
 * Authentication Fix Validation Tests
 * 
 * Tests to verify the authentication fix works correctly:
 * - No competing listeners
 * - Session persistence
 * - All roles work
 * - No unexpected logouts
 */

import React from 'react';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { SessionContextProvider } from '@supabase/auth-helpers-react';
import { useSession, useSupabaseClient } from '@supabase/auth-helpers-react';
import Router from 'next/router';
import { AuthProvider, useAuth } from '../../contexts/AuthContext';
import * as roleUtils from '../../utils/roleUtils';

// Mock modules
vi.mock('next/router', async () => {
  const actual = await vi.importActual<typeof import('next/router')>('next/router');
  const pushMock = vi.fn();
  return {
    ...actual,
    useRouter: () => ({
      push: pushMock,
      pathname: '/',
      query: {},
      asPath: '/',
    }),
    default: {
      ...(actual as any).default,
      push: pushMock,
    },
  };
});

vi.mock('@supabase/auth-helpers-react', async () => {
  const actual = await vi.importActual<typeof import('@supabase/auth-helpers-react')>('@supabase/auth-helpers-react');
  return {
    ...actual,
    useSession: vi.fn(),
    useSupabaseClient: vi.fn(),
    SessionContextProvider: ({ children }: any) => <>{children}</>,
  };
});

// Mock roleUtils to prevent RLS calls
vi.mock('../../utils/roleUtils', async () => {
  const actual = await vi.importActual<typeof import('../../utils/roleUtils')>('../../utils/roleUtils');
  const getUserProfileMock = vi.fn();
  const hasAdminPrivilegesMock = vi.fn();
  return {
    ...actual,
    getUserProfileWithRoles: getUserProfileMock,
    getUserProfileWithRolesRLS: getUserProfileMock,
    hasAdminPrivileges: hasAdminPrivilegesMock,
    hasAdminPrivilegesRLS: hasAdminPrivilegesMock,
    getUserPermissions: vi.fn(() => ({
      can_create_courses: false,
      can_edit_all_courses: false,
      can_delete_courses: false,
      can_assign_courses: false,
      can_create_users: false,
      can_edit_users: false,
      can_delete_users: false,
      can_assign_roles: false,
      can_manage_schools: false,
      can_manage_generations: false,
      can_manage_communities: false,
      reporting_scope: 'individual',
      feedback_scope: 'individual'
    })),
    migrateLegacyUserRLS: vi.fn(),
    getHighestRole: vi.fn(),
  };
});

describe('Authentication Fix Validation', () => {
  let mockSupabase: any;
  let mockSession: any;
const mockedUseSession = vi.mocked(useSession);
const mockedUseSupabaseClient = vi.mocked(useSupabaseClient);
const mockedRoleUtils = vi.mocked(roleUtils);

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock Supabase client
    mockSupabase = {
      auth: {
        signOut: vi.fn().mockResolvedValue({ error: null }),
        getSession: vi.fn(),
      },
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
          })),
        })),
      })),
      storage: {
        from: vi.fn(() => ({
          getPublicUrl: vi.fn(() => ({ data: { publicUrl: '' } })),
        })),
      },
    };

    // Setup mock implementations
    mockedUseSupabaseClient.mockReturnValue(mockSupabase);
  });

  describe('No Competing Listeners', () => {
    test('AuthContext should not create its own onAuthStateChange listener', () => {
      // Spy on the auth object
      const onAuthStateChangeSpy = vi.fn();
      mockSupabase.auth.onAuthStateChange = onAuthStateChangeSpy;

      // Mock no session initially
      mockedUseSession.mockReturnValue(null);

      render(
        <SessionContextProvider supabaseClient={mockSupabase}>
          <AuthProvider>
            <div>Test</div>
          </AuthProvider>
        </SessionContextProvider>
      );

      // AuthContext should NOT call onAuthStateChange
      expect(onAuthStateChangeSpy).not.toHaveBeenCalled();
    });

    test('AuthContext should react to session changes from SessionContextProvider', async () => {
      // Start with no session
      mockedUseSession.mockReturnValue(null);

      const { rerender } = render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      // Verify initial state
      expect(screen.getByText('Not authenticated')).toBeInTheDocument();

      // Mock session change
      mockSession = {
        user: { id: '123', email: 'test@example.com' },
        access_token: 'token',
      };
      mockedUseSession.mockReturnValue(mockSession);
      
      // Mock profile fetch
      mockedRoleUtils.getUserProfileWithRoles.mockResolvedValueOnce({
        id: '123',
        email: 'test@example.com',
        role: 'admin',
        roles: [{ role_type: 'admin' }],
      });

      // Force re-render
      rerender(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      // Wait for auth state to update
      await waitFor(() => {
        expect(screen.getByText('Authenticated: test@example.com')).toBeInTheDocument();
      });
    });
  });

  describe('Session Persistence', () => {
    test('should maintain session across component remounts', async () => {
      mockSession = {
        user: { id: '123', email: 'admin@test.com' },
        access_token: 'valid-token',
      };
      mockedUseSession.mockReturnValue(mockSession);
      
      mockedRoleUtils.getUserProfileWithRoles.mockResolvedValue({
        id: '123',
        email: 'admin@test.com',
        role: 'admin',
        roles: [{ role_type: 'admin' }],
      });

      // Initial mount
      const { unmount } = render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByText('Authenticated: admin@test.com')).toBeInTheDocument();
      });

      // Unmount
      unmount();

      // Remount - session should persist
      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      // Should immediately show authenticated state
      await waitFor(() => {
        expect(screen.getByText('Authenticated: admin@test.com')).toBeInTheDocument();
      });
    });

    test('should handle session refresh without logout', async () => {
      // Start with valid session
      mockSession = {
        user: { id: '123', email: 'test@test.com' },
        access_token: 'old-token',
      };
      mockedUseSession.mockReturnValue(mockSession);
      
      mockedRoleUtils.getUserProfileWithRoles.mockResolvedValue({
        id: '123',
        email: 'test@test.com',
        role: 'docente',
        roles: [{ role_type: 'docente' }],
      });

      const { rerender } = render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByText('Authenticated: test@test.com')).toBeInTheDocument();
      });

      // Simulate token refresh (same user, new token)
      mockSession = {
        user: { id: '123', email: 'test@test.com' },
        access_token: 'new-token',
      };
      mockedUseSession.mockReturnValue(mockSession);

      rerender(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      // User should remain authenticated
      await waitFor(() => {
        expect(screen.getByText('Authenticated: test@test.com')).toBeInTheDocument();
      });
      
      // Should NOT show logout message
      expect(screen.queryByText('Not authenticated')).not.toBeInTheDocument();
    });
  });

  describe('Role-Based Authentication', () => {
    const testRoles = [
      { role: 'admin', email: 'admin@test.com' },
      { role: 'consultor', email: 'consultor@test.com' },
      { role: 'equipo_directivo', email: 'director@test.com' },
      { role: 'lider_generacion', email: 'lider_gen@test.com' },
      { role: 'lider_comunidad', email: 'lider_com@test.com' },
      { role: 'docente', email: 'docente@test.com' },
    ];

    testRoles.forEach(({ role, email }) => {
      test(`should authenticate ${role} role correctly`, async () => {
        mockSession = {
          user: { id: '123', email },
          access_token: 'token',
        };
        mockedUseSession.mockReturnValue(mockSession);
        
        mockedRoleUtils.getUserProfileWithRoles.mockResolvedValue({
          id: '123',
          email,
          role,
          roles: [{ role_type: role }],
        });
        
        mockedRoleUtils.hasAdminPrivileges.mockResolvedValue(role === 'admin');
        
        // Mock appropriate permissions for role
        const permissions = role === 'admin' ? {
          can_create_courses: true,
          can_edit_all_courses: true,
          can_delete_courses: true,
          can_assign_courses: true,
          can_create_users: true,
          can_edit_users: true,
          can_delete_users: true,
          can_assign_roles: true,
          can_manage_schools: true,
          can_manage_generations: true,
          can_manage_communities: true,
          reporting_scope: 'all',
          feedback_scope: 'all'
        } : {
          can_create_courses: false,
          can_edit_all_courses: false,
          can_delete_courses: false,
          can_assign_courses: false,
          can_create_users: false,
          can_edit_users: false,
          can_delete_users: false,
          can_assign_roles: false,
          can_manage_schools: false,
          can_manage_generations: false,
          can_manage_communities: false,
          reporting_scope: 'individual',
          feedback_scope: 'individual'
        };
        
        mockedRoleUtils.getUserPermissions.mockReturnValue(permissions);

        render(
          <AuthProvider>
            <RoleTestComponent />
          </AuthProvider>
        );

        await waitFor(() => {
          expect(screen.getByText(`Role: ${role}`)).toBeInTheDocument();
          if (role === 'admin') {
            expect(screen.getByText('Is Admin: true')).toBeInTheDocument();
          } else {
            expect(screen.getByText('Is Admin: false')).toBeInTheDocument();
          }
        });
      });
    });
  });

  describe('Logout Functionality', () => {
    test('should clear session and redirect on logout', async () => {
      mockSession = {
        user: { id: '123', email: 'test@test.com' },
        access_token: 'token',
      };
      mockedUseSession.mockReturnValue(mockSession);
      
      mockedRoleUtils.getUserProfileWithRoles.mockResolvedValue({
        id: '123',
        email: 'test@test.com',
        role: 'admin',
        roles: [{ role_type: 'admin' }],
      });

      render(
        <AuthProvider>
          <LogoutTestComponent />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByText('Authenticated')).toBeInTheDocument();
      });

      // Click logout
      const logoutButton = screen.getByText('Logout');
      fireEvent.click(logoutButton);

      await waitFor(() => {
        expect(mockSupabase.auth.signOut).toHaveBeenCalled();
      });

      // Simulate session clear
      mockedUseSession.mockReturnValue(null);

      await waitFor(() => {
        expect(Router.push).toHaveBeenCalledWith('/login');
      });
    });
  });
});

// Test Components
function TestComponent() {
  const { user, loading } = useAuth();
  
  if (loading) return <div>Loading...</div>;
  if (!user) return <div>Not authenticated</div>;
  
  return <div>Authenticated: {user.email}</div>;
}

function RoleTestComponent() {
  const { user, loading, isAdmin, userRoles } = useAuth();
  
  if (loading) return <div>Loading...</div>;
  if (!user) return <div>Not authenticated</div>;
  
  const roleType = userRoles[0]?.role_type || 'none';
  
  return (
    <div>
      <div>Role: {roleType}</div>
      <div>Is Admin: {isAdmin ? 'true' : 'false'}</div>
    </div>
  );
}

function LogoutTestComponent() {
  const { user, logout, loading } = useAuth();
  
  if (loading) return <div>Loading...</div>;
  if (!user) return <div>Not authenticated</div>;
  
  return (
    <div>
      <div>Authenticated</div>
      <button onClick={logout}>Logout</button>
    </div>
  );
}
