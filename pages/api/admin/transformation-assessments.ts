import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { readClientSchoolScope } from '../../../lib/simulation/tenant-policy';
import { createApiSupabaseClient, requireVerifiedCaller } from '@/lib/api-auth';

/**
 * GET /api/admin/transformation-assessments
 * Transformation assessments grouped by school, for admins and consultores.
 * An admin sees every client school plus legacy rows without a school. A
 * consultor (not admin) sees only the client schools of their ACTIVE
 * consultant_assignments (or where they are an active equipo_directivo), never
 * the unscoped legacy rows; before this a consultor saw every school.
 *
 * Query params:
 *   - status: 'all' | 'completed' | 'in_progress' | 'archived' (default: 'all')
 *   - schoolId: number (optional, filter by specific school)
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const supabase = await createApiSupabaseClient(req, res);
  // Identity comes from the auth server; the cookie's stored `user` is
  // client-controlled (SM-B015).
  const caller = await requireVerifiedCaller(req, res);
  if (!caller.user) {
    return res.status(caller.status).json(caller.body);
  }

  const userId = caller.user.id;

  // Check if user is admin or consultor
  const { data: userRoles, error: rolesError } = await supabase
    .from('user_roles')
    .select('role_type, school_id')
    .eq('user_id', userId)
    .eq('is_active', true);

  if (rolesError) {
    console.error('[admin/transformation-assessments] Error checking roles:', rolesError);
    return res.status(500).json({ error: 'Error al verificar permisos' });
  }

  const isAdminOrConsultor = userRoles?.some(r =>
    ['admin', 'consultor'].includes(r.role_type)
  );

  if (!isAdminOrConsultor) {
    return res.status(403).json({ error: 'No tienes permisos para acceder a esta información' });
  }

  // Initialize admin client for full access
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

  try {
    const { status = 'all', schoolId } = req.query;
    const clientSchools = await readClientSchoolScope(supabaseAdmin);
    const isAdmin = userRoles!.some(r => r.role_type === 'admin');

    // School ids this caller may see; null = no extra limit (admin).
    let allowedSchoolIds: number[] | null = null;
    if (!isAdmin) {
      const { data: assignments, error: assignmentsError } = await supabaseAdmin
        .from('consultant_assignments')
        .select('school_id')
        .eq('consultant_id', userId)
        .eq('is_active', true);
      if (assignmentsError) {
        console.error('[admin/transformation-assessments] Error reading consultant assignments:', assignmentsError);
        return res.status(500).json({ error: 'Error al verificar permisos' });
      }
      const ownSchools = new Set<number>([
        ...(assignments || []).map(a => Number(a.school_id)),
        ...userRoles!.filter(r => r.role_type === 'equipo_directivo' && r.school_id != null).map(r => Number(r.school_id)),
      ]);
      allowedSchoolIds = clientSchools.ids.filter(id => ownSchools.has(Number(id)));
    }

    let requestedSchoolId: number | null = null;
    if (schoolId !== undefined && schoolId !== '') {
      requestedSchoolId = Number(schoolId);
      if (!Number.isSafeInteger(requestedSchoolId) || requestedSchoolId <= 0) {
        return res.status(400).json({ error: 'schoolId inválido' });
      }
      if (allowedSchoolIds && !allowedSchoolIds.includes(requestedSchoolId)) {
        return res.status(403).json({ error: 'No tienes acceso a esta escuela' });
      }
    }

    if (allowedSchoolIds && allowedSchoolIds.length === 0) {
      return res.status(200).json({
        schoolGroups: [],
        noSchoolAssessments: [],
        schools: [],
        stats: { total: 0, completed: 0, in_progress: 0, archived: 0, schools_with_assessments: 0 },
      });
    }

    const visibleSchoolIds = allowedSchoolIds ?? clientSchools.ids;
    const tenantFilter = allowedSchoolIds
      ? `school_id.in.(${allowedSchoolIds.join(',')})`
      : clientSchools.ids.length > 0
        ? `school_id.is.null,school_id.in.(${clientSchools.ids.join(',')})`
        : 'school_id.is.null';

    // 1. Fetch assessments for official admin reporting. Legacy unscoped rows remain
    // visible to admins, while QA/operator tenants never enter this stakeholder-facing surface.
    let assessmentsQuery = supabaseAdmin
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
        context_metadata,
        schools:school_id (
          id,
          name
        )
      `)
      .order('updated_at', { ascending: false })
      .or(tenantFilter);

    // Filter by status if specified
    if (status && status !== 'all') {
      assessmentsQuery = assessmentsQuery.eq('status', status);
    }

    // Filter by school
    if (requestedSchoolId !== null) {
      assessmentsQuery = assessmentsQuery.eq('school_id', requestedSchoolId);
    }

    const { data: assessments, error: assessmentsError } = await assessmentsQuery;

    if (assessmentsError) {
      console.error('[admin/transformation-assessments] Error fetching assessments:', assessmentsError);
      return res.status(500).json({ error: 'Error al obtener evaluaciones' });
    }

    // 2. Fetch all schools for filtering dropdown
    const schoolsResult = visibleSchoolIds.length > 0
      ? await supabaseAdmin
          .from('schools')
          .select('id, name')
          .in('id', visibleSchoolIds)
          .order('name')
      : { data: [], error: null };
    const { data: schools, error: schoolsError } = schoolsResult;

    if (schoolsError) {
      console.error('[admin/transformation-assessments] Error fetching schools:', schoolsError);
    }

    // 3. Get creator profiles
    const creatorIds = [...new Set(assessments?.map(a => a.created_by).filter(Boolean))];
    let creatorProfiles: Record<string, any> = {};

    if (creatorIds.length > 0) {
      const { data: profiles } = await supabaseAdmin
        .from('profiles')
        .select('id, first_name, last_name, avatar_url, email')
        .in('id', creatorIds);

      profiles?.forEach(p => {
        creatorProfiles[p.id] = p;
      });
    }

    // 4. Get collaborators count per assessment
    const assessmentIds = assessments?.map(a => a.id) || [];
    let collaboratorCounts: Record<string, number> = {};

    if (assessmentIds.length > 0) {
      const { data: collabData } = await supabaseAdmin
        .from('transformation_assessment_collaborators')
        .select('assessment_id')
        .in('assessment_id', assessmentIds);

      collabData?.forEach(c => {
        collaboratorCounts[c.assessment_id] = (collaboratorCounts[c.assessment_id] || 0) + 1;
      });
    }

    // 5. Get rubric item counts per area (for progress calculation)
    const areas = [...new Set(assessments?.map(a => a.area) || [])];
    let rubricCountsByArea: Record<string, number> = {};

    if (areas.length > 0) {
      const { data: rubricCounts } = await supabaseAdmin
        .from('transformation_rubric')
        .select('area')
        .in('area', areas);

      // Count items per area
      rubricCounts?.forEach(r => {
        rubricCountsByArea[r.area] = (rubricCountsByArea[r.area] || 0) + 1;
      });
    }

    // 6. Format assessments
    const formattedAssessments = assessments?.map(assessment => {
      const creatorProfile = creatorProfiles[assessment.created_by];
      const evaluation = assessment.context_metadata?.evaluation;
      const questionsAnswered = assessment.context_metadata?.responses
        ? Object.keys(assessment.context_metadata.responses).length
        : 0;
      const totalQuestions = rubricCountsByArea[assessment.area] || 0;
      const progressPercent = totalQuestions > 0
        ? Math.round((questionsAnswered / totalQuestions) * 100)
        : 0;

      return {
        id: assessment.id,
        area: assessment.area,
        status: assessment.status,
        grades: assessment.grades || [],
        school_id: assessment.school_id,
        school_name: (assessment.schools as any)?.name || 'Sin escuela',
        growth_community_id: assessment.growth_community_id,
        created_by: assessment.created_by,
        creator_name: creatorProfile
          ? `${creatorProfile.first_name || ''} ${creatorProfile.last_name || ''}`.trim() || creatorProfile.email
          : 'Usuario desconocido',
        creator_email: creatorProfile?.email,
        started_at: assessment.started_at,
        updated_at: assessment.updated_at,
        completed_at: assessment.completed_at,
        collaborator_count: collaboratorCounts[assessment.id] || 0,
        // Include evaluation summary if completed
        overall_level: evaluation?.overallLevel,
        questions_answered: questionsAnswered,
        total_questions: totalQuestions,
        progress_percent: progressPercent,
      };
    }) || [];

    // 6. Group by school
    const bySchool: Record<number, {
      school_id: number;
      school_name: string;
      assessments: typeof formattedAssessments;
      stats: {
        total: number;
        completed: number;
        in_progress: number;
        archived: number;
      };
    }> = {};

    // Also track assessments without school (legacy)
    const noSchoolAssessments: typeof formattedAssessments = [];

    formattedAssessments.forEach(assessment => {
      if (assessment.school_id) {
        if (!bySchool[assessment.school_id]) {
          bySchool[assessment.school_id] = {
            school_id: assessment.school_id,
            school_name: assessment.school_name,
            assessments: [],
            stats: { total: 0, completed: 0, in_progress: 0, archived: 0 },
          };
        }
        bySchool[assessment.school_id].assessments.push(assessment);
        bySchool[assessment.school_id].stats.total++;
        if (assessment.status === 'completed') bySchool[assessment.school_id].stats.completed++;
        else if (assessment.status === 'in_progress') bySchool[assessment.school_id].stats.in_progress++;
        else if (assessment.status === 'archived') bySchool[assessment.school_id].stats.archived++;
      } else {
        noSchoolAssessments.push(assessment);
      }
    });

    // Sort schools by name
    const schoolGroups = Object.values(bySchool).sort((a, b) =>
      a.school_name.localeCompare(b.school_name)
    );

    // Overall stats
    const stats = {
      total: formattedAssessments.length,
      completed: formattedAssessments.filter(a => a.status === 'completed').length,
      in_progress: formattedAssessments.filter(a => a.status === 'in_progress').length,
      archived: formattedAssessments.filter(a => a.status === 'archived').length,
      schools_with_assessments: Object.keys(bySchool).length,
    };

    return res.status(200).json({
      schoolGroups,
      noSchoolAssessments,
      schools: schools || [],
      stats,
    });

  } catch (error) {
    console.error('[admin/transformation-assessments] Unexpected error:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}
