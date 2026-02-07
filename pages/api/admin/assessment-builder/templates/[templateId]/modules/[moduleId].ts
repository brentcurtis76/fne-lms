import { NextApiRequest, NextApiResponse } from 'next';
import { getApiUser, createApiSupabaseClient, sendAuthError, handleMethodNotAllowed } from '@/lib/api-auth';
import type { UpdateModuleRequest } from '@/types/assessment-builder';
import { updatePublishedTemplateSnapshot } from '@/lib/services/assessment-builder/autoAssignmentService';
import { hasAssessmentReadPermission, hasAssessmentWritePermission } from '@/lib/assessment-permissions';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { templateId, moduleId } = req.query;

  if (!templateId || typeof templateId !== 'string') {
    return res.status(400).json({ error: 'ID de template inválido' });
  }

  if (!moduleId || typeof moduleId !== 'string') {
    return res.status(400).json({ error: 'ID de módulo inválido' });
  }

  // Authentication check
  const { user, error: authError } = await getApiUser(req, res);
  if (authError || !user) {
    return sendAuthError(res, 'Autenticación requerida');
  }

  const supabaseClient = await createApiSupabaseClient(req, res);

  // Read permission check (admin or consultor)
  const canRead = await hasAssessmentReadPermission(supabaseClient, user.id);
  if (!canRead) {
    return res.status(403).json({ error: 'No tienes permiso para acceder al constructor de evaluaciones' });
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

  switch (req.method) {
    case 'GET':
      return handleGet(req, res, supabaseClient, moduleId);
    case 'PUT':
    case 'DELETE': {
      const canWrite = await hasAssessmentWritePermission(supabaseClient, user.id);
      if (!canWrite) {
        return res.status(403).json({ error: 'Solo administradores pueden modificar módulos' });
      }
      if (template.is_archived) {
        return res.status(400).json({ error: 'Los templates archivados no pueden ser modificados' });
      }
      if (req.method === 'PUT') {
        return handlePut(req, res, supabaseClient, templateId, moduleId, user.id);
      }
      return handleDelete(req, res, supabaseClient, moduleId, templateId, user.id);
    }
    default:
      return handleMethodNotAllowed(res, ['GET', 'PUT', 'DELETE']);
  }
}

// GET /api/admin/assessment-builder/templates/[templateId]/modules/[moduleId]
async function handleGet(
  req: NextApiRequest,
  res: NextApiResponse,
  supabaseClient: any,
  moduleId: string
) {
  try {
    const { data: module, error } = await supabaseClient
      .from('assessment_modules')
      .select(`
        id,
        template_id,
        name,
        description,
        instructions,
        display_order,
        weight,
        created_at,
        updated_at
      `)
      .eq('id', moduleId)
      .single();

    if (error) {
      console.error('Error fetching module:', error);
      return res.status(500).json({ error: 'Error al obtener el módulo' });
    }

    // Fetch indicators for this module
    const { data: indicators, error: indicatorsError } = await supabaseClient
      .from('assessment_indicators')
      .select(`
        id,
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
      .eq('module_id', moduleId)
      .order('display_order', { ascending: true });

    if (indicatorsError) {
      console.error('Error fetching indicators:', indicatorsError);
      return res.status(500).json({ error: 'Error al obtener los indicadores' });
    }

    return res.status(200).json({
      success: true,
      module: {
        ...module,
        indicators: indicators || []
      }
    });

  } catch (err: any) {
    console.error('Unexpected error fetching module:', err);
    return res.status(500).json({ error: err.message || 'Error al obtener módulo' });
  }
}

// PUT /api/admin/assessment-builder/templates/[templateId]/modules/[moduleId]
async function handlePut(
  req: NextApiRequest,
  res: NextApiResponse,
  supabaseClient: any,
  templateId: string,
  moduleId: string,
  userId: string
) {
  try {
    const { name, description, instructions, weight } = req.body as UpdateModuleRequest;

    // Build update object
    const updateData: Record<string, any> = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (instructions !== undefined) updateData.instructions = instructions;
    if (weight !== undefined) updateData.weight = weight;

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: 'No hay campos para actualizar' });
    }

    // Update module
    const { data: module, error } = await supabaseClient
      .from('assessment_modules')
      .update(updateData)
      .eq('id', moduleId)
      .select()
      .single();

    if (error) {
      console.error('Error updating module:', error);
      return res.status(500).json({ error: 'Error al actualizar el módulo' });
    }

    // Update the snapshot for published templates
    const snapshotResult = await updatePublishedTemplateSnapshot(templateId, userId);
    if (!snapshotResult.success) {
      console.error('Failed to update snapshot:', snapshotResult.error);
    }

    return res.status(200).json({
      success: true,
      module,
      snapshotUpdated: snapshotResult.success,
    });

  } catch (err: any) {
    console.error('Unexpected error updating module:', err);
    return res.status(500).json({ error: err.message || 'Error al actualizar módulo' });
  }
}

// DELETE /api/admin/assessment-builder/templates/[templateId]/modules/[moduleId]
async function handleDelete(
  req: NextApiRequest,
  res: NextApiResponse,
  supabaseClient: any,
  moduleId: string,
  templateId: string,
  userId: string
) {
  try {
    // Delete module (cascades to indicators)
    const { error } = await supabaseClient
      .from('assessment_modules')
      .delete()
      .eq('id', moduleId);

    if (error) {
      console.error('Error deleting module:', error);
      return res.status(500).json({ error: 'Error al eliminar el módulo' });
    }

    // Re-order remaining modules
    const { data: remainingModules } = await supabaseClient
      .from('assessment_modules')
      .select('id, display_order')
      .eq('template_id', templateId)
      .order('display_order', { ascending: true });

    if (remainingModules && remainingModules.length > 0) {
      // Update display_order for remaining modules
      for (let i = 0; i < remainingModules.length; i++) {
        if (remainingModules[i].display_order !== i + 1) {
          await supabaseClient
            .from('assessment_modules')
            .update({ display_order: i + 1 })
            .eq('id', remainingModules[i].id);
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
      message: 'Módulo eliminado correctamente',
      snapshotUpdated: snapshotResult.success,
    });

  } catch (err: any) {
    console.error('Unexpected error deleting module:', err);
    return res.status(500).json({ error: err.message || 'Error al eliminar módulo' });
  }
}
