import { NextApiRequest, NextApiResponse } from 'next';
import { getApiUser, createServiceRoleClient, sendAuthError, handleMethodNotAllowed } from '@/lib/api-auth';
import { updatePublishedTemplateSnapshot } from '@/lib/services/assessment-builder/autoAssignmentService';
import { hasAssessmentReadPermission, hasAssessmentWritePermission } from '@/lib/assessment-permissions';
import type { IndicatorCategory } from '@/types/assessment-builder';
import { validateDetalleOptions } from '@/lib/validation/detalleValidator';
import { validateProfundidadDescriptors } from '@/lib/validation/profundidadValidator';
import { normalizeIndicatorText } from '@/lib/validation/indicatorNormalize';
import { mapIndicatorRow } from '@/lib/services/assessment-builder/indicatorMapper';
import {
  describeExpectationConflict,
  frequencyExpectationConflicts,
  type FrequencyExpectationConflict,
} from '@/lib/services/assessment-builder/frequencyConfig';

const VALID_CATEGORIES: IndicatorCategory[] = ['cobertura', 'frecuencia', 'profundidad', 'traspaso', 'detalle'];

// The five level descriptors, so pick / effective-state / update all iterate one
// list instead of repeating each digit at four sites (transposition-bug guard).
const LEVEL_DESCRIPTOR_KEYS = [0, 1, 2, 3, 4].map((n) => ({
  camel: `level${n}Descriptor`,
  snake: `level_${n}_descriptor`,
}));

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { templateId, moduleId, indicatorId } = req.query;

  if (!templateId || typeof templateId !== 'string') {
    return res.status(400).json({ error: 'ID de template inválido' });
  }

  if (!moduleId || typeof moduleId !== 'string') {
    return res.status(400).json({ error: 'ID de módulo inválido' });
  }

  if (!indicatorId || typeof indicatorId !== 'string') {
    return res.status(400).json({ error: 'ID de indicador inválido' });
  }

  // Authentication check
  const { user, error: authError } = await getApiUser(req, res);
  if (authError || !user) {
    return sendAuthError(res, 'Autenticación requerida');
  }

  // Use service role client for data operations (auth is handled above)
  const serviceClient = createServiceRoleClient();

  // Read permission check (admin or consultor)
  const canRead = await hasAssessmentReadPermission(serviceClient, user.id);
  if (!canRead) {
    return res.status(403).json({ error: 'No tienes permiso para acceder al constructor de evaluaciones' });
  }

  // Verify template exists
  const { data: template, error: templateError } = await serviceClient
    .from('assessment_templates')
    .select('id, status, is_archived')
    .eq('id', templateId)
    .single();

  if (templateError || !template) {
    return res.status(404).json({ error: 'Template no encontrado' });
  }

  // Verify module exists and belongs to template
  const { data: module, error: moduleError } = await serviceClient
    .from('assessment_modules')
    .select('id, template_id')
    .eq('id', moduleId)
    .single();

  if (moduleError || !module) {
    return res.status(404).json({ error: 'Módulo no encontrado' });
  }

  if (module.template_id !== templateId) {
    return res.status(400).json({ error: 'El módulo no pertenece a este template' });
  }

  // Verify indicator exists and belongs to module. Select the category-specific
  // columns too so handlePut can validate the effective post-update state without
  // a second round-trip.
  const { data: indicator, error: indicatorError } = await serviceClient
    .from('assessment_indicators')
    .select('id, module_id, code, name, category, frequency_config, level_0_descriptor, level_1_descriptor, level_2_descriptor, level_3_descriptor, level_4_descriptor, detalle_options')
    .eq('id', indicatorId)
    .single();

  if (indicatorError || !indicator) {
    return res.status(404).json({ error: 'Indicador no encontrado' });
  }

  if (indicator.module_id !== moduleId) {
    return res.status(400).json({ error: 'El indicador no pertenece a este módulo' });
  }

  switch (req.method) {
    case 'GET':
      return handleGet(req, res, serviceClient, indicatorId);
    case 'PUT':
    case 'DELETE': {
      const canWrite = await hasAssessmentWritePermission(serviceClient, user.id);
      if (!canWrite) {
        return res.status(403).json({ error: 'Solo administradores pueden modificar indicadores' });
      }
      if (template.is_archived) {
        return res.status(400).json({ error: 'Los templates archivados no pueden ser modificados' });
      }
      if (req.method === 'PUT') {
        return handlePut(req, res, serviceClient, templateId, moduleId, indicatorId, user.id, indicator, template.status);
      }
      return handleDelete(req, res, serviceClient, indicatorId, moduleId, templateId, user.id);
    }
    default:
      return handleMethodNotAllowed(res, ['GET', 'PUT', 'DELETE']);
  }
}

