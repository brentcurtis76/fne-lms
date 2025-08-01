import { NextApiRequest, NextApiResponse } from 'next';
import { LearningPathsService } from '../../../lib/services/learningPathsService';
import { getApiUser, createApiSupabaseClient, sendAuthError, handleMethodNotAllowed } from '../../../lib/api-auth';

interface UnassignRequest {
  pathId: string;
  userIds?: string[];
  groupIds?: string[];
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Only allow DELETE method
  if (req.method !== 'DELETE') {
    return handleMethodNotAllowed(res, ['DELETE']);
  }

  // Authenticate user
  const { user, error } = await getApiUser(req, res);
  
  if (error || !user) {
    return sendAuthError(res, 'Authentication required');
  }

  // Create authenticated Supabase client
  const supabaseClient = await createApiSupabaseClient(req, res);

  try {
    // Check if user has permission to assign learning paths
    const hasPermission = await LearningPathsService.hasManagePermission(
      supabaseClient,
      user.id
    );
    
    if (!hasPermission) {
      return res.status(403).json({ 
        error: 'You do not have permission to unassign learning paths' 
      });
    }

    // Validate request body
    const { pathId, userIds, groupIds } = req.body as UnassignRequest;

    if (!pathId) {
      return res.status(400).json({ 
        error: 'pathId is required' 
      });
    }

    // Validate that at least one user or group is provided
    const hasUsers = Array.isArray(userIds) && userIds.length > 0;
    const hasGroups = Array.isArray(groupIds) && groupIds.length > 0;

    if (!hasUsers && !hasGroups) {
      return res.status(400).json({ 
        error: 'At least one userId or groupId must be provided' 
      });
    }

    // Verify the learning path exists
    const { data: path } = await supabaseClient
      .from('learning_paths')
      .select('id, name')
      .eq('id', pathId)
      .single();

    if (!path) {
      return res.status(404).json({ error: 'Learning path not found' });
    }

    let unassignedCount = 0;

    // Unassign from users
    if (hasUsers) {
      const { error: userError } = await supabaseClient
        .from('learning_path_assignments')
        .delete()
        .eq('path_id', pathId)
        .in('user_id', userIds!)
        .is('group_id', null);

      if (userError) {
        throw new Error(`Failed to unassign users: ${userError.message}`);
      }

      unassignedCount += userIds!.length;
    }

    // Unassign from groups (and their members)
    if (hasGroups) {
      console.log('Unassigning from groups:', groupIds);
      for (const groupId of groupIds!) {
        // Get the community_id for this group
        const { data: workspace } = await supabaseClient
          .from('community_workspaces')
          .select('community_id')
          .eq('id', groupId)
          .single();

        if (!workspace) {
          throw new Error(`Group with ID ${groupId} not found`);
        }

        // Remove group assignment
        const { error: groupError } = await supabaseClient
          .from('learning_path_assignments')
          .delete()
          .eq('path_id', pathId)
          .eq('group_id', groupId);

        if (groupError) {
          throw new Error(`Failed to unassign group: ${groupError.message}`);
        }

        // Remove individual assignments for group members
        // Get all members of this community
        const { data: members } = await supabaseClient
          .from('user_roles')
          .select('user_id')
          .eq('community_id', workspace.community_id)
          .eq('is_active', true);

        if (members && members.length > 0) {
          const memberIds = members.map(m => m.user_id);
          
          const { error: memberError } = await supabaseClient
            .from('learning_path_assignments')
            .delete()
            .eq('path_id', pathId)
            .in('user_id', memberIds)
            .is('group_id', null);

          if (memberError) {
            console.warn(`Warning: Failed to remove some individual member assignments: ${memberError.message}`);
          }

          unassignedCount += memberIds.length;
        }

        unassignedCount += 1; // Count the group itself
      }
    }

    // Return success response
    return res.status(200).json({
      success: true,
      pathName: path.name,
      unassigned_count: unassignedCount,
      message: `Successfully unassigned learning path from ${unassignedCount} users/groups`
    });

  } catch (error: any) {
    console.error('Unassign error:', error);
    
    return res.status(500).json({ 
      error: error.message || 'Failed to unassign learning path' 
    });
  }
}