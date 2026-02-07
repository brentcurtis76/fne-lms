import { NextApiRequest, NextApiResponse } from 'next';
import { getApiUser, createApiSupabaseClient, sendAuthError, handleMethodNotAllowed } from '@/lib/api-auth';
import type { SaveTransversalContextRequest } from '@/types/assessment-builder';

// Check if user has directivo permission for a specific school
async function hasDirectivoPermission(
  supabaseClient: any,
  userId: string,
  schoolId?: number
): Promise<{ hasPermission: boolean; schoolId: number | null; isAdmin: boolean }> {
  // Check for admin/consultor first
  const { data: roles } = await supabaseClient
    .from('user_roles')
    .select('role_type, school_id')
    .eq('user_id', userId)
    .eq('is_active', true);

  if (!roles || roles.length === 0) {
    return { hasPermission: false, schoolId: null, isAdmin: false };
  }

  const isActualAdmin = roles.some((r: any) => r.role_type === 'admin');

  if (isActualAdmin) {
    // Admin can access any school, but needs a school_id to be specified
    return { hasPermission: true, schoolId: schoolId || null, isAdmin: true };
  }

  // Consultor: must validate against consultant_assignments
  const isConsultor = roles.some((r: any) => r.role_type === 'consultor');
  if (isConsultor) {
    const { data: assignments } = await supabaseClient
      .from('consultant_assignments')
      .select('school_id')
      .eq('user_id', userId)
      .eq('is_active', true);

    if (!assignments || assignments.length === 0) {
      return { hasPermission: false, schoolId: null, isAdmin: false };
    }

    const assignedSchoolIds = assignments.map((a: any) => a.school_id);

    if (schoolId && !assignedSchoolIds.includes(schoolId)) {
      return { hasPermission: false, schoolId: null, isAdmin: false };
    }

    return { hasPermission: true, schoolId: schoolId || assignments[0].school_id, isAdmin: false };
  }

  // Check for directivo role
  const directivoRole = roles.find((r: any) => r.role_type === 'equipo_directivo');
  if (directivoRole) {
    // If schoolId is specified, verify it matches
    if (schoolId && directivoRole.school_id !== schoolId) {
      return { hasPermission: false, schoolId: null, isAdmin: false };
    }
    return { hasPermission: true, schoolId: directivoRole.school_id, isAdmin: false };
  }

  return { hasPermission: false, schoolId: null, isAdmin: false };
}

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
      return handlePost(req, res, supabaseClient, effectiveSchoolId!);
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
        course_letter,
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
      .order('course_letter', { ascending: true });

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
  schoolId: number
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

    // Check if context already exists
    const { data: existingContext } = await supabaseClient
      .from('school_transversal_context')
      .select('id')
      .eq('school_id', schoolId)
      .maybeSingle();

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

    // Generate course structure based on grade levels and courses per level
    let coursesGenerated = 0;
    let warning = null;

    try {
      // Delete existing course structure for this school
      await supabaseClient
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
            grade_level: gradeLevel,
            course_name: `${gradeLevel.replace(/_/g, ' ')} ${courseLetters[i]}`.toUpperCase(),
            course_letter: courseLetters[i],
          });
        }
      }

      if (coursesToInsert.length > 0) {
        const { error: courseInsertError } = await supabaseClient
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
