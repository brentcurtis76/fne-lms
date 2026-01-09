import { NextApiRequest, NextApiResponse } from 'next';
import { LearningPathsService } from '../../../lib/services/learningPathsService';
import { getApiUser, createApiSupabaseClient, sendAuthError, handleMethodNotAllowed } from '../../../lib/api-auth';
import { logBatchAssignmentAudit, createLPAssignmentAuditEntries } from '../../../lib/auditLog';

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

    const { pathId, userIds, groupIds } = req.body;

    // Validate required fields
    if (!pathId) {
      return res.status(400).json({ error: 'pathId is required' });
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

    // Execute batch assignment using atomic database function
    const result = await LearningPathsService.batchAssignLearningPath(
      supabaseClient,
      pathId,
      userIds || [],
      groupIds || [],
      assignedBy
    );

    // Log to audit trail (non-blocking)
    if (hasUsers && result.assignments_created > 0) {
      const auditEntries = createLPAssignmentAuditEntries(
        'assigned',
        pathId,
        userIds!,
        assignedBy,
        userIds!.length
      );
      logBatchAssignmentAudit(supabaseClient, auditEntries);
    }

    // Return detailed success response
    return res.status(201).json({
      success: true,
      pathName: path.name,
      ...result
    });

  } catch (error: any) {
    console.error('Batch assignment error:', error);
    
    return res.status(500).json({ 
      error: error.message || 'Failed to batch assign learning path' 
    });
  }
}