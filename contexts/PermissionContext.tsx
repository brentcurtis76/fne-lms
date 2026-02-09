import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSupabaseClient, useUser } from '@supabase/auth-helpers-react';

interface PermissionContextType {
  permissions: Record<string, boolean>;
  loading: boolean;
  hasPermission: (permission: string) => boolean;
  hasAnyPermission: (permissions: string[]) => boolean;
  hasAllPermissions: (permissions: string[]) => boolean;
  refetch: () => Promise<void>;
}

const PermissionContext = createContext<PermissionContextType | undefined>(undefined);

export function PermissionProvider({ children }: { children: React.ReactNode }) {
  const supabase = useSupabaseClient();
  const user = useUser();
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  // Stable references: extract primitives from user object to avoid re-render cascades
  const userId = user?.id;
  const userRef = useRef(user);
  userRef.current = user;

  const isAdmin = useMemo(() => {
    return user?.user_metadata?.roles?.includes('admin') ||
           user?.user_metadata?.role === 'admin' || false;
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps
  // isAdmin only changes when the user changes (by id)

  // Load cached permissions when user becomes available
  useEffect(() => {
    if (typeof window !== 'undefined' && userId) {
      const cached = localStorage.getItem(`permissions_${userId}`);
      if (cached) {
        try {
          const cachedPerms = JSON.parse(cached);
          setPermissions(cachedPerms);
          setLoading(false);
        } catch (e) {
          console.error('Failed to parse cached permissions:', e);
        }
      }
    }
  }, [userId]);

  const fetchPermissions = useCallback(async () => {
    const currentUser = userRef.current;
    if (!currentUser) {
      setPermissions({});
      setLoading(false);
      if (typeof window !== 'undefined') {
        Object.keys(localStorage).forEach(key => {
          if (key.startsWith('permissions_')) {
            localStorage.removeItem(key);
          }
        });
      }
      return;
    }

    try {
      setLoading(true);

      const { data: userRoles, error: rolesError } = await supabase
        .from('user_roles')
        .select('role_type')
        .eq('user_id', currentUser.id)
        .eq('is_active', true);

      if (rolesError) {
        console.error('[PermissionContext] Error fetching user roles:', rolesError);
        setPermissions({});
        setLoading(false);
        return;
      }

      if (!userRoles || userRoles.length === 0) {
        console.warn('[PermissionContext] User has no active roles');
        setPermissions({});
        setLoading(false);
        return;
      }

      const roleTypes = userRoles.map(r => r.role_type);

      const { data: rolePermissions, error: permsError } = await supabase
        .from('role_permissions')
        .select('permission_key, granted')
        .in('role_type', roleTypes)
        .eq('is_test', false)
        .eq('active', true);

      if (permsError) {
        console.error('[PermissionContext] Error fetching permissions:', permsError);
        setPermissions({});
        setLoading(false);
        return;
      }

      const permMap: Record<string, boolean> = {};

      rolePermissions?.forEach(perm => {
        if (perm.granted) {
          permMap[perm.permission_key] = true;
        } else if (!(perm.permission_key in permMap)) {
          permMap[perm.permission_key] = false;
        }
      });

      setPermissions(permMap);

      if (typeof window !== 'undefined' && currentUser.id) {
        localStorage.setItem(`permissions_${currentUser.id}`, JSON.stringify(permMap));
      }

    } catch (error) {
      console.error('Unexpected error fetching permissions:', error);
      setPermissions({});
    } finally {
      setLoading(false);
    }
  }, [supabase]); // Only depends on supabase client, reads user from ref

  useEffect(() => {
    fetchPermissions();
  }, [userId, fetchPermissions]);

  const hasPermission = useCallback((permission: string): boolean => {
    if (isAdmin) {
      return true;
    }

    const result = permissions[permission] === true;

    if (!result && !loading) {
      if (process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_DEBUG_PERMISSIONS === 'true') {
        console.warn(`[PermissionContext] Permission denied: ${permission}`);
      }
    }

    return result;
  }, [permissions, loading, isAdmin]);

  const hasAnyPermission = useCallback((perms: string[]): boolean => {
    return perms.some(p => hasPermission(p));
  }, [hasPermission]);

  const hasAllPermissions = useCallback((perms: string[]): boolean => {
    return perms.every(p => hasPermission(p));
  }, [hasPermission]);

  const contextValue = useMemo(() => ({
    permissions,
    loading,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    refetch: fetchPermissions
  }), [permissions, loading, hasPermission, hasAnyPermission, hasAllPermissions, fetchPermissions]);

  return (
    <PermissionContext.Provider value={contextValue}>
      {children}
    </PermissionContext.Provider>
  );
}

export function usePermissions() {
  const context = useContext(PermissionContext);

  // During SSR or if provider is missing, return safe defaults
  if (context === undefined) {
    // Only throw error in development client-side
    if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
      console.warn('usePermissions used outside PermissionProvider - returning defaults');
    }

    return {
      permissions: {},
      loading: true,
      hasPermission: () => false,
      hasAnyPermission: () => false,
      hasAllPermissions: () => false,
      refetch: async () => {}
    };
  }

  return context;
}
