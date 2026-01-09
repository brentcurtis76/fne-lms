import { NextApiRequest, NextApiResponse } from 'next';
import { getApiUser, createApiSupabaseClient, sendAuthError, handleMethodNotAllowed } from '@/lib/api-auth';
import type { SaveMigrationPlanRequest, GenerationType } from '@/types/assessment-builder';

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

// IDs of always-GT grades (1-6: Medio Menor through Segundo Básico)
const ALWAYS_GT_GRADE_IDS = [1, 2, 3, 4, 5, 6];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Authentication check
  const { user, error: authError } = await getApiUser(req, res);
  if (authError || !user) {
    return sendAuthError(res, 'Autenticación requerida');
  }

  const supabaseClient = await createApiSupabaseClient(req, res);

  // Get school_id from query for GET, or from body for PUT
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
      error: 'Solo directivos y administradores pueden acceder al plan de migración'
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
    case 'PUT':
      return handlePut(req, res, supabaseClient, effectiveSchoolId!);
    default:
      return handleMethodNotAllowed(res, ['GET', 'PUT']);
  }
}

// GET /api/school/migration-plan
async function handleGet(
  req: NextApiRequest,
  res: NextApiResponse,
  supabaseClient: any,
  schoolId: number
) {
  try {
    // Fetch existing migration plan entries with grade info
    const { data: entries, error: entriesError } = await supabaseClient
      .from('ab_migration_plan')
      .select(`
        id,
        school_id,
        year_number,
        grade_id,
        generation_type,
        created_at,
        updated_at,
        grade:ab_grades (
          id,
          name,
          sort_order,
          is_always_gt
        )
      `)
      .eq('school_id', schoolId)
      .order('year_number', { ascending: true })
      .order('grade_id', { ascending: true });

    if (entriesError) {
      console.error('Error fetching migration plan:', entriesError);
      return res.status(500).json({ error: 'Error al obtener el plan de migración' });
    }

    // Fetch the school's current transformation year from transversal context
    const { data: context, error: contextError } = await supabaseClient
      .from('school_transversal_context')
      .select('implementation_year_2026')
      .eq('school_id', schoolId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    let transformationYear: number | null = null;
    if (!contextError && context) {
      transformationYear = context.implementation_year_2026;
    }

    // Fetch all grades for reference
    const { data: grades, error: gradesError } = await supabaseClient
      .from('ab_grades')
      .select('id, name, sort_order, is_always_gt')
      .order('sort_order', { ascending: true });

    if (gradesError) {
      console.error('Error fetching grades:', gradesError);
      return res.status(500).json({ error: 'Error al obtener los niveles' });
    }

    return res.status(200).json({
      success: true,
      entries: entries || [],
      transformation_year: transformationYear,
      grades: grades || [],
    });
  } catch (err: any) {
    console.error('Unexpected error fetching migration plan:', err);
    return res.status(500).json({ error: err.message || 'Error al obtener plan de migración' });
  }
}

// PUT /api/school/migration-plan
async function handlePut(
  req: NextApiRequest,
  res: NextApiResponse,
  supabaseClient: any,
  schoolId: number
) {
  try {
    const { entries } = req.body as SaveMigrationPlanRequest;

    if (!entries || !Array.isArray(entries)) {
      return res.status(400).json({ error: 'Se requiere un array de entries' });
    }

    // Validate entries
    const errors: string[] = [];
    let year5HasGI = false;

    for (const entry of entries) {
      // Validate year_number
      if (typeof entry.year_number !== 'number' || entry.year_number < 1 || entry.year_number > 5) {
        errors.push(`year_number inválido: ${entry.year_number}`);
        continue;
      }

      // Validate grade_id
      if (typeof entry.grade_id !== 'number') {
        errors.push(`grade_id inválido: ${entry.grade_id}`);
        continue;
      }

      // Validate generation_type
      if (!['GT', 'GI'].includes(entry.generation_type)) {
        errors.push(`generation_type inválido: ${entry.generation_type}`);
        continue;
      }

      // Validate: Grades 1-6 must always be GT
      if (ALWAYS_GT_GRADE_IDS.includes(entry.grade_id) && entry.generation_type !== 'GT') {
        errors.push(`El nivel con ID ${entry.grade_id} debe ser siempre GT`);
      }

      // Check if Year 5 has any GI grades
      if (entry.year_number === 5 && entry.generation_type === 'GI') {
        year5HasGI = true;
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({
        error: 'Datos inválidos',
        details: errors
      });
    }

    // Delete existing entries for this school
    const { error: deleteError } = await supabaseClient
      .from('ab_migration_plan')
      .delete()
      .eq('school_id', schoolId);

    if (deleteError) {
      console.error('Error deleting existing migration plan:', deleteError);
      return res.status(500).json({ error: 'Error al actualizar el plan de migración' });
    }

    // Insert new entries
    if (entries.length > 0) {
      const entriesToInsert = entries.map(entry => ({
        school_id: schoolId,
        year_number: entry.year_number,
        grade_id: entry.grade_id,
        generation_type: entry.generation_type as GenerationType,
      }));

      const { error: insertError } = await supabaseClient
        .from('ab_migration_plan')
        .insert(entriesToInsert);

      if (insertError) {
        console.error('Error inserting migration plan:', insertError);
        return res.status(500).json({ error: 'Error al guardar el plan de migración' });
      }
    }

    // Fetch the updated entries
    const { data: updatedEntries, error: fetchError } = await supabaseClient
      .from('ab_migration_plan')
      .select(`
        id,
        school_id,
        year_number,
        grade_id,
        generation_type,
        created_at,
        updated_at,
        grade:ab_grades (
          id,
          name,
          sort_order,
          is_always_gt
        )
      `)
      .eq('school_id', schoolId)
      .order('year_number', { ascending: true })
      .order('grade_id', { ascending: true });

    if (fetchError) {
      console.error('Error fetching updated entries:', fetchError);
    }

    const response: any = {
      success: true,
      entries: updatedEntries || [],
      message: 'Plan de migración guardado exitosamente',
    };

    // Add warning if Year 5 has GI grades
    if (year5HasGI) {
      response.warning = 'El Año 5 tiene niveles marcados como GI. Se recomienda que todos los niveles sean GT en el Año 5.';
    }

    return res.status(200).json(response);
  } catch (err: any) {
    console.error('Unexpected error saving migration plan:', err);
    return res.status(500).json({ error: err.message || 'Error al guardar plan de migración' });
  }
}
