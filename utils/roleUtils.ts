/**
 * Role Management Utilities for FNE LMS 6-Role System
 * Provides functions for checking permissions and managing roles
 */

import { SupabaseClient } from '@supabase/supabase-js';
import {
  UserRoleType,
  UserRole,
  UserProfile,
  RolePermissions,
  ROLE_HIERARCHY,
  PermissionKey,
  GrowthCommunity,
  School,
  RedDeColegios

} from '../types/roles';

/**
 * Extract normalized role strings from Supabase user metadata
 */
export function extractRolesFromMetadata(metadata: any): string[] {
  if (!metadata) {
    return [];
  }

  const rolesArray = Array.isArray(metadata.roles)
    ? metadata.roles.filter((value: unknown): value is string => typeof value === 'string')
    : [];

  if (typeof metadata.role === 'string' && metadata.role.length > 0) {
    return rolesArray.includes(metadata.role)
      ? rolesArray
      : [metadata.role, ...rolesArray];
  }

  return rolesArray;
}

/**
 * Check whether metadata contains a specific role
 */
export function metadataHasRole(metadata: any, role: string): boolean {
  return extractRolesFromMetadata(metadata).includes(role);
}

/**
 * Return the highest priority role available in metadata
 */
export function getPrimaryRoleFromMetadata(metadata: any): string | null {
  const roles = extractRolesFromMetadata(metadata);
  if (roles.length === 0) {
    return null;
  }

  // Prioritise admin if present, otherwise return the first entry
  if (roles.includes('admin')) {
    return 'admin';
  }

  return roles[0];
}


/**
 * Check if user has global admin privileges
 * This is the ONLY role with full admin powers in the new system
 */
