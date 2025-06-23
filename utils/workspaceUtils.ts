/**
 * Workspace Access Utilities for FNE LMS Community Workspaces
 * Handles access control and workspace management logic
 */

import { supabase } from '../lib/supabase';
import { UserRole, GrowthCommunity } from '../types/roles';

export interface WorkspaceAccess {
  canAccess: boolean;
  accessType: 'admin' | 'community_member' | 'consultant' | 'none';
  availableCommunities: CommunityInfo[];
  defaultCommunityId?: string;
  userCommunityId?: string;
}

export interface CommunityInfo {
  id: string;
  name: string;
  custom_name?: string;
  display_name: string; // This will be custom_name || name
  school_name: string;
  generation_name: string;
  member_count?: number;
  workspace_id?: string;
}

export interface CommunityWorkspace {
  id: string;
  community_id: string;
  name: string;
  custom_name?: string;
  image_url?: string;
  image_storage_path?: string;
  description?: string;
  settings: Record<string, any>;
  is_active: boolean;
  created_at: string;
  community?: GrowthCommunity;
}

/**
 * Determine user's workspace access level and available communities
 */
export async function getUserWorkspaceAccess(userId: string): Promise<WorkspaceAccess> {
  try {
    // Get user roles
    const { data: userRoles, error: rolesError } = await supabase
      .from('user_roles')
      .select(`
        *,
        school:schools(*),
        generation:generations(*),
        community:growth_communities(*)
      `)
      .eq('user_id', userId)
      .eq('is_active', true);

    if (rolesError) {
      console.error('Error fetching user roles:', rolesError);
      return {
        canAccess: false,
        accessType: 'none',
        availableCommunities: []
      };
    }

    if (!userRoles || userRoles.length === 0) {
      return {
        canAccess: false,
        accessType: 'none',
        availableCommunities: []
      };
    }

    // Check if user is admin
    const isAdmin = userRoles.some(role => role.role_type === 'admin');
    if (isAdmin) {
      const allCommunities = await getAllCommunitiesForAdmin();
      return {
        canAccess: true,
        accessType: 'admin',
        availableCommunities: allCommunities,
        defaultCommunityId: allCommunities.length > 0 ? allCommunities[0].id : undefined
      };
    }

    // Check if user is consultant
    const consultantRoles = userRoles.filter(role => role.role_type === 'consultor');
    if (consultantRoles.length > 0) {
      const consultantCommunities = await getCommunitiesForConsultant(consultantRoles);
      return {
        canAccess: consultantCommunities.length > 0,
        accessType: 'consultant',
        availableCommunities: consultantCommunities,
        defaultCommunityId: consultantCommunities.length > 0 ? consultantCommunities[0].id : undefined
      };
    }

    // Check if user is community member
    const communityRoles = userRoles.filter(role => role.community_id);
    if (communityRoles.length > 0) {
      const memberCommunities = await getCommunitiesForMember(communityRoles);
      const userCommunityId = communityRoles[0].community_id;
      
      return {
        canAccess: memberCommunities.length > 0,
        accessType: 'community_member',
        availableCommunities: memberCommunities,
        defaultCommunityId: userCommunityId,
        userCommunityId: userCommunityId
      };
    }

    // User has no community access
    return {
      canAccess: false,
      accessType: 'none',
      availableCommunities: []
    };

  } catch (error) {
    console.error('Error determining workspace access:', error);
    return {
      canAccess: false,
      accessType: 'none',
      availableCommunities: []
    };
  }
}

/**
 * Get all communities for admin users
 */
