import { NextApiRequest, NextApiResponse } from 'next';
import { LearningPathsService } from '../../../lib/services/learningPathsService';
import { getApiUser, createApiSupabaseClient, sendAuthError } from '../../../lib/api-auth';

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
        // Check if this is a user-specific request (has 'user' query param)
        const isUserRequest = req.query.user === 'true';
        
        if (isUserRequest) {
          // Get learning path details with user progress
          const pathDetailsForUser = await LearningPathsService.getLearningPathDetailsForUser(
            supabaseClient,
            userId,
            pathId
          );

          if (!pathDetailsForUser) {
            return res.status(404).json({ error: 'Learning path not found' });
          }

          return res.status(200).json(pathDetailsForUser);
        } else {
          // Admin request - get a single learning path with courses
          const pathWithCourses = await LearningPathsService.getLearningPathWithCourses(
            supabaseClient,
            pathId
          );

          if (!pathWithCourses) {
            return res.status(404).json({ error: 'Learning path not found' });
          }

          return res.status(200).json(pathWithCourses);
        }

      case 'PUT':
        // Update a learning path
        // First check if user has permission
        const hasUpdatePermission = await LearningPathsService.hasManagePermission(
          supabaseClient,
          userId
        );
        
        if (!hasUpdatePermission) {
          return res.status(403).json({ error: 'You do not have permission to update learning paths' });
        }

        // Check if user owns this path or is admin
        const { data: existingPath } = await supabaseClient
          .from('learning_paths')
          .select('created_by')
          .eq('id', pathId)
          .single();

        if (!existingPath) {
          return res.status(404).json({ error: 'Learning path not found' });
        }

        // Check if user can manage this specific path (admin roles or owner)
        const canManage = await LearningPathsService.canManagePath(supabaseClient, pathId, userId);
        
        if (!canManage) {
          return res.status(403).json({ error: 'You can only update your own learning paths or need admin privileges' });
        }

        const { name, description, courseIds } = req.body;

        // Validate required fields
        if (!name || !description) {
          return res.status(400).json({ error: 'Name and description are required' });
        }

        if (!Array.isArray(courseIds)) {
          return res.status(400).json({ error: 'courseIds must be an array' });
        }

        // Update the learning path
        const updatedPath = await LearningPathsService.updateLearningPath(
          supabaseClient,
          pathId,
          name,
          description,
          courseIds,
          userId
        );

        return res.status(200).json(updatedPath);

      case 'DELETE':
        // Delete a learning path
        // First check if user has permission
        const hasDeletePermission = await LearningPathsService.hasManagePermission(
          supabaseClient,
          userId
        );
        
        if (!hasDeletePermission) {
          return res.status(403).json({ error: 'You do not have permission to delete learning paths' });
        }

        // Check if user owns this path or is admin
        const { data: pathToDelete } = await supabaseClient
          .from('learning_paths')
          .select('created_by')
          .eq('id', pathId)
          .single();

        if (!pathToDelete) {
          return res.status(404).json({ error: 'Learning path not found' });
        }

        // Use the service's permission check which correctly handles all admin roles
        await LearningPathsService.deleteLearningPath(supabaseClient, pathId, userId);

        return res.status(204).end();

      default:
        res.setHeader('Allow', ['GET', 'PUT', 'DELETE']);
        return res.status(405).json({ error: `Method ${req.method} not allowed` });
    }
  } catch (error: any) {
    console.error('Learning path API error:', error);
    return res.status(500).json({ 
      error: error.message || 'Internal server error' 
    });
  }
}