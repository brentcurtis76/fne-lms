import { NextApiRequest, NextApiResponse } from 'next';
import { getApiUser, createApiSupabaseClient, sendAuthError, handleMethodNotAllowed } from '../../../../lib/api-auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return handleMethodNotAllowed(res, ['GET']);
  }

  // Authenticate user using the standard api-auth pattern
  const { user, error } = await getApiUser(req, res);
  
  if (error || !user) {
    return sendAuthError(res, 'Authentication required');
  }

  const requestingUserId = user.id;
  
  // Create authenticated Supabase client
  const supabaseClient = await createApiSupabaseClient(req, res);
  const targetUserId = req.query.userId as string;

  if (!targetUserId) {
    return res.status(400).json({ error: 'User ID is required' });
  }

  try {
    // Users can view their own learning paths
    // Admins and authorized roles can view any user's learning paths
    if (requestingUserId !== targetUserId) {
      // Check if requesting user has permission
      const { data: roles } = await supabaseClient
        .from('user_roles')
        .select('role_type')
        .eq('user_id', requestingUserId)
        .eq('is_active', true)
        .in('role_type', ['admin', 'equipo_directivo', 'consultor']);

      if (!roles || roles.length === 0) {
        return res.status(403).json({ 
          error: 'You can only view your own learning paths' 
        });
      }
    }

    // Use the utility function to get user's learning paths
    const { data: learningPaths, error } = await supabaseClient
      .rpc('get_user_learning_paths', { target_user_id: targetUserId });

    if (error) throw error;

    // Enrich the data with course counts
    const pathIds = learningPaths.map((lp: any) => lp.path_id);
    
    if (pathIds.length > 0) {
      const { data: courseCounts } = await supabaseClient
        .from('learning_path_courses')
        .select('path_id')
        .in('path_id', pathIds);

      const countMap = courseCounts?.reduce((acc: any, item: any) => {
        acc[item.path_id] = (acc[item.path_id] || 0) + 1;
        return acc;
      }, {}) || {};

      // Add course counts to the response
      const enrichedPaths = learningPaths.map((lp: any) => ({
        ...lp,
        course_count: countMap[lp.path_id] || 0
      }));

      return res.status(200).json(enrichedPaths);
    }

    return res.status(200).json(learningPaths);

  } catch (error: any) {
    console.error('Error fetching user learning paths:', error);
    return res.status(500).json({ 
      error: error.message || 'Failed to fetch user learning paths' 
    });
  }
}