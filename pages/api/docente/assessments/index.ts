import { NextApiRequest, NextApiResponse } from 'next';
import { getApiUser, createApiSupabaseClient, sendAuthError, handleMethodNotAllowed } from '@/lib/api-auth';

/**
 * GET /api/docente/assessments
 *
 * Returns all assessment instances assigned to the current docente user.
 * Includes template snapshot info for display (name, area, status).
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return handleMethodNotAllowed(res, ['GET']);
  }

  // Authentication check
  const { user, error: authError } = await getApiUser(req, res);
  if (authError || !user) {
    return sendAuthError(res, 'Autenticación requerida');
  }

  const supabaseClient = await createApiSupabaseClient(req, res);

  try {
    // Query parameters for filtering
    const statusFilter = req.query.status as string | undefined;

    // Get all instances where this user is an assignee
    let query = supabaseClient
      .from('assessment_instance_assignees')
      .select(`
        id,
        instance_id,
        can_edit,
        can_submit,
        has_started,
        has_submitted,
        assigned_at,
        assessment_instances:instance_id (
          id,
          template_snapshot_id,
          school_id,
          course_structure_id,
          transformation_year,
          status,
          started_at,
          completed_at,
          created_at,
          assessment_template_snapshots:template_snapshot_id (
            id,
            template_id,
            version,
            snapshot_data
          ),
          school_course_structure:course_structure_id (
            grade_level,
            course_name
          )
        )
      `)
      .eq('user_id', user.id);

    const { data: assignees, error } = await query;

    if (error) {
      console.error('Error fetching assessments:', error);
      return res.status(500).json({ error: 'Error al obtener las evaluaciones' });
    }

    // Transform data for frontend consumption
    const assessments = (assignees || [])
      .map((assignee: any) => {
        const instance = assignee.assessment_instances;
        if (!instance) return null;

        const snapshot = instance.assessment_template_snapshots;
        const snapshotData = snapshot?.snapshot_data;
        const templateInfo = snapshotData?.template || {};

        return {
          id: instance.id,
          assigneeId: assignee.id,
          templateId: snapshot?.template_id,
          templateName: templateInfo.name || 'Sin título',
          templateArea: templateInfo.area || 'personalizacion',
          templateVersion: snapshot?.version || '1.0.0',
          transformationYear: instance.transformation_year,
          status: instance.status,
          courseName: instance.school_course_structure?.course_name,
          gradeLevel: instance.school_course_structure?.grade_level,
          canEdit: assignee.can_edit,
          canSubmit: assignee.can_submit,
          hasStarted: assignee.has_started,
          hasSubmitted: assignee.has_submitted,
          assignedAt: assignee.assigned_at,
          startedAt: instance.started_at,
          completedAt: instance.completed_at,
          createdAt: instance.created_at,
        };
      })
      .filter(Boolean)
      .filter((assessment: any) => {
        // Apply status filter if provided
        if (statusFilter) {
          return assessment.status === statusFilter;
        }
        return true;
      });

    // Sort by status (pending first, then in_progress, then completed)
    const statusOrder: Record<string, number> = {
      pending: 0,
      in_progress: 1,
      completed: 2,
      archived: 3,
    };

    assessments.sort((a: any, b: any) => {
      const orderDiff = statusOrder[a.status] - statusOrder[b.status];
      if (orderDiff !== 0) return orderDiff;
      // Secondary sort by assigned date (newest first)
      return new Date(b.assignedAt).getTime() - new Date(a.assignedAt).getTime();
    });

    return res.status(200).json({
      success: true,
      assessments,
      total: assessments.length,
    });
  } catch (err: any) {
    console.error('Unexpected error fetching assessments:', err);
    return res.status(500).json({ error: err.message || 'Error al obtener evaluaciones' });
  }
}
