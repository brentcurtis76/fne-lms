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

  try {
    switch (req.method) {
      case 'GET':
        // Get user's assigned learning paths
        const assignedPaths = await LearningPathsService.getUserAssignedPaths(supabaseClient, userId);
        
        // For each path, get the progress (placeholder for now)
        const pathsWithProgress = await Promise.all(
          assignedPaths.map(async (path) => {
            const progress = await LearningPathsService.getUserPathProgress(
              supabaseClient,
              userId,
              path.id
            );
            
            return {
              ...path,
              progress
            };
          })
        );
        
        return res.status(200).json(pathsWithProgress);

      default:
        res.setHeader('Allow', ['GET']);
        return res.status(405).json({ error: `Method ${req.method} not allowed` });
    }
  } catch (error: any) {
    console.error('My paths API error:', error);
    return res.status(500).json({ 
      error: error.message || 'Internal server error' 
    });
  }
}