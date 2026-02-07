import { NextApiRequest, NextApiResponse } from 'next';
import { getApiUser, createApiSupabaseClient, sendAuthError, handleMethodNotAllowed } from '@/lib/api-auth';
import { IndicatorCategory } from '@/types/assessment-builder';
import { updatePublishedTemplateSnapshot } from '@/lib/services/assessment-builder/autoAssignmentService';

// Check if user has admin/consultor permissions (queries user_roles table)
async function hasAssessmentAdminPermission(supabaseClient: any, userId: string): Promise<boolean> {
  const { data: roles } = await supabaseClient
    .from('user_roles')
    .select('role_type')
    .eq('user_id', userId)
    .eq('is_active', true);

  if (!roles || roles.length === 0) return false;
  return roles.some((r: any) => ['admin', 'consultor'].includes(r.role_type));
}

/**
 * GET /api/admin/assessment-builder/templates/[templateId]/modules/[moduleId]/indicators/[indicatorId]
 * Returns a single indicator
 *
 * PUT /api/admin/assessment-builder/templates/[templateId]/modules/[moduleId]/indicators/[indicatorId]
 * Updates an indicator
 *
 * DELETE /api/admin/assessment-builder/templates/[templateId]/modules/[moduleId]/indicators/[indicatorId]
 * Deletes an indicator (only if template is draft)
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'PUT' && req.method !== 'DELETE') {
    return handleMethodNotAllowed(res, ['GET', 'PUT', 'DELETE']);
  }

  // Authentication check
  const { user, error: authError } = await getApiUser(req, res);
  if (authError || !user) {
    return sendAuthError(res, 'Autenticación requerida');
  }

  const supabaseClient = await createApiSupabaseClient(req, res);

  // Permission check - query user_roles table
  const hasPermission = await hasAssessmentAdminPermission(supabaseClient, user.id);
  if (!hasPermission) {
    return res.status(403).json({ error: 'No tienes permiso para gestionar indicadores' });
  }

  const { templateId, moduleId, indicatorId } = req.query;
  if (!templateId || typeof templateId !== 'string') {
    return res.status(400).json({ error: 'templateId es requerido' });
  }
  if (!moduleId || typeof moduleId !== 'string') {
    return res.status(400).json({ error: 'moduleId es requerido' });
  }
  if (!indicatorId || typeof indicatorId !== 'string') {
    return res.status(400).json({ error: 'indicatorId es requerido' });
  }

  // Verify indicator exists and belongs to the correct module/template
  const { data: indicator, error: indicatorError } = await supabaseClient
    .from('assessment_indicators')
    .select(`
      *,
      assessment_modules:module_id (
        id,
        template_id
      )
    `)
    .eq('id', indicatorId)
    .single();

  if (indicatorError || !indicator) {
    return res.status(404).json({ error: 'Indicador no encontrado' });
  }

  const module = indicator.assessment_modules as any;
  if (module?.id !== moduleId || module?.template_id !== templateId) {
    return res.status(404).json({ error: 'Indicador no encontrado en este módulo' });
  }

  if (req.method === 'GET') {
    // GET is allowed for any template status (to view indicator)
    return handleGet(res, indicator);
  } else {
    // PUT and DELETE - blocked only for archived templates
    const { data: template, error: templateError } = await supabaseClient
      .from('assessment_templates')
      .select('status, is_archived')
      .eq('id', templateId)
      .single();

    if (templateError || !template) {
      return res.status(404).json({ error: 'Template no encontrado' });
    }

    if (template.is_archived) {
      return res.status(400).json({ error: 'Los templates archivados no pueden ser modificados' });
    }

    if (req.method === 'PUT') {
      return handlePut(req, res, supabaseClient, templateId, indicatorId, indicator, user.id);
    } else {
      return handleDelete(req, res, supabaseClient, templateId, indicatorId, user.id);
    }
  }
}

function handleGet(res: NextApiResponse, indicator: any) {
  return res.status(200).json({
    success: true,
    indicator: {
      id: indicator.id,
      moduleId: indicator.module_id,
      code: indicator.code,
      name: indicator.name,
      description: indicator.description,
      category: indicator.category,
      frequencyConfig: indicator.frequency_config,
      frequencyUnitOptions: indicator.frequency_unit_options,
      level0Descriptor: indicator.level_0_descriptor,
      level1Descriptor: indicator.level_1_descriptor,
      level2Descriptor: indicator.level_2_descriptor,
      level3Descriptor: indicator.level_3_descriptor,
      level4Descriptor: indicator.level_4_descriptor,
      displayOrder: indicator.display_order,
      weight: indicator.weight,
      createdAt: indicator.created_at,
      updatedAt: indicator.updated_at,
    },
  });
}

async function handlePut(
  req: NextApiRequest,
  res: NextApiResponse,
  supabaseClient: any,
  templateId: string,
  indicatorId: string,
  currentIndicator: any,
  userId: string
) {
  try {
    const {
      code,
      name,
      description,
      category,
      frequencyConfig,
      frequencyUnitOptions,
      level0Descriptor,
      level1Descriptor,
      level2Descriptor,
      level3Descriptor,
      level4Descriptor,
      displayOrder,
      weight,
    } = req.body;

    // Build update object with only provided fields
    const updateData: any = {};

    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({ error: 'El nombre del indicador no puede estar vacío' });
      }
      updateData.name = name.trim();
    }

    if (code !== undefined) {
      updateData.code = code?.trim() || null;
    }

    if (description !== undefined) {
      updateData.description = description?.trim() || null;
    }

    if (category !== undefined) {
      const validCategories: IndicatorCategory[] = ['cobertura', 'frecuencia', 'profundidad'];
      if (!validCategories.includes(category)) {
        return res.status(400).json({
          error: 'Categoría inválida. Debe ser: cobertura, frecuencia, o profundidad',
        });
      }
      updateData.category = category;
    }

    // Determine the effective category for validation
    const effectiveCategory = category || currentIndicator.category;

    if (frequencyConfig !== undefined) {
      updateData.frequency_config = effectiveCategory === 'frecuencia' ? frequencyConfig : null;
    }

    if (level0Descriptor !== undefined) {
      updateData.level_0_descriptor = effectiveCategory === 'profundidad' ? (level0Descriptor?.trim() || null) : null;
    }
    if (level1Descriptor !== undefined) {
      updateData.level_1_descriptor = effectiveCategory === 'profundidad' ? (level1Descriptor?.trim() || null) : null;
    }
    if (level2Descriptor !== undefined) {
      updateData.level_2_descriptor = effectiveCategory === 'profundidad' ? (level2Descriptor?.trim() || null) : null;
    }
    if (level3Descriptor !== undefined) {
      updateData.level_3_descriptor = effectiveCategory === 'profundidad' ? (level3Descriptor?.trim() || null) : null;
    }
    if (level4Descriptor !== undefined) {
      updateData.level_4_descriptor = effectiveCategory === 'profundidad' ? (level4Descriptor?.trim() || null) : null;
    }

    if (displayOrder !== undefined) {
      updateData.display_order = displayOrder;
    }

    if (weight !== undefined) {
      updateData.weight = weight;
    }

    if (frequencyUnitOptions !== undefined) {
      updateData.frequency_unit_options = effectiveCategory === 'frecuencia' ? frequencyUnitOptions : null;
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: 'No hay campos para actualizar' });
    }

    const { data: updated, error } = await supabaseClient
      .from('assessment_indicators')
      .update(updateData)
      .eq('id', indicatorId)
      .select()
      .single();

    if (error) {
      console.error('Error updating indicator:', error);
      return res.status(500).json({ error: 'Error al actualizar indicador' });
    }

    // Update the snapshot for published templates
    const snapshotResult = await updatePublishedTemplateSnapshot(templateId, userId);
    if (!snapshotResult.success) {
      console.error('Failed to update snapshot:', snapshotResult.error);
      // Don't fail the request, just log the error
    }

    return res.status(200).json({
      success: true,
      indicator: {
        id: updated.id,
        moduleId: updated.module_id,
        code: updated.code,
        name: updated.name,
        description: updated.description,
        category: updated.category,
        frequencyConfig: updated.frequency_config,
        frequencyUnitOptions: updated.frequency_unit_options,
        level0Descriptor: updated.level_0_descriptor,
        level1Descriptor: updated.level_1_descriptor,
        level2Descriptor: updated.level_2_descriptor,
        level3Descriptor: updated.level_3_descriptor,
        level4Descriptor: updated.level_4_descriptor,
        displayOrder: updated.display_order,
        weight: updated.weight,
        createdAt: updated.created_at,
        updatedAt: updated.updated_at,
      },
      snapshotUpdated: snapshotResult.success,
    });
  } catch (err: any) {
    console.error('Unexpected error updating indicator:', err);
    return res.status(500).json({ error: err.message || 'Error al actualizar indicador' });
  }
}

async function handleDelete(
  req: NextApiRequest,
  res: NextApiResponse,
  supabaseClient: any,
  templateId: string,
  indicatorId: string,
  userId: string
) {
  try {
    // Check if template is archived (archived templates cannot have indicators deleted)
    const { data: template, error: templateError } = await supabaseClient
      .from('assessment_templates')
      .select('status, is_archived')
      .eq('id', templateId)
      .single();

    if (templateError || !template) {
      return res.status(404).json({ error: 'Template no encontrado' });
    }

    if (template.is_archived) {
      return res.status(400).json({
        error: 'Los templates archivados no pueden ser modificados',
      });
    }

    const { error } = await supabaseClient
      .from('assessment_indicators')
      .delete()
      .eq('id', indicatorId);

    if (error) {
      console.error('Error deleting indicator:', error);
      return res.status(500).json({ error: 'Error al eliminar indicador' });
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
