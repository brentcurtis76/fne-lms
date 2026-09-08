import { NextApiRequest, NextApiResponse } from 'next';
import { getApiUser, createApiSupabaseClient, sendAuthError, handleMethodNotAllowed } from '../../../../lib/api-auth';
import { LearningPathsService } from '../../../../lib/services/learningPathsService';

/**
 * GET /api/learning-paths/user/[userId] — the learning paths assigned to one user.
 *
 * Authority (W-B2c-01): a user may read their OWN assigned paths; reading
 * ANOTHER user's paths is cross-user reporting and is literal-admin-only.
 * equipo_directivo and consultor are refused like any other non-admin role.
 *
 * Data: the previous implementation called a `get_user_learning_paths` RPC
 * that exists in no migration (the route failed on every request) and then
 * counted `learning_path_courses.path_id`, a column the table does not have
 * (it is `learning_path_id`). Both are replaced with the service method the
 * own-paths route already uses, so the response is the same shape as
 * /api/learning-paths/my-paths plus `course_count`.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return handleMethodNotAllowed(res, ['GET']);
  }

  const { user, error } = await getApiUser(req, res);

  if (error || !user) {
    return sendAuthError(res, 'Authentication required');
  }

  const requestingUserId = user.id;
  const supabaseClient = await createApiSupabaseClient(req, res);
  const targetUserId = req.query.userId as string;

  if (!targetUserId) {
    return res.status(400).json({ error: 'User ID is required' });
  }

  try {
    if (requestingUserId !== targetUserId) {
      const isAdmin = await LearningPathsService.hasManagePermission(supabaseClient, requestingUserId);
      if (!isAdmin) {
        return res.status(403).json({
          error: 'You can only view your own learning paths'
        });
      }
    }

    const learningPaths = await LearningPathsService.getUserAssignedPaths(supabaseClient, targetUserId);
    const pathIds = learningPaths.map((lp: { id: string }) => lp.id);

    if (pathIds.length === 0) {
      return res.status(200).json(learningPaths);
    }

    const { data: courseLinks, error: courseError } = await supabaseClient
      .from('learning_path_courses')
      .select('learning_path_id')
      .in('learning_path_id', pathIds);

    if (courseError) throw courseError;

    const countMap: Record<string, number> = {};
    (courseLinks || []).forEach((link: { learning_path_id: string }) => {
      countMap[link.learning_path_id] = (countMap[link.learning_path_id] || 0) + 1;
    });

    return res.status(200).json(
      learningPaths.map((lp: { id: string }) => ({
        ...lp,
        course_count: countMap[lp.id] || 0
      }))
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch user learning paths';
    console.error('Error fetching user learning paths:', err);
    return res.status(500).json({ error: message });
  }
}
