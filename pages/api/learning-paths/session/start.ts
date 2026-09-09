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

    // Literal admin may open a session on any path; everyone else must be
    // assigned to it — directly or through an active membership of an
    // assigned group. The answer comes from the same auth.uid()-derived
    // helper the database policies use, so the API and the database agree.
    const { data: userRoles } = await supabaseClient
      .from('user_roles')
      .select('role_type')
      .eq('user_id', userId)
      .eq('is_active', true);

    const hasAdminAccess = userRoles?.some(role => role.role_type === 'admin');

    if (!hasAdminAccess) {
      const { data: isAssignee, error: assigneeError } = await supabaseClient
        .rpc('auth_is_learning_path_assignee', { p_path_id: pathId });

      if (assigneeError || isAssignee !== true) {
        return res.status(403).json({ error: 'You do not have access to this learning path' });
      }
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

    // Create a real progress session via RPC (SECURITY DEFINER)
    const { data: newSessionId, error: startErr } = await supabaseClient
      .rpc('start_learning_path_session', {
        p_user_id: userId,
        p_path_id: pathId,
        p_course_id: courseId || null,
        p_activity_type: activityType,
      });

    if (startErr || !newSessionId) {
      console.error('start_learning_path_session failed:', startErr);
      return res.status(500).json({ error: 'Failed to start session' });
    }

    // Return session details
    res.status(200).json({
      sessionId: newSessionId,
      pathId,
      courseId: courseId || null,
      activityType,
      startedAt: new Date().toISOString(),
      message: 'Session started successfully'
    });

  } catch (error: any) {
    console.error('Session start error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to start session'
    });
  }
}
