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
  const { sessionId, activityType, courseId } = req.body;

  // Validate required fields
  if (!sessionId || !activityType) {
    return res.status(400).json({ error: 'Session ID and activity type are required' });
  }

  if (!['path_view', 'course_start', 'course_progress', 'course_complete', 'path_complete'].includes(activityType)) {
    return res.status(400).json({ error: 'Invalid activity type' });
  }

  try {
    const supabaseClient = await createApiSupabaseClient(req, res);

    // Verify session belongs to user and is still active
    const { data: session, error: sessionError } = await supabaseClient
      .from('learning_path_progress_sessions')
      .select('id, user_id, path_id, session_end')
      .eq('id', sessionId)
      .eq('user_id', userId)
      .single();

    if (sessionError || !session) {
      return res.status(404).json({ error: 'Session not found or access denied' });
    }

    // Check if session is already ended
    if (session.session_end) {
      return res.status(400).json({ error: 'Session has already ended' });
    }

    // If courseId is provided, verify it belongs to this path
    if (courseId) {
      const { data: pathCourse, error: pathCourseError } = await supabaseClient
        .from('learning_path_courses')
        .select('course_id')
        .eq('learning_path_id', session.path_id)
        .eq('course_id', courseId)
        .single();

      if (pathCourseError || !pathCourse) {
        return res.status(400).json({ error: 'Course is not part of this learning path' });
      }
    }

    // Update session activity type and course
    const updateData: any = {
      activity_type: activityType,
      last_heartbeat: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    if (courseId !== undefined) {
      updateData.course_id = courseId;
    }

    const { error: updateError } = await supabaseClient
      .from('learning_path_progress_sessions')
      .update(updateData)
      .eq('id', sessionId);

    if (updateError) {
      console.error('Failed to update activity:', updateError);
      throw new Error('Failed to update session activity');
    }

    // Handle special activity types
    if (activityType === 'course_start' && courseId) {
      // Update the current course sequence in assignment
      const { data: courseSequence } = await supabaseClient
        .from('learning_path_courses')
        .select('sequence_order')
        .eq('learning_path_id', session.path_id)
        .eq('course_id', courseId)
        .single();

      if (courseSequence) {
        await supabaseClient
          .from('learning_path_assignments')
          .update({
            current_course_sequence: courseSequence.sequence_order,
            last_activity_at: new Date().toISOString()
          })
          .eq('user_id', userId)
          .eq('path_id', session.path_id);
      }
    }

    if (activityType === 'path_complete') {
      // Mark path as completed
      await supabaseClient
        .from('learning_path_assignments')
        .update({
          completed_at: new Date().toISOString(),
          last_activity_at: new Date().toISOString()
        })
        .eq('user_id', userId)
        .eq('path_id', session.path_id);
    }

    // Return success
    res.status(200).json({
      sessionId,
      activityType,
      courseId: courseId || null,
      updatedAt: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('Activity update error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to update activity'
    });
  }
}