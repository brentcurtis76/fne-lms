import { NextApiRequest, NextApiResponse } from 'next';
import { 
  checkIsAdmin, 
  createServiceRoleClient, 
  sendAuthError, 
  sendApiResponse,
  validateRequestBody,
  logApiRequest
} from '../../../lib/api-auth';
import { ApiError, ApiSuccess } from '../../../lib/types/api-auth.types';

// Define the expected request/response types
interface AssignRoleRequest {
  targetUserId: string;
  roleType: string;
  organizationalScope?: {
    schoolId?: string;
    generationId?: string;
    communityId?: string;
  };
}

interface RemoveRoleRequest {
  roleId: string;
}

interface RoleListResponse {
  id: string;
  user_id: string;
  role_type: string;
  school_id?: string;
  generation_id?: string;
  community_id?: string;
  created_at: string;
  created_by: string;
  school?: any;
  generation?: any;
  community?: any;
}

export default async function handler(
  req: NextApiRequest, 
  res: NextApiResponse<ApiSuccess<any> | ApiError>
) {
  // Log the request
  logApiRequest(req, 'user-roles');

  try {
    // CRITICAL: Verify admin access - role management is admin-only
    const { isAdmin, user, error } = await checkIsAdmin(req, res);
    
    if (error || !user) {
      return sendAuthError(res, 'Authentication required', 401);
    }
    
    if (!isAdmin) {
      return sendAuthError(res, 'Admin access required', 403);
    }

    const supabaseAdmin = createServiceRoleClient();

    // Handle different HTTP methods
    switch (req.method) {
      case 'GET':
        return await handleGetRoles(req, res, user, supabaseAdmin);
      case 'POST':
        return await handleAssignRole(req, res, user, supabaseAdmin);
      case 'DELETE':
        return await handleRemoveRole(req, res, user, supabaseAdmin);
      default:
        return sendAuthError(res, 'Method not allowed', 405);
    }

  } catch (error: any) {
    console.error('[API] Unexpected error in user-roles:', error);
    return sendAuthError(res, 'Internal server error', 500);
  }
}

