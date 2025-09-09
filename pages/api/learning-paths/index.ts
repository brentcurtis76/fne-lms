import { NextApiRequest, NextApiResponse } from 'next';
import typedHandler from './index-typed';
import { LearningPathsService } from '../../../lib/services/learningPathsService';
import { getApiUser, createApiSupabaseClient, sendAuthError } from '../../../lib/api-auth';

// Wrapper to enable gradual rollout of typed routes
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (process.env.ENABLE_TYPED_ROUTES === 'true') {
    return typedHandler(req, res);
  }
  return legacyHandler(req, res);
}

async function legacyHandler(req: NextApiRequest, res: NextApiResponse) {
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
        // Get all learning paths
        const paths = await LearningPathsService.getAllLearningPaths(supabaseClient);
        return res.status(200).json(paths);

      case 'POST':
        // Create a new learning path
        console.log('[Learning Paths API] Creating learning path with user:', userId);
        
        // First check if user has permission
        const hasPermission = await LearningPathsService.hasManagePermission(supabaseClient, userId);
        
        if (!hasPermission) {
          return res.status(403).json({ error: 'You do not have permission to create learning paths' });
        }

        const { name, description, courseIds } = req.body;
        console.log('[Learning Paths API] Request body:', { name, description, courseIds });

        // Validate required fields
        if (!name || !description) {
          return res.status(400).json({ error: 'Name and description are required' });
        }

        if (!Array.isArray(courseIds)) {
          return res.status(400).json({ error: 'courseIds must be an array' });
        }

        // Create the learning path
        const newPath = await LearningPathsService.createLearningPath(
          supabaseClient,
          name,
          description,
          courseIds,
          userId
        );

        return res.status(201).json(newPath);

      default:
        res.setHeader('Allow', ['GET', 'POST']);
        return res.status(405).json({ error: `Method ${req.method} not allowed` });
    }
  } catch (error: any) {
    console.error('Learning paths API error:', error);
    return res.status(500).json({ 
      error: error.message || 'Internal server error' 
    });
  }
}
