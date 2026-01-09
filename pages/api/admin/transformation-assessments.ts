import type { NextApiRequest, NextApiResponse } from 'next';
import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';

/**
 * GET /api/admin/transformation-assessments
 * Admin-only endpoint to fetch all transformation assessments grouped by school
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

  const supabase = createPagesServerClient({ req, res });
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  const userId = session.user.id;

  // Check if user is admin or consultor
  const { data: userRoles, error: rolesError } = await supabase
    .from('user_roles')
    .select('role_type')
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

    // 1. Fetch all assessments for admin view
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
      .order('updated_at', { ascending: false });

    // Filter by status if specified
    if (status && status !== 'all') {
      assessmentsQuery = assessmentsQuery.eq('status', status);
    }

    // Filter by school
    if (schoolId) {
      assessmentsQuery = assessmentsQuery.eq('school_id', Number(schoolId));
    }

    const { data: assessments, error: assessmentsError } = await assessmentsQuery;

    if (assessmentsError) {
      console.error('[admin/transformation-assessments] Error fetching assessments:', assessmentsError);
      return res.status(500).json({ error: 'Error al obtener evaluaciones' });
    }

    // 2. Fetch all schools for filtering dropdown
    const { data: schools, error: schoolsError } = await supabaseAdmin
      .from('schools')
      .select('id, name')
      .order('name');

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
