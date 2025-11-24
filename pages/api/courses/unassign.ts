import { NextApiRequest, NextApiResponse } from 'next';
import { getApiUser, createApiSupabaseClient, sendAuthError, handleMethodNotAllowed } from '../../../lib/api-auth';

interface UnassignRequest {
  courseId: string;
  userIds: string[];
}

// Check if user has permission to assign courses
async function hasAssignPermission(supabaseClient: any, userId: string): Promise<boolean> {
  const { data: roles } = await supabaseClient
    .from('user_roles')
    .select('role_type')
    .eq('user_id', userId)
    .eq('is_active', true);

  if (!roles || roles.length === 0) return false;

  const userRoles = roles.map((r: any) => r.role_type);
  return userRoles.includes('admin') || userRoles.includes('consultor');
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Only allow DELETE method
  if (req.method !== 'DELETE') {
    return handleMethodNotAllowed(res, ['DELETE']);
  }

  // Authenticate user
  const { user, error } = await getApiUser(req, res);

  if (error || !user) {
    return sendAuthError(res, 'Authentication required');
  }

  // Create authenticated Supabase client
  const supabaseClient = await createApiSupabaseClient(req, res);

  try {
    // Check if user has permission to assign courses
    const hasPermission = await hasAssignPermission(supabaseClient, user.id);

    if (!hasPermission) {
      return res.status(403).json({
        error: 'No tienes permiso para desasignar cursos'
      });
    }

    // Validate request body
    const { courseId, userIds } = req.body as UnassignRequest;

    if (!courseId) {
      return res.status(400).json({
        error: 'courseId es requerido'
      });
    }

    // Validate that at least one user is provided
    const hasUsers = Array.isArray(userIds) && userIds.length > 0;

    if (!hasUsers) {
      return res.status(400).json({
        error: 'Al menos un userId debe ser proporcionado'
      });
    }

    // Verify the course exists
    const { data: course } = await supabaseClient
      .from('courses')
      .select('id, title')
      .eq('id', courseId)
      .single();

    if (!course) {
      return res.status(404).json({ error: 'Curso no encontrado' });
    }

    // Execute batch unassignment using atomic database function
    // NOTE: Database function now derives caller ID from auth.uid() for security
    // Ensures both assignment deletion and enrollment update happen atomically
    const { data: result, error: dbError } = await supabaseClient
      .rpc('batch_unassign_courses', {
        p_course_id: courseId,
        p_user_ids: userIds
      });

    if (dbError) {
      console.error('Database function error:', dbError);
      throw new Error(dbError.message || 'Error al desasignar curso');
    }

    // Return success response
    return res.status(200).json({
      success: true,
      courseName: course.title,
      unassigned_count: result.unassigned_count,
      message: `Curso desasignado exitosamente de ${result.unassigned_count} usuario(s)`
    });

  } catch (error: any) {
    console.error('Unassign error:', error);

    return res.status(500).json({
      error: error.message || 'Error al desasignar curso'
    });
  }
}
