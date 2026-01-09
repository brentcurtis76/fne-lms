import { NextApiRequest, NextApiResponse } from 'next';
import { getApiUser, createApiSupabaseClient, sendAuthError, handleMethodNotAllowed } from '@/lib/api-auth';
import type { CreateModuleRequest } from '@/types/assessment-builder';
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

// Get next display order for a module in a template
async function getNextDisplayOrder(supabaseClient: any, templateId: string): Promise<number> {
  const { data: existing } = await supabaseClient
    .from('assessment_modules')
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

  switch (req.method) {
    case 'GET':
      // GET is allowed for any template status (to view modules)
      return handleGet(req, res, supabaseClient, templateId);
    case 'POST':
      // POST (creating modules) - blocked only for archived templates
      if (template.is_archived) {
        return res.status(400).json({ error: 'Los templates archivados no pueden ser modificados' });
      }
      return handlePost(req, res, supabaseClient, templateId, user.id);
    default:
      return handleMethodNotAllowed(res, ['GET', 'POST']);
  }
}

// GET /api/admin/assessment-builder/templates/[templateId]/modules
async function handleGet(
  req: NextApiRequest,
  res: NextApiResponse,
  supabaseClient: any,
  templateId: string
) {
  try {
    const { data: modules, error } = await supabaseClient
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
      .eq('template_id', templateId)
      .order('display_order', { ascending: true });

    if (error) {
      console.error('Error fetching modules:', error);
      return res.status(500).json({ error: 'Error al obtener los módulos' });
    }

    // Get indicator counts for each module
    const moduleIds = modules?.map((m: any) => m.id) || [];
    let indicatorCounts: Record<string, number> = {};

    if (moduleIds.length > 0) {
      const { data: indicators } = await supabaseClient
        .from('assessment_indicators')
        .select('module_id')
        .in('module_id', moduleIds);

      if (indicators) {
        indicatorCounts = indicators.reduce((acc: Record<string, number>, ind: any) => {
          acc[ind.module_id] = (acc[ind.module_id] || 0) + 1;
          return acc;
        }, {});
      }
    }

    // Add indicator count to each module
    const modulesWithCounts = modules?.map((m: any) => ({
      ...m,
      indicator_count: indicatorCounts[m.id] || 0
    })) || [];

    return res.status(200).json({
      success: true,
      modules: modulesWithCounts
    });

  } catch (err: any) {
    console.error('Unexpected error fetching modules:', err);
    return res.status(500).json({ error: err.message || 'Error al obtener módulos' });
  }
}

// POST /api/admin/assessment-builder/templates/[templateId]/modules
async function handlePost(
  req: NextApiRequest,
  res: NextApiResponse,
  supabaseClient: any,
  templateId: string,
  userId: string
) {
  try {
    const { name, description, instructions, weight } = req.body as CreateModuleRequest;

    // Validation
    if (!name) {
      return res.status(400).json({ error: 'El nombre del módulo es requerido' });
    }

    // Get next display order
    const displayOrder = await getNextDisplayOrder(supabaseClient, templateId);

    // Create module
    const { data: module, error } = await supabaseClient
      .from('assessment_modules')
      .insert({
        template_id: templateId,
        name,
        description: description || null,
        instructions: instructions || null,
        weight: weight ?? 1.0,
        display_order: displayOrder
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating module:', error);
      return res.status(500).json({ error: 'Error al crear el módulo' });
    }

    // Update the snapshot for published templates
    const snapshotResult = await updatePublishedTemplateSnapshot(templateId, userId);
    if (!snapshotResult.success) {
      console.error('Failed to update snapshot:', snapshotResult.error);
    }

    return res.status(201).json({
      success: true,
      module,
      snapshotUpdated: snapshotResult.success,
    });

  } catch (err: any) {
    console.error('Unexpected error creating module:', err);
    return res.status(500).json({ error: err.message || 'Error al crear módulo' });
  }
}
