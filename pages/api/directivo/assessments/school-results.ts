import { NextApiRequest, NextApiResponse } from 'next';
import { getApiUser, createApiSupabaseClient, sendAuthError, handleMethodNotAllowed } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import {
  getInstanceResults,
  aggregateSchoolScores,
  fetchInstanceGapAnalysis,
  aggregateSchoolGapAnalysis,
  AssessmentGapAnalysis,
} from '@/lib/services/assessment-builder/scoringService';
import {
  getMaturityLevelLabel,
  AREA_LABELS,
  TransformationArea,
  AssessmentSummary,
} from '@/types/assessment-builder';

/**
 * GET /api/directivo/assessments/school-results
 *
 * Returns aggregated assessment results for the directivo's school.
 * Includes:
 * - Overall school averages across all areas
 * - Per-area breakdown with averages
 * - Per-course breakdown with details
 * - Comparison to expected levels for transformation year
 *
 * Query params:
 * - area (optional): Filter to specific transformation area
 * - includeDetails (optional): Include per-instance details
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
  const { area, includeDetails } = req.query;

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
      return res.status(403).json({ error: 'No tienes permiso para ver resultados de escuela' });
    }

    // Get school ID for directivo
    let schoolId: number | null = null;

    if (isAdmin) {
      // Admin must specify school_id
      const querySchoolId = req.query.school_id;
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

    // Get school info (use admin client to bypass RLS)
    const { data: school } = await supabaseAdmin
      .from('schools')
      .select('id, name')
      .eq('id', schoolId)
      .single();

    // Get school context for transformation year (use admin client)
    const { data: context } = await supabaseAdmin
      .from('school_transversal_context')
      .select('implementation_year_2026')
      .eq('school_id', schoolId)
      .single();

    const transformationYear = (context?.implementation_year_2026 || 1) as 1 | 2 | 3 | 4 | 5;

    // Build query for completed instances (use admin client to bypass RLS)
    const { data: instances, error: instancesError } = await supabaseAdmin
      .from('assessment_instances')
      .select(
        `
        id,
        status,
        transformation_year,
        completed_at,
        course_structure_id,
        template_snapshot_id,
        assessment_template_snapshots!inner (
          version,
          snapshot_data
        ),
        school_course_structure:course_structure_id (
          id,
          grade_level,
          course_name
        )
      `
      )
      .eq('school_id', schoolId)
      .eq('status', 'completed');

    if (instancesError) {
      console.error('Error fetching instances:', instancesError);
      return res.status(500).json({ error: 'Error al cargar evaluaciones' });
    }

    if (!instances || instances.length === 0) {
      return res.status(200).json({
        success: true,
        school: {
          id: schoolId,
          name: school?.name || 'Escuela',
        },
        transformationYear,
        message: 'No hay evaluaciones completadas para esta escuela',
        results: {
          byArea: {},
          overall: { avgScore: 0, avgLevel: 0, totalInstances: 0 },
        },
        instances: [],
      });
    }

    // Gather summaries and gap analyses for all instances
    const summaries: AssessmentSummary[] = [];
    const gapAnalyses: AssessmentGapAnalysis[] = [];
    const instanceDetails: any[] = [];

    for (const instance of instances) {
      const snapshotData = (instance as any).assessment_template_snapshots?.snapshot_data;
      const templateArea = snapshotData?.template?.area as TransformationArea;

      // Filter by area if specified
      if (area && typeof area === 'string' && templateArea !== area) {
        continue;
      }

      // Get or calculate results
      let summary = await getInstanceResults(supabaseClient, instance.id);

      if (!summary) {
        // Calculate if not exists
        const { getInstanceResults: _, calculateAndSaveScores } = await import(
          '@/lib/services/assessment-builder/scoringService'
        );
        const calcResult = await calculateAndSaveScores(supabaseClient, instance.id);
        summary = calcResult.summary || null;
      }

      if (summary) {
        summaries.push(summary);

        // Get gap analysis for this instance
        const gapAnalysis = await fetchInstanceGapAnalysis(supabaseClient, instance.id);
        if (gapAnalysis) {
          gapAnalyses.push(gapAnalysis);
        }

        if (includeDetails === 'true') {
          const courseStructure = (instance as any).school_course_structure;
          instanceDetails.push({
            instanceId: instance.id,
            area: summary.area,
            areaLabel: AREA_LABELS[summary.area],
            totalScore: summary.totalScore,
            overallLevel: summary.overallLevel,
            overallLevelLabel: getMaturityLevelLabel(summary.overallLevel),
            expectedLevel: summary.expectedLevel,
            meetsExpectations: summary.overallLevel >= summary.expectedLevel,
            completedAt: instance.completed_at,
            course: courseStructure
              ? {
                  id: courseStructure.id,
                  gradeLevel: courseStructure.grade_level,
                  name: courseStructure.course_name,
                }
              : null,
            gapAnalysis: gapAnalysis
              ? {
                  avgGap: gapAnalysis.avgGap,
                  stats: gapAnalysis.overallStats,
                  criticalCount: gapAnalysis.criticalIndicators.length,
                  behindCount: gapAnalysis.behindIndicators.length,
                }
              : null,
          });
        }
      }
    }

    // Aggregate scores
    const aggregated = aggregateSchoolScores(summaries);

    // Aggregate gap analyses
    const aggregatedGaps = aggregateSchoolGapAnalysis(gapAnalyses);

    // Format by-area with labels
    const formattedByArea: Record<
      string,
      {
        area: string;
        label: string;
        avgScore: number;
        avgLevel: number;
        levelLabel: string;
        count: number;
        gapStats?: {
          avgGap: number | null;
          ahead: number;
          onTrack: number;
          behind: number;
          critical: number;
        };
      }
    > = {};

    for (const [areaKey, data] of Object.entries(aggregated.byArea)) {
      if (data.count > 0) {
        const areaGaps = aggregatedGaps.byArea[areaKey as TransformationArea];
        formattedByArea[areaKey] = {
          area: areaKey,
          label: AREA_LABELS[areaKey as TransformationArea],
          avgScore: data.avgScore,
          avgLevel: data.avgLevel,
          levelLabel: getMaturityLevelLabel(Math.round(data.avgLevel)),
          count: data.count,
          gapStats: areaGaps
            ? {
                avgGap: areaGaps.avgGap,
                ahead: areaGaps.stats.ahead,
                onTrack: areaGaps.stats.onTrack,
                behind: areaGaps.stats.behind,
                critical: areaGaps.stats.critical,
              }
            : undefined,
        };
      }
    }

    // Calculate expected level comparison
    const expectedLevelForYear = getExpectedLevelByYear(transformationYear);

    return res.status(200).json({
      success: true,
      school: {
        id: schoolId,
        name: school?.name || 'Escuela',
      },
      transformationYear,
      expectedLevel: {
        level: expectedLevelForYear,
        label: getMaturityLevelLabel(expectedLevelForYear),
      },
      results: {
        byArea: formattedByArea,
        overall: {
          avgScore: aggregated.overall.avgScore,
          avgLevel: aggregated.overall.avgLevel,
          levelLabel: getMaturityLevelLabel(Math.round(aggregated.overall.avgLevel)),
          totalInstances: aggregated.overall.totalInstances,
          meetsExpectations: aggregated.overall.avgLevel >= expectedLevelForYear,
        },
      },
      // Gap analysis summary for the entire school
      gapAnalysis: {
        avgGap: aggregatedGaps.overall.avgGap,
        stats: aggregatedGaps.overall.stats,
        topCriticalIndicators: aggregatedGaps.topCriticalIndicators,
      },
      instances: includeDetails === 'true' ? instanceDetails : undefined,
    });
  } catch (err: any) {
    console.error('Unexpected error fetching school results:', err);
    return res.status(500).json({ error: err.message || 'Error al obtener resultados' });
  }
}

// Helper to get expected level (import from types doesn't work directly in API)
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
