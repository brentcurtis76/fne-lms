import React, { createContext, useContext, useState, useEffect } from 'react';
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

  // Load cached permissions when user becomes available
  useEffect(() => {
    if (typeof window !== 'undefined' && user?.id) {
      const cached = localStorage.getItem(`permissions_${user.id}`);
      if (cached) {
        try {
          const cachedPerms = JSON.parse(cached);
          console.log('[PermissionContext] Loaded cached permissions:', Object.keys(cachedPerms).length);
          setPermissions(cachedPerms);
          setLoading(false); // Don't show loading state if we have cached data
        } catch (e) {
          console.error('Failed to parse cached permissions:', e);
        }
      }
    }
  }, [user?.id]);

  const fetchPermissions = async () => {
    if (!user) {
      setPermissions({});
      setLoading(false);
      // Clear cached permissions when user logs out
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

      // Get user's role(s) from user_roles table
      console.log('[PermissionContext] Fetching roles for user:', user.id);
      const { data: userRoles, error: rolesError } = await supabase
        .from('user_roles')
        .select('role_type')
        .eq('user_id', user.id)
        .eq('is_active', true);

      if (rolesError) {
        console.error('[PermissionContext] Error fetching user roles:', rolesError);
        setPermissions({});
        return;
      }

      console.log('[PermissionContext] Found roles:', userRoles);

      if (!userRoles || userRoles.length === 0) {
        console.warn('[PermissionContext] User has no active roles');
        setPermissions({});
        return;
      }

      // Get all permissions for user's role(s)
      const roleTypes = userRoles.map(r => r.role_type);
      console.log('[PermissionContext] Fetching permissions for roles:', roleTypes);

      const { data: rolePermissions, error: permsError } = await supabase
        .from('role_permissions')
        .select('permission_key, granted')
        .in('role_type', roleTypes)
        .eq('is_test', false)
        .eq('active', true);

      if (permsError) {
        console.error('[PermissionContext] Error fetching permissions:', permsError);
        setPermissions({});
        return;
      }

      console.log('[PermissionContext] Raw permissions from DB:', rolePermissions?.length || 0);

      // Build permission map (if user has multiple roles, use OR logic - granted if ANY role grants it)
      const permMap: Record<string, boolean> = {};

      rolePermissions?.forEach(perm => {
        // If any role grants the permission, user has it
        if (perm.granted) {
          permMap[perm.permission_key] = true;
        } else if (!(perm.permission_key in permMap)) {
          // Only set to false if not already granted by another role
          permMap[perm.permission_key] = false;
        }
      });

      console.log(`[PermissionContext] Loaded ${Object.keys(permMap).length} permissions for user`);
      setPermissions(permMap);

      // Cache permissions in localStorage for instant access on page navigation
      if (typeof window !== 'undefined' && user.id) {
        localStorage.setItem(`permissions_${user.id}`, JSON.stringify(permMap));
      }

    } catch (error) {
      console.error('Unexpected error fetching permissions:', error);
      setPermissions({});
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPermissions();
  }, [user?.id]);

  const hasPermission = (permission: string): boolean => {
    // Admin bypass - check if user has admin role
    const isAdmin = user?.user_metadata?.roles?.includes('admin') ||
                    user?.user_metadata?.role === 'admin';

    if (isAdmin) {
      console.log(`[PermissionContext] Admin bypass for: ${permission}`);
      return true;
    }

    const result = permissions[permission] === true;

    if (!result && !loading) {
      console.warn(`[PermissionContext] Permission denied: ${permission}`);
    }

    return result;
  };

  const hasAnyPermission = (perms: string[]): boolean => {
    return perms.some(p => hasPermission(p));
  };

  const hasAllPermissions = (perms: string[]): boolean => {
    return perms.every(p => hasPermission(p));
  };

  return (
    <PermissionContext.Provider
      value={{
        permissions,
        loading,
        hasPermission,
        hasAnyPermission,
        hasAllPermissions,
        refetch: fetchPermissions
      }}
    >
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
