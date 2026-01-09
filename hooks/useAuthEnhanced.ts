/**
 * Enhanced Authentication Hook with Edge Case Handling
 * Fixes authentication edge cases with RLS policies
 */

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/router';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
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
  isAdmin: boolean;
  isGlobalAdmin: boolean;
  userRoles: UserRole[];
  permissions: RolePermissions;
  avatarUrl: string;
  error: string | null;
  sessionValid: boolean;
  retryCount: number;
}

const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY = 1000; // 1 second
const SESSION_CHECK_INTERVAL = 60000; // 1 minute
const ROLE_REFRESH_INTERVAL = 300000; // 5 minutes

export function useAuthEnhanced() {
  const router = useRouter();
  const sessionCheckTimer = useRef<NodeJS.Timeout>();
  const roleRefreshTimer = useRef<NodeJS.Timeout>();
  const retryTimeouts = useRef<Set<NodeJS.Timeout>>(new Set());
  
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
    avatarUrl: '',
    error: null,
    sessionValid: false,
    retryCount: 0
  });

  // Retry wrapper for failed operations
  const retryOperation = async <T,>(
    operation: () => Promise<T>,
    retryCount = 0
  ): Promise<T | null> => {
    try {
      return await operation();
    } catch (error) {
      if (retryCount < MAX_RETRY_ATTEMPTS) {
        console.warn(`Operation failed, retrying (${retryCount + 1}/${MAX_RETRY_ATTEMPTS})...`);
        await new Promise(resolve => {
          const timeout = setTimeout(resolve, RETRY_DELAY * (retryCount + 1));
          retryTimeouts.current.add(timeout);
        });
        return retryOperation(operation, retryCount + 1);
      }
      throw error;
    }
  };

  // Check if session is still valid
  const checkSessionValidity = useCallback(async (session: Session | null): Promise<boolean> => {
    if (!session) return false;
    
    try {
      // Verify token is not expired
      const now = Math.floor(Date.now() / 1000);
      const expiresAt = session.expires_at || 0;
      
      if (expiresAt <= now) {
        console.log('Session token expired, refreshing...');
        const { data, error } = await supabase.auth.refreshSession();
        if (error || !data.session) {
          console.error('Failed to refresh session:', error);
          return false;
        }
        return true;
      }
      
      // Verify user still exists and is active
      const { data, error } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', session.user.id)
        .single();
        
      return !error && !!data;
    } catch (error) {
      console.error('Session validity check failed:', error);
      return false;
    }
  }, []);

  // Refresh user roles and permissions
  const refreshRolesAndPermissions = useCallback(async (userId: string) => {
    try {
      const userRoles = await retryOperation(() => getUserRoles(supabase, userId));
      if (!userRoles) return null;
      
      const isAdmin = await retryOperation(() => hasAdminPrivileges(supabase, userId));
      const isGlobalAdmin = userRoles.some(role => role.role_type === 'admin');
      const permissions = getUserPermissions(userRoles);
      
      return { userRoles, isAdmin: isAdmin || false, isGlobalAdmin, permissions };
    } catch (error) {
      console.error('Failed to refresh roles and permissions:', error);
      return null;
    }
  }, []);

  // Initialize authentication with retry logic
  const initializeAuth = useCallback(async (retryCount = 0) => {
    try {
      setAuthState(prev => ({ ...prev, loading: true, error: null, retryCount }));
      
      // Get current session with retry
      const sessionResult = await retryOperation(async () => {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        return data;
      });
      
      if (!sessionResult?.session) {
        setAuthState(prev => ({ 
          ...prev, 
          loading: false, 
          sessionValid: false,
          error: 'No hay sesión activa' 
        }));
        return;
      }

      const session = sessionResult.session;
      const user = session.user;

      // Check session validity
      const isValid = await checkSessionValidity(session);
      if (!isValid) {
        setAuthState(prev => ({ 
          ...prev, 
          loading: false, 
          sessionValid: false,
          error: 'Sesión inválida o expirada'
        }));
        await supabase.auth.signOut();
        return;
      }

      // Get profile data with retry
      let profileResult = await retryOperation(async () => {
        const { data, error } = await supabase
          .from('profiles')
          .select(`
            *,
            school:schools(*),
            generation:generations(*),
            community:growth_communities(*)
          `)
          .eq('id', user.id)
          .single();
          
        if (error) throw error;
        return data;
      });

      if (!profileResult) {
        // Create basic profile if it doesn't exist
        console.log('Profile not found, creating basic profile...');
        const { data: newProfile } = await supabase
          .from('profiles')
          .insert({ id: user.id, email: user.email })
          .select()
          .single();
          
        if (newProfile) {
          profileResult = newProfile;
        } else {
          throw new Error('No se pudo crear el perfil del usuario');
        }
      }

      // Get roles and permissions
      let rolesData = await refreshRolesAndPermissions(user.id);
      
      if (!rolesData) {
        // Use default permissions if roles fetch fails
        console.warn('Using default permissions due to role fetch failure');
        rolesData = {
          userRoles: [],
          isAdmin: false,
          isGlobalAdmin: false,
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
            reporting_scope: 'individual' as const,
            feedback_scope: 'individual' as const
          }
        };
      }

      // Auto-migrate legacy users if needed
      if (rolesData.userRoles.length === 0 && profileResult?.role) {
        console.log('Migrating legacy user...');
        const migrationSuccess = await retryOperation(() => 
          migrateLegacyUser(supabase, user.id, profileResult.role as 'admin' | 'docente')
        );
        
        if (migrationSuccess) {
          // Refresh roles after migration
          const newRolesData = await refreshRolesAndPermissions(user.id);
          if (newRolesData) {
            rolesData = newRolesData;
          }
        }
      }

      // Set avatar URL
      const avatarUrl = profileResult?.avatar_url || 
        `https://ui-avatars.com/api/?name=${encodeURIComponent(
          user.email?.split('@')[0] || 'User'
        )}&background=00365b&color=fdb933&size=128`;

      setAuthState({
        user,
        profile: profileResult,
        loading: false,
        isAdmin: rolesData.isAdmin,
        isGlobalAdmin: rolesData.isGlobalAdmin,
        userRoles: rolesData.userRoles,
        permissions: rolesData.permissions,
        avatarUrl,
        error: null,
        sessionValid: true,
        retryCount: 0
      });

      // Start periodic checks
      startPeriodicChecks(user.id);

    } catch (error) {
      console.error('Auth initialization error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Error de autenticación';
      
      setAuthState(prev => ({ 
        ...prev, 
        loading: false, 
        error: errorMessage,
        sessionValid: false
      }));

      // Retry if under max attempts
      if (retryCount < MAX_RETRY_ATTEMPTS) {
        setTimeout(() => initializeAuth(retryCount + 1), RETRY_DELAY * (retryCount + 1));
      }
    }
  }, [checkSessionValidity, refreshRolesAndPermissions]);

  // Start periodic session and role checks
  const startPeriodicChecks = useCallback((userId: string) => {
    // Clear existing timers
    if (sessionCheckTimer.current) clearInterval(sessionCheckTimer.current);
    if (roleRefreshTimer.current) clearInterval(roleRefreshTimer.current);

    // Check session validity periodically
    sessionCheckTimer.current = setInterval(async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const isValid = await checkSessionValidity(session);
      
      if (!isValid) {
        console.log('Session invalid, re-initializing auth...');
        await initializeAuth();
      }
    }, SESSION_CHECK_INTERVAL);

    // Refresh roles periodically to catch changes
    roleRefreshTimer.current = setInterval(async () => {
      const rolesData = await refreshRolesAndPermissions(userId);
      if (rolesData) {
        setAuthState(prev => ({
          ...prev,
          ...rolesData
        }));
      }
    }, ROLE_REFRESH_INTERVAL);
  }, [checkSessionValidity, initializeAuth, refreshRolesAndPermissions]);

  // Cleanup function
  const cleanup = useCallback(() => {
    if (sessionCheckTimer.current) clearInterval(sessionCheckTimer.current);
    if (roleRefreshTimer.current) clearInterval(roleRefreshTimer.current);
    retryTimeouts.current.forEach(timeout => clearTimeout(timeout));
    retryTimeouts.current.clear();
  }, []);

  useEffect(() => {
    initializeAuth();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('Auth state changed:', event);
        
        if (event === 'SIGNED_OUT' || !session) {
          cleanup();
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
            avatarUrl: '',
            error: null,
            sessionValid: false,
            retryCount: 0
          });
        } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          // Re-initialize auth state
          await initializeAuth();
        } else if (event === 'USER_UPDATED') {
          // Refresh roles when user is updated
          if (session?.user?.id) {
            const rolesData = await refreshRolesAndPermissions(session.user.id);
            if (rolesData) {
              setAuthState(prev => ({
                ...prev,
                ...rolesData
              }));
            }
          }
        }
      }
    );

    return () => {
      cleanup();
      subscription.unsubscribe();
    };
  }, [initializeAuth, refreshRolesAndPermissions, cleanup]);

  const logout = async () => {
    try {
      cleanup();
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

  // Force refresh authentication state
  const refreshAuth = useCallback(async () => {
    await initializeAuth();
  }, [initializeAuth]);

  // Force refresh roles without full re-initialization
  const refreshRoles = useCallback(async () => {
    if (!authState.user) return;
    
    const rolesData = await refreshRolesAndPermissions(authState.user.id);
    if (rolesData) {
      setAuthState(prev => ({
        ...prev,
        ...rolesData
      }));
    }
  }, [authState.user, refreshRolesAndPermissions]);

  return {
    ...authState,
    logout,
    hasPermission,
    hasRole,
    getOrganizationalScope,
    refreshAuth,
    refreshRoles,
    // Backward compatibility helpers
    canCreateCourses: hasPermission('can_create_courses'),
    canManageUsers: hasPermission('can_create_users'),
    canAssignCourses: hasPermission('can_assign_courses')
  };
}
