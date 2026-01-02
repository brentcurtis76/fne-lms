import { NextApiRequest, NextApiResponse } from 'next';
import { getApiUser, createApiSupabaseClient, sendAuthError, handleMethodNotAllowed } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import type { GradeLevel, PeriodSystem, SaveTransversalContextRequest } from '@/types/assessment-builder';

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

  const isAdmin = roles.some((r: any) => ['admin', 'consultor'].includes(r.role_type));

  if (isAdmin) {
    // Admin can access any school, but needs a school_id to be specified
    return { hasPermission: true, schoolId: schoolId || null, isAdmin: true };
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

// Validate transversal context data
function validateContextData(data: SaveTransversalContextRequest): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Required fields
  if (typeof data.total_students !== 'number' || data.total_students < 1) {
    errors.push('total_students debe ser un número mayor a 0');
  }

  if (!data.grade_levels || !Array.isArray(data.grade_levels) || data.grade_levels.length === 0) {
    errors.push('grade_levels es requerido y debe contener al menos un nivel');
  }

  if (!data.courses_per_level || typeof data.courses_per_level !== 'object') {
    errors.push('courses_per_level es requerido');
  }

  if (typeof data.implementation_year_2026 !== 'number' ||
      data.implementation_year_2026 < 1 ||
      data.implementation_year_2026 > 5) {
    errors.push('implementation_year_2026 debe ser un número entre 1 y 5');
  }

  if (!data.period_system || !['semestral', 'trimestral'].includes(data.period_system)) {
    errors.push('period_system debe ser "semestral" o "trimestral"');
  }

  if (typeof data.programa_inicia_completed !== 'boolean') {
    errors.push('programa_inicia_completed es requerido');
  }

  return { valid: errors.length === 0, errors };
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
    const { data: context, error } = await supabaseClient
      .from('school_transversal_context')
      .select('*')
      .eq('school_id', schoolId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') {
      // PGRST116 is "no rows returned" - that's fine for new schools
      console.error('Error fetching transversal context:', error);
      return res.status(500).json({ error: 'Error al obtener el contexto' });
    }

    // Fetch course structure for this school (regardless of context_id)
    // A school should only have one active set of courses
    let courseStructure: any[] = [];
    console.log(`[API] Fetching courses for school_id=${schoolId}`);

    // First, get the course structure
    const { data: courses, error: coursesError } = await supabaseClient
      .from('school_course_structure')
      .select(`
        id,
        grade_level,
        course_name,
        context_id,
        created_at
      `)
      .eq('school_id', schoolId)
      .order('grade_level')
      .order('course_name');

    if (coursesError) {
      console.error('[API] Error fetching course structure:', coursesError);
    } else {
      courseStructure = courses || [];
      console.log(`[API] Found ${courseStructure.length} courses for school ${schoolId}`);

      // If we have courses, fetch docente assignments separately
      if (courseStructure.length > 0) {
        const courseIds = courseStructure.map((c: any) => c.id);

        const { data: assignments, error: assignError } = await supabaseClient
          .from('school_course_docente_assignments')
          .select('id, course_structure_id, docente_id, is_active, assigned_at')
          .in('course_structure_id', courseIds);

        if (assignError) {
          console.error('[API] Error fetching assignments:', assignError);
        } else if (assignments && assignments.length > 0) {
          // Get unique docente IDs
          const docenteIds = [...new Set(assignments.map((a: any) => a.docente_id))];

          // Fetch profile info for docentes (use admin client to bypass RLS)
          const { data: profiles } = await supabaseAdmin
            .from('profiles')
            .select('id, first_name, last_name, email')
            .in('id', docenteIds);

          // Map profiles with constructed full_name
          const profileMap = new Map((profiles || []).map((p: any) => [p.id, {
            id: p.id,
            full_name: [p.first_name, p.last_name].filter(Boolean).join(' ') || p.email,
            email: p.email,
          }]));

          // Attach assignments with profile info to courses
          const assignmentsByCourse = new Map<string, any[]>();
          for (const assignment of assignments) {
            const profile = profileMap.get(assignment.docente_id);
            const enrichedAssignment = {
              ...assignment,
              profiles: profile || null,
            };
            if (!assignmentsByCourse.has(assignment.course_structure_id)) {
              assignmentsByCourse.set(assignment.course_structure_id, []);
            }
            assignmentsByCourse.get(assignment.course_structure_id)!.push(enrichedAssignment);
          }

          // Add assignments to each course
          courseStructure = courseStructure.map((course: any) => ({
            ...course,
            school_course_docente_assignments: assignmentsByCourse.get(course.id) || [],
          }));
        } else {
          // No assignments, add empty arrays
          courseStructure = courseStructure.map((course: any) => ({
            ...course,
            school_course_docente_assignments: [],
          }));
        }
      }
    }

    return res.status(200).json({
      success: true,
      context: context || null,
      courseStructure,
      hasContext: !!context,
    });
  } catch (err: any) {
    console.error('Unexpected error fetching context:', err);
    return res.status(500).json({ error: err.message || 'Error al obtener contexto' });
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

    // Validate input
    const validation = validateContextData(body);
    if (!validation.valid) {
      return res.status(400).json({
        error: 'Datos inválidos',
        details: validation.errors
      });
    }

    // Check if context already exists for this school
    const { data: existingContext } = await supabaseClient
      .from('school_transversal_context')
      .select('id')
      .eq('school_id', schoolId)
      .single();

    let contextResult;

    if (existingContext) {
      // Update existing context
      const { data, error } = await supabaseClient
        .from('school_transversal_context')
        .update({
          total_students: body.total_students,
          grade_levels: body.grade_levels,
          courses_per_level: body.courses_per_level,
          implementation_year_2026: body.implementation_year_2026,
          period_system: body.period_system,
          programa_inicia_completed: body.programa_inicia_completed,
          programa_inicia_hours: body.programa_inicia_hours,
          programa_inicia_year: body.programa_inicia_year,
          // Optional fields for later phases
          subjects_per_level: body.subjects_per_level,
          generacion_tractor_history: body.generacion_tractor_history,
          generacion_innova_history: body.generacion_innova_history,
          completed_by: userId,
          completed_at: new Date().toISOString(),
        })
        .eq('id', existingContext.id)
        .select()
        .single();

      if (error) {
        console.error('Error updating transversal context:', error);
        return res.status(500).json({ error: 'Error al actualizar el contexto' });
      }
      contextResult = data;
    } else {
      // Create new context
      const { data, error } = await supabaseClient
        .from('school_transversal_context')
        .insert({
          school_id: schoolId,
          total_students: body.total_students,
          grade_levels: body.grade_levels,
          courses_per_level: body.courses_per_level,
          implementation_year_2026: body.implementation_year_2026,
          period_system: body.period_system,
          programa_inicia_completed: body.programa_inicia_completed,
          programa_inicia_hours: body.programa_inicia_hours,
          programa_inicia_year: body.programa_inicia_year,
          subjects_per_level: body.subjects_per_level,
          generacion_tractor_history: body.generacion_tractor_history,
          generacion_innova_history: body.generacion_innova_history,
          completed_by: userId,
          completed_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating transversal context:', error);
        return res.status(500).json({ error: 'Error al crear el contexto' });
      }
      contextResult = data;
    }

    // Generate course structure based on grade_levels and courses_per_level
    let generatedCourses: any[] = [];
    try {
      generatedCourses = await generateCourseStructure(supabaseClient, schoolId, contextResult.id, body);
    } catch (courseError: any) {
      console.error('Failed to generate course structure:', courseError);
      // Return partial success - context saved but courses failed
      return res.status(200).json({
        success: true,
        context: contextResult,
        message: existingContext ? 'Contexto actualizado' : 'Contexto creado',
        warning: `Contexto guardado pero hubo un error al generar la estructura de cursos: ${courseError.message}`,
        coursesGenerated: 0,
      });
    }

    return res.status(existingContext ? 200 : 201).json({
      success: true,
      context: contextResult,
      message: existingContext ? 'Contexto actualizado' : 'Contexto creado',
      coursesGenerated: generatedCourses.length,
    });
  } catch (err: any) {
    console.error('Unexpected error saving context:', err);
    return res.status(500).json({ error: err.message || 'Error al guardar contexto' });
  }
}

