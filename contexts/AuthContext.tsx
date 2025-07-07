/**
 * Global Authentication Context for FNE LMS
 * Refactored to use SessionContextProvider as single source of truth
 * No competing onAuthStateChange listeners
 */

import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/router';
import { User } from '@supabase/supabase-js';
import { useSession, useSupabaseClient } from '@supabase/auth-helpers-react';
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
  const session = useSession(); // Single source of truth from SessionContextProvider
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
      if (!session?.user?.id) {
        // No session - clear auth state
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
        // Set loading state
        setAuthState(prev => ({ ...prev, loading: true }));

        // Fetch profile and roles
        const profileData = await getUserProfileWithRoles(supabase, session.user.id);
        
        if (!profileData) {
          console.error('[AuthContext] No profile found for user');
          setAuthState(prev => ({ ...prev, loading: false }));
          return;
        }

        // The function returns { ...profile, roles: UserRole[] }
        // But UserProfile type expects user_roles
        const userRoles = (profileData as any).roles || profileData.user_roles || [];

        // Check for legacy role and migrate if needed
        if (profileData.role && userRoles.length === 0 && (profileData.role === 'admin' || profileData.role === 'docente')) {
          console.log('[AuthContext] Migrating legacy role:', profileData.role);
          const migrationResult = await migrateLegacyUser(supabase, session.user.id, profileData.role as 'admin' | 'docente');
          if (migrationResult.success) {
            // Re-fetch profile after migration
            const updatedProfile = await getUserProfileWithRoles(supabase, session.user.id);
            if (updatedProfile) {
              const updatedRoles = (updatedProfile as any).roles || updatedProfile.user_roles || [];
              userRoles.length = 0;
              userRoles.push(...updatedRoles);
            }
          }
        }

        // Get permissions
        const permissions = getUserPermissions(userRoles);
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
  }, [session?.user?.id, supabase]);

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

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
