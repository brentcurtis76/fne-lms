import { NextApiRequest, NextApiResponse } from 'next';
import { getApiUser, createApiSupabaseClient, sendAuthError, handleMethodNotAllowed } from '@/lib/api-auth';
import {
  getInstanceResults,
  calculateAndSaveScores,
  fetchInstanceGapAnalysis,
} from '@/lib/services/assessment-builder/scoringService';
import { getMaturityLevelLabel, AREA_LABELS, TransformationArea } from '@/types/assessment-builder';

/**
 * GET /api/docente/assessments/[instanceId]/results
 *
 * Returns the calculated results for a completed assessment instance.
 * Only accessible by users assigned to the instance.
 * If results don't exist yet, recalculates them.
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

  const { instanceId } = req.query;
  if (!instanceId || typeof instanceId !== 'string') {
    return res.status(400).json({ error: 'instanceId es requerido' });
  }

  const supabaseClient = await createApiSupabaseClient(req, res);

  try {
    // Verify the user is assigned to this instance
    const { data: assignee, error: assigneeError } = await supabaseClient
      .from('assessment_instance_assignees')
      .select('*')
      .eq('instance_id', instanceId)
      .eq('user_id', user.id)
      .single();

    if (assigneeError || !assignee) {
      return res.status(403).json({
        error: 'No tienes permiso para ver los resultados de esta evaluación',
      });
    }

    // Get instance to check status
    const { data: instance, error: instanceError } = await supabaseClient
      .from('assessment_instances')
      .select(
        `
        id,
        status,
        completed_at,
        transformation_year,
        generation_type,
        school_id,
        course_structure_id,
        template_snapshot_id,
        assessment_template_snapshots!inner (
          version,
          snapshot_data
        )
      `
      )
      .eq('id', instanceId)
      .single();

    if (instanceError || !instance) {
      return res.status(404).json({ error: 'Evaluación no encontrada' });
    }

    // Only show results for completed instances
    if (instance.status !== 'completed') {
      return res.status(400).json({
        error: 'Los resultados solo están disponibles para evaluaciones completadas',
        status: instance.status,
      });
    }

    // Try to get existing results
    let summary = await getInstanceResults(supabaseClient, instanceId);

    // If no results exist, calculate them
    if (!summary) {
      const calcResult = await calculateAndSaveScores(supabaseClient, instanceId, user.id);
      if (!calcResult.success || !calcResult.summary) {
        return res.status(500).json({
          error: calcResult.error || 'Error al calcular resultados',
        });
      }
      summary = calcResult.summary;
    }

    // Get template info from snapshot
    const snapshotData = (instance as any).assessment_template_snapshots?.snapshot_data;
    const templateInfo = snapshotData?.template || {};

    // Get gap analysis data
    const gapAnalysis = await fetchInstanceGapAnalysis(supabaseClient, instanceId);

    // Format response with rich data for UI
    const response = {
      success: true,
      instance: {
        id: instance.id,
        status: instance.status,
        completedAt: instance.completed_at,
        transformationYear: instance.transformation_year,
        generationType: (instance as any).generation_type || 'GT',
        snapshotVersion: (instance as any).assessment_template_snapshots?.version,
      },
      template: {
        name: templateInfo.name,
        area: templateInfo.area as TransformationArea,
        areaLabel: AREA_LABELS[templateInfo.area as TransformationArea] || templateInfo.area,
        description: templateInfo.description,
      },
      results: {
        totalScore: summary.totalScore,
        overallLevel: summary.overallLevel,
        overallLevelLabel: getMaturityLevelLabel(summary.overallLevel),
        expectedLevel: summary.expectedLevel,
        expectedLevelLabel: getMaturityLevelLabel(summary.expectedLevel),
        meetsExpectations: summary.overallLevel >= summary.expectedLevel,
        moduleScores: summary.moduleScores.map((m) => {
          // Find gap analysis for this module
          const moduleGap = gapAnalysis?.modules.find((mg) => mg.moduleId === m.moduleId);

          return {
            moduleId: m.moduleId,
            moduleName: m.moduleName,
            moduleScore: m.moduleScore,
            moduleWeight: m.moduleWeight,
            level: Math.round(m.moduleScore / 25), // Approximate level from score
            gapStats: moduleGap
              ? {
                  ahead: moduleGap.stats.ahead,
                  onTrack: moduleGap.stats.onTrack,
                  behind: moduleGap.stats.behind,
                  critical: moduleGap.stats.critical,
                  avgGap: moduleGap.avgGap,
                }
              : null,
            indicators: m.indicators.map((i) => {
              // Find gap analysis for this indicator
              const indicatorGap = moduleGap?.indicators.find(
                (ig) => ig.indicatorId === i.indicatorId
              );

              return {
                indicatorId: i.indicatorId,
                indicatorName: i.indicatorName,
                category: i.category,
                rawValue: i.rawValue,
                normalizedScore: i.normalizedScore,
                weight: i.weight,
                isAboveExpectation: i.isAboveExpectation,
                // Gap analysis fields
                gap: indicatorGap
                  ? {
                      actualLevel: indicatorGap.actualLevel,
                      expectedLevel: indicatorGap.expectedLevel,
                      gap: indicatorGap.gap,
                      classification: indicatorGap.classification,
                      tolerance: indicatorGap.tolerance,
                    }
                  : null,
              };
            }),
          };
        }),
      },
      // Summary stats for quick display
      stats: {
        totalModules: summary.moduleScores.length,
        totalIndicators: summary.moduleScores.reduce((sum, m) => sum + m.indicators.length, 0),
        indicatorsAboveExpectation: summary.moduleScores.reduce(
          (sum, m) => sum + m.indicators.filter((i) => i.isAboveExpectation).length,
          0
        ),
        strongestModule:
          summary.moduleScores.length > 0
            ? summary.moduleScores.reduce((best, m) =>
                m.moduleScore > best.moduleScore ? m : best
              ).moduleName
            : null,
        weakestModule:
          summary.moduleScores.length > 0
            ? summary.moduleScores.reduce((worst, m) =>
                m.moduleScore < worst.moduleScore ? m : worst
              ).moduleName
            : null,
      },
      // Gap analysis summary
      gapAnalysis: gapAnalysis
        ? {
            overallStats: gapAnalysis.overallStats,
            avgGap: gapAnalysis.avgGap,
            criticalIndicators: gapAnalysis.criticalIndicators.map((ci) => ({
              indicatorName: ci.indicatorName,
              indicatorCode: ci.indicatorCode,
              actualLevel: ci.actualLevel,
              expectedLevel: ci.expectedLevel,
              gap: ci.gap,
            })),
            behindIndicators: gapAnalysis.behindIndicators.map((bi) => ({
              indicatorName: bi.indicatorName,
              indicatorCode: bi.indicatorCode,
              actualLevel: bi.actualLevel,
              expectedLevel: bi.expectedLevel,
              gap: bi.gap,
            })),
          }
        : null,
    };

    return res.status(200).json(response);
  } catch (err: any) {
    console.error('Unexpected error fetching results:', err);
    return res.status(500).json({ error: err.message || 'Error al obtener resultados' });
  }
}
