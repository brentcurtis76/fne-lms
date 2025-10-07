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

    // Phase 2: Query actual permissions from database
    const { data: permissionsData, error: permsError } = await supabaseAdmin
      .from('role_permissions')
      .select('role_type, permission_key, granted')
      .eq('is_test', false)
      .eq('active', true);

    if (permsError) {
      console.error('Error fetching permissions:', permsError);
      // Fallback to mock data if database query fails
      return res.status(200).json({
        permissions: mockPermissions,
        is_mock: true,
        test_mode: testMode?.enabled || false,
        test_run_id: testMode?.test_run_id || null,
        error: 'Failed to load permissions from database'
      });
    }

    // Transform flat permission list into nested object structure
    const permissions: { [role: string]: { [permission: string]: boolean } } = {};

    for (const perm of permissionsData || []) {
      if (!permissions[perm.role_type]) {
        permissions[perm.role_type] = {};
      }
      permissions[perm.role_type][perm.permission_key] = perm.granted;
    }

    return res.status(200).json({
      permissions,
      is_mock: false,
      test_mode: testMode?.enabled || false,
      test_run_id: testMode?.test_run_id || null
    });
  } catch (error) {
    console.error('Unexpected error:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}