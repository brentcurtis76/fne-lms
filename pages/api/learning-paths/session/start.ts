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

    // Check if user is admin first - admins have access to everything
    const { data: userRoles, error: rolesError } = await supabaseClient
      .from('user_roles')
      .select('role_type')
      .eq('user_id', userId)
      .eq('is_active', true);

    console.log('[Session Start] User ID:', userId);
    console.log('[Session Start] User roles query result:', userRoles);
    console.log('[Session Start] Roles error:', rolesError);

    const hasAdminAccess = userRoles?.some(role => 
      ['admin', 'equipo_directivo', 'consultor'].includes(role.role_type)
    );

    console.log('[Session Start] Has admin access:', hasAdminAccess);
    console.log('[Session Start] User roles found:', userRoles?.map(r => r.role_type));

    if (!hasAdminAccess) {
      // For non-admin users, verify they have access to this learning path
      const { data: assignments, error: assignmentError } = await supabaseClient
        .from('learning_path_assignments')
        .select('id, path_id, user_id, group_id')
        .eq('path_id', pathId)
        .or(`user_id.eq.${userId},group_id.is.not.null`);

      if (assignmentError || !assignments || assignments.length === 0) {
        return res.status(403).json({ error: 'You do not have access to this learning path' });
      }

      // Check if user has direct assignment or belongs to an assigned group
      const userAssignment = assignments.find(a => a.user_id === userId);
      const groupAssignments = assignments.filter(a => a.group_id && !a.user_id);
      
      if (!userAssignment && groupAssignments.length === 0) {
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

    // Since we don't have session tracking tables, we'll just return success
    // In the future, this would create records in learning_path_progress_sessions

    // Generate a simple session ID for consistency with frontend expectations
    const sessionId = `${userId}-${pathId}-${Date.now()}`;

    // Return session details
    res.status(200).json({
      sessionId,
      pathId,
      courseId: courseId || null,
      activityType,
      startedAt: new Date().toISOString(),
      message: 'Session started successfully (simplified tracking)'
    });

  } catch (error: any) {
    console.error('Session start error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to start session'
    });
  }
}