import { NextApiRequest, NextApiResponse } from 'next';
import { getApiUser, createApiSupabaseClient, sendAuthError } from '../../../../lib/api-auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Authenticate user
  const { user, error } = await getApiUser(req, res);
  
  if (error || !user) {
    return sendAuthError(res, 'Authentication required');
  }

  const userId = user.id;
  const { pathId, courseId, activityType = 'path_view' } = req.body;

  // Validate required fields
  if (!pathId) {
    return res.status(400).json({ error: 'Path ID is required' });
  }

  if (!['path_view', 'course_start', 'course_progress', 'course_complete', 'path_complete'].includes(activityType)) {
    return res.status(400).json({ error: 'Invalid activity type' });
  }

  try {
    const supabaseClient = await createApiSupabaseClient(req, res);

    // Verify user has access to this learning path
    const { data: assignment, error: assignmentError } = await supabaseClient
      .from('learning_path_assignments')
      .select('id, path_id')
      .eq('user_id', userId)
      .eq('path_id', pathId)
      .single();

    if (assignmentError || !assignment) {
      return res.status(403).json({ error: 'You do not have access to this learning path' });
    }

    // If courseId is provided, verify it belongs to this path
    if (courseId) {
      const { data: pathCourse, error: pathCourseError } = await supabaseClient
        .from('learning_path_courses')
        .select('course_id')
        .eq('learning_path_id', pathId)
        .eq('course_id', courseId)
        .single();

      if (pathCourseError || !pathCourse) {
        return res.status(400).json({ error: 'Course is not part of this learning path' });
      }
    }

    // Start new session using the database function
    const { data: sessionId, error: sessionError } = await supabaseClient
      .rpc('start_learning_path_session', {
        p_user_id: userId,
        p_path_id: pathId,
        p_course_id: courseId || null,
        p_activity_type: activityType
      });

    if (sessionError) {
      console.error('Failed to start session:', sessionError);
      throw new Error('Failed to create session');
    }

    // Return session details
    res.status(200).json({
      sessionId,
      pathId,
      courseId: courseId || null,
      activityType,
      startedAt: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('Session start error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to start session'
    });
  }
}