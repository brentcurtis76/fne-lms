/**
 * Role Management Utilities for FNE LMS 6-Role System
 * Provides functions for checking permissions and managing roles
 */

import { supabase } from '../lib/supabase';
import { 
  UserRoleType, 
  UserRole, 
  UserProfile, 
  RolePermissions, 
  ROLE_HIERARCHY,
  PermissionKey,
  GrowthCommunity 
} from '../types/roles';

/**
 * Check if user has global admin privileges
 * This is the ONLY role with full admin powers in the new system
 */
export async function isGlobalAdmin(userId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('user_roles')
      .select('id')
      .eq('user_id', userId)
      .eq('role_type', 'admin')
      .eq('is_active', true)
      .limit(1);

    if (error) {
      console.error('Error checking global admin status:', error);
      return false;
    }

    return data && data.length > 0;
  } catch (error) {
    console.error('Error in isGlobalAdmin:', error);
    return false;
  }
}

/**
 * Check for backward compatibility with legacy admin role
 * Returns true if user is either global_admin OR legacy admin
 */
export async function hasAdminPrivileges(userId: string): Promise<boolean> {
  try {
    // Check new role system first
    const isNewAdmin = await isGlobalAdmin(userId);
    if (isNewAdmin) return true;

    // Check legacy role system for backward compatibility
    const { data, error } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('Error checking legacy admin status:', error);
      return false;
    }

    return data?.role === 'admin';
  } catch (error) {
    console.error('Error in hasAdminPrivileges:', error);
    return false;
  }
}

/**
 * Get all active roles for a user
 */
