import { NextApiRequest, NextApiResponse } from 'next';
import { getApiUser, createApiSupabaseClient, sendAuthError, handleMethodNotAllowed } from '@/lib/api-auth';
import { updatePublishedTemplateSnapshot } from '@/lib/services/assessment-builder/autoAssignmentService';

// Check if user has admin/consultor permissions
async function hasAssessmentAdminPermission(supabaseClient: any, userId: string): Promise<boolean> {
  const { data: roles } = await supabaseClient
    .from('user_roles')
    .select('role_type')
    .eq('user_id', userId)
    .eq('is_active', true);

  if (!roles || roles.length === 0) return false;
  return roles.some((r: any) => ['admin', 'consultor'].includes(r.role_type));
}

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

  const supabaseClient = await createApiSupabaseClient(req, res);

  // Permission check
  const hasPermission = await hasAssessmentAdminPermission(supabaseClient, user.id);
  if (!hasPermission) {
    return res.status(403).json({ error: 'Solo administradores y consultores pueden acceder al constructor de evaluaciones' });
  }

  // Verify template exists
  const { data: template, error: templateError } = await supabaseClient
    .from('assessment_templates')
    .select('id, status, is_archived')
    .eq('id', templateId)
    .single();

  if (templateError || !template) {
    return res.status(404).json({ error: 'Template no encontrado' });
  }

  // Verify module exists and belongs to template
  const { data: module, error: moduleError } = await supabaseClient
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

  // Verify indicator exists and belongs to module
  const { data: indicator, error: indicatorError } = await supabaseClient
    .from('assessment_indicators')
    .select('id, module_id')
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
      return handleGet(req, res, supabaseClient, indicatorId);
    case 'PUT':
    case 'DELETE':
      if (template.is_archived) {
        return res.status(400).json({ error: 'Los templates archivados no pueden ser modificados' });
      }
      if (req.method === 'PUT') {
        return handlePut(req, res, supabaseClient, templateId, indicatorId, user.id);
      }
      return handleDelete(req, res, supabaseClient, indicatorId, moduleId, templateId, user.id);
    default:
      return handleMethodNotAllowed(res, ['GET', 'PUT', 'DELETE']);
  }
}

// GET /api/admin/assessment-builder/templates/[templateId]/modules/[moduleId]/indicators/[indicatorId]
async function handleGet(
  req: NextApiRequest,
  res: NextApiResponse,
  supabaseClient: any,
  indicatorId: string
) {
  try {
    const { data: indicator, error } = await supabaseClient
      .from('assessment_indicators')
      .select(`
        id,
        module_id,
        code,
        name,
        description,
        category,
        frequency_config,
        level_0_descriptor,
        level_1_descriptor,
        level_2_descriptor,
        level_3_descriptor,
        level_4_descriptor,
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
      indicator
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
  supabaseClient: any,
  templateId: string,
  indicatorId: string,
  userId: string
) {
  try {
    const {
      code,
      name,
      description,
      category,
      frequency_config,
      level_0_descriptor,
      level_1_descriptor,
      level_2_descriptor,
      level_3_descriptor,
      level_4_descriptor,
      weight,
      visibility_condition
    } = req.body;

    // Build update object
    const updateData: Record<string, any> = {};
    if (code !== undefined) updateData.code = code;
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (category !== undefined) updateData.category = category;
    if (frequency_config !== undefined) updateData.frequency_config = frequency_config;
    if (level_0_descriptor !== undefined) updateData.level_0_descriptor = level_0_descriptor;
    if (level_1_descriptor !== undefined) updateData.level_1_descriptor = level_1_descriptor;
    if (level_2_descriptor !== undefined) updateData.level_2_descriptor = level_2_descriptor;
    if (level_3_descriptor !== undefined) updateData.level_3_descriptor = level_3_descriptor;
    if (level_4_descriptor !== undefined) updateData.level_4_descriptor = level_4_descriptor;
    if (weight !== undefined) updateData.weight = weight;
    if (visibility_condition !== undefined) updateData.visibility_condition = visibility_condition;

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: 'No hay campos para actualizar' });
    }

    // Update indicator
    const { data: indicator, error } = await supabaseClient
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
      indicator,
      snapshotUpdated: snapshotResult.success,
    });

  } catch (err: any) {
    console.error('Unexpected error updating indicator:', err);
    return res.status(500).json({ error: err.message || 'Error al actualizar indicador' });
  }
}

// DELETE /api/admin/assessment-builder/templates/[templateId]/modules/[moduleId]/indicators/[indicatorId]
async function handleDelete(
  req: NextApiRequest,
  res: NextApiResponse,
  supabaseClient: any,
  indicatorId: string,
  moduleId: string,
  templateId: string,
  userId: string
) {
  try {
    // Delete indicator
    const { error } = await supabaseClient
      .from('assessment_indicators')
      .delete()
      .eq('id', indicatorId);

    if (error) {
      console.error('Error deleting indicator:', error);
      return res.status(500).json({ error: 'Error al eliminar el indicador' });
    }

    // Re-order remaining indicators
    const { data: remainingIndicators } = await supabaseClient
      .from('assessment_indicators')
      .select('id, display_order')
      .eq('module_id', moduleId)
      .order('display_order', { ascending: true });

    if (remainingIndicators && remainingIndicators.length > 0) {
      for (let i = 0; i < remainingIndicators.length; i++) {
        if (remainingIndicators[i].display_order !== i + 1) {
          await supabaseClient
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
