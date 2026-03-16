import { NextApiRequest, NextApiResponse } from 'next';
import { getApiUser, createApiSupabaseClient, createServiceRoleClient, sendAuthError, handleMethodNotAllowed } from '@/lib/api-auth';
import { hasDirectivoPermission } from '@/lib/permissions/directivo';
import type { SaveTransversalContextRequest } from '@/types/assessment-builder';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Authentication check
  const { user, error: authError } = await getApiUser(req, res);
  if (authError || !user) {
    return sendAuthError(res, 'Autenticación requerida');
  }

  const supabaseClient = await createApiSupabaseClient(req, res);

  // Get school_id from query for GET, or from body for POST
  const querySchoolId = req.query.school_id ? parseInt(req.query.school_id as string) : undefined;
  const bodySchoolId = req.body?.school_id ? parseInt(req.body.school_id) : undefined;
  const requestedSchoolId = req.method === 'GET' ? querySchoolId : bodySchoolId;

  // Permission check
  const { hasPermission, schoolId, isAdmin } = await hasDirectivoPermission(
    supabaseClient,
    user.id,
    requestedSchoolId
  );

  if (!hasPermission) {
    return res.status(403).json({
      error: 'Solo directivos y administradores pueden acceder al contexto transversal'
    });
  }

  // For non-admin users, we must have a school_id
  if (!isAdmin && !schoolId) {
    return res.status(400).json({
      error: 'No se encontró escuela asociada al usuario'
    });
  }

  // For admin, require school_id in request
  if (isAdmin && !requestedSchoolId) {
    return res.status(400).json({
      error: 'Se requiere school_id para administradores'
    });
  }

  const effectiveSchoolId = isAdmin ? requestedSchoolId : schoolId;

  switch (req.method) {
    case 'GET':
      return handleGet(req, res, supabaseClient, effectiveSchoolId!);
    case 'POST':
      return handlePost(req, res, supabaseClient, effectiveSchoolId!, user.id);
    default:
      return handleMethodNotAllowed(res, ['GET', 'POST']);
  }
}

