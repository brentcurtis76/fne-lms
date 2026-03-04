import { NextApiRequest, NextApiResponse } from 'next';
import { getApiUser, createApiSupabaseClient, sendAuthError, handleMethodNotAllowed } from '@/lib/api-auth';
import type { UpdateObjectiveRequest } from '@/types/assessment-builder';
import { updatePublishedTemplateSnapshot } from '@/lib/services/assessment-builder/autoAssignmentService';
import { hasAssessmentReadPermission, hasAssessmentWritePermission } from '@/lib/assessment-permissions';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { templateId, objectiveId } = req.query;

  if (!templateId || typeof templateId !== 'string') {
    return res.status(400).json({ error: 'ID de template inválido' });
  }

  if (!objectiveId || typeof objectiveId !== 'string') {
    return res.status(400).json({ error: 'ID de objetivo inválido' });
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

  // Verify objective exists and belongs to template
  const { data: objective, error: objectiveError } = await supabaseClient
    .from('assessment_objectives')
    .select('id, template_id')
    .eq('id', objectiveId)
    .single();

  if (objectiveError || !objective) {
    return res.status(404).json({ error: 'Objetivo no encontrado' });
  }

  if (objective.template_id !== templateId) {
    return res.status(400).json({ error: 'El objetivo no pertenece a este template' });
  }

  switch (req.method) {
    case 'GET':
      return handleGet(req, res, supabaseClient, objectiveId);
    case 'PUT':
    case 'DELETE': {
      const canWrite = await hasAssessmentWritePermission(supabaseClient, user.id);
      if (!canWrite) {
        return res.status(403).json({ error: 'Solo administradores pueden modificar objetivos' });
      }
      if (template.is_archived) {
        return res.status(400).json({ error: 'Los templates archivados no pueden ser modificados' });
      }
      if (req.method === 'PUT') {
        return handlePut(req, res, supabaseClient, templateId, objectiveId, user.id);
      }
      return handleDelete(req, res, supabaseClient, objectiveId, templateId, user.id);
    }
    default:
      return handleMethodNotAllowed(res, ['GET', 'PUT', 'DELETE']);
  }
}

// GET /api/admin/assessment-builder/templates/[templateId]/objectives/[objectiveId]
async function handleGet(
  req: NextApiRequest,
  res: NextApiResponse,
  supabaseClient: ReturnType<typeof Object.create>,
  objectiveId: string
) {
  try {
    const { data: objective, error } = await supabaseClient
      .from('assessment_objectives')
      .select(`
        id,
        template_id,
        name,
        description,
        display_order,
        weight,
        created_at,
        updated_at
      `)
      .eq('id', objectiveId)
      .single();

    if (error) {
      return res.status(500).json({ error: 'Error al obtener el objetivo' });
    }

    // Fetch modules for this objective
    const { data: modules, error: modulesError } = await supabaseClient
      .from('assessment_modules')
      .select(`
        id,
        name,
        description,
        instructions,
        display_order,
        weight,
        created_at,
        updated_at
      `)
      .eq('objective_id', objectiveId)
      .order('display_order', { ascending: true });

    if (modulesError) {
      return res.status(500).json({ error: 'Error al obtener las acciones del objetivo' });
    }

    return res.status(200).json({
      success: true,
      objective: {
        ...objective,
        modules: modules || [],
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al obtener objetivo';
    return res.status(500).json({ error: message });
  }
}

// PUT /api/admin/assessment-builder/templates/[templateId]/objectives/[objectiveId]
async function handlePut(
  req: NextApiRequest,
  res: NextApiResponse,
  supabaseClient: ReturnType<typeof Object.create>,
  templateId: string,
  objectiveId: string,
  userId: string
) {
  try {
    const { name, description, weight } = req.body as UpdateObjectiveRequest;

    // Build update object
    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name.trim();
    if (description !== undefined) updateData.description = description;
    if (weight !== undefined) updateData.weight = weight;

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: 'No hay campos para actualizar' });
    }

    // Update objective
    const { data: objective, error } = await supabaseClient
      .from('assessment_objectives')
      .update(updateData)
      .eq('id', objectiveId)
      .select()
      .single();

    if (error) {
      return res.status(500).json({ error: 'Error al actualizar el objetivo' });
    }

    // Update the snapshot for published templates
    const snapshotResult = await updatePublishedTemplateSnapshot(templateId, userId);
    if (!snapshotResult.success) {
      // Non-fatal: log but don't fail the request
    }

    return res.status(200).json({
      success: true,
      objective,
      snapshotUpdated: snapshotResult.success,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al actualizar objetivo';
    return res.status(500).json({ error: message });
  }
}

// DELETE /api/admin/assessment-builder/templates/[templateId]/objectives/[objectiveId]
async function handleDelete(
  req: NextApiRequest,
  res: NextApiResponse,
  supabaseClient: ReturnType<typeof Object.create>,
  objectiveId: string,
  templateId: string,
  userId: string
) {
  try {
    // Delete objective (cascades to modules via FK)
    const { error } = await supabaseClient
      .from('assessment_objectives')
      .delete()
      .eq('id', objectiveId);

    if (error) {
      return res.status(500).json({ error: 'Error al eliminar el objetivo' });
    }

    // Re-order remaining objectives
    const { data: remainingObjectives } = await supabaseClient
      .from('assessment_objectives')
      .select('id, display_order')
      .eq('template_id', templateId)
      .order('display_order', { ascending: true });

    if (remainingObjectives && remainingObjectives.length > 0) {
      for (let i = 0; i < remainingObjectives.length; i++) {
        if (remainingObjectives[i].display_order !== i + 1) {
          await supabaseClient
            .from('assessment_objectives')
            .update({ display_order: i + 1 })
            .eq('id', remainingObjectives[i].id);
        }
      }
    }

    // Update the snapshot for published templates
    const snapshotResult = await updatePublishedTemplateSnapshot(templateId, userId);
    if (!snapshotResult.success) {
      // Non-fatal: log but don't fail the request
    }

    return res.status(200).json({
      success: true,
      message: 'Objetivo eliminado correctamente',
      snapshotUpdated: snapshotResult.success,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al eliminar objetivo';
    return res.status(500).json({ error: message });
  }
}