async function getAllCommunitiesForAdmin(): Promise<CommunityInfo[]> {
  try {
    // First get all communities with basic info
    const { data: communities, error } = await supabase
      .from('growth_communities')
      .select(`
        id,
        name,
        school:schools(name),
        generation:generations(name)
      `)
      .order('name');

    if (error) {
      console.error('Error fetching communities for admin:', error);
      return [];
    }

    // Then get workspace info separately
    const { data: workspaces, error: wsError } = await supabase
      .from('community_workspaces')
      .select('community_id, id, custom_name');

    if (wsError) {
      console.error('Error fetching workspaces:', wsError);
    }

    // Create a map of community_id to workspace info
    const workspaceMap = new Map();
    workspaces?.forEach(ws => {
      workspaceMap.set(ws.community_id, {
        workspace_id: ws.id,
        custom_name: ws.custom_name
      });
    });

    return communities?.map(community => {
      const workspaceInfo = workspaceMap.get(community.id);
      return {
        id: community.id,
        name: community.name,
        custom_name: workspaceInfo?.custom_name,
        display_name: workspaceInfo?.custom_name || community.name,
        school_name: (community.school as any)?.name || 'Sin escuela',
        generation_name: (community.generation as any)?.name || 'Sin generación',
        workspace_id: workspaceInfo?.workspace_id
      };
    }) || [];

  } catch (error) {
    console.error('Error in getAllCommunitiesForAdmin:', error);
    return [];
  }
}

/**
 * Get communities accessible to consultants
 */
async function getCommunitiesForConsultant(consultantRoles: UserRole[]): Promise<CommunityInfo[]> {
  try {
    const schoolIds = consultantRoles
      .map(role => role.school_id)
      .filter((id): id is string => id !== null && id !== undefined);

    if (schoolIds.length === 0) {
      return [];
    }

    const { data: communities, error } = await supabase
      .from('growth_communities')
      .select(`
        id,
        name,
        school:schools(name),
        generation:generations(name)
      `)
      .in('school_id', schoolIds)
      .order('name');

    if (error) {
      console.error('Error fetching communities for consultant:', error);
      return [];
    }

    // Get workspace info separately
    const communityIds = communities?.map(c => c.id) || [];
    const { data: workspaces, error: wsError } = await supabase
      .from('community_workspaces')
      .select('community_id, id, custom_name')
      .in('community_id', communityIds);

    if (wsError) {
      console.error('Error fetching workspaces:', wsError);
    }

    // Create a map of community_id to workspace info
    const workspaceMap = new Map();
    workspaces?.forEach(ws => {
      workspaceMap.set(ws.community_id, {
        workspace_id: ws.id,
        custom_name: ws.custom_name
      });
    });

    return communities?.map(community => {
      const workspaceInfo = workspaceMap.get(community.id);
      return {
        id: community.id,
        name: community.name,
        custom_name: workspaceInfo?.custom_name,
        display_name: workspaceInfo?.custom_name || community.name,
        school_name: (community.school as any)?.name || 'Sin escuela',
        generation_name: (community.generation as any)?.name || 'Sin generación',
        workspace_id: workspaceInfo?.workspace_id
      };
    }) || [];

  } catch (error) {
    console.error('Error in getCommunitiesForConsultant:', error);
    return [];
  }
}

/**
 * Get communities for community members
 */
async function getCommunitiesForMember(communityRoles: UserRole[]): Promise<CommunityInfo[]> {
  try {
    const communityIds = communityRoles
      .map(role => role.community_id)
      .filter((id): id is string => id !== null && id !== undefined);

    if (communityIds.length === 0) {
      return [];
    }

    const { data: communities, error } = await supabase
      .from('growth_communities')
      .select(`
        id,
        name,
        school:schools(name),
        generation:generations(name)
      `)
      .in('id', communityIds)
      .order('name');

    if (error) {
      console.error('Error fetching communities for member:', error);
      return [];
    }

    // Get workspace info separately
    const { data: workspaces, error: wsError } = await supabase
      .from('community_workspaces')
      .select('community_id, id, custom_name')
      .in('community_id', communityIds);

    if (wsError) {
      console.error('Error fetching workspaces:', wsError);
    }

    // Create a map of community_id to workspace info
    const workspaceMap = new Map();
    workspaces?.forEach(ws => {
      workspaceMap.set(ws.community_id, {
        workspace_id: ws.id,
        custom_name: ws.custom_name
      });
    });

    return communities?.map(community => {
      const workspaceInfo = workspaceMap.get(community.id);
      return {
        id: community.id,
        name: community.name,
        custom_name: workspaceInfo?.custom_name,
        display_name: workspaceInfo?.custom_name || community.name,
        school_name: (community.school as any)?.name || 'Sin escuela',
        generation_name: (community.generation as any)?.name || 'Sin generación',
        workspace_id: workspaceInfo?.workspace_id
      };
    }) || [];

  } catch (error) {
    console.error('Error in getCommunitiesForMember:', error);
    return [];
  }
}