// GET /api/school/transversal-context
async function handleGet(
  req: NextApiRequest,
  res: NextApiResponse,
  supabaseClient: any,
  schoolId: number
) {
  try {
    // Fetch existing transversal context
    const { data: context, error: contextError } = await supabaseClient
      .from('school_transversal_context')
      .select('*')
      .eq('school_id', schoolId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (contextError) {
      console.error('Error fetching transversal context:', contextError);
      return res.status(500).json({ error: 'Error al obtener el contexto transversal' });
    }

    // Fetch course structure for this school
    const { data: courseStructure, error: courseError } = await supabaseClient
      .from('school_course_structure')
      .select(`
        id,
        school_id,
        grade_level,
        course_name,
        created_at,
        school_course_docente_assignments (
          id,
          docente_id,
          is_active,
          created_at,
          profiles:docente_id (
            id,
            full_name,
            email
          )
        )
      `)
      .eq('school_id', schoolId)
      .order('grade_level', { ascending: true })
      .order('course_name', { ascending: true });

    if (courseError) {
      console.error('Error fetching course structure:', courseError);
      // Don't fail the whole request, just return empty array
    }

    return res.status(200).json({
      success: true,
      context: context || null,
      courseStructure: courseStructure || [],
    });
  } catch (err: any) {
    console.error('Unexpected error fetching transversal context:', err);
    return res.status(500).json({ error: err.message || 'Error al obtener contexto transversal' });
  }
}

// POST /api/school/transversal-context
async function handlePost(
  req: NextApiRequest,
  res: NextApiResponse,
  supabaseClient: any,
  schoolId: number,
  userId: string
) {
  try {
    const body = req.body as SaveTransversalContextRequest;

    // Validate required fields
    if (!body.total_students || body.total_students < 1) {
      return res.status(400).json({ error: 'Se requiere el número total de estudiantes' });
    }

    if (!body.grade_levels || body.grade_levels.length === 0) {
      return res.status(400).json({ error: 'Se requiere al menos un nivel educativo' });
    }

    if (!body.implementation_year_2026 || body.implementation_year_2026 < 1 || body.implementation_year_2026 > 5) {
      return res.status(400).json({ error: 'Se requiere un año de implementación válido (1-5)' });
    }

    if (!body.period_system || !['semestral', 'trimestral'].includes(body.period_system)) {
      return res.status(400).json({ error: 'Se requiere un sistema de períodos válido' });
    }

    // Fetch previous state for change history
    const { data: previousContext } = await supabaseClient
      .from('school_transversal_context')
      .select('*')
      .eq('school_id', schoolId)
      .maybeSingle();

    // Check if context already exists (use previous fetch)
    const existingContext = previousContext ? { id: previousContext.id } : null;

    const contextData = {
      school_id: schoolId,
      total_students: body.total_students,
      grade_levels: body.grade_levels,
      courses_per_level: body.courses_per_level || {},
      implementation_year_2026: body.implementation_year_2026,
      period_system: body.period_system,
      programa_inicia_completed: body.programa_inicia_completed || false,
      programa_inicia_hours: body.programa_inicia_hours || null,
      programa_inicia_year: body.programa_inicia_year || null,
      updated_at: new Date().toISOString(),
    };

    let savedContext;
    if (existingContext) {
      // Update existing
      const { data, error } = await supabaseClient
        .from('school_transversal_context')
        .update(contextData)
        .eq('id', existingContext.id)
        .select()
        .single();

      if (error) {
        console.error('Error updating transversal context:', error);
        return res.status(500).json({ error: 'Error al actualizar el contexto transversal' });
      }
      savedContext = data;
    } else {
      // Insert new
      const { data, error } = await supabaseClient
        .from('school_transversal_context')
        .insert({
          ...contextData,
          created_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) {
        console.error('Error inserting transversal context:', error);
        return res.status(500).json({ error: 'Error al guardar el contexto transversal' });
      }
      savedContext = data;
    }

    // Log change history and update completion status
    try {
      const serviceClient = createServiceRoleClient();
      const { data: profile } = await serviceClient.from('profiles').select('full_name').eq('id', userId).single();

      const DIFF_IGNORE_FIELDS = new Set(['school_id', 'updated_at', 'created_at', 'id', 'is_completed', 'completed_at', 'completed_by']);
      const changedFields = Object.keys(contextData)
        .filter(key => !DIFF_IGNORE_FIELDS.has(key))
        .filter(key =>
          JSON.stringify(previousContext?.[key]) !== JSON.stringify(savedContext[key])
        );

      if (changedFields.length > 0 || !previousContext) {
        await serviceClient.from('school_change_history').insert({
          school_id: schoolId,
          feature: 'transversal_context',
          action: previousContext ? 'update' : 'initial_save',
          previous_state: previousContext || null,
          new_state: savedContext,
          changed_fields: changedFields,
          user_id: userId,
          user_name: profile?.full_name || 'Unknown',
        });
      }

      const isComplete = !!(savedContext.total_students && savedContext.grade_levels?.length > 0 && savedContext.implementation_year_2026 && savedContext.period_system);
      const completionUpdate: Record<string, any> = {
        is_completed: isComplete,
      };
      if (isComplete) {
        // Always update to reflect the latest completion
        completionUpdate.completed_at = new Date().toISOString();
        completionUpdate.completed_by = userId;
      } else {
        // Clear completion fields when no longer complete
        completionUpdate.completed_at = null;
        completionUpdate.completed_by = null;
      }
      await serviceClient.from('school_transversal_context').update(completionUpdate).eq('id', savedContext.id);
    } catch (historyErr) {
      console.error('Error logging change history:', historyErr);
    }

    // Generate course structure based on grade levels and courses per level
    let coursesGenerated = 0;
    let warning = null;

    try {
      const serviceClient = createServiceRoleClient();
      // Delete existing course structure for this school
      await serviceClient
        .from('school_course_structure')
        .delete()
        .eq('school_id', schoolId);

      // Generate new course structure
      const courseLetters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
      const coursesToInsert = [];

      for (const gradeLevel of body.grade_levels) {
        const numCourses = body.courses_per_level?.[gradeLevel] || 1;
        for (let i = 0; i < numCourses; i++) {
          coursesToInsert.push({
            school_id: schoolId,
            context_id: savedContext.id,
            grade_level: gradeLevel,
            course_name: `${gradeLevel.replace(/_/g, ' ')} ${courseLetters[i]}`.toUpperCase(),
          });
        }
      }

      if (coursesToInsert.length > 0) {
        const { error: courseInsertError } = await serviceClient
          .from('school_course_structure')
          .insert(coursesToInsert);

        if (courseInsertError) {
          console.error('Error generating course structure:', courseInsertError);
          warning = 'El contexto se guardó pero hubo un error al generar los cursos';
        } else {
          coursesGenerated = coursesToInsert.length;
        }
      }
    } catch (courseErr) {
      console.error('Error in course generation:', courseErr);
      warning = 'El contexto se guardó pero hubo un error al generar los cursos';
    }

    return res.status(200).json({
      success: true,
      context: savedContext,
      message: existingContext ? 'Contexto actualizado exitosamente' : 'Contexto guardado exitosamente',
      coursesGenerated,
      warning,
    });
  } catch (err: any) {
    console.error('Unexpected error saving transversal context:', err);
    return res.status(500).json({ error: err.message || 'Error al guardar contexto transversal' });
  }
}
