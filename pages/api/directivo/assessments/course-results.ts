import { NextApiRequest, NextApiResponse } from 'next';
import { getApiUser, createApiSupabaseClient, sendAuthError, handleMethodNotAllowed } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getInstanceResults, calculateAndSaveScores } from '@/lib/services/assessment-builder/scoringService';
import {
  getMaturityLevelLabel,
  AREA_LABELS,
  TransformationArea,
  GRADE_LEVEL_LABELS,
  GradeLevel,
} from '@/types/assessment-builder';

/**
 * GET /api/directivo/assessments/course-results
 *
 * Returns assessment results grouped by course for the directivo's school.
 * Shows each course's progress across transformation areas.
 *
 * Query params:
 * - course_structure_id (optional): Filter to specific course
 * - grade_level (optional): Filter to specific grade level
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
  const { course_structure_id, grade_level, school_id: querySchoolId } = req.query;

  try {
    // Get user roles from database (bypass RLS with admin client)
    const { data: userRolesData } = await supabaseAdmin
      .from('user_roles')
      .select('role_type, school_id')
      .eq('user_id', user.id)
      .eq('is_active', true);

    const roleTypes = (userRolesData || []).map((r: any) => r.role_type);
    const isAdmin = roleTypes.includes('admin') || roleTypes.includes('consultor');
    const isDirectivo = roleTypes.includes('equipo_directivo');

    if (!isAdmin && !isDirectivo) {
      return res.status(403).json({ error: 'No tienes permiso para ver resultados por curso' });
    }

    // Get school ID
    let schoolId: number | null = null;

    if (isAdmin) {
      if (!querySchoolId || typeof querySchoolId !== 'string') {
        return res.status(400).json({ error: 'school_id es requerido para administradores' });
      }
      schoolId = parseInt(querySchoolId, 10);
    } else {
      // Get directivo's school from user_roles
      const directivoRole = userRolesData?.find((r: any) => r.role_type === 'equipo_directivo');
      schoolId = directivoRole?.school_id || null;
    }

    if (!schoolId) {
      return res.status(400).json({ error: 'No se encontró la escuela asociada' });
    }

    // Get course structures for the school (use admin client to bypass RLS)
    let coursesQuery = supabaseAdmin
      .from('school_course_structure')
      .select('id, grade_level, course_name')
      .eq('school_id', schoolId)
      .order('grade_level')
      .order('course_name');

    if (grade_level && typeof grade_level === 'string') {
      coursesQuery = coursesQuery.eq('grade_level', grade_level);
    }

    if (course_structure_id && typeof course_structure_id === 'string') {
      coursesQuery = coursesQuery.eq('id', course_structure_id);
    }

    const { data: courses, error: coursesError } = await coursesQuery;

    if (coursesError) {
      console.error('Error fetching courses:', coursesError);
      return res.status(500).json({ error: 'Error al cargar cursos' });
    }

    if (!courses || courses.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No hay cursos configurados para esta escuela',
        courses: [],
      });
    }

    // Get transformation year (use admin client)
    const { data: context } = await supabaseAdmin
      .from('school_transversal_context')
      .select('implementation_year_2026')
      .eq('school_id', schoolId)
      .single();

    const transformationYear = (context?.implementation_year_2026 || 1) as 1 | 2 | 3 | 4 | 5;
    const expectedLevel = getExpectedLevelByYear(transformationYear);

    // Get completed instances for all courses (use admin client to bypass RLS)
    const courseIds = courses.map((c) => c.id);
    const { data: instances, error: instancesError } = await supabaseAdmin
      .from('assessment_instances')
      .select(
        `
        id,
        status,
        completed_at,
        course_structure_id,
        template_snapshot_id,
        assessment_template_snapshots!inner (
          snapshot_data
        )
      `
      )
      .in('course_structure_id', courseIds)
      .eq('status', 'completed');

    if (instancesError) {
      console.error('Error fetching instances:', instancesError);
      return res.status(500).json({ error: 'Error al cargar evaluaciones' });
    }

    // Group instances by course
    const instancesByCourse = new Map<string, any[]>();
    for (const instance of instances || []) {
      const courseId = instance.course_structure_id;
      if (!instancesByCourse.has(courseId)) {
        instancesByCourse.set(courseId, []);
      }
      instancesByCourse.get(courseId)!.push(instance);
    }

    // Process each course
    const courseResults = await Promise.all(
      courses.map(async (course) => {
        const courseInstances = instancesByCourse.get(course.id) || [];
        const areaResults: Record<
          string,
          {
            area: string;
            label: string;
            totalScore: number;
            level: number;
            levelLabel: string;
            completedAt: string | null;
          }
        > = {};

        let totalScore = 0;
        let totalLevel = 0;
        let completedCount = 0;

        for (const instance of courseInstances) {
          const snapshotData = (instance as any).assessment_template_snapshots?.snapshot_data;
          const templateArea = snapshotData?.template?.area as TransformationArea;

          // Get or calculate results
          let summary = await getInstanceResults(supabaseClient, instance.id);

          if (!summary) {
            const calcResult = await calculateAndSaveScores(supabaseClient, instance.id);
            summary = calcResult.summary || null;
          }

          if (summary) {
            areaResults[templateArea] = {
              area: templateArea,
              label: AREA_LABELS[templateArea],
              totalScore: summary.totalScore,
              level: summary.overallLevel,
              levelLabel: getMaturityLevelLabel(summary.overallLevel),
              completedAt: instance.completed_at,
            };

            totalScore += summary.totalScore;
            totalLevel += summary.overallLevel;
            completedCount++;
          }
        }

        const avgScore = completedCount > 0 ? Math.round((totalScore / completedCount) * 100) / 100 : 0;
        const avgLevel = completedCount > 0 ? Math.round((totalLevel / completedCount) * 100) / 100 : 0;

        return {
          courseId: course.id,
          gradeLevel: course.grade_level as GradeLevel,
          gradeLevelLabel: GRADE_LEVEL_LABELS[course.grade_level as GradeLevel],
          courseName: course.course_name,
          summary: {
            completedAssessments: completedCount,
            avgScore,
            avgLevel,
            avgLevelLabel: getMaturityLevelLabel(Math.round(avgLevel)),
            meetsExpectations: avgLevel >= expectedLevel,
          },
          byArea: areaResults,
        };
      })
    );

    return res.status(200).json({
      success: true,
      schoolId,
      transformationYear,
      expectedLevel: {
        level: expectedLevel,
        label: getMaturityLevelLabel(expectedLevel),
      },
      courses: courseResults,
    });
  } catch (err: any) {
    console.error('Unexpected error fetching course results:', err);
    return res.status(500).json({ error: err.message || 'Error al obtener resultados' });
  }
}

function getExpectedLevelByYear(year: 1 | 2 | 3 | 4 | 5): number {
  const expectedLevels: Record<number, number> = {
    1: 1,
    2: 1,
    3: 2,
    4: 3,
    5: 3,
  };
  return expectedLevels[year];
}
