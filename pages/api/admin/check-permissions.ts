/**
 * API endpoint to check user permissions in new 6-role system
 * Maintains backward compatibility while providing new role features
 */

import { NextApiRequest, NextApiResponse } from 'next';
import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import { 
  getUserRoles, 
  hasAdminPrivileges, 
  getUserPermissions,
  isGlobalAdmin 
} from '../../../utils/roleUtils';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const supabase = createServerSupabaseClient({ req, res });
    
    // Get current user
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError || !session?.user) {
      return res.status(401).json({ error: 'No authenticated user' });
    }

    const userId = session.user.id;

    // Get legacy profile for backward compatibility
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role, first_name, last_name, email')
      .eq('id', userId)
      .single();

    if (profileError) {
      console.error('Error fetching profile:', profileError);
      return res.status(500).json({ error: 'Failed to fetch user profile' });
    }

    // Get new role system data
    const userRoles = await getUserRoles(supabase, userId);
    // PHASE 1 FIX: Pass legacy role to getUserPermissions
    const permissions = getUserPermissions(userRoles, profile?.role);
    const isAdmin = await hasAdminPrivileges(supabase, userId);
    const isGlobalAdminUser = await isGlobalAdmin(supabase, userId);

    // Return comprehensive permission information
    return res.status(200).json({
      user: {
        id: userId,
        email: session.user.email,
        name: profile ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() : null
      },
      legacy: {
        role: profile?.role || null,
        isAdmin: profile?.role === 'admin'
      },
      roleSystem: {
        roles: userRoles.map(role => ({
          id: role.id,
          type: role.role_type,
          school: role.school?.name || null,
          generation: role.generation?.name || null,
          community: role.community?.name || null,
          isActive: role.is_active
        })),
        permissions,
        isGlobalAdmin: isGlobalAdminUser,
        hasAdminAccess: isAdmin
      },
      backwardCompatibility: {
        // These maintain existing API compatibility
        isAdmin,
        canCreateCourses: permissions.can_create_courses,
        canManageUsers: permissions.can_create_users,
        canAssignCourses: permissions.can_assign_courses,
        canDeleteCourses: permissions.can_delete_courses
      }
    });

  } catch (error) {
    console.error('Error checking permissions:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}