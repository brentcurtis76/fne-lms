import { NextApiRequest, NextApiResponse } from 'next';
import { getApiUser, createApiSupabaseClient, sendAuthError, handleMethodNotAllowed } from '@/lib/api-auth';
import { calculateAndSaveScores } from '@/lib/services/assessment-builder/scoringService';

/**
 * POST /api/docente/assessments/[instanceId]/submit
 *
 * Submits a completed assessment.
 * Validates that all required indicators have responses.
 * Changes status to 'completed' and sets completed_at timestamp.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return handleMethodNotAllowed(res, ['POST']);
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
    // Verify the user is assigned to this instance and can submit
    const { data: assignee, error: assigneeError } = await supabaseClient
      .from('assessment_instance_assignees')
      .select('*')
      .eq('instance_id', instanceId)
      .eq('user_id', user.id)
      .single();

    if (assigneeError || !assignee) {
      return res.status(403).json({
        error: 'No tienes permiso para enviar esta evaluación'
      });
    }

    if (!assignee.can_submit) {
      return res.status(403).json({
        error: 'No tienes permiso para enviar esta evaluación'
      });
    }

    if (assignee.has_submitted) {
      return res.status(400).json({
        error: 'Esta evaluación ya fue enviada anteriormente'
      });
    }

    // Get instance with snapshot (R12: also fetch transformation_year, generation_type, template_id)
    const { data: instance, error: instanceError } = await supabaseClient
      .from('assessment_instances')
      .select(`
        id,
        status,
        transformation_year,
        generation_type,
        template_snapshot_id,
        assessment_template_snapshots:template_snapshot_id (
          template_id,
          snapshot_data
        )
      `)
      .eq('id', instanceId)
      .single();

    if (instanceError || !instance) {
      return res.status(404).json({ error: 'Evaluación no encontrada' });
    }

    // Don't allow submitting completed/archived instances
    if (instance.status === 'completed' || instance.status === 'archived') {
      return res.status(400).json({
        error: 'Esta evaluación ya está completada'
      });
    }

    // Get all responses for this instance
    const { data: responses, error: responsesError } = await supabaseClient
      .from('assessment_responses')
      .select('indicator_id, coverage_value, frequency_value, profundity_level, sub_responses')
      .eq('instance_id', instanceId);

    if (responsesError) {
      console.error('Error fetching responses:', responsesError);
      return res.status(500).json({ error: 'Error al verificar respuestas' });
    }

    // Build response map
    const responseMap = new Map<string, any>();
    (responses || []).forEach((resp: any) => {
      responseMap.set(resp.indicator_id, resp);
    });

    // R12: Fetch year expectations to determine active indicators for this instance
    const snapshot = instance.assessment_template_snapshots as any;
    const snapshotData = snapshot?.snapshot_data;

    // Dual-path: use objectives hierarchy if present, fall back to flat modules
    const snapshotObjectives = snapshotData?.objectives || [];
    const flatModules = snapshotData?.modules || [];
    const modulesToValidate = snapshotObjectives.length > 0
      ? snapshotObjectives.flatMap((o: any) => o.modules || [])
      : flatModules;

    // Build active indicator set (R12)
    const templateId = snapshot?.template_id;
    const transformationYear = instance.transformation_year;
    const generationType = instance.generation_type as string;
    if (!generationType || !['GT', 'GI'].includes(generationType)) {
      return res.status(400).json({
        error: `Tipo de generación inválido: ${generationType || 'no definido'}`
      });
    }

    let activeIndicatorIds: Set<string> | null = null;

    if (templateId && transformationYear) {
      const yearKey = `year_${transformationYear}_expected`;
      const { data: expData, error: expError } = await supabaseClient
        .from('assessment_year_expectations')
        .select('indicator_id, ' + yearKey)
        .eq('template_id', templateId)
        .eq('generation_type', generationType);

      if (!expError && expData && expData.length > 0) {
        activeIndicatorIds = new Set<string>();
        for (const row of expData) {
          const r = row as any;
          const expectedValue = r[yearKey];
          if (expectedValue !== null && expectedValue !== undefined) {
            activeIndicatorIds.add(r.indicator_id);
          }
        }
      }
      // If error or no data: leave activeIndicatorIds null (validate all indicators — backward compat)
    }

    const missingIndicators: string[] = [];

    modulesToValidate.forEach((module: any) => {
      (module.indicators || []).forEach((indicator: any) => {
        // R12: skip inactive indicators (if expectations data exists)
        if (activeIndicatorIds !== null && !activeIndicatorIds.has(indicator.id)) {
          return;
        }

        // Legacy mode: when no year expectations data is available, skip traspaso/detalle
        // (they are descriptive-only and were never required in the original validation).
        if (activeIndicatorIds === null && (indicator.category === 'traspaso' || indicator.category === 'detalle')) {
          return;
        }

        const response = responseMap.get(indicator.id);

        if (!response) {
          missingIndicators.push(indicator.name || indicator.id);
          return;
        }

        // Check if response has appropriate value based on category
        let hasValue = false;
        switch (indicator.category) {
          case 'cobertura':
            hasValue = response.coverage_value !== null;
            break;
          case 'frecuencia':
            hasValue = response.frequency_value !== null;
            break;
          case 'profundidad':
            hasValue = response.profundity_level !== null;
            break;
          case 'traspaso': {
            const sub = response.sub_responses as Record<string, unknown> | undefined;
            const evidenceLink = sub?.evidence_link;
            const suggestions = sub?.improvement_suggestions;
            hasValue =
              (typeof evidenceLink === 'string' && evidenceLink.trim().length > 0) ||
              (typeof suggestions === 'string' && suggestions.trim().length > 0);
            break;
          }
          case 'detalle': {
            const sub = response.sub_responses as Record<string, unknown> | undefined;
            const selectedOptions = sub?.selected_options;
            hasValue = Array.isArray(selectedOptions) && selectedOptions.length > 0;
            break;
          }
        }

        if (!hasValue) {
          missingIndicators.push(indicator.name || indicator.id);
        }
      });
    });

    if (missingIndicators.length > 0) {
      return res.status(400).json({
        error: 'Faltan respuestas para algunos indicadores',
        missingIndicators: missingIndicators.slice(0, 10), // Limit to first 10
        missingCount: missingIndicators.length,
      });
    }

    // All validations passed - mark as completed
    const completedAt = new Date().toISOString();

    // Update instance status
    const { error: updateInstanceError } = await supabaseClient
      .from('assessment_instances')
      .update({
        status: 'completed',
        completed_at: completedAt,
      })
      .eq('id', instanceId);

    if (updateInstanceError) {
      console.error('Error updating instance:', updateInstanceError);
      return res.status(500).json({ error: 'Error al completar la evaluación' });
    }

    // Update assignee as submitted
    const { error: updateAssigneeError } = await supabaseClient
      .from('assessment_instance_assignees')
      .update({
        has_submitted: true,
      })
      .eq('id', assignee.id);

    if (updateAssigneeError) {
      console.error('Error updating assignee:', updateAssigneeError);
      // Don't fail the request, instance is already marked complete
    }

    // Auto-calculate scores on submit
    const scoringResult = await calculateAndSaveScores(
      supabaseClient,
      instanceId,
      user.id
    );

    if (!scoringResult.success) {
      console.error('Error calculating scores:', scoringResult.error);
      // Don't fail the submit - scores can be recalculated later
    }

    return res.status(200).json({
      success: true,
      message: 'Evaluación enviada correctamente',
      completedAt,
      scoring: scoringResult.success
        ? {
            totalScore: scoringResult.summary?.totalScore,
            overallLevel: scoringResult.summary?.overallLevel,
            meetsExpectations: (scoringResult.summary?.overallLevel ?? 0) >= (scoringResult.summary?.expectedLevel ?? 0),
          }
        : undefined,
    });
  } catch (err: any) {
    console.error('Unexpected error submitting assessment:', err);
    return res.status(500).json({ error: err.message || 'Error al enviar la evaluación' });
  }
}