export async function isGlobalAdmin(supabase: SupabaseClient, userId: string): Promise<boolean> {
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
 * Check if user has admin privileges
 * Uses the new user_roles system exclusively
 * Note: When called from API routes, should be passed a service role client to bypass RLS
 */
export async function hasAdminPrivileges(supabase: SupabaseClient, userId: string): Promise<boolean> {
  try {
    // Only check the new role system - no legacy fallback
    return await isGlobalAdmin(supabase, userId);
  } catch (error) {
    console.error('Error in hasAdminPrivileges:', error);
    return false;
  }
}

/**
 * Get all active roles for a user
 */
export async function getUserRoles(supabase: SupabaseClient, userId: string): Promise<UserRole[]> {
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

    if (data && data.length > 0) {
      return data;
    }

    // Fallback to cache when direct query returns no rows (due to RLS or replication delays)
    const { data: cacheData, error: cacheError } = await supabase
      .from('user_roles_cache')
      .select('*')
      .eq('user_id', userId)
      .order('role');

    if (cacheError) {
      console.error('Error fetching user roles from cache:', cacheError);
      return [];
    }

    if (cacheData && cacheData.length > 0) {
      const schoolIds = Array.from(
        new Set(cacheData.map(row => row.school_id).filter(Boolean))
      );
      const generationIds = Array.from(
        new Set(cacheData.map(row => row.generation_id).filter(Boolean))
      );
      const communityIds = Array.from(
        new Set(cacheData.map(row => row.community_id).filter(Boolean))
      );

      const [schoolsRes, generationsRes, communitiesRes] = await Promise.all([
        schoolIds.length
          ? supabase.from('schools').select('*').in('id', schoolIds as number[])
          : Promise.resolve({ data: [] as any[], error: null }),
        generationIds.length
          ? supabase.from('generations').select('*').in('id', generationIds as string[])
          : Promise.resolve({ data: [] as any[], error: null }),
        communityIds.length
          ? supabase
              .from('growth_communities')
              .select('*, school:schools(*), generation:generations(*)')
              .in('id', communityIds as string[])
          : Promise.resolve({ data: [] as any[], error: null })
      ]);

      if (schoolsRes.error) {
        console.error('role cache fallback: failed to load schools', schoolsRes.error);
      }
      if (generationsRes.error) {
        console.error('role cache fallback: failed to load generations', generationsRes.error);
      }
      if (communitiesRes.error) {
        console.error('role cache fallback: failed to load communities', communitiesRes.error);
      }

      const schoolsMap = new Map<number, any>((schoolsRes.data || []).map((item: any) => [item.id, item]));
      const generationsMap = new Map<string, any>((generationsRes.data || []).map((item: any) => [item.id, item]));
      const communitiesMap = new Map<string, any>((communitiesRes.data || []).map((item: any) => [item.id, item]));

      return cacheData.map((cache) => ({
        id: `${cache.user_id}-${cache.role}`,
        user_id: cache.user_id,
        role_type: cache.role as UserRoleType,
        school_id: cache.school_id || null,
        generation_id: cache.generation_id || null,
        community_id: cache.community_id || null,
        is_active: true,
        assigned_at: null,
        assigned_by: null,
        reporting_scope: {},
        feedback_scope: {},
        created_at: null,
        school: cache.school_id ? schoolsMap.get(cache.school_id) || null : null,
        generation: cache.generation_id ? generationsMap.get(cache.generation_id) || null : null,
        community: cache.community_id ? communitiesMap.get(cache.community_id) || null : null
      } as unknown as UserRole));
    }

    return [];
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
    'supervisor_de_red',
    'community_manager',
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
 * Now includes legacy role support for backward compatibility
 */
export function getUserPermissions(roles: UserRole[], legacyRole?: string): RolePermissions {
  // PHASE 1 FIX: Check legacy admin role first
  if (legacyRole === 'admin') {
    console.log('[getUserPermissions] Legacy admin detected, granting full permissions');
    return ROLE_HIERARCHY.admin; // Return full admin permissions immediately
  }

  // If no roles in new system and legacy role is docente, use docente permissions
  if ((!roles || roles.length === 0) && legacyRole === 'docente') {
    return ROLE_HIERARCHY.docente;
  }

  // No roles at all - default to lowest permissions
  if (!roles || roles.length === 0) {
    return ROLE_HIERARCHY.docente;
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
  supabase: SupabaseClient,
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
    const canAssign = await isGlobalAdmin(supabase, assignedBy);
    if (!canAssign) {
      return { success: false, error: 'Solo administradores pueden asignar roles' };
    }

    let finalCommunityId = organizationalScope.communityId;

    // Auto-create community for lider_comunidad role
    if (roleType === 'lider_comunidad' && organizationalScope.schoolId && !organizationalScope.communityId) {
      const communityResult = await createCommunityForLeader(
        supabase,
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
  supabase: SupabaseClient,
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
  supabase: SupabaseClient,
  roleId: string,
  removedBy: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Verify remover has global admin privileges
    const canRemove = await isGlobalAdmin(supabase, removedBy);
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
 * Assign a role to a user using API endpoint (bypasses RLS)
 * This should be used from client-side code to avoid RLS restrictions
 */
export async function assignRoleViaAPI(
  targetUserId: string,
  roleType: UserRoleType,
  organizationalScope: {
    schoolId?: string;
    generationId?: string;
    communityId?: string;
  } = {}
): Promise<{ success: boolean; error?: string; communityId?: string; code?: string; debug?: any }> {
  try {
    const response = await fetch('/api/admin/assign-role', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        targetUserId,
        roleType,
        schoolId: organizationalScope.schoolId,
        generationId: organizationalScope.generationId,
        communityId: organizationalScope.communityId,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[assignRoleViaAPI] API error response:', {
        status: response.status,
        statusText: response.statusText,
        data
      });
      return { 
        success: false, 
        error: data.error || 'Error al asignar rol',
        code: data.code,
        debug: data.debug
      };
    }

    return { 
      success: true, 
      communityId: data.communityId 
    };
  } catch (error) {
    console.error('Error in assignRoleViaAPI:', error);
    return { success: false, error: 'Error de conexión al asignar rol' };
  }
}

/**
 * Remove a role from a user using API endpoint (bypasses RLS)
 * This should be used from client-side code to avoid RLS restrictions
 */
export async function removeRoleViaAPI(
  roleId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch('/api/admin/remove-role', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        roleId,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: data.error || 'Error al remover rol' };
    }

    return { success: true };
  } catch (error) {
    console.error('Error in removeRoleViaAPI:', error);
    return { success: false, error: 'Error de conexión al remover rol' };
  }
}

/**
 * Get user profile with role information
 */
export async function getUserProfileWithRoles(supabase: SupabaseClient, userId: string): Promise<UserProfile | null> {
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
    const userRoles = await getUserRoles(supabase, userId);

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
  supabase: SupabaseClient,
  userId: string,
  legacyRole: 'admin' | 'docente'
): Promise<{ success: boolean; error?: string }> {
  try {
    // Don't migrate if user already has new roles
    const existingRoles = await getUserRoles(supabase, userId);
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
  supabase: SupabaseClient,
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
export async function getCommunityMembers(_supabase: SupabaseClient, communityId: string): Promise<UserProfile[]> {
  // Use secure API route to bypass RLS while enforcing access on server
  try {
    const resp = await fetch(`/api/community/members?community_id=${encodeURIComponent(communityId)}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });

    if (resp.ok) {
      const json = await resp.json();
      const members = (json.members || []) as any[];
      return members as UserProfile[];
    }

    // If API returns 403/401 or other, fall back to client-side best effort (may be RLS-limited)
    console.warn('[getCommunityMembers] API route failed, falling back to direct query:', resp.status);
  } catch (err) {
    // Network or environment without API (tests), fall back
    console.warn('[getCommunityMembers] API route error, falling back to direct query:', err);
  }

  try {
    const supabase = _supabase;
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('user_id, role_type, id, assigned_at')
      .eq('community_id', communityId)
      .eq('is_active', true);

    if (!roleData || roleData.length === 0) {
      return [];
    }

    const userIds = roleData.map(role => role.user_id);
    const { data: profileData } = await supabase
      .from('profiles')
      .select('*')
      .in('id', userIds);

    return roleData.map(roleItem => {
      const profile = profileData?.find(p => p.id === roleItem.user_id);
      const firstName = profile?.first_name || profile?.name?.split(' ')[0] || '';
      const lastName = profile?.last_name || profile?.name?.split(' ').slice(1).join(' ') || '';
      return {
        id: roleItem.user_id,
        name: profile?.name,
        email: profile?.email,
        first_name: firstName,
        last_name: lastName,
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
      } as unknown as UserProfile;
    });
  } catch (error) {
    console.error('Error in getCommunityMembers (fallback):', error);
    return [];
  }
}

/**
 * Get community members grouped by role type
 */
export async function getCommunityMembersByRole(supabase: SupabaseClient, communityId: string): Promise<Record<UserRoleType, UserProfile[]>> {
  try {
    const members = await getCommunityMembers(supabase, communityId);
    
    const membersByRole: Record<UserRoleType, UserProfile[]> = {
      admin: [],
      consultor: [],
      equipo_directivo: [],
      lider_generacion: [],
      lider_comunidad: [],
      supervisor_de_red: [],
      community_manager: [],
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
      supervisor_de_red: [],
      community_manager: [],
      docente: []
    };
  }
}

/**
 * Check if user can access admin features (backward compatibility)
 */
export async function canAccessAdminFeatures(supabase: SupabaseClient, userId: string): Promise<boolean> {
  // In the new system, ONLY admin role has admin access
  // But we maintain backward compatibility with legacy admin role
  return await hasAdminPrivileges(supabase, userId);
}

/**
 * Get effective role and admin status for a user
 * This handles legacy role fallback
 */
export async function getEffectiveRoleAndStatus(supabase: SupabaseClient, userId: string): Promise<{
  effectiveRole: string;
  isAdmin: boolean;
  activeRole: UserRole | null;
}> {
  try {
    // Get user roles from user_roles table
    const userRoles = await getUserRoles(supabase, userId);
    const highestRole = getHighestRole(userRoles);
    
    // Use highest role from new system
    const effectiveRole = highestRole || '';
    
    // Check admin status
    const isAdmin = await hasAdminPrivileges(supabase, userId);
    
    // Get the active role object for organizational context
    const activeRole = userRoles.find(r => r.role_type === effectiveRole) || null;
    
    return {
      effectiveRole,
      isAdmin,
      activeRole
    };
  } catch (error) {
    console.error('Error in getEffectiveRoleAndStatus:', error);
    return {
      effectiveRole: '',
      isAdmin: false,
      activeRole: null
    };
  }
}

/**
 * Get the primary (highest priority) role for a user
 * This is a simpler function for when you just need the role string
 */
export async function getUserPrimaryRole(userId: string): Promise<string> {
  const { supabase } = await import('../lib/supabase');
  
  try {
    const userRoles = await getUserRoles(supabase, userId);
    const highestRole = getHighestRole(userRoles);
    return highestRole || '';
  } catch (error) {
    console.error('Error in getUserPrimaryRole:', error);
    return '';
  }
}

/**
 * Check if user is a network supervisor
 */
export async function isNetworkSupervisor(supabase: SupabaseClient, userId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('user_roles')
      .select('id')
      .eq('user_id', userId)
      .eq('role_type', 'supervisor_de_red')
      .eq('is_active', true)
      .not('red_id', 'is', null)
      .limit(1);

    if (error) {
      console.error('Error checking network supervisor status:', error);
      return false;
    }

    return data && data.length > 0;
  } catch (error) {
    console.error('Error in isNetworkSupervisor:', error);
    return false;
  }
}

/**
 * Get user's assigned network ID (for supervisors)
 */
export async function getUserNetworkId(supabase: SupabaseClient, userId: string): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('user_roles')
      .select('red_id')
      .eq('user_id', userId)
      .eq('role_type', 'supervisor_de_red')
      .eq('is_active', true)
      .not('red_id', 'is', null)
      .single();

    if (error) {
      console.error('Error getting user network ID:', error);
      return null;
    }

    return data?.red_id || null;
  } catch (error) {
    console.error('Error in getUserNetworkId:', error);
    return null;
  }
}

/**
 * Get schools in a supervisor's network
 */
export async function getNetworkSchools(supabase: SupabaseClient, networkId: string): Promise<School[]> {
  try {
    const { data, error } = await supabase
      .from('red_escuelas')
      .select(`
        school_id,
        schools (
          id,
          name,
          code,
          has_generations,
          created_at
        )
      `)
      .eq('red_id', networkId);

    if (error) {
      console.error('Error fetching network schools:', error);
      return [];
    }

    return data?.map(item => ({
      id: item.school_id.toString(),
      name: item.schools?.name || '',
      code: item.schools?.code,
      has_generations: item.schools?.has_generations,
      created_at: item.schools?.created_at
    })) || [];
  } catch (error) {
    console.error('Error in getNetworkSchools:', error);
    return [];
  }
}

/**
 * Check if supervisor can access specific user data
 */
export async function supervisorCanAccessUser(
  supabase: SupabaseClient, 
  supervisorId: string, 
  targetUserId: string
): Promise<boolean> {
  try {
    // Use the database function for efficient checking
    const { data, error } = await supabase
      .rpc('supervisor_can_access_user', {
        supervisor_id: supervisorId,
        target_user_id: targetUserId
      });

    if (error) {
      console.error('Error checking supervisor user access:', error);
      return false;
    }

    return data === true;
  } catch (error) {
    console.error('Error in supervisorCanAccessUser:', error);
    return false;
  }
}

/**
 * Get users accessible to a network supervisor
 */
export async function getNetworkUsers(supabase: SupabaseClient, userId: string): Promise<UserProfile[]> {
  try {
    // First get the supervisor's network ID
    const networkId = await getUserNetworkId(supabase, userId);
    if (!networkId) {
      return [];
    }

    // Get schools in the network
    const networkSchools = await getNetworkSchools(supabase, networkId);
    const schoolIds = networkSchools.map(school => parseInt(school.id));

    if (schoolIds.length === 0) {
      return [];
    }

    // Get users from these schools
    const { data, error } = await supabase
      .from('profiles')
      .select(`
        *,
        user_roles!inner (
          role_type,
          school_id,
          is_active
        )
      `)
      .or(`school_id.in.(${schoolIds.join(',')}),user_roles.school_id.in.(${schoolIds.map(id => `"${id}"`).join(',')})`)
      .eq('user_roles.is_active', true);

    if (error) {
      console.error('Error fetching network users:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error in getNetworkUsers:', error);
    return [];
  }
}

/**
 * Assign supervisor role with network
 */
export async function assignSupervisorRole(
  supabase: SupabaseClient,
  targetUserId: string,
  networkId: string,
  assignedBy: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Verify assigner has global admin privileges
    const canAssign = await isGlobalAdmin(supabase, assignedBy);
    if (!canAssign) {
      return { success: false, error: 'Solo administradores pueden asignar roles de supervisor' };
    }

    // Check if network exists
    const { data: networkExists } = await supabase
      .from('redes_de_colegios')
      .select('id')
      .eq('id', networkId)
      .single();

    if (!networkExists) {
      return { success: false, error: 'La red especificada no existe' };
    }

    // Check if user already has supervisor role for this network
    const { data: existingRole } = await supabase
      .from('user_roles')
      .select('id')
      .eq('user_id', targetUserId)
      .eq('role_type', 'supervisor_de_red')
      .eq('red_id', networkId)
      .eq('is_active', true)
      .single();

    if (existingRole) {
      return { success: false, error: 'El usuario ya tiene el rol de supervisor para esta red' };
    }

    // Assign the role
    const { error } = await supabase
      .from('user_roles')
      .insert({
        user_id: targetUserId,
        role_type: 'supervisor_de_red',
        red_id: networkId,
        is_active: true,
        assigned_by: assignedBy,
        assigned_at: new Date().toISOString()
      });

    if (error) {
      console.error('Error assigning supervisor role:', error);
      return { success: false, error: 'Error al asignar rol de supervisor: ' + error.message };
    }

    return { success: true };
  } catch (error) {
    console.error('Error in assignSupervisorRole:', error);
    return { success: false, error: 'Error inesperado al asignar rol de supervisor' };
  }
}

/**
 * Get available networks for supervisor assignment
 */
export async function getAvailableNetworks(supabase: SupabaseClient): Promise<any[]> {
  try {
    const { data, error } = await supabase
      .from('redes_de_colegios')
      .select(`
        id,
        name,
        description,
        created_at,
        red_escuelas!inner (
          school_id,
          schools (
            name
          )
        )
      `)
      .order('name');

    if (error) {
      console.error('Error fetching available networks:', error);
      return [];
    }

    // Group schools by network
    return data?.map(network => ({
      id: network.id,
      name: network.name,
      description: network.description,
      created_at: network.created_at,
      school_count: network.red_escuelas?.length || 0,
      schools: network.red_escuelas?.map((re: any) => re.schools?.name).filter(Boolean) || []
    })) || [];
  } catch (error) {
    console.error('Error in getAvailableNetworks:', error);
    return [];
  }
}

/**
 * Enhanced permission checking that includes network scope
 */
export function hasNetworkPermission(
  roles: UserRole[], 
  permission: PermissionKey,
  requiredScope: 'network' | 'global' = 'network'
): boolean {
  if (!roles || roles.length === 0) return false;

  return roles.some(role => {
    const permissions = ROLE_HIERARCHY[role.role_type];
    const hasPermission = permissions[permission];
    
    // For network scope, allow network supervisors
    if (requiredScope === 'network' && role.role_type === 'supervisor_de_red') {
      return hasPermission;
    }
    
    // For global scope, only allow admin and above
    if (requiredScope === 'global') {
      return hasPermission && permissions.reporting_scope === 'global';
    }
    
    return hasPermission;
  });
}

/**
 * Get data filtering scope for user
 */
export function getUserDataScope(roles: UserRole[]): {
  scope: 'global' | 'network' | 'school' | 'generation' | 'community' | 'individual';
  contextId?: string;
} {
  if (!roles || roles.length === 0) {
    return { scope: 'individual' };
  }

  // Find the highest privilege role
  const highestRole = getHighestRole(roles);
  const roleObj = roles.find(r => r.role_type === highestRole);
  
  if (!roleObj) {
    return { scope: 'individual' };
  }

  const permissions = ROLE_HIERARCHY[roleObj.role_type];
  
  // Return scope with context ID for filtering
  switch (permissions.reporting_scope) {
    case 'global':
      return { scope: 'global' };
    case 'network':
      return { scope: 'network', contextId: roleObj.red_id };
    case 'school':
      return { scope: 'school', contextId: roleObj.school_id };
    case 'generation':
      return { scope: 'generation', contextId: roleObj.generation_id };
    case 'community':
      return { scope: 'community', contextId: roleObj.community_id };
    default:
      return { scope: 'individual' };
  }
}