/**
 * Get or create workspace for a community
 */
export async function getOrCreateWorkspace(communityId: string): Promise<CommunityWorkspace | null> {
  try {
    // Try to get existing workspace
    const { data: existingWorkspace, error: fetchError } = await supabase
      .from('community_workspaces')
      .select(`
        *,
        community:growth_communities(*)
      `)
      .eq('community_id', communityId)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') { // Not found error is okay
      console.error('Error fetching workspace:', fetchError);
      return null;
    }

    if (existingWorkspace) {
      return existingWorkspace;
    }

    // Get community info for workspace creation
    const { data: community, error: communityError } = await supabase
      .from('growth_communities')
      .select('*')
      .eq('id', communityId)
      .single();

    if (communityError) {
      console.error('Error fetching community:', communityError);
      return null;
    }

    // Create new workspace
    const { data: newWorkspace, error: createError } = await supabase
      .from('community_workspaces')
      .insert({
        community_id: communityId,
        name: `Espacio de ${community.name}`,
        description: `Espacio colaborativo para ${community.name}`,
        settings: {
          features: {
            meetings: true,
            documents: true,
            messaging: true,
            feed: true
          },
          permissions: {
            all_can_post: true,
            all_can_upload: true
          }
        }
      })
      .select(`
        *,
        community:growth_communities(*)
      `)
      .single();

    if (createError) {
      console.error('Error creating workspace:', createError);
      return null;
    }

    return newWorkspace;

  } catch (error) {
    console.error('Error in getOrCreateWorkspace:', error);
    return null;
  }
}

/**
 * Check if user can access a specific workspace
 */
export async function canUserAccessWorkspace(userId: string, workspaceId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .rpc('can_access_workspace', {
        p_user_id: userId,
        p_workspace_id: workspaceId
      });

    if (error) {
      console.error('Error checking workspace access:', error);
      return false;
    }

    return data === true;

  } catch (error) {
    console.error('Error in canUserAccessWorkspace:', error);
    return false;
  }
}

/**
 * Get workspace member count
 */
export async function getWorkspaceMemberCount(communityId: string): Promise<number> {
  try {
    const { count, error } = await supabase
      .from('user_roles')
      .select('*', { count: 'exact', head: true })
      .eq('community_id', communityId)
      .eq('is_active', true);

    if (error) {
      console.error('Error fetching member count:', error);
      return 0;
    }

    return count || 0;

  } catch (error) {
    console.error('Error in getWorkspaceMemberCount:', error);
    return 0;
  }
}

/**
 * Log workspace activity
 */
export async function logWorkspaceActivity(
  workspaceId: string,
  userId: string,
  activityType: string,
  activityData: Record<string, any> = {}
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('workspace_activities')
      .insert({
        workspace_id: workspaceId,
        user_id: userId,
        activity_type: activityType,
        activity_data: activityData
      });

    if (error) {
      console.error('Error logging workspace activity:', error);
      return false;
    }

    return true;

  } catch (error) {
    console.error('Error in logWorkspaceActivity:', error);
    return false;
  }
}