import { NextApiRequest, NextApiResponse } from 'next';
import { getApiUser, createApiSupabaseClient, sendAuthError, handleMethodNotAllowed } from '@/lib/api-auth';
import type { UpdateTemplateRequest } from '@/types/assessment-builder';
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

  switch (req.method) {
    case 'GET':
      return handleGet(req, res, supabaseClient, templateId);
    case 'PUT':
      return handlePut(req, res, supabaseClient, templateId, user.id);
    case 'DELETE':
      return handleDelete(req, res, supabaseClient, templateId);
    default:
      return handleMethodNotAllowed(res, ['GET', 'PUT', 'DELETE']);
  }
}

// GET /api/admin/assessment-builder/templates/[templateId]
async function handleGet(
  req: NextApiRequest,
  res: NextApiResponse,
  supabaseClient: any,
  templateId: string
) {
  try {
    // Fetch template with modules and indicators
    const { data: template, error } = await supabaseClient
      .from('assessment_templates')
      .select(`
        id,
        area,
        version,
        name,
        description,
        status,
        scoring_config,
        published_at,
        published_by,
        created_by,
        created_at,
        updated_at,
        is_archived
      `)
      .eq('id', templateId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Template no encontrado' });
      }
      console.error('Error fetching template:', error);
      return res.status(500).json({ error: 'Error al obtener el template' });
    }

    // For published templates, get response count
    let responseCount = 0;
    let instanceCount = 0;

    if (template.status === 'published') {
      // Get snapshots for this template
      const { data: snapshots } = await supabaseClient
        .from('assessment_template_snapshots')
        .select('id')
        .eq('template_id', templateId);

      const snapshotIds = snapshots?.map((s: any) => s.id) || [];

      if (snapshotIds.length > 0) {
        // Count instances
        const { count: instCount } = await supabaseClient
          .from('assessment_instances')
          .select('*', { count: 'exact', head: true })
          .in('template_snapshot_id', snapshotIds);
        instanceCount = instCount || 0;

        // Count responses
        if (instanceCount > 0) {
          const { data: instances } = await supabaseClient
            .from('assessment_instances')
            .select('id')
            .in('template_snapshot_id', snapshotIds);

          const instanceIds = instances?.map((i: any) => i.id) || [];

          if (instanceIds.length > 0) {
            const { count: respCount } = await supabaseClient
              .from('assessment_responses')
              .select('*', { count: 'exact', head: true })
              .in('instance_id', instanceIds);
            responseCount = respCount || 0;
          }
        }
      }
    }

    // Fetch modules with indicators
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
      .eq('template_id', templateId)
      .order('display_order', { ascending: true });

    if (modulesError) {
      console.error('Error fetching modules:', modulesError);
      return res.status(500).json({ error: 'Error al obtener los módulos' });
    }

    // Fetch indicators for all modules
    const moduleIds = modules?.map((m: any) => m.id) || [];
    let indicators: any[] = [];

    if (moduleIds.length > 0) {
      const { data: indicatorData, error: indicatorsError } = await supabaseClient
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
        .in('module_id', moduleIds)
        .order('display_order', { ascending: true });

      if (indicatorsError) {
        console.error('Error fetching indicators:', indicatorsError);
        return res.status(500).json({ error: 'Error al obtener los indicadores' });
      }

      indicators = indicatorData || [];
    }

    // Group indicators by module
    const indicatorsByModule = indicators.reduce((acc: Record<string, any[]>, ind: any) => {
      if (!acc[ind.module_id]) {
        acc[ind.module_id] = [];
      }
      acc[ind.module_id].push(ind);
      return acc;
    }, {});

    // Attach indicators to modules
    const modulesWithIndicators = modules?.map((m: any) => ({
      ...m,
      indicators: indicatorsByModule[m.id] || []
    })) || [];

    return res.status(200).json({
      success: true,
      template: {
        ...template,
        modules: modulesWithIndicators
      },
      // Include usage stats for published templates
      usageStats: template.status === 'published' ? {
        instanceCount,
        responseCount,
        hasResponses: responseCount > 0,
      } : null,
    });

  } catch (err: any) {
    console.error('Unexpected error fetching template:', err);
    return res.status(500).json({ error: err.message || 'Error al obtener template' });
  }
}

