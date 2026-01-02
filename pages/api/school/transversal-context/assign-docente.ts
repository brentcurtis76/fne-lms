import { NextApiRequest, NextApiResponse } from 'next';
import { getApiUser, createApiSupabaseClient, sendAuthError, handleMethodNotAllowed } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { triggerAutoAssignment } from '@/lib/services/assessment-builder/autoAssignmentService';

// Check if user has directivo permission for a specific school
// Uses admin client to bypass RLS
async function hasDirectivoPermission(
  userId: string,
  schoolId: number
): Promise<boolean> {
  const { data: roles } = await supabaseAdmin
    .from('user_roles')
    .select('role_type, school_id')
    .eq('user_id', userId)
    .eq('is_active', true);

  if (!roles || roles.length === 0) return false;

  // Admin/consultor can manage any school
  if (roles.some((r: any) => ['admin', 'consultor'].includes(r.role_type))) {
    return true;
  }

  // Directivo can only manage their own school
  return roles.some((r: any) => r.role_type === 'equipo_directivo' && r.school_id === schoolId);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST' && req.method !== 'DELETE') {
    return handleMethodNotAllowed(res, ['POST', 'DELETE']);
  }

  // Authentication check
  const { user, error: authError } = await getApiUser(req, res);
  if (authError || !user) {
    return sendAuthError(res, 'Autenticación requerida');
  }

  const supabaseClient = await createApiSupabaseClient(req, res);

  const { course_structure_id, docente_id } = req.body;

  if (!course_structure_id || !docente_id) {
    return res.status(400).json({
      error: 'course_structure_id y docente_id son requeridos'
    });
  }

  // Get course structure to verify school ownership
  const { data: courseStructure, error: courseError } = await supabaseClient
    .from('school_course_structure')
    .select('id, school_id, grade_level, course_name, context_id')
    .eq('id', course_structure_id)
    .single();

  if (courseError || !courseStructure) {
    return res.status(404).json({ error: 'Curso no encontrado' });
  }

  // Permission check (uses admin client to bypass RLS)
  const hasPermission = await hasDirectivoPermission(
    user.id,
    courseStructure.school_id
  );

  if (!hasPermission) {
    return res.status(403).json({
      error: 'No tienes permiso para asignar docentes a este curso'
    });
  }

  // Verify docente exists and has docente role (uses admin client to bypass RLS)
  const { data: docenteRoles, error: docenteError } = await supabaseAdmin
    .from('user_roles')
    .select('id, role_type')
    .eq('user_id', docente_id)
    .eq('is_active', true);

  if (docenteError) {
    console.error('Error checking docente roles:', docenteError);
    return res.status(500).json({ error: 'Error verificando docente' });
  }

  const isDocente = docenteRoles?.some((r: any) => r.role_type === 'docente');
  if (!isDocente) {
    return res.status(400).json({
      error: 'El usuario seleccionado no tiene rol de docente'
    });
  }

  if (req.method === 'POST') {
    return handleAssign(req, res, supabaseClient, courseStructure, docente_id, user.id);
  } else {
    return handleUnassign(req, res, supabaseClient, course_structure_id, docente_id);
  }
}

// POST - Assign docente to course
async function handleAssign(
  req: NextApiRequest,
  res: NextApiResponse,
  supabaseClient: any,
  courseStructure: any,
  docenteId: string,
  assignedBy: string
) {
  try {
    // Check if assignment already exists
    const { data: existingAssignment } = await supabaseClient
      .from('school_course_docente_assignments')
      .select('id, is_active')
      .eq('course_structure_id', courseStructure.id)
      .eq('docente_id', docenteId)
      .single();

    let assignment;

    if (existingAssignment) {
      if (existingAssignment.is_active) {
        return res.status(400).json({
          error: 'El docente ya está asignado a este curso'
        });
      }

      // Reactivate existing assignment
      const { data, error } = await supabaseClient
        .from('school_course_docente_assignments')
        .update({
          is_active: true,
          assigned_by: assignedBy,
          assigned_at: new Date().toISOString(),
        })
        .eq('id', existingAssignment.id)
        .select()
        .single();

      if (error) throw error;
      assignment = data;
    } else {
      // Create new assignment
      const { data, error } = await supabaseClient
        .from('school_course_docente_assignments')
        .insert({
          course_structure_id: courseStructure.id,
          docente_id: docenteId,
          assigned_by: assignedBy,
          is_active: true,
        })
        .select()
        .single();

      if (error) throw error;
      assignment = data;
    }

    // Trigger auto-assignment of assessment instances
    const autoAssignResult = await triggerAutoAssignment(
      supabaseClient,
      docenteId,
      courseStructure.id,
      courseStructure.school_id,
      assignedBy
    );

    return res.status(200).json({
      success: true,
      assignment,
      autoAssignment: autoAssignResult,
      message: 'Docente asignado correctamente',
    });
  } catch (err: any) {
    console.error('Error assigning docente:', err);
    return res.status(500).json({ error: err.message || 'Error al asignar docente' });
  }
}

// DELETE - Unassign docente from course
async function handleUnassign(
  req: NextApiRequest,
  res: NextApiResponse,
  supabaseClient: any,
  courseStructureId: string,
  docenteId: string
) {
  try {
    // Soft delete - just deactivate
    const { error } = await supabaseClient
      .from('school_course_docente_assignments')
      .update({ is_active: false })
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
    console.error('Error unassigning docente:', err);
    return res.status(500).json({ error: err.message || 'Error al desasignar docente' });
  }
}