// GET /api/admin/assessment-builder/templates/[templateId]/modules/[moduleId]/indicators/[indicatorId]
async function handleGet(
  req: NextApiRequest,
  res: NextApiResponse,
  serviceClient: any,
  indicatorId: string
) {
  try {
    const { data: indicator, error } = await serviceClient
      .from('assessment_indicators')
      .select(`
        id,
        module_id,
        code,
        name,
        description,
        category,
        frequency_config,
        frequency_unit_options,
        level_0_descriptor,
        level_1_descriptor,
        level_2_descriptor,
        level_3_descriptor,
        level_4_descriptor,
        detalle_options,
        evaluation_guidance,
        display_order,
        weight,
        visibility_condition,
        created_at,
        updated_at
      `)
      .eq('id', indicatorId)
      .single();

    if (error) {
      console.error('Error fetching indicator:', error);
      return res.status(500).json({ error: 'Error al obtener el indicador' });
    }

    return res.status(200).json({
      success: true,
      indicator: mapIndicatorRow(indicator),
    });

  } catch (err: any) {
    console.error('Unexpected error fetching indicator:', err);
    return res.status(500).json({ error: err.message || 'Error al obtener indicador' });
  }
}

// PUT /api/admin/assessment-builder/templates/[templateId]/modules/[moduleId]/indicators/[indicatorId]
async function handlePut(
  req: NextApiRequest,
  res: NextApiResponse,
  serviceClient: any,
  templateId: string,
  moduleId: string,
  indicatorId: string,
  userId: string,
  currentRow: any,
  templateStatus: string
) {
  try {
    // Guard against non-object JSON bodies (e.g. a bare string/number/array),
    // otherwise the `in` operator below throws and turns a bad request into a 500.
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      return res.status(400).json({ error: 'Cuerpo de solicitud inválido' });
    }
    const body = req.body as Record<string, unknown>;

    // Presence-based fallback: camelCase wins; snake_case only if camelCase absent.
    // Using `in` (not `??`) so an explicit `null` on the camelCase key clears the column.
    const pick = (camel: string, snake: string): unknown =>
      camel in body ? body[camel] : (snake in body ? body[snake] : undefined);

    const code = body.code;
    const name = body.name;
    const description = body.description;
    const category = body.category;
    const detalleOptions = pick('detalleOptions', 'detalle_options');
    const weight = body.weight;

    const evaluationGuidance = pick('evaluationGuidance', 'evaluation_guidance');
    const frequencyConfig = pick('frequencyConfig', 'frequency_config');
    const frequencyUnitOptions = pick('frequencyUnitOptions', 'frequency_unit_options');
    const visibilityCondition = pick('visibilityCondition', 'visibility_condition');

    // Level descriptors, de-duplicated via LEVEL_DESCRIPTOR_KEYS.
    const descriptorProvided = LEVEL_DESCRIPTOR_KEYS.map(({ camel, snake }) => camel in body || snake in body);
    const descriptorValues = LEVEL_DESCRIPTOR_KEYS.map(({ camel, snake }) => pick(camel, snake));
    const anyDescriptorProvided = descriptorProvided.some(Boolean);

    // Validate category if provided
    if (category !== undefined && !VALID_CATEGORIES.includes(category as IndicatorCategory)) {
      return res.status(400).json({
        error: 'Categoría inválida. Debe ser: cobertura, frecuencia, profundidad, traspaso, o detalle',
      });
    }

    // Reject an explicitly-provided empty name (PUT is partial — an absent name is fine)
    if (name !== undefined && (typeof name !== 'string' || name.trim().length === 0)) {
      return res.status(400).json({ error: 'El nombre del indicador es requerido' });
    }

    // Validate the shapes of the structured fields so malformed input is a 400,
    // not a Postgres error surfaced as a 500.
    if (weight !== undefined && (typeof weight !== 'number' || !Number.isFinite(weight) || weight < 0 || weight > 10)) {
      return res.status(400).json({ error: 'El peso debe ser un número entre 0 y 10' });
    }
    if (frequencyConfig !== undefined && frequencyConfig !== null && (typeof frequencyConfig !== 'object' || Array.isArray(frequencyConfig))) {
      return res.status(400).json({ error: 'Configuración de frecuencia inválida' });
    }
    if (frequencyUnitOptions !== undefined && frequencyUnitOptions !== null && !Array.isArray(frequencyUnitOptions)) {
      return res.status(400).json({ error: 'Los períodos permitidos deben ser un arreglo' });
    }
    if (visibilityCondition !== undefined && visibilityCondition !== null && (typeof visibilityCondition !== 'object' || Array.isArray(visibilityCondition))) {
      return res.status(400).json({ error: 'Condición de visibilidad inválida' });
    }

    // Effective post-update state = current row (passed from the existence check)
    // merged with the request body. Explicit `null` counts as provided.
    const effectiveCategory = category !== undefined ? category : currentRow.category;

    // Profundidad must keep >=1 non-empty descriptor — but only judge this when the
    // request actually touches category or descriptors. A pure rename/weight/visibility
    // edit can't worsen the invariant, and must not be blocked on legacy descriptor-less rows.
    if (effectiveCategory === 'profundidad' && (category !== undefined || anyDescriptorProvided)) {
      const effectiveDescriptors = LEVEL_DESCRIPTOR_KEYS.map(({ snake }, i) =>
        descriptorProvided[i] ? descriptorValues[i] : currentRow[snake]
      );
      const result = validateProfundidadDescriptors(effectiveDescriptors);
      if (!result.valid) {
        return res.status(400).json({ error: result.error });
      }
    }

    // Validate detalle options. When re-affirming category 'detalle' without new
    // options, fall back to the row's current options (effective-state parity).
    let validatedDetalleOptions: string[] | undefined = undefined;
    if (effectiveCategory === 'detalle' && (category === 'detalle' || detalleOptions !== undefined)) {
      const optsToValidate = detalleOptions !== undefined ? detalleOptions : currentRow.detalle_options;
      const result = validateDetalleOptions(optsToValidate);
      if (!result.valid) {
        return res.status(400).json({ error: result.error });
      }
      validatedDetalleOptions = result.options!;
    }

    // Enforce cobertura lock: first indicator in a module must stay cobertura
    if (category && category !== 'cobertura') {
      const { data: indicators } = await serviceClient
        .from('assessment_indicators')
        .select('id, display_order')
        .eq('module_id', moduleId)
        .order('display_order', { ascending: true })
        .limit(1);

      if (indicators?.[0]?.id === indicatorId) {
        return res.status(400).json({
          error: 'El primer indicador de cada práctica generativa debe ser de tipo Cobertura y no puede ser modificado'
        });
      }
    }

    // Build update object. Category-specific columns are preserved on a category
    // change (not nulled) — the snapshot builders hide off-category columns, so a
    // switch never destroys data and reappears if the category is switched back.
    const updateData: Record<string, unknown> = {};
    if (code !== undefined) updateData.code = normalizeIndicatorText(code);
    if (name !== undefined) updateData.name = (name as string).trim();
    if (description !== undefined) updateData.description = normalizeIndicatorText(description);
    if (evaluationGuidance !== undefined) updateData.evaluation_guidance = normalizeIndicatorText(evaluationGuidance);
    if (category !== undefined) updateData.category = category;
    // frequency_config is a full-replace of the jsonb column by design; the client
    // merges onto the existing config so hidden scoring fields aren't wiped.
    if (frequencyConfig !== undefined) updateData.frequency_config = frequencyConfig;
    if (frequencyUnitOptions !== undefined) updateData.frequency_unit_options = frequencyUnitOptions;
    LEVEL_DESCRIPTOR_KEYS.forEach(({ snake }, i) => {
      if (descriptorProvided[i]) updateData[snake] = normalizeIndicatorText(descriptorValues[i]);
    });
    if (validatedDetalleOptions !== undefined) updateData.detalle_options = validatedDetalleOptions;
    if (weight !== undefined) updateData.weight = weight;
    if (visibilityCondition !== undefined) updateData.visibility_condition = visibilityCondition;

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: 'No hay campos para actualizar' });
    }

    // F1: year expectations must stay answerable under the indicator's rules.
    // A draft template may be saved anyway (publish refuses it until the
    // expectations are fixed) and gets the conflicts back as warnings; a
    // published template has no later gate, so the change is refused.
    let expectationConflicts: Array<FrequencyExpectationConflict & { indicator: string }> = [];
    // effectiveCategory: computed above (post-update category)
    if (effectiveCategory === 'frecuencia' && (frequencyConfig !== undefined || category !== undefined)) {
      const effectiveConfig = frequencyConfig !== undefined ? frequencyConfig : currentRow?.frequency_config;
      const { data: expectationRows, error: expectationsError } = await serviceClient
        .from('assessment_year_expectations')
        .select('generation_type, year_1_expected, year_2_expected, year_3_expected, year_4_expected, year_5_expected')
        .eq('template_id', templateId)
        .eq('indicator_id', indicatorId);
      if (expectationsError) {
        console.error('Error fetching expectations for indicator check:', expectationsError);
        return res.status(500).json({ error: 'Error al verificar las expectativas del indicador' });
      }
      const label =
        (code !== undefined ? normalizeIndicatorText(code) : currentRow?.code) ||
        (name !== undefined ? (name as string).trim() : currentRow?.name) ||
        indicatorId;
      expectationConflicts = frequencyExpectationConflicts(effectiveConfig, expectationRows || [])
        .map((conflict) => ({ ...conflict, indicator: String(label) }));
      if (expectationConflicts.length > 0 && templateStatus === 'published') {
        return res.status(409).json({
          error:
            'No se guardó: este template ya está publicado y las nuevas reglas de frecuencia dejarían expectativas fuera de rango. ' +
            'Corrige primero las expectativas.',
          code: 'expectations_out_of_range',
          details: expectationConflicts.map(describeExpectationConflict),
        });
      }
    }

    // Update indicator
    const { data: indicator, error } = await serviceClient
      .from('assessment_indicators')
      .update(updateData)
      .eq('id', indicatorId)
      .select()
      .single();

    if (error) {
      console.error('Error updating indicator:', error);
      return res.status(500).json({ error: 'Error al actualizar el indicador' });
    }

    // Update the snapshot for published templates
    const snapshotResult = await updatePublishedTemplateSnapshot(templateId, userId);
    if (!snapshotResult.success) {
      console.error('Failed to update snapshot:', snapshotResult.error);
    }

    return res.status(200).json({
      success: true,
      indicator: mapIndicatorRow(indicator),
      snapshotUpdated: snapshotResult.success,
      ...(expectationConflicts.length > 0
        ? { expectationWarnings: expectationConflicts.map(describeExpectationConflict) }
        : {}),
    });

  } catch (err: any) {
    console.error('Unexpected error updating indicator:', err);
    return res.status(500).json({ error: 'Error al actualizar indicador' });
  }
}