// GET: List roles for a specific user
async function handleGetRoles(
  req: NextApiRequest,
  res: NextApiResponse,
  adminUser: any,
  supabaseAdmin: any
) {
  const { userId } = req.query;

  if (!userId || typeof userId !== 'string') {
    return sendAuthError(res, 'Missing or invalid userId parameter', 400);
  }

  try {
    // Fetch user's roles with expanded relations
    const { data: roles, error } = await supabaseAdmin
      .from('user_roles')
      .select(`
        *,
        school:schools(*),
        generation:generations(*),
        community:growth_communities(*)
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[API] Error fetching user roles:', error);
      return sendAuthError(res, 'Failed to fetch user roles', 500, error.message);
    }

    // Log the role query
    await supabaseAdmin
      .from('audit_logs')
      .insert({
        user_id: adminUser.id,
        action: 'roles_viewed',
        details: {
          target_user_id: userId,
          role_count: roles?.length || 0,
          timestamp: new Date().toISOString()
        }
      });

    return sendApiResponse(res, {
      success: true,
      roles: roles || []
    });

  } catch (error: any) {
    console.error('[API] Error in handleGetRoles:', error);
    return sendAuthError(res, 'Failed to fetch roles', 500);
  }
}

// POST: Assign a new role to a user
async function handleAssignRole(
  req: NextApiRequest,
  res: NextApiResponse,
  adminUser: any,
  supabaseAdmin: any
) {
  // Validate request body
  const { valid, missing } = validateRequestBody<AssignRoleRequest>(
    req.body,
    ['targetUserId', 'roleType']
  );
  
  if (!valid) {
    return sendAuthError(res, `Missing required fields: ${missing.join(', ')}`, 400);
  }

  const { targetUserId, roleType, organizationalScope = {} } = req.body;

  // Validate role type
  const validRoles = ['admin', 'consultor', 'equipo_directivo', 'lider_generacion', 'lider_comunidad', 'docente'];
  if (!validRoles.includes(roleType)) {
    return sendAuthError(res, `Invalid role type. Must be one of: ${validRoles.join(', ')}`, 400);
  }

  try {
    // Start a transaction
    const { data: targetUser, error: userError } = await supabaseAdmin
      .from('profiles')
      .select('id, email, first_name, last_name')
      .eq('id', targetUserId)
      .single();

    if (userError || !targetUser) {
      return sendAuthError(res, 'Target user not found', 404);
    }

    // Validate role-specific requirements
    if (roleType === 'lider_generacion' && organizationalScope.schoolId) {
      // Check if school has generations
      const { data: school, error: schoolError } = await supabaseAdmin
        .from('schools')
        .select('has_generations')
        .eq('id', organizationalScope.schoolId)
        .single();

      if (schoolError || !school) {
        return sendAuthError(res, 'School not found', 404);
      }

      if (!school.has_generations) {
        return sendAuthError(res, 'Cannot assign Líder de Generación role to schools without generations', 400);
      }

      if (!organizationalScope.generationId) {
        return sendAuthError(res, 'Generation ID required for Líder de Generación role', 400);
      }
    }

    // Check for duplicate role assignment
    const { data: existingRole, error: checkError } = await supabaseAdmin
      .from('user_roles')
      .select('id')
      .eq('user_id', targetUserId)
      .eq('role_type', roleType)
      .eq('school_id', organizationalScope.schoolId || null)
      .eq('generation_id', organizationalScope.generationId || null)
      .eq('community_id', organizationalScope.communityId || null)
      .single();

    if (existingRole) {
      return sendAuthError(res, 'User already has this role with the same organizational scope', 409);
    }

    // Special handling for community leader role
    let communityId = organizationalScope.communityId;
    
    if (roleType === 'lider_comunidad' && !communityId) {
      // Auto-create community for community leaders
      const communityName = `${targetUser.first_name || 'Usuario'} ${targetUser.last_name || ''}`.trim();
      
      const { data: newCommunity, error: communityError } = await supabaseAdmin
        .from('growth_communities')
        .insert({
          name: communityName,
          description: `Comunidad de ${communityName}`,
          school_id: organizationalScope.schoolId || null,
          generation_id: organizationalScope.generationId || null,
          created_by: adminUser.id
        })
        .select()
        .single();

      if (communityError || !newCommunity) {
        console.error('[API] Error creating community:', communityError);
        return sendAuthError(res, 'Failed to create community for leader', 500);
      }

      communityId = newCommunity.id;

      // Create workspace for the new community
      await supabaseAdmin
        .from('community_workspaces')
        .insert({
          community_id: newCommunity.id,
          created_by: adminUser.id
        });
    }

    // Insert the new role
    const { data: newRole, error: insertError } = await supabaseAdmin
      .from('user_roles')
      .insert({
        user_id: targetUserId,
        role_type: roleType,
        school_id: organizationalScope.schoolId || null,
        generation_id: organizationalScope.generationId || null,
        community_id: communityId || null,
        created_by: adminUser.id
      })
      .select(`
        *,
        school:schools(*),
        generation:generations(*),
        community:growth_communities(*)
      `)
      .single();

    if (insertError) {
      console.error('[API] Error inserting role:', insertError);
      return sendAuthError(res, 'Failed to assign role', 500, insertError.message);
    }

    // Update the profiles table role field (for backward compatibility during migration)
    // This maintains the highest priority role in the legacy field
    const roleHierarchy = ['admin', 'consultor', 'equipo_directivo', 'lider_generacion', 'lider_comunidad', 'docente'];
    
    const { data: allRoles } = await supabaseAdmin
      .from('user_roles')
      .select('role_type')
      .eq('user_id', targetUserId);

    if (allRoles && allRoles.length > 0) {
      // Find the highest priority role
      const highestRole = allRoles
        .map(r => r.role_type)
        .sort((a, b) => roleHierarchy.indexOf(a) - roleHierarchy.indexOf(b))[0];

      await supabaseAdmin
        .from('profiles')
        .update({ role: highestRole })
        .eq('id', targetUserId);

      // JWT sync removed - no longer needed
    }

    // Log the role assignment
    await supabaseAdmin
      .from('audit_logs')
      .insert({
        user_id: adminUser.id,
        action: 'role_assigned',
        details: {
          target_user_id: targetUserId,
          target_email: targetUser.email,
          role_type: roleType,
          organizational_scope: organizationalScope,
          community_created: roleType === 'lider_comunidad' && !organizationalScope.communityId,
          timestamp: new Date().toISOString()
        }
      });

    return sendApiResponse(res, {
      success: true,
      message: `Role ${roleType} assigned successfully`,
      role: newRole,
      communityCreated: roleType === 'lider_comunidad' && !organizationalScope.communityId
    }, 201);

  } catch (error: any) {
    console.error('[API] Error in handleAssignRole:', error);
    return sendAuthError(res, 'Failed to assign role', 500);
  }
}

// DELETE: Remove a role from a user
async function handleRemoveRole(
  req: NextApiRequest,
  res: NextApiResponse,
  adminUser: any,
  supabaseAdmin: any
) {
  // For DELETE requests, get roleId from body or query
  const roleId = req.body?.roleId || req.query?.roleId;

  if (!roleId || typeof roleId !== 'string') {
    return sendAuthError(res, 'Missing or invalid roleId', 400);
  }

  try {
    // First, fetch the role to be deleted
    const { data: roleToDelete, error: fetchError } = await supabaseAdmin
      .from('user_roles')
      .select('*, profiles!inner(email)')
      .eq('id', roleId)
      .single();

    if (fetchError || !roleToDelete) {
      return sendAuthError(res, 'Role not found', 404);
    }

    // Security check: Don't allow removing the last admin role
    if (roleToDelete.role_type === 'admin') {
      const { data: adminCount } = await supabaseAdmin
        .from('user_roles')
        .select('id', { count: 'exact' })
        .eq('role_type', 'admin');

      if (adminCount && adminCount.length <= 1) {
        return sendAuthError(res, 'Cannot remove the last admin role', 400);
      }
    }

    // Delete the role
    const { error: deleteError } = await supabaseAdmin
      .from('user_roles')
      .delete()
      .eq('id', roleId);

    if (deleteError) {
      console.error('[API] Error deleting role:', deleteError);
      return sendAuthError(res, 'Failed to remove role', 500, deleteError.message);
    }

    // Update the profiles table role field
    const { data: remainingRoles } = await supabaseAdmin
      .from('user_roles')
      .select('role_type')
      .eq('user_id', roleToDelete.user_id);

    if (remainingRoles && remainingRoles.length > 0) {
      // Find the highest priority remaining role
      const roleHierarchy = ['admin', 'consultor', 'equipo_directivo', 'lider_generacion', 'lider_comunidad', 'docente'];
      const highestRole = remainingRoles
        .map(r => r.role_type)
        .sort((a, b) => roleHierarchy.indexOf(a) - roleHierarchy.indexOf(b))[0];

      await supabaseAdmin
        .from('profiles')
        .update({ role: highestRole })
        .eq('id', roleToDelete.user_id);

      // JWT sync removed - no longer needed
    } else {
      // No roles left, set to null or default
      await supabaseAdmin
        .from('profiles')
        .update({ role: null })
        .eq('id', roleToDelete.user_id);

      // JWT sync removed - no longer needed
    }

    // Log the role removal
    await supabaseAdmin
      .from('audit_logs')
      .insert({
        user_id: adminUser.id,
        action: 'role_removed',
        details: {
          target_user_id: roleToDelete.user_id,
          target_email: roleToDelete.profiles?.email,
          role_type: roleToDelete.role_type,
          role_id: roleId,
          timestamp: new Date().toISOString()
        }
      });

    return sendApiResponse(res, {
      success: true,
      message: `Role ${roleToDelete.role_type} removed successfully`,
      removedRole: {
        id: roleId,
        role_type: roleToDelete.role_type,
        user_id: roleToDelete.user_id
      }
    });

  } catch (error: any) {
    console.error('[API] Error in handleRemoveRole:', error);
    return sendAuthError(res, 'Failed to remove role', 500);
  }
}