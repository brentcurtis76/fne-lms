import { NextApiRequest, NextApiResponse } from 'next';
import { LearningPathsService } from '../../../../lib/services/learningPathsService';
import { getApiUser, createApiSupabaseClient, sendAuthError } from '../../../../lib/api-auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Authenticate user using the standard api-auth pattern
  const { user, error } = await getApiUser(req, res);
  
  if (error || !user) {
    return sendAuthError(res, 'Authentication required');
  }

  const userId = user.id;
  
  // Create authenticated Supabase client
  const supabaseClient = await createApiSupabaseClient(req, res);
  const pathId = req.query.id as string;

  if (!pathId) {
    return res.status(400).json({ error: 'Path ID is required' });
  }

  try {
    switch (req.method) {
      case 'GET':
        // Get all assignments for a learning path
        // Check if user has permission to view assignments
        const hasViewPermission = await LearningPathsService.hasManagePermission(
          supabaseClient,
          userId
        );
        
        if (!hasViewPermission) {
          return res.status(403).json({ 
            error: 'You do not have permission to view assignments' 
          });
        }

        const { data: assignments, error } = await supabaseClient
          .from('learning_path_assignments')
          .select('*')
          .eq('path_id', pathId);

        if (error) {
          return res.status(500).json({ error: error.message });
        }

        return res.status(200).json(assignments || []);

      case 'DELETE':
        // Remove an assignment
        // The assignment ID should be in the request body
        const { assignmentId } = req.body;

        if (!assignmentId) {
          return res.status(400).json({ error: 'assignmentId is required' });
        }

        // Check if user has permission to remove assignments
        const hasDeletePermission = await LearningPathsService.hasManagePermission(
          supabaseClient,
          userId
        );
        
        if (!hasDeletePermission) {
          return res.status(403).json({ 
            error: 'You do not have permission to remove assignments' 
          });
        }

        // Verify the assignment exists and belongs to this path
        const { data: assignment } = await supabaseClient
          .from('learning_path_assignments')
          .select('id, path_id')
          .eq('id', assignmentId)
          .single();

        if (!assignment) {
          return res.status(404).json({ error: 'Assignment not found' });
        }

        if (assignment.path_id !== pathId) {
          return res.status(400).json({ 
            error: 'Assignment does not belong to this learning path' 
          });
        }

        const { error: deleteError } = await supabaseClient
          .from('learning_path_assignments')
          .delete()
          .eq('id', assignmentId);

        if (deleteError) {
          return res.status(500).json({ error: deleteError.message });
        }

        return res.status(204).end();

      default:
        res.setHeader('Allow', ['GET', 'DELETE']);
        return res.status(405).json({ error: `Method ${req.method} not allowed` });
    }
  } catch (error: any) {
    console.error('Assignment API error:', error);
    return res.status(500).json({ 
      error: error.message || 'Internal server error' 
    });
  }
}