export async function getUserRoles(userId: string): Promise<UserRole[]> {
  try {
    const { data, error } = await supabase
      .from('user_roles')
      .select(`
        *,
        school:schools(*),
        generation:generations(*),
        community:growth_communities(*)
      `)
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('role_type');

    if (error) {
      console.error('Error fetching user roles:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error in getUserRoles:', error);
    return [];
  }
}

/**
 * Get user's highest privilege role
 */
export function getHighestRole(roles: UserRole[]): UserRoleType | null {
  if (!roles || roles.length === 0) return null;

  const roleOrder: UserRoleType[] = [
    'admin',
    'consultor', 
    'equipo_directivo',
    'lider_generacion',
    'lider_comunidad',
    'docente'
  ];

  for (const roleType of roleOrder) {
    if (roles.some(role => role.role_type === roleType)) {
      return roleType;
    }
  }

  return null;
}

/**
 * Check if user has a specific permission
 */
export function hasPermission(
  roles: UserRole[], 
  permission: PermissionKey
): boolean {
  if (!roles || roles.length === 0) return false;

  return roles.some(role => {
    const permissions = ROLE_HIERARCHY[role.role_type];
    return permissions[permission];
  });
}

/**
 * Get aggregated permissions for a user based on all their roles
 */
export function getUserPermissions(roles: UserRole[]): RolePermissions {
  if (!roles || roles.length === 0) {
    return ROLE_HIERARCHY.docente; // Default to lowest permissions
  }

  // Start with no permissions
  const permissions: RolePermissions = {
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

  // Aggregate permissions from all roles (OR logic for boolean permissions)
  roles.forEach(role => {
    const rolePerms = ROLE_HIERARCHY[role.role_type];
    
    // Boolean permissions: if ANY role has permission, user has it
    Object.keys(permissions).forEach(key => {
      if (typeof permissions[key as PermissionKey] === 'boolean') {
        permissions[key as PermissionKey] = 
          permissions[key as PermissionKey] || rolePerms[key as PermissionKey];
      }
    });

    // Scope permissions: use the broadest scope available
    const scopeOrder = ['individual', 'community', 'generation', 'school', 'global'];
    
    if (scopeOrder.indexOf(rolePerms.reporting_scope) > 
        scopeOrder.indexOf(permissions.reporting_scope)) {
      permissions.reporting_scope = rolePerms.reporting_scope;
    }
    
    if (scopeOrder.indexOf(rolePerms.feedback_scope) > 
        scopeOrder.indexOf(permissions.feedback_scope)) {
      permissions.feedback_scope = rolePerms.feedback_scope;
    }
  });

  return permissions;
}

/**
 * Assign a role to a user with auto-community creation for leaders
 * Only global_admin can assign roles
 */
export async function assignRole(
  targetUserId: string,
  roleType: UserRoleType,
  assignedBy: string,
  organizationalScope: {
    schoolId?: string;
    generationId?: string;
    communityId?: string;
  } = {}
): Promise<{ success: boolean; error?: string; communityId?: string }> {
  try {
    // Verify assigner has global admin privileges
    const canAssign = await isGlobalAdmin(assignedBy);
    if (!canAssign) {
      return { success: false, error: 'Solo administradores pueden asignar roles' };
    }

    let finalCommunityId = organizationalScope.communityId;

    // Auto-create community for lider_comunidad role
    if (roleType === 'lider_comunidad' && organizationalScope.schoolId && !organizationalScope.communityId) {
      const communityResult = await createCommunityForLeader(
        targetUserId,
        organizationalScope.schoolId!,
        organizationalScope.generationId // Can be undefined for schools without generations
      );
      
      if (communityResult.success) {
        finalCommunityId = communityResult.communityId;
      } else {
        return { success: false, error: communityResult.error };
      }
    }
    
    // For all other roles, community assignment is optional but allowed
    // No special logic needed - just use the provided communityId if available

    const { error } = await supabase
      .from('user_roles')
      .insert({
        user_id: targetUserId,
        role_type: roleType,
        school_id: organizationalScope.schoolId || null,
        generation_id: organizationalScope.generationId || null,
        community_id: finalCommunityId || null,
        is_active: true,
        assigned_by: assignedBy,
        assigned_at: new Date().toISOString()
      });

    if (error) {
      console.error('Error assigning role:', error);
      return { success: false, error: 'Error al asignar rol: ' + error.message };
    }

    return { success: true, communityId: finalCommunityId };
  } catch (error) {
    console.error('Error in assignRole:', error);
    return { success: false, error: 'Error inesperado al asignar rol' };
  }
}

/**
 * Auto-create a growth community when assigning a community leader
 * Updated to use the database function that prevents duplicates
 */
async function createCommunityForLeader(
  leaderId: string,
  schoolId: string,
  generationId?: string
): Promise<{ success: boolean; communityId?: string; error?: string }> {
  try {
    // Convert schoolId to integer for the database function
    const schoolIdInt = parseInt(schoolId);
    if (isNaN(schoolIdInt)) {
      return { success: false, error: 'ID de escuela inválido' };
    }

    // Call the database function that safely gets or creates a community
    const { data, error } = await supabase
      .rpc('get_or_create_community_for_leader', {
        p_leader_id: leaderId,
        p_school_id: schoolId, // The function will handle the UUID
        p_generation_id: generationId || null
      });

    if (error) {
      console.error('Error getting/creating community:', error);
      
      // Check if it's a unique constraint violation (shouldn't happen with our function, but just in case)
      if (error.code === '23505') {
        // Try to find the existing community
        const { data: existingCommunity } = await supabase
          .from('growth_communities')
          .select('id')
          .eq('school_id', schoolIdInt)
          .eq('generation_id', generationId || null)
          .like('name', `Comunidad de %`)
          .single();
        
        if (existingCommunity) {
          return { success: true, communityId: existingCommunity.id };
        }
      }
      
      return { success: false, error: 'Error al crear comunidad: ' + error.message };
    }

    if (!data) {
      return { success: false, error: 'No se pudo crear la comunidad' };
    }

    return { success: true, communityId: data };
  } catch (error) {
    console.error('Error in createCommunityForLeader:', error);
    return { success: false, error: 'Error inesperado al crear comunidad' };
  }
}

/**
 * Remove a role from a user
 */
export async function removeRole(
  roleId: string,
  removedBy: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Verify remover has global admin privileges
    const canRemove = await isGlobalAdmin(removedBy);
    if (!canRemove) {
      return { success: false, error: 'Solo administradores pueden remover roles' };
    }

    const { error } = await supabase
      .from('user_roles')
      .update({ is_active: false })
      .eq('id', roleId);

    if (error) {
      console.error('Error removing role:', error);
      return { success: false, error: 'Error al remover rol: ' + error.message };
    }

    return { success: true };
  } catch (error) {
    console.error('Error in removeRole:', error);
    return { success: false, error: 'Error inesperado al remover rol' };
  }
}

/**
 * Get user profile with role information
 */
export async function getUserProfileWithRoles(userId: string): Promise<UserProfile | null> {
  try {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select(`
        *,
        school:schools(*),
        generation:generations(*),
        community:growth_communities(*)
      `)
      .eq('id', userId)
      .single();

    if (profileError) {
      console.error('Error fetching user profile:', profileError);
      return null;
    }

    // Get user roles
    const userRoles = await getUserRoles(userId);

    return {
      ...profile,
      user_roles: userRoles
    };
  } catch (error) {
    console.error('Error in getUserProfileWithRoles:', error);
    return null;
  }
}

/**
 * Migrate legacy user to new role system
 */
export async function migrateLegacyUser(
  userId: string,
  legacyRole: 'admin' | 'docente'
): Promise<{ success: boolean; error?: string }> {
  try {
    // Don't migrate if user already has new roles
    const existingRoles = await getUserRoles(userId);
    if (existingRoles.length > 0) {
      return { success: true }; // Already migrated
    }

    const newRoleType: UserRoleType = legacyRole === 'admin' ? 'admin' : 'docente';
    
    // Get default school for docentes
    let schoolId = null;
    if (newRoleType === 'docente') {
      const { data: defaultSchool } = await supabase
        .from('schools')
        .select('id')
        .eq('code', 'DEMO001')
        .single();
      
      schoolId = defaultSchool?.id || null;
    }

    const { error } = await supabase
      .from('user_roles')
      .insert({
        user_id: userId,
        role_type: newRoleType,
        school_id: schoolId,
        is_active: true,
        assigned_at: new Date().toISOString()
      });

    if (error) {
      console.error('Error migrating legacy user:', error);
      return { success: false, error: 'Error al migrar usuario: ' + error.message };
    }

    return { success: true };
  } catch (error) {
    console.error('Error in migrateLegacyUser:', error);
    return { success: false, error: 'Error inesperado al migrar usuario' };
  }
}

/**
 * Get communities available for teacher assignment (led by community leaders)
 */
export async function getAvailableCommunitiesForAssignment(
  schoolId?: string,
  generationId?: string
): Promise<GrowthCommunity[]> {
  try {
    let query = supabase
      .from('growth_communities')
      .select(`
        *,
        generation:generations(*),
        school:schools(*)
      `);

    if (schoolId) {
      // Convert schoolId to integer to match database type
      // This fixes the bug where newly created communities don't appear
      const schoolIdInt = parseInt(schoolId);
      if (!isNaN(schoolIdInt)) {
        query = query.eq('school_id', schoolIdInt);
        console.log('Filtering communities by school_id:', schoolIdInt);
      }
    }
    if (generationId) {
      query = query.eq('generation_id', generationId);
    }

    const { data, error } = await query.order('name');

    if (error) {
      console.error('Error fetching communities:', error);
      return [];
    }

    console.log('Communities fetched:', data?.length || 0, 'communities');
    return data || [];
  } catch (error) {
    console.error('Error in getAvailableCommunitiesForAssignment:', error);
    return [];
  }
}

/**
 * Get all members in a specific community (all roles, not just teachers)
 */
export async function getCommunityMembers(communityId: string): Promise<UserProfile[]> {
  try {
    // First get the user_roles for this community
    const { data: roleData, error: roleError } = await supabase
      .from('user_roles')
      .select('user_id, role_type, id, assigned_at')
      .eq('community_id', communityId)
      .eq('is_active', true);

    if (roleError) {
      console.error('Error fetching community roles:', roleError);
      return [];
    }

    if (!roleData || roleData.length === 0) {
      console.log('No roles found for community:', communityId);
      return [];
    }

    // Then get the profile data for each user
    const userIds = roleData.map(role => role.user_id);
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .in('id', userIds);

    if (profileError) {
      console.error('Error fetching community member profiles:', profileError);
      return [];
    }

    // Combine the data
    return roleData.map(roleItem => {
      const profile = profileData?.find(p => p.id === roleItem.user_id);
      return {
        id: roleItem.user_id,
        email: profile?.email,
        first_name: profile?.first_name,
        last_name: profile?.last_name,
        avatar_url: profile?.avatar_url,
        role: profile?.role,
        school_id: profile?.school_id,
        generation_id: profile?.generation_id,
        community_id: profile?.community_id,
        created_at: profile?.created_at,
        user_roles: [{
          id: roleItem.id,
          user_id: roleItem.user_id,
          role_type: roleItem.role_type,
          school_id: null,
          generation_id: null,
          community_id: communityId,
          is_active: true,
          assigned_at: roleItem.assigned_at,
          reporting_scope: {},
          feedback_scope: {},
          created_at: roleItem.assigned_at
        }]
      };
    });
  } catch (error) {
    console.error('Error in getCommunityMembers:', error);
    return [];
  }
}

/**
 * Get community members grouped by role type
 */
export async function getCommunityMembersByRole(communityId: string): Promise<Record<UserRoleType, UserProfile[]>> {
  try {
    const members = await getCommunityMembers(communityId);
    
    const membersByRole: Record<UserRoleType, UserProfile[]> = {
      admin: [],
      consultor: [],
      equipo_directivo: [],
      lider_generacion: [],
      lider_comunidad: [],
      docente: []
    };

    members.forEach(member => {
      if (member.user_roles && member.user_roles.length > 0) {
        const roleType = member.user_roles[0].role_type;
        membersByRole[roleType].push(member);
      }
    });

    return membersByRole;
  } catch (error) {
    console.error('Error in getCommunityMembersByRole:', error);
    return {
      admin: [],
      consultor: [],
      equipo_directivo: [],
      lider_generacion: [],
      lider_comunidad: [],
      docente: []
    };
  }
}

/**
 * Check if user can access admin features (backward compatibility)
 */
export async function canAccessAdminFeatures(userId: string): Promise<boolean> {
  // In the new system, ONLY admin role has admin access
  // But we maintain backward compatibility with legacy admin role
  return await hasAdminPrivileges(userId);
}