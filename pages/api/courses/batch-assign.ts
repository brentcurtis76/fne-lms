import { NextApiRequest, NextApiResponse } from 'next';
import { getApiUser, createApiSupabaseClient, sendAuthError, handleMethodNotAllowed } from '../../../lib/api-auth';
import NotificationService from '../../../lib/notificationService';
import { logBatchAssignmentAudit, createCourseAssignmentAuditEntries } from '../../../lib/auditLog';

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
  // Only allow POST method
  if (req.method !== 'POST') {
    return handleMethodNotAllowed(res, ['POST']);
  }

  // Authenticate user using the standard api-auth pattern
  const { user, error } = await getApiUser(req, res);

  if (error || !user) {
    return sendAuthError(res, 'Authentication required');
  }

  const assignedBy = user.id;

  // Create authenticated Supabase client
  const supabaseClient = await createApiSupabaseClient(req, res);

  try {
    // Check if user has permission to assign courses
    const hasPermission = await hasAssignPermission(supabaseClient, assignedBy);

    if (!hasPermission) {
      return res.status(403).json({
        error: 'No tienes permiso para asignar cursos'
      });
    }

    const { courseId, userIds } = req.body;

    // Validate required fields
    if (!courseId) {
      return res.status(400).json({ error: 'courseId es requerido' });
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

    // Execute batch assignment using atomic database function
    // NOTE: Database function now derives caller ID from auth.uid() for security
    // No need to pass assignedBy - prevents privilege escalation
    const { data: result, error: dbError } = await supabaseClient
      .rpc('batch_assign_courses', {
        p_course_id: courseId,
        p_user_ids: userIds
      });

    if (dbError) {
      console.error('Database function error:', dbError);
      throw new Error(dbError.message || 'Error al asignar curso');
    }

    // Trigger course assignment notifications for successfully assigned users
    if (result && result.assignments_created > 0) {
      try {
        // Get the newly assigned user IDs (excluding those that were skipped)
        const { data: newAssignments } = await supabaseClient
          .from('course_assignments')
          .select('teacher_id')
          .eq('course_id', courseId)
          .in('teacher_id', userIds);

        const assignedUserIds = newAssignments?.map((a: any) => a.teacher_id) || [];

        if (assignedUserIds.length > 0) {
          await NotificationService.triggerNotification('course_assigned', {
            course: {
              id: courseId,
              name: course.title
            },
            assigned_users: assignedUserIds,
            assigned_by: assignedBy
          });
          console.log(`✅ Course assignment notifications triggered for ${assignedUserIds.length} user(s)`);

          // Log to audit trail (non-blocking)
          const auditEntries = createCourseAssignmentAuditEntries(
            'assigned',
            courseId,
            assignedUserIds,
            assignedBy,
            assignedUserIds.length
          );
          logBatchAssignmentAudit(supabaseClient, auditEntries);
        }
      } catch (notificationError) {
        console.error('❌ Failed to trigger course assignment notifications:', notificationError);
        // Don't fail the API call if notifications fail
      }
    }

    // Return detailed success response
    return res.status(201).json({
      success: true,
      courseName: course.title,
      assignments_created: result.assignments_created,
      assignments_skipped: result.assignments_skipped,
      enrollments_created: result.enrollments_created,
      message: result.message
    });

  } catch (error: any) {
    console.error('Batch assignment error:', error);

    return res.status(500).json({
      error: error.message || 'Error al asignar curso en lote'
    });
  }
}
