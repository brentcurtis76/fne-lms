/**
 * Global Authentication Context for Genera
 * Refactored to use SessionContextProvider as single source of truth
 * No competing onAuthStateChange listeners
 */

import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/router';
import { User } from '@supabase/supabase-js';
import { useSessionContext, useSupabaseClient } from '@supabase/auth-helpers-react';
import { 
  getUserProfileWithRoles,
  hasAdminPrivileges, 
  getUserPermissions,
  migrateLegacyUser,
  getHighestRole
} from '../utils/roleUtils';
import { UserRole, RolePermissions } from '../types/roles';

interface AuthState {
  user: User | null;
  profile: any;
  loading: boolean;
  isAdmin: boolean; // Backward compatibility
  isGlobalAdmin: boolean; // New role system
  userRoles: UserRole[];
  permissions: RolePermissions;
  avatarUrl: string;
}

interface AuthContextType extends AuthState {
  logout: () => Promise<void>;
  hasPermission: (permission: keyof RolePermissions) => boolean;
  hasRole: (roleType: string) => boolean;
  getOrganizationalScope: () => any;
  // Backward compatibility helpers
  canCreateCourses: boolean;
  canManageUsers: boolean;
  canAssignCourses: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { session, isLoading: sessionLoading } = useSessionContext(); // Single source of truth
  const supabase = useSupabaseClient();
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    profile: null,
    loading: true,
    isAdmin: false,
    isGlobalAdmin: false,
    userRoles: [],
    permissions: {
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
    },
    avatarUrl: ''
  });

  // Fetch user profile and roles when session changes
  useEffect(() => {
    const fetchUserData = async () => {
      // Wait for session to finish initializing before acting on null
      if (sessionLoading) return;

      if (!session?.user?.id) {
        // Session resolved but no user — clear auth state
        setAuthState({
          user: null,
          profile: null,
          loading: false,
          isAdmin: false,
          isGlobalAdmin: false,
          userRoles: [],
          permissions: {
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
          },
          avatarUrl: ''
        });
        return;
      }

      try {
        // Fetch profile data
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select(`
            *,
            school:schools(*),
            generation:generations(*),
            community:growth_communities(*)
          `)
          .eq('id', session.user.id)
          .single();

        if (profileError || !profileData) {
          console.error('[AuthContext] No profile found for user:', profileError);
          setAuthState(prev => ({ ...prev, loading: false }));
          return;
        }

        // Fetch roles via API to bypass RLS restrictions
        let userRoles: UserRole[] = [];
        console.log('[AuthContext] Starting role fetch for user:', session.user.id, session.user.email);

        // Get the access token from session to pass as Bearer token
        const accessToken = session.access_token;

        try {
          const rolesResponse = await fetch('/api/auth/my-roles', {
            credentials: 'include',
            headers: accessToken ? {
              'Authorization': `Bearer ${accessToken}`
            } : undefined
          });
          console.log('[AuthContext] API response status:', rolesResponse.status);
          if (rolesResponse.ok) {
            const rolesData = await rolesResponse.json();
            userRoles = rolesData.roles || [];
            console.log('[AuthContext] Fetched roles via API:', userRoles.map(r => r.role_type));
          } else {
            const errorText = await rolesResponse.text();
            console.warn('[AuthContext] Failed to fetch roles via API:', rolesResponse.status, errorText);
            // Fallback to direct query
            console.log('[AuthContext] Attempting direct query fallback...');
            const directRoles = await getUserProfileWithRoles(supabase, session.user.id);
            console.log('[AuthContext] Direct query result:', directRoles);
            userRoles = (directRoles as any)?.roles || directRoles?.user_roles || [];
            console.log('[AuthContext] Roles from direct query:', userRoles.map((r: any) => r.role_type || r));
          }
        } catch (apiError) {
          console.warn('[AuthContext] API fetch failed:', apiError);
          const directRoles = await getUserProfileWithRoles(supabase, session.user.id);
          console.log('[AuthContext] Direct query fallback result:', directRoles);
          userRoles = (directRoles as any)?.roles || directRoles?.user_roles || [];
        }
        console.log('[AuthContext] Final userRoles:', userRoles.length, 'roles');

        // Check for legacy role and migrate if needed (profiles.role column may not exist)
        const legacyRole = (profileData as any).role;
        if (legacyRole && userRoles.length === 0 && (legacyRole === 'admin' || legacyRole === 'docente')) {
          console.log('[AuthContext] Migrating legacy role:', legacyRole);
          const migrationResult = await migrateLegacyUser(supabase, session.user.id, legacyRole as 'admin' | 'docente');
          if (migrationResult.success) {
            // Re-fetch roles via API after migration
            try {
              const rolesResponse = await fetch('/api/auth/my-roles');
              if (rolesResponse.ok) {
                const rolesData = await rolesResponse.json();
                userRoles.length = 0;
                userRoles.push(...(rolesData.roles || []));
              }
            } catch {
              // Ignore errors during migration re-fetch
            }
          }
        }

        // Get permissions - PHASE 1 FIX: Pass legacy role for backward compatibility
        const permissions = getUserPermissions(userRoles, legacyRole);
        const isGlobalAdmin = await hasAdminPrivileges(supabase, session.user.id);
        const highestRole = getHighestRole(userRoles);

        // Get avatar URL
        let avatarUrl = '';
        if (profileData.avatar_url) {
          const { data: { publicUrl } } = supabase.storage
            .from('avatars')
            .getPublicUrl(profileData.avatar_url);
          avatarUrl = publicUrl;
        }

        // Update auth state
        setAuthState({
          user: session.user,
          profile: profileData,
          loading: false,
          isAdmin: profileData.role === 'admin' || isGlobalAdmin, // Backward compatibility
          isGlobalAdmin,
          userRoles: userRoles,
          permissions,
          avatarUrl
        });

      } catch (error) {
        console.error('[AuthContext] Error fetching user data:', error);
        setAuthState(prev => ({ ...prev, loading: false }));
      }
    };

    fetchUserData();
  }, [session?.user?.id, sessionLoading, supabase]);

  // Logout function
  const logout = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      
      // Clear auth state immediately
      setAuthState({
        user: null,
        profile: null,
        loading: false,
        isAdmin: false,
        isGlobalAdmin: false,
        userRoles: [],
        permissions: {
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
        },
        avatarUrl: ''
      });
      
      // Clear any legacy storage
      if (typeof window !== 'undefined') {
        localStorage.removeItem('rememberMe');
      }
      
      router.push('/login');
    } catch (error) {
      console.error('[AuthContext] Logout error:', error);
    }
  };

  // Permission helpers
  const hasPermission = (permission: keyof RolePermissions): boolean => {
    const value = authState.permissions[permission];
    // For boolean permissions, check if true
    if (typeof value === 'boolean') {
      return value === true;
    }
    // For scope permissions, check if not 'individual' (has broader scope)
    return value !== 'individual';
  };

  const hasRole = (roleType: string): boolean => {
    return authState.userRoles.some(role => role.role_type === roleType);
  };

  const getOrganizationalScope = () => {
    if (!authState.userRoles.length) return null;
    
    const highestRole = authState.userRoles[0]; // Assuming sorted by priority
    return {
      school_id: highestRole.school_id,
      generation_id: highestRole.generation_id,
      community_id: highestRole.community_id,
      school: highestRole.school,
      generation: highestRole.generation,
      community: highestRole.community
    };
  };

  const value: AuthContextType = {
    ...authState,
    logout,
    hasPermission,
    hasRole,
    getOrganizationalScope,
    // Backward compatibility
    canCreateCourses: hasPermission('can_create_courses'),
    canManageUsers: hasPermission('can_create_users') || hasPermission('can_edit_users'),
    canAssignCourses: hasPermission('can_assign_courses')
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

const defaultPermissions: RolePermissions = {
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

const defaultAuthValue: AuthContextType = {
  user: null,
  profile: null,
  loading: true,
  isAdmin: false,
  isGlobalAdmin: false,
  userRoles: [],
  permissions: defaultPermissions,
  avatarUrl: '',
  logout: async () => {},
  hasPermission: () => false,
  hasRole: () => false,
  getOrganizationalScope: () => null,
  canCreateCourses: false,
  canManageUsers: false,
  canAssignCourses: false
};

export function useAuth() {
  const context = useContext(AuthContext);
  // Return safe defaults during SSR or if provider is missing
  if (!context) {
    if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
      console.warn('[AuthContext] useAuth used outside AuthProvider - returning defaults');
    }
    return defaultAuthValue;
  }
  return context;
}
