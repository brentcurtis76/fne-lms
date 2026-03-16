import { NextApiRequest, NextApiResponse } from 'next';
import { getApiUser, createApiSupabaseClient, createServiceRoleClient, sendAuthError, handleMethodNotAllowed } from '@/lib/api-auth';
import { hasDirectivoPermission } from '@/lib/permissions/directivo';
import { triggerAutoAssignment } from '@/lib/services/assessment-builder/autoAssignmentService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!['POST', 'DELETE'].includes(req.method || '')) {
    return handleMethodNotAllowed(res, ['POST', 'DELETE']);
  }

  // Authentication check
  const { user, error: authError } = await getApiUser(req, res);
  if (authError || !user) {
    return sendAuthError(res, 'Autenticación requerida');
  }

  const supabaseClient = await createApiSupabaseClient(req, res);
  const serviceClient = createServiceRoleClient();

  // Permission check
  const { hasPermission, schoolId, isAdmin } = await hasDirectivoPermission(
    serviceClient,
    user.id
  );

  if (!hasPermission) {
    return res.status(403).json({
      error: 'Solo directivos y administradores pueden asignar docentes'
    });
  }

  const { course_structure_id, docente_id } = req.body;

  if (!course_structure_id || !docente_id) {
    return res.status(400).json({ error: 'Se requiere course_structure_id y docente_id' });
  }

  // Get course structure to verify school ownership
  const { data: course, error: courseError } = await supabaseClient
    .from('school_course_structure')
    .select('id, school_id')
    .eq('id', course_structure_id)
    .single();

  if (courseError || !course) {
    return res.status(404).json({ error: 'Curso no encontrado' });
  }

  // Verify school access for non-admins
  if (!isAdmin && course.school_id !== schoolId) {
    return res.status(403).json({ error: 'No tiene permiso para este curso' });
  }

  const effectiveSchoolId = course.school_id;

  if (req.method === 'POST') {
    return handlePost(res, supabaseClient, course_structure_id, docente_id, effectiveSchoolId, user.id);
  } else if (req.method === 'DELETE') {
    return handleDelete(res, supabaseClient, course_structure_id, docente_id);
  }
}

// POST - Assign docente to course
async function handlePost(
  res: NextApiResponse,
  supabaseClient: any,
  courseStructureId: string,
  docenteId: string,
  schoolId: number,
  assignedBy: string
) {
  try {
    // Check if assignment already exists
    const { data: existing } = await supabaseClient
      .from('school_course_docente_assignments')
      .select('id, is_active')
      .eq('course_structure_id', courseStructureId)
      .eq('docente_id', docenteId)
      .maybeSingle();

    if (existing) {
      if (existing.is_active) {
        return res.status(400).json({ error: 'El docente ya está asignado a este curso' });
      }

      // Reactivate existing assignment
      const { error: updateError } = await supabaseClient
        .from('school_course_docente_assignments')
        .update({ is_active: true, updated_at: new Date().toISOString() })
        .eq('id', existing.id);

      if (updateError) {
        console.error('Error reactivating assignment:', updateError);
        return res.status(500).json({ error: 'Error al asignar docente' });
      }
    } else {
      // Create new assignment
      const { error: insertError } = await supabaseClient
        .from('school_course_docente_assignments')
        .insert({
          course_structure_id: courseStructureId,
          docente_id: docenteId,
          is_active: true,
        });

      if (insertError) {
        console.error('Error creating assignment:', insertError);
        return res.status(500).json({ error: 'Error al asignar docente' });
      }
    }

    // Auto-create assessment instances using the proper service
    let autoAssignment = { instancesCreated: 0, instancesSkipped: 0 };
    try {
      const result = await triggerAutoAssignment(
        null, // supabase param unused — service uses supabaseAdmin internally
        docenteId,
        courseStructureId,
        schoolId,
        assignedBy
      );
      autoAssignment.instancesCreated = result.instancesCreated;
      autoAssignment.instancesSkipped = result.instancesSkipped;

      if (result.errors.length > 0) {
        console.error('Auto-assignment errors:', result.errors);
      }
      if (result.warnings.length > 0) {
        console.warn('Auto-assignment warnings:', result.warnings);
      }
    } catch (autoErr) {
      console.error('Error in auto-assignment:', autoErr);
      // Don't fail the main operation
    }

    return res.status(200).json({
      success: true,
      message: 'Docente asignado correctamente',
      autoAssignment,
    });
  } catch (err: any) {
    console.error('Unexpected error assigning docente:', err);
    return res.status(500).json({ error: err.message || 'Error al asignar docente' });
  }
}

// DELETE - Unassign docente from course
async function handleDelete(
  res: NextApiResponse,
  supabaseClient: any,
  courseStructureId: string,
  docenteId: string
) {
  try {
    const { error } = await supabaseClient
      .from('school_course_docente_assignments')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('course_structure_id', courseStructureId)
      .eq('docente_id', docenteId);

    if (error) {
      console.error('Error unassigning docente:', error);
      return res.status(500).json({ error: 'Error al desasignar docente' });
    }

    return res.status(200).json({
      success: true,
      message: 'Docente desasignado correctamente',
    });
  } catch (err: any) {
    console.error('Unexpected error unassigning docente:', err);
    return res.status(500).json({ error: err.message || 'Error al desasignar docente' });
  }
}
