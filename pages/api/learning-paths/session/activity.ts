import { NextApiRequest, NextApiResponse } from 'next';
import { getApiUser, createApiSupabaseClient, sendAuthError } from '../../../../lib/api-auth';

const ACTIVITY_TYPES = ['path_view', 'course_start', 'course_progress', 'course_complete', 'path_complete'];

/**
 * POST /api/learning-paths/session/activity — activity on the caller's own open
 * session.
 *
 * R2-04 (2026-09-07): the route no longer writes the session or the assignment
 * tables directly. `record_learning_path_activity` (SECURITY DEFINER, actor =
 * auth.uid()) updates the caller's OWN open session (activity type, course —
 * which must belong to the path — and heartbeat) and records the progress
 * (course sequence on course_start, completion on path_complete) in the
 * caller's own progress row, mirrored into their direct assignment row when one
 * exists. A group-only assignee therefore keeps their progress; previously the
 * assignment UPDATE matched nothing for them and the progress was lost.
 *
 * R3-01 (2026-09-07): the RPC re-checks CURRENT assignment authority before
 * writing (42501 when the caller lost it) — answered here as 403.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Authenticate user
  const { user, error } = await getApiUser(req, res);

  if (error || !user) {
    return sendAuthError(res, 'Authentication required');
  }

  const { sessionId, activityType, courseId } = req.body;

  // Validate required fields
  if (!sessionId || !activityType) {
    return res.status(400).json({ error: 'Session ID and activity type are required' });
  }

  if (!ACTIVITY_TYPES.includes(activityType)) {
    return res.status(400).json({ error: 'Invalid activity type' });
  }

  try {
    const supabaseClient = await createApiSupabaseClient(req, res);

    const { data, error: rpcError } = await supabaseClient
      .rpc('record_learning_path_activity', {
        p_session_id: sessionId,
        p_activity_type: activityType,
        p_course_id: courseId || null,
      });

    if (rpcError) {
      const code = (rpcError as { code?: string }).code;
      // 22023 = the course is not part of the session's path (or bad activity type)
      if (code === '22023') {
        return res.status(400).json({ error: 'Course is not part of this learning path' });
      }
      // 42501 = the caller no longer holds assignment authority for the path
      // (direct assignment removed or group membership ended while the session
      // was open — R3-01). The database wrote nothing; this is a denial, not an
      // internal error.
      if (code === '42501') {
        return res.status(403).json({ error: 'You do not have access to this learning path' });
      }
      console.error('Failed to update activity:', rpcError);
      throw new Error('Failed to update session activity');
    }

    const result = (data ?? {}) as { ok?: boolean; reason?: string; courseId?: string | null };
    if (!result.ok) {
      if (result.reason === 'ended') {
        return res.status(400).json({ error: 'Session has already ended' });
      }
      // Someone else's session is indistinguishable from a missing one.
      return res.status(404).json({ error: 'Session not found or access denied' });
    }

    res.status(200).json({
      sessionId,
      activityType,
      courseId: result.courseId ?? (courseId || null),
      updatedAt: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('Activity update error:', error);
    res.status(500).json({
      error: error.message || 'Failed to update activity'
    });
  }
}
