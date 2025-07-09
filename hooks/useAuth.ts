/**
 * Enhanced Authentication Hook for FNE LMS 6-Role System
 * Provides backward-compatible authentication with new role system
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase-wrapper';
import { 
  getUserRoles, 
  hasAdminPrivileges, 
  getUserPermissions,
  migrateLegacyUser 
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

export function useAuth() {
  const router = useRouter();
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

  useEffect(() => {
    const initializeAuth = async () => {
      try {
        // Get current session
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError) {
          console.error('Session error:', sessionError);
          setAuthState(prev => ({ ...prev, loading: false }));
          return;
        }

        if (!session?.user) {
          setAuthState(prev => ({ ...prev, loading: false }));
          return;
        }

        // Set user
        const user = session.user;
        setAuthState(prev => ({ ...prev, user }));

        // Get profile data
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select(`
            *,
            school:schools(*),
            generation:generations(*),
            community:growth_communities(*)
          `)
          .eq('id', user.id)
          .single();

        if (profileError) {
          console.error('Profile error:', profileError);
          setAuthState(prev => ({ ...prev, loading: false }));
          return;
        }

        // Get user roles from new system
        const userRoles = await getUserRoles(supabase, user.id);
        
        // Check admin privileges (backward compatible)
        const isAdmin = await hasAdminPrivileges(supabase, user.id);
        const isGlobalAdmin = userRoles.some(role => role.role_type === 'admin');

        // Get aggregated permissions - PHASE 1 FIX: Pass legacy role
        const permissions = getUserPermissions(userRoles, profile?.role);

        // Auto-migrate legacy users if needed
        if (userRoles.length === 0 && profile?.role) {
          await migrateLegacyUser(supabase, user.id, profile.role);
          // Refresh roles after migration
          const newRoles = await getUserRoles(supabase, user.id);
          setAuthState(prev => ({
            ...prev,
            userRoles: newRoles,
            permissions: getUserPermissions(newRoles, profile?.role)
          }));
        }

        // Set avatar URL
        let avatarUrl = '';
        if (profile?.avatar_url) {
          avatarUrl = profile.avatar_url;
        } else {
          avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(
            user.email?.split('@')[0] || 'User'
          )}&background=00365b&color=fdb933&size=128`;
        }

        setAuthState({
          user,
          profile,
          loading: false,
          isAdmin,
          isGlobalAdmin,
          userRoles,
          permissions,
          avatarUrl
        });

      } catch (error) {
        console.error('Auth initialization error:', error);
        setAuthState(prev => ({ ...prev, loading: false }));
      }
    };

    initializeAuth();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_OUT' || !session) {
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
        } else if (event === 'SIGNED_IN') {
          // Re-initialize auth state
          initializeAuth();
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const logout = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error('Logout error:', error);
      }
      
      // Clear local storage
      localStorage.removeItem('rememberMe');
      sessionStorage.removeItem('sessionOnly');
      
      // Redirect to login
      router.push('/login');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const hasPermission = (permission: keyof RolePermissions): boolean => {
    if (typeof authState.permissions[permission] === 'boolean') {
      return authState.permissions[permission] as boolean;
    }
    return false;
  };

  const hasRole = (roleType: string): boolean => {
    return authState.userRoles.some(role => role.role_type === roleType);
  };

  const getOrganizationalScope = () => {
    const roles = authState.userRoles;
    if (roles.length === 0) return null;

    // Return the broadest organizational scope
    const schoolRoles = roles.filter(role => role.school_id);
    const generationRoles = roles.filter(role => role.generation_id);
    const communityRoles = roles.filter(role => role.community_id);

    return {
      schools: schoolRoles.map(role => role.school).filter(Boolean),
      generations: generationRoles.map(role => role.generation).filter(Boolean),
      communities: communityRoles.map(role => role.community).filter(Boolean)
    };
  };

  return {
    ...authState,
    logout,
    hasPermission,
    hasRole,
    getOrganizationalScope,
    // Backward compatibility helpers
    canCreateCourses: hasPermission('can_create_courses'),
    canManageUsers: hasPermission('can_create_users'),
    canAssignCourses: hasPermission('can_assign_courses')
  };
}