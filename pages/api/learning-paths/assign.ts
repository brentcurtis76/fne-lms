import { NextApiRequest, NextApiResponse } from 'next';
import { LearningPathsService } from '../../../lib/services/learningPathsService';
import { getApiUser, createApiSupabaseClient, sendAuthError, handleMethodNotAllowed } from '../../../lib/api-auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Only allow POST method
  if (req.method !== 'POST') {
    return handleMethodNotAllowed(res, ['POST']);
  }

  // Authenticate user using the standard api-auth pattern
  const { user, error } = await getApiUser(req, res);
  
  if (error || !user) {
    return sendAuthError(res, 'Authentication required');
  }

  const assignedBy = user.id;
  
  // Create authenticated Supabase client
  const supabaseClient = await createApiSupabaseClient(req, res);

  try {
    // Check if user has permission to assign learning paths
    const hasPermission = await LearningPathsService.hasManagePermission(
      supabaseClient,
      assignedBy
    );
    
    if (!hasPermission) {
      return res.status(403).json({ 
        error: 'You do not have permission to assign learning paths' 
      });
    }

    const { pathId, userId, groupId } = req.body;

    // Validate required fields
    if (!pathId) {
      return res.status(400).json({ error: 'pathId is required' });
    }

    // Validate that either userId or groupId is provided, but not both
    if ((!userId && !groupId) || (userId && groupId)) {
      return res.status(400).json({ 
        error: 'Must provide either userId or groupId, but not both' 
      });
    }

    // Verify the learning path exists
    const { data: path } = await supabaseClient
      .from('learning_paths')
      .select('id')
      .eq('id', pathId)
      .single();

    if (!path) {
      return res.status(404).json({ error: 'Learning path not found' });
    }

    // If assigning to a user, verify the user exists
    if (userId) {
      const { data: user } = await supabaseClient
        .from('profiles')
        .select('id')
        .eq('id', userId)
        .single();

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
    }

    // If assigning to a group, verify the group exists
    if (groupId) {
      const { data: group } = await supabaseClient
        .from('groups')
        .select('id')
        .eq('id', groupId)
        .single();

      if (!group) {
        return res.status(404).json({ error: 'Group not found' });
      }
    }

    // Create the assignment (using batch assign with single user)
    const result = await LearningPathsService.batchAssignLearningPath(
      supabaseClient,
      pathId,
      [userId],
      groupId ? [groupId] : [],
      assignedBy
    );

    // Return success with assignment details
    return res.status(201).json({
      success: true,
      assignment: result.assignments?.[0],
      message: userId 
        ? 'Learning path assigned to user successfully' 
        : 'Learning path assigned to group successfully'
    });

  } catch (error: any) {
    console.error('Learning path assignment error:', error);
    
    // Handle specific error cases
    if (error.message.includes('already assigned')) {
      return res.status(409).json({ 
        error: error.message 
      });
    }

    return res.status(500).json({ 
      error: error.message || 'Failed to assign learning path' 
    });
  }
}