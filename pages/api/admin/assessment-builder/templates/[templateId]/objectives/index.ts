import { NextApiRequest, NextApiResponse } from 'next';
import { getApiUser, createApiSupabaseClient, sendAuthError, handleMethodNotAllowed } from '@/lib/api-auth';
import type { CreateObjectiveRequest } from '@/types/assessment-builder';
import { updatePublishedTemplateSnapshot } from '@/lib/services/assessment-builder/autoAssignmentService';
import { hasAssessmentReadPermission, hasAssessmentWritePermission } from '@/lib/assessment-permissions';

// Get next display order for an objective in a template
async function getNextDisplayOrder(supabaseClient: ReturnType<typeof Object.create>, templateId: string): Promise<number> {
  const { data: existing } = await supabaseClient
    .from('assessment_objectives')
    .select('display_order')
    .eq('template_id', templateId)
    .order('display_order', { ascending: false })
    .limit(1);

  if (!existing || existing.length === 0) {
    return 1;
  }

  return existing[0].display_order + 1;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { templateId } = req.query;

  if (!templateId || typeof templateId !== 'string') {
    return res.status(400).json({ error: 'ID de template inválido' });
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

  switch (req.method) {
    case 'GET':
      return handleGet(req, res, supabaseClient, templateId);
    case 'POST': {
      const canWrite = await hasAssessmentWritePermission(supabaseClient, user.id);
      if (!canWrite) {
        return res.status(403).json({ error: 'Solo administradores pueden crear objetivos' });
      }
      if (template.is_archived) {
        return res.status(400).json({ error: 'Los templates archivados no pueden ser modificados' });
      }
      return handlePost(req, res, supabaseClient, templateId, user.id);
    }
    default:
      return handleMethodNotAllowed(res, ['GET', 'POST']);
  }
}

// GET /api/admin/assessment-builder/templates/[templateId]/objectives
async function handleGet(
  req: NextApiRequest,
  res: NextApiResponse,
  supabaseClient: ReturnType<typeof Object.create>,
  templateId: string
) {
  try {
    const { data: objectives, error } = await supabaseClient
      .from('assessment_objectives')
      .select(`
        id,
        name,
        description,
        display_order,
        weight,
        created_at,
        updated_at
      `)
      .eq('template_id', templateId)
      .order('display_order', { ascending: true });

    if (error) {
      return res.status(500).json({ error: 'Error al obtener los objetivos' });
    }

    // Get module counts for each objective
    const objectiveIds = (objectives || []).map((o: { id: string }) => o.id);
    let moduleCounts: Record<string, number> = {};

    if (objectiveIds.length > 0) {
      const { data: modules } = await supabaseClient
        .from('assessment_modules')
        .select('objective_id')
        .in('objective_id', objectiveIds);

      if (modules) {
        moduleCounts = modules.reduce((acc: Record<string, number>, mod: { objective_id: string }) => {
          acc[mod.objective_id] = (acc[mod.objective_id] || 0) + 1;
          return acc;
        }, {});
      }
    }

    // Add module count to each objective
    const objectivesWithCounts = (objectives || []).map((o: { id: string }) => ({
      ...o,
      module_count: moduleCounts[o.id] || 0,
    }));

    return res.status(200).json({
      success: true,
      objectives: objectivesWithCounts,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al obtener objetivos';
    return res.status(500).json({ error: message });
  }
}

// POST /api/admin/assessment-builder/templates/[templateId]/objectives
async function handlePost(
  req: NextApiRequest,
  res: NextApiResponse,
  supabaseClient: ReturnType<typeof Object.create>,
  templateId: string,
  userId: string
) {
  try {
    const { name, description, weight } = req.body as CreateObjectiveRequest;

    // Validation
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'El nombre del objetivo es requerido' });
    }

    if (weight !== undefined) {
      if (typeof weight !== 'number' || !isFinite(weight) || weight <= 0 || weight > 100) {
        return res.status(400).json({ error: 'El peso debe ser un número entre 0.01 y 100' });
      }
    }

    // Get next display order
    const displayOrder = await getNextDisplayOrder(supabaseClient, templateId);

    // Create objective
    const { data: objective, error } = await supabaseClient
      .from('assessment_objectives')
      .insert({
        template_id: templateId,
        name: name.trim(),
        description: description || null,
        weight: weight ?? 1.0,
        display_order: displayOrder,
      })
      .select()
      .single();

    if (error) {
      return res.status(500).json({ error: 'Error al crear el objetivo' });
    }

    // Update the snapshot for published templates
    const snapshotResult = await updatePublishedTemplateSnapshot(templateId, userId);
    if (!snapshotResult.success) {
      // Non-fatal: log but don't fail the request
    }

    return res.status(201).json({
      success: true,
      objective,
      snapshotUpdated: snapshotResult.success,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al crear objetivo';
    return res.status(500).json({ error: message });
  }
}