// Generate course structure from context data
async function generateCourseStructure(
  supabaseClient: any,
  schoolId: number,
  contextId: string,
  context: SaveTransversalContextRequest
) {
  // First, check if courses already exist for this school
  const { data: existingCourses, error: fetchError } = await supabaseClient
    .from('school_course_structure')
    .select('id, grade_level, course_name')
    .eq('school_id', schoolId);

  if (fetchError) {
    console.error('Error fetching existing courses:', fetchError);
  }

  // If courses already exist, update their context_id and return them
  // (This handles the case where RLS blocked deletion but courses exist)
  if (existingCourses && existingCourses.length > 0) {
    console.log(`Found ${existingCourses.length} existing courses for school ${schoolId}`);

    // Update all existing courses to link to current context
    const { error: updateError } = await supabaseClient
      .from('school_course_structure')
      .update({ context_id: contextId })
      .eq('school_id', schoolId);

    if (updateError) {
      console.error('Error updating course context_id:', updateError);
    }

    // Check if we need to add/remove courses based on new grade_levels
    const existingGradeLevels = new Set<string>(existingCourses.map((c: any) => c.grade_level));
    const newGradeLevels = new Set<string>(context.grade_levels);

    // Delete courses for removed grade levels
    const removedLevels = [...existingGradeLevels].filter(l => !newGradeLevels.has(l));
    if (removedLevels.length > 0) {
      await supabaseClient
        .from('school_course_structure')
        .delete()
        .eq('school_id', schoolId)
        .in('grade_level', removedLevels);
    }

    // Add courses for new grade levels
    const addedLevels = [...newGradeLevels].filter(l => !existingGradeLevels.has(l));
    if (addedLevels.length > 0) {
      const courseLetters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
      const newCourses: any[] = [];

      for (const gradeLevel of addedLevels) {
        const numCourses = context.courses_per_level[gradeLevel as string] || 1;
        for (let i = 0; i < numCourses; i++) {
          const courseLetter = courseLetters[i] || (i + 1).toString();
          newCourses.push({
            school_id: schoolId,
            context_id: contextId,
            grade_level: gradeLevel,
            course_name: `${getGradeLevelPrefix(gradeLevel as any)}°${courseLetter}`,
          });
        }
      }

      if (newCourses.length > 0) {
        await supabaseClient
          .from('school_course_structure')
          .insert(newCourses);
      }
    }

    // Refetch to get final count
    const { data: finalCourses } = await supabaseClient
      .from('school_course_structure')
      .select('id')
      .eq('school_id', schoolId);

    return finalCourses || existingCourses;
  }

  // No existing courses - create new ones
  const coursesToInsert: any[] = [];
  const courseLetters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];

  for (const gradeLevel of context.grade_levels) {
    const numCourses = context.courses_per_level[gradeLevel] || 1;

    for (let i = 0; i < numCourses; i++) {
      const courseLetter = courseLetters[i] || (i + 1).toString();
      coursesToInsert.push({
        school_id: schoolId,
        context_id: contextId,
        grade_level: gradeLevel,
        course_name: `${getGradeLevelPrefix(gradeLevel)}°${courseLetter}`,
      });
    }
  }

  if (coursesToInsert.length > 0) {
    console.log(`Inserting ${coursesToInsert.length} courses for school ${schoolId}, context ${contextId}`);
    const { data: insertedCourses, error: insertError } = await supabaseClient
      .from('school_course_structure')
      .insert(coursesToInsert)
      .select();

    if (insertError) {
      console.error('Error inserting course structure:', insertError);
      throw new Error(`Failed to generate course structure: ${insertError.message}`);
    }

    console.log(`Successfully inserted ${insertedCourses?.length || 0} courses`);
    return insertedCourses;
  }

  return [];
}

// Get the numeric prefix for a grade level
function getGradeLevelPrefix(gradeLevel: GradeLevel): string {
  const prefixes: Record<GradeLevel, string> = {
    medio_menor: 'MM',
    medio_mayor: 'My',
    pre_kinder: 'PK',
    kinder: 'K',
    '1_basico': '1',
    '2_basico': '2',
    '3_basico': '3',
    '4_basico': '4',
    '5_basico': '5',
    '6_basico': '6',
    '7_basico': '7',
    '8_basico': '8',
    '1_medio': 'I',
    '2_medio': 'II',
    '3_medio': 'III',
    '4_medio': 'IV',
  };
  return prefixes[gradeLevel] || gradeLevel;
}
