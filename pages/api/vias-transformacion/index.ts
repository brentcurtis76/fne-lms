import type { NextApiRequest, NextApiResponse } from 'next';
import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import type { ChileanGrade } from '@/types/grades';

/**
 * GET /api/vias-transformacion
 * List all assessments the user can view (their school's assessments)
 *
 * POST /api/vias-transformacion
 * Create a new assessment with school, grades, and collaborators
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const supabase = createPagesServerClient({ req, res });
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  const userId = session.user.id;

  // Initialize admin client for RLS bypass when needed
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );

  if (req.method === 'GET') {
    return handleGet(req, res, supabase, supabaseAdmin, userId);
  } else if (req.method === 'POST') {
    return handlePost(req, res, supabase, supabaseAdmin, userId);
  } else {
    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).json({ error: 'Método no permitido' });
  }
}

/**
 * GET: List assessments for user's school(s)
 */
async function handleGet(
  req: NextApiRequest,
  res: NextApiResponse,
  supabase: any,
  supabaseAdmin: any,
  userId: string
) {
  try {
    // 1. Get user's school IDs
    const { data: userRoles, error: rolesError } = await supabase
      .from('user_roles')
      .select('school_id, role_type')
      .eq('user_id', userId)
      .eq('is_active', true);

    if (rolesError) {
      console.error('[vias-transformacion/list] Error getting user roles:', rolesError);
      return res.status(500).json({ error: 'Error al obtener roles del usuario' });
    }

    // Check if user is admin/consultor
    const isAdminOrConsultor = userRoles?.some(r =>
      ['admin', 'consultor'].includes(r.role_type)
    );

    // Get unique school IDs
    const schoolIds = [...new Set(userRoles?.filter(r => r.school_id).map(r => r.school_id))];

    if (schoolIds.length === 0 && !isAdminOrConsultor) {
      console.log('[vias-transformacion/list] User has no school assigned:', userId);
      return res.status(200).json({
        assessments: [],
        userSchoolIds: [],
        message: 'No tienes una escuela asignada',
      });
    }

    // 2. Build query for assessments
    let query = supabaseAdmin
      .from('transformation_assessments')
      .select(`
        id,
        area,
        status,
        grades,
        school_id,
        growth_community_id,
        created_by,
        started_at,
        updated_at,
        completed_at,
        schools:school_id (
          id,
          name
        )
      `)
      .order('updated_at', { ascending: false });

    // 3. Filter by school (unless admin/consultor)
    if (!isAdminOrConsultor && schoolIds.length > 0) {
      query = query.in('school_id', schoolIds);
    }

    const { data: assessments, error: assessmentsError } = await query;

    if (assessmentsError) {
      console.error('[vias-transformacion/list] Error fetching assessments:', assessmentsError);
      return res.status(500).json({ error: 'Error al obtener evaluaciones' });
    }

    // 4. Get collaborators for each assessment
    const assessmentIds = assessments?.map(a => a.id) || [];

    let collaboratorsByAssessment: Record<string, any[]> = {};

    if (assessmentIds.length > 0) {
      const { data: allCollaborators, error: collabError } = await supabaseAdmin
        .from('transformation_assessment_collaborators')
        .select(`
          assessment_id,
          user_id,
          role,
          can_edit,
          profiles:user_id (
            id,
            first_name,
            last_name,
            avatar_url
          )
        `)
        .in('assessment_id', assessmentIds);

      if (collabError) {
        console.error('[vias-transformacion/list] Error fetching collaborators:', collabError);
      } else {
        // Group collaborators by assessment
        allCollaborators?.forEach(c => {
          if (!collaboratorsByAssessment[c.assessment_id]) {
            collaboratorsByAssessment[c.assessment_id] = [];
          }
          const profile = Array.isArray(c.profiles) ? c.profiles[0] : c.profiles;
          collaboratorsByAssessment[c.assessment_id].push({
            id: c.user_id,
            role: c.role,
            can_edit: c.can_edit,
            first_name: profile?.first_name,
            last_name: profile?.last_name,
            full_name: profile
              ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim()
              : 'Usuario',
            avatar_url: profile?.avatar_url,
          });
        });
      }
    }

    // 5. Get creator profiles for legacy assessments without collaborators
    const creatorIds = [...new Set(assessments?.map(a => a.created_by).filter(Boolean))];
    let creatorProfiles: Record<string, any> = {};

    if (creatorIds.length > 0) {
      const { data: profiles } = await supabaseAdmin
        .from('profiles')
        .select('id, first_name, last_name, avatar_url')
        .in('id', creatorIds);

      profiles?.forEach(p => {
        creatorProfiles[p.id] = p;
      });
    }

    // 6. Format response
    const formattedAssessments = assessments?.map(assessment => {
      const collaborators = collaboratorsByAssessment[assessment.id] || [];
      const isUserCollaborator = collaborators.some(c => c.id === userId);
      const isCreator = assessment.created_by === userId;
      const canEdit = isUserCollaborator || isCreator ||
        userRoles?.some(r => ['admin', 'consultor'].includes(r.role_type));

      // Get creator info
      const creatorProfile = creatorProfiles[assessment.created_by];
      const creatorName = creatorProfile
        ? `${creatorProfile.first_name || ''} ${creatorProfile.last_name || ''}`.trim()
        : 'Usuario';

      return {
        id: assessment.id,
        area: assessment.area,
        status: assessment.status,
        grades: assessment.grades || [],
        school_id: assessment.school_id,
        school_name: (assessment.schools as any)?.name || null,
        growth_community_id: assessment.growth_community_id,
        created_by: assessment.created_by,
        creator_name: creatorName,
        creator_avatar: creatorProfile?.avatar_url,
        started_at: assessment.started_at,
        updated_at: assessment.updated_at,
        completed_at: assessment.completed_at,
        collaborators,
        is_user_collaborator: isUserCollaborator,
        is_creator: isCreator,
        can_edit: canEdit,
      };
    });

    return res.status(200).json({
      assessments: formattedAssessments || [],
      userSchoolIds: schoolIds,
      isAdmin: isAdminOrConsultor,
    });
  } catch (error) {
    console.error('[vias-transformacion/list] Unexpected error:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

/**
 * POST: Create a new assessment
 */
async function handlePost(
  req: NextApiRequest,
  res: NextApiResponse,
  supabase: any,
  supabaseAdmin: any,
  userId: string
) {
  try {
    const { schoolId, area, grades, collaboratorIds } = req.body;

    // Validate required fields
    if (!schoolId) {
      return res.status(400).json({ error: 'schoolId es requerido' });
    }

    const VALID_AREAS = ['personalizacion', 'aprendizaje', 'evaluacion'] as const;
    if (!area || !VALID_AREAS.includes(area)) {
      return res.status(400).json({
        error: 'Área inválida',
        validAreas: VALID_AREAS,
      });
    }

    if (!grades || !Array.isArray(grades) || grades.length === 0) {
      return res.status(400).json({ error: 'Debes seleccionar al menos un grado' });
    }

    // 1. Verify user belongs to this school
    const { data: userRoles, error: rolesError } = await supabase
      .from('user_roles')
      .select('school_id, role_type')
      .eq('user_id', userId)
      .eq('is_active', true);

    if (rolesError) {
      console.error('[vias-transformacion/create] Error getting user roles:', rolesError);
      return res.status(500).json({ error: 'Error al verificar permisos' });
    }

    const isAdmin = userRoles?.some(r => ['admin', 'consultor'].includes(r.role_type));
    const userSchoolIds = userRoles?.filter(r => r.school_id).map(r => r.school_id) || [];

    if (!isAdmin && !userSchoolIds.includes(schoolId)) {
      return res.status(403).json({ error: 'No perteneces a esta escuela' });
    }

    // 2. Verify school exists
    const { data: school, error: schoolError } = await supabaseAdmin
      .from('schools')
      .select('id, name')
      .eq('id', schoolId)
      .single();

    if (schoolError || !school) {
      return res.status(404).json({ error: 'Escuela no encontrada' });
    }

    // 3. Validate collaborators belong to the same school (if provided)
    const validatedCollaboratorIds: string[] = [];

    if (collaboratorIds && Array.isArray(collaboratorIds) && collaboratorIds.length > 0) {
      const { data: collaboratorRoles, error: collabRolesError } = await supabaseAdmin
        .from('user_roles')
        .select('user_id, school_id')
        .in('user_id', collaboratorIds)
        .eq('school_id', schoolId)
        .eq('is_active', true);

      if (collabRolesError) {
        console.error('[vias-transformacion/create] Error validating collaborators:', collabRolesError);
        return res.status(500).json({ error: 'Error al validar colaboradores' });
      }

      const validUserIds = new Set(collaboratorRoles?.map(r => r.user_id) || []);
      collaboratorIds.forEach((id: string) => {
        if (validUserIds.has(id)) {
          validatedCollaboratorIds.push(id);
        }
      });

      if (validatedCollaboratorIds.length !== collaboratorIds.length) {
        console.warn(
          '[vias-transformacion/create] Some collaborators filtered out:',
          collaboratorIds.length - validatedCollaboratorIds.length
        );
      }
    }

    // 4. Create the assessment
    const now = new Date().toISOString();

    const { data: assessment, error: createError } = await supabaseAdmin
      .from('transformation_assessments')
      .insert({
        school_id: schoolId,
        area,
        grades: grades,
        status: 'in_progress',
        created_by: userId,
        started_at: now,
        updated_at: now,
        // growth_community_id is NULL for new school-based assessments
      })
      .select('*')
      .single();

    if (createError || !assessment) {
      console.error('[vias-transformacion/create] Error creating assessment:', createError);
      return res.status(500).json({ error: 'Error al crear la evaluación' });
    }

    // 5. Add creator as collaborator with 'creator' role
    const { error: creatorCollabError } = await supabaseAdmin
      .from('transformation_assessment_collaborators')
      .insert({
        assessment_id: assessment.id,
        user_id: userId,
        role: 'creator',
        can_edit: true,
        added_by: userId,
      });

    if (creatorCollabError) {
      console.error('[vias-transformacion/create] Error adding creator as collaborator:', creatorCollabError);
      // Don't fail the request, assessment was created
    }

    // 6. Add other collaborators
    if (validatedCollaboratorIds.length > 0) {
      const collaboratorRecords = validatedCollaboratorIds.map(collabId => ({
        assessment_id: assessment.id,
        user_id: collabId,
        role: 'collaborator',
        can_edit: true,
        added_by: userId,
      }));

      const { error: addCollabError } = await supabaseAdmin
        .from('transformation_assessment_collaborators')
        .insert(collaboratorRecords);

      if (addCollabError) {
        console.error('[vias-transformacion/create] Error adding collaborators:', addCollabError);
        // Don't fail the request, assessment was created
      }
    }

    console.log(
      '[vias-transformacion/create] Assessment created:',
      assessment.id,
      'school:', schoolId,
      'area:', area,
      'grades:', grades.length,
      'collaborators:', validatedCollaboratorIds.length + 1
    );

    return res.status(201).json({
      assessment,
      collaboratorCount: validatedCollaboratorIds.length + 1, // +1 for creator
    });
  } catch (error) {
    console.error('[vias-transformacion/create] Unexpected error:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}