// DELETE /api/admin/assessment-builder/templates/[templateId]/modules/[moduleId]/indicators/[indicatorId]
async function handleDelete(
  req: NextApiRequest,
  res: NextApiResponse,
  serviceClient: any,
  indicatorId: string,
  moduleId: string,
  templateId: string,
  userId: string
) {
  try {
    // Delete indicator
    const { error } = await serviceClient
      .from('assessment_indicators')
      .delete()
      .eq('id', indicatorId);

    if (error) {
      console.error('Error deleting indicator:', error);
      return res.status(500).json({ error: 'Error al eliminar el indicador' });
    }

    // Re-order remaining indicators
    const { data: remainingIndicators } = await serviceClient
      .from('assessment_indicators')
      .select('id, display_order')
      .eq('module_id', moduleId)
      .order('display_order', { ascending: true });

    if (remainingIndicators && remainingIndicators.length > 0) {
      for (let i = 0; i < remainingIndicators.length; i++) {
        if (remainingIndicators[i].display_order !== i + 1) {
          await serviceClient
            .from('assessment_indicators')
            .update({ display_order: i + 1 })
            .eq('id', remainingIndicators[i].id);
        }
      }
    }

    // Update the snapshot for published templates
    const snapshotResult = await updatePublishedTemplateSnapshot(templateId, userId);
    if (!snapshotResult.success) {
      console.error('Failed to update snapshot:', snapshotResult.error);
    }

    return res.status(200).json({
      success: true,
      message: 'Indicador eliminado correctamente',
      snapshotUpdated: snapshotResult.success,
    });

  } catch (err: any) {
    console.error('Unexpected error deleting indicator:', err);
    return res.status(500).json({ error: err.message || 'Error al eliminar indicador' });
  }
}