// PUT /api/admin/assessment-builder/templates/[templateId]
async function handlePut(
  req: NextApiRequest,
  res: NextApiResponse,
  supabaseClient: any,
  templateId: string,
  userId: string
) {
  try {
    const { name, description, scoring_config } = req.body as UpdateTemplateRequest;

    // Check if template exists
    const { data: existing, error: fetchError } = await supabaseClient
      .from('assessment_templates')
      .select('id, status, version, is_archived')
      .eq('id', templateId)
      .single();

    if (fetchError || !existing) {
      return res.status(404).json({ error: 'Template no encontrado' });
    }

    // Archived templates cannot be edited
    if (existing.is_archived) {
      return res.status(400).json({ error: 'Los templates archivados no pueden ser editados' });
    }

    // Build update object
    const updateData: Record<string, any> = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (scoring_config !== undefined) updateData.scoring_config = scoring_config;

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: 'No hay campos para actualizar' });
    }

    // For published templates, increment patch version
    let newVersion = existing.version;
    if (existing.status === 'published') {
      const versionParts = existing.version.split('.').map(Number);
      versionParts[2] = (versionParts[2] || 0) + 1; // Increment patch
      newVersion = versionParts.join('.');
      updateData.version = newVersion;
    }

    // Update template
    const { data: template, error } = await supabaseClient
      .from('assessment_templates')
      .update(updateData)
      .eq('id', templateId)
      .select()
      .single();

    if (error) {
      console.error('Error updating template:', error);
      return res.status(500).json({ error: 'Error al actualizar el template' });
    }

    // Update the snapshot for published templates
    let snapshotUpdated = false;
    if (existing.status === 'published') {
      const snapshotResult = await updatePublishedTemplateSnapshot(templateId, userId);
      snapshotUpdated = snapshotResult.success;
      if (!snapshotResult.success) {
        console.error('Failed to update snapshot:', snapshotResult.error);
      }
    }

    return res.status(200).json({
      success: true,
      template,
      versionUpdated: existing.status === 'published',
      newVersion: existing.status === 'published' ? newVersion : undefined,
      snapshotUpdated,
    });

  } catch (err: any) {
    console.error('Unexpected error updating template:', err);
    return res.status(500).json({ error: err.message || 'Error al actualizar template' });
  }
}

// DELETE /api/admin/assessment-builder/templates/[templateId]
// Supports ?confirm=true for archived templates with data
async function handleDelete(
  req: NextApiRequest,
  res: NextApiResponse,
  supabaseClient: any,
  templateId: string
) {
  try {
    const confirm = req.query.confirm === 'true';

    // Check if template exists
    const { data: existing, error: fetchError } = await supabaseClient
      .from('assessment_templates')
      .select('id, name, status, is_archived')
      .eq('id', templateId)
      .single();

    if (fetchError || !existing) {
      return res.status(404).json({ error: 'Template no encontrado' });
    }

    // Draft templates can always be deleted
    // Archived templates can be deleted with confirmation
    // Published (non-archived) templates cannot be deleted - must archive first
    if (existing.status !== 'draft' && !existing.is_archived) {
      return res.status(400).json({
        error: 'Los templates publicados deben ser archivados antes de eliminarse',
      });
    }

    // Get snapshots for this template
    const { data: snapshots } = await supabaseClient
      .from('assessment_template_snapshots')
      .select('id')
      .eq('template_id', templateId);

    const snapshotIds = snapshots?.map((s: any) => s.id) || [];

    // Count related data
    let instanceCount = 0;
    let responseCount = 0;

    if (snapshotIds.length > 0) {
      // Count instances
      const { count: instCount } = await supabaseClient
        .from('assessment_instances')
        .select('*', { count: 'exact', head: true })
        .in('template_snapshot_id', snapshotIds);
      instanceCount = instCount || 0;

      // Get instance IDs for response count
      if (instanceCount > 0) {
        const { data: instances } = await supabaseClient
          .from('assessment_instances')
          .select('id')
          .in('template_snapshot_id', snapshotIds);

        const instanceIds = instances?.map((i: any) => i.id) || [];

        if (instanceIds.length > 0) {
          const { count: respCount } = await supabaseClient
            .from('assessment_responses')
            .select('*', { count: 'exact', head: true })
            .in('instance_id', instanceIds);
          responseCount = respCount || 0;
        }
      }
    }

    // Get modules for this template
    const { data: modules } = await supabaseClient
      .from('assessment_modules')
      .select('id')
      .eq('template_id', templateId);

    const moduleIds = modules?.map((m: any) => m.id) || [];

    // If there's related data and no confirmation, return counts for confirmation modal
    if ((instanceCount > 0 || responseCount > 0) && !confirm) {
      return res.status(200).json({
        requiresConfirmation: true,
        template: {
          id: existing.id,
          name: existing.name,
        },
        counts: {
          instances: instanceCount,
          responses: responseCount,
          snapshots: snapshotIds.length,
          modules: moduleIds.length,
        },
        message: `Este template tiene ${instanceCount} evaluaciones y ${responseCount} respuestas. La eliminación es permanente.`,
      });
    }

    // Perform cascade delete
    console.log(`[Delete Template] Starting cascade delete for template ${templateId}`);

    // 1. Delete responses (must delete before instances due to FK)
    if (snapshotIds.length > 0) {
      const { data: instances } = await supabaseClient
        .from('assessment_instances')
        .select('id')
        .in('template_snapshot_id', snapshotIds);

      const instanceIds = instances?.map((i: any) => i.id) || [];

      if (instanceIds.length > 0) {
        // Delete responses
        await supabaseClient
          .from('assessment_responses')
          .delete()
          .in('instance_id', instanceIds);

        // Delete instance results
        await supabaseClient
          .from('assessment_instance_results')
          .delete()
          .in('instance_id', instanceIds);

        // Delete instance assignees
        await supabaseClient
          .from('assessment_instance_assignees')
          .delete()
          .in('instance_id', instanceIds);

        // Delete instances
        await supabaseClient
          .from('assessment_instances')
          .delete()
          .in('template_snapshot_id', snapshotIds);
      }

      // Delete snapshots
      await supabaseClient
        .from('assessment_template_snapshots')
        .delete()
        .eq('template_id', templateId);
    }

    // 2. Delete year expectations
    await supabaseClient
      .from('assessment_year_expectations')
      .delete()
      .eq('template_id', templateId);

    // 3. Delete indicators (must delete before modules)
    if (moduleIds.length > 0) {
      await supabaseClient
        .from('assessment_indicators')
        .delete()
        .in('module_id', moduleIds);
    }

    // 4. Delete modules
    await supabaseClient
      .from('assessment_modules')
      .delete()
      .eq('template_id', templateId);

    // 5. Finally delete the template
    const { error } = await supabaseClient
      .from('assessment_templates')
      .delete()
      .eq('id', templateId);

    if (error) {
      console.error('Error deleting template:', error);
      return res.status(500).json({ error: 'Error al eliminar el template' });
    }

    console.log(`[Delete Template] Successfully deleted template ${templateId}`);

    return res.status(200).json({
      success: true,
      message: 'Template eliminado correctamente',
      deleted: {
        instances: instanceCount,
        responses: responseCount,
      },
    });

  } catch (err: any) {
    console.error('Unexpected error deleting template:', err);
    return res.status(500).json({ error: err.message || 'Error al eliminar template' });
  }
}
