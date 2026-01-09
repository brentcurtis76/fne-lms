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

    // Get instance with snapshot
    const { data: instance, error: instanceError } = await supabaseClient
      .from('assessment_instances')
      .select(`
        id,
        status,
        template_snapshot_id,
        assessment_template_snapshots:template_snapshot_id (
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
      .select('indicator_id, coverage_value, frequency_value, profundity_level')
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

    // Validate all required indicators are answered
    const snapshot = instance.assessment_template_snapshots as any;
    const snapshotData = snapshot?.snapshot_data;
    const modules = snapshotData?.modules || [];

    const missingIndicators: string[] = [];

    modules.forEach((module: any) => {
      (module.indicators || []).forEach((indicator: any) => {
        const response = responseMap.get(indicator.id);

        if (!response) {
          missingIndicators.push(indicator.name || indicator.id);
          return;
        }

        // Check if response has appropriate value based on category
        const hasValue =
          (indicator.category === 'cobertura' && response.coverage_value !== null) ||
          (indicator.category === 'frecuencia' && response.frequency_value !== null) ||
          (indicator.category === 'profundidad' && response.profundity_level !== null);

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
