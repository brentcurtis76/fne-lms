import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// Mock data for dev mode
const mockPermissions = {
  admin: {
    view_dashboard: true,
    manage_users: true,
    manage_courses: true,
    manage_roles: true,
    view_reports: true,
    manage_content: true,
    manage_generations: true,
    manage_networks: true
  },
  docente: {
    view_dashboard: true,
    manage_users: false,
    manage_courses: false,
    manage_roles: false,
    view_reports: true,
    manage_content: true,
    manage_generations: false,
    manage_networks: false
  },
  estudiante: {
    view_dashboard: true,
    manage_users: false,
    manage_courses: false,
    manage_roles: false,
    view_reports: false,
    manage_content: false,
    manage_generations: false,
    manage_networks: false
  },
  consultor: {
    view_dashboard: true,
    manage_users: false,
    manage_courses: false,
    manage_roles: false,
    view_reports: true,
    manage_content: false,
    manage_generations: false,
    manage_networks: false  // Intentional: networks are managed via generations permission
  },
  community_manager: {
    view_dashboard: true,
    manage_users: false,
    manage_courses: false,
    manage_roles: false,
    view_reports: true,
    manage_content: true,
    manage_generations: false,
    manage_networks: false
  },
  supervisor_de_red: {
    view_dashboard: true,
    manage_users: false,
    manage_courses: false,
    manage_roles: false,
    view_reports: true,
    manage_content: false,
    manage_generations: false,
    manage_networks: true
  }
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Feature flag check
  if (process.env.FEATURE_SUPERADMIN_RBAC !== 'true') {
    return res.status(404).json({ error: 'Not found' });
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Dev mock mode
  if (process.env.RBAC_DEV_MOCK === 'true') {
    return res.status(200).json({
      permissions: mockPermissions,
      is_mock: true,
      test_mode: false
    });
  }

  try {
    // Get auth header
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No autorizado' });
    }

    const token = authHeader.substring(7);
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({ error: 'No autorizado' });
    }

    // Check superadmin status
    const { data: isSuperadmin } = await supabaseAdmin
      .rpc('auth_is_superadmin', { check_user_id: user.id });

    if (!isSuperadmin) {
      return res.status(403).json({ error: 'Acceso denegado' });
    }

    // Get test mode state
    const { data: testMode } = await supabaseAdmin
      .from('test_mode_state')
      .select('enabled, test_run_id, expires_at')
      .eq('user_id', user.id)
      .single();

    // Phase 0: Fetch from database when not in mock mode
    try {
      // Fetch role types catalog
      const { data: roleTypes, error: roleTypesError } = await supabaseAdmin
        .from('role_types')
        .select('type, name, description')
        .order('type');

      if (roleTypesError) {
        console.error('Error fetching role types:', roleTypesError);
        // Fallback to mock if DB not ready
        return res.status(200).json({
          permissions: mockPermissions,
          is_mock: true,
          test_mode: false,
          error: 'Database catalogs not ready'
        });
      }

      // Fetch permissions catalog
      const { data: permissionsCatalog, error: permissionsError } = await supabaseAdmin
        .from('permissions')
        .select('key, name, description, category')
        .order('key');

      if (permissionsError) {
        console.error('Error fetching permissions:', permissionsError);
        // Fallback to mock if DB not ready
        return res.status(200).json({
          permissions: mockPermissions,
          is_mock: true,
          test_mode: false,
          error: 'Database catalogs not ready'
        });
      }

      // Build permissions matrix using get_effective_permissions RPC
      const permissionsMatrix: Record<string, Record<string, boolean>> = {};
      const roles: string[] = [];

      // If no role types in DB, fallback to mock
      if (!roleTypes || roleTypes.length === 0) {
        return res.status(200).json({
          permissions: mockPermissions,
          is_mock: true,
          test_mode: testMode?.enabled || false,
          test_run_id: testMode?.test_run_id || null,
          note: 'No role types in database'
        });
      }

      // For each role type, get effective permissions (baseline + overlays)
      for (const roleType of roleTypes) {
        roles.push(roleType.type);
        
        // Call get_effective_permissions RPC which now includes baseline
        const { data: effectivePerms, error: rpcError } = await supabaseAdmin
          .rpc('get_effective_permissions', {
            p_role_type: roleType.type,
            p_test_run_id: testMode?.test_run_id || null
          });

        if (rpcError) {
          console.error(`Error getting permissions for ${roleType.type}:`, rpcError);
          
          // Try to get at least baseline permissions as fallback
          const { data: baselinePerms, error: baselineError } = await supabaseAdmin
            .from('role_permission_baseline')
            .select('permission_key, granted')
            .eq('role_type', roleType.type);
          
          if (!baselineError && baselinePerms) {
            const rolePermissions: Record<string, boolean> = {};
            for (const perm of baselinePerms) {
              rolePermissions[perm.permission_key] = perm.granted || false;
            }
            permissionsMatrix[roleType.type] = rolePermissions;
          } else {
            // Initialize with empty permissions if both fail
            permissionsMatrix[roleType.type] = {};
          }
          continue;
        }

        // Build permission map for this role from effective permissions
        const rolePermissions: Record<string, boolean> = {};
        
        if (Array.isArray(effectivePerms)) {
          for (const perm of effectivePerms) {
            rolePermissions[perm.permission_key] = perm.granted || false;
          }
        }
        
        permissionsMatrix[roleType.type] = rolePermissions;
      }

      // Return DB-backed response
      return res.status(200).json({
        permissions: permissionsMatrix,
        roles: roles,
        permission_catalog: permissionsCatalog || [],
        is_mock: false,
        test_mode: testMode?.enabled || false,
        test_run_id: testMode?.test_run_id || null
      });

    } catch (dbError) {
      console.error('Database query error:', dbError);
      // Fallback to mock on any DB error
      return res.status(200).json({
        permissions: mockPermissions,
        is_mock: true,
        test_mode: testMode?.enabled || false,
        test_run_id: testMode?.test_run_id || null,
        error: 'Database query failed'
      });
    }
  } catch (error) {
    console.error('Unexpected error:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}
