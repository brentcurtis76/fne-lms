import { NextApiRequest, NextApiResponse } from 'next';
import { getApiUser, createApiSupabaseClient, sendAuthError, handleMethodNotAllowed } from '@/lib/api-auth';
import type { SaveResponseRequest } from '@/types/assessment-builder';

/**
 * PUT /api/docente/assessments/[instanceId]/responses
 *
 * Saves responses for an assessment instance.
 * Supports partial saves (auto-save as user fills out form).
 * Uses upsert to handle both new and updated responses.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'PUT') {
    return handleMethodNotAllowed(res, ['PUT']);
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
    // Verify the user is assigned to this instance and can edit
    const { data: assignee, error: assigneeError } = await supabaseClient
      .from('assessment_instance_assignees')
      .select('*')
      .eq('instance_id', instanceId)
      .eq('user_id', user.id)
      .single();

    if (assigneeError || !assignee) {
      return res.status(403).json({
        error: 'No tienes permiso para responder esta evaluación'
      });
    }

    if (!assignee.can_edit) {
      return res.status(403).json({
        error: 'No tienes permiso de edición para esta evaluación'
      });
    }

    // Get instance to check status
    const { data: instance, error: instanceError } = await supabaseClient
      .from('assessment_instances')
      .select('id, status, template_snapshot_id')
      .eq('id', instanceId)
      .single();

    if (instanceError || !instance) {
      return res.status(404).json({ error: 'Evaluación no encontrada' });
    }

    // Don't allow editing completed/archived instances
    if (instance.status === 'completed' || instance.status === 'archived') {
      return res.status(400).json({
        error: 'Esta evaluación ya está completada y no puede ser modificada'
      });
    }

    // Parse request body
    const { responses } = req.body as { responses: Omit<SaveResponseRequest, 'instance_id'>[] };

    if (!responses || !Array.isArray(responses)) {
      return res.status(400).json({ error: 'Se requiere un array de respuestas' });
    }

    // Get snapshot to validate indicator IDs exist
    const { data: snapshot, error: snapshotError } = await supabaseClient
      .from('assessment_template_snapshots')
      .select('snapshot_data')
      .eq('id', instance.template_snapshot_id)
      .single();

    if (snapshotError || !snapshot) {
      return res.status(500).json({ error: 'Error al obtener plantilla' });
    }

    // Build set of valid indicator IDs from snapshot
    const validIndicatorIds = new Set<string>();
    const indicatorCategories = new Map<string, string>();

    const modules = (snapshot.snapshot_data as any)?.modules || [];
    modules.forEach((module: any) => {
      (module.indicators || []).forEach((indicator: any) => {
        validIndicatorIds.add(indicator.id);
        indicatorCategories.set(indicator.id, indicator.category);
      });
    });

    // Validate each response
    const errors: string[] = [];
    const validResponses: any[] = [];

    for (const response of responses) {
      if (!response.indicator_id) {
        errors.push('indicator_id es requerido para cada respuesta');
        continue;
      }

      if (!validIndicatorIds.has(response.indicator_id)) {
        errors.push(`Indicador ${response.indicator_id} no existe en esta evaluación`);
        continue;
      }

      const category = indicatorCategories.get(response.indicator_id);

      // Validate response matches category type
      if (category === 'cobertura' && response.coverage_value === undefined) {
        // Allow empty/partial saves, just skip validation
      }
      if (category === 'frecuencia' && response.frequency_value !== undefined) {
        if (typeof response.frequency_value !== 'number') {
          errors.push(`Indicador ${response.indicator_id}: frecuencia debe ser un número`);
          continue;
        }
      }
      if (category === 'profundidad' && response.profundity_level !== undefined) {
        if (typeof response.profundity_level !== 'number' ||
            response.profundity_level < 0 ||
            response.profundity_level > 4) {
          errors.push(`Indicador ${response.indicator_id}: nivel debe ser 0-4`);
          continue;
        }
      }

      validResponses.push({
        instance_id: instanceId,
        indicator_id: response.indicator_id,
        coverage_value: response.coverage_value ?? null,
        frequency_value: response.frequency_value ?? null,
        frequency_unit: response.frequency_unit ?? null,
        profundity_level: response.profundity_level ?? null,
        rationale: response.rationale ?? null,
        evidence_notes: response.evidence_notes ?? null,
        sub_responses: response.sub_responses ?? null,
        responded_by: user.id,
        responded_at: new Date().toISOString(),
      });
    }

    if (validResponses.length === 0) {
      return res.status(400).json({
        error: 'No hay respuestas válidas para guardar',
        details: errors,
      });
    }

    // Upsert responses (update if exists, insert if not)
    const { data: savedResponses, error: saveError } = await supabaseClient
      .from('assessment_responses')
      .upsert(validResponses, {
        onConflict: 'instance_id,indicator_id',
        ignoreDuplicates: false,
      })
      .select();

    if (saveError) {
      console.error('Error saving responses:', saveError);
      return res.status(500).json({ error: 'Error al guardar respuestas' });
    }

    // Update instance status to in_progress if it was pending
    if (instance.status === 'pending') {
      await supabaseClient
        .from('assessment_instances')
        .update({
          status: 'in_progress',
          started_at: new Date().toISOString(),
        })
        .eq('id', instanceId);
    }

    // Mark assignee as started
    if (!assignee.has_started) {
      await supabaseClient
        .from('assessment_instance_assignees')
        .update({ has_started: true })
        .eq('id', assignee.id);
    }

    return res.status(200).json({
      success: true,
      saved: savedResponses?.length || 0,
      errors: errors.length > 0 ? errors : undefined,
      message: 'Respuestas guardadas correctamente',
    });
  } catch (err: any) {
    console.error('Unexpected error saving responses:', err);
    return res.status(500).json({ error: err.message || 'Error al guardar respuestas' });
  }
}
