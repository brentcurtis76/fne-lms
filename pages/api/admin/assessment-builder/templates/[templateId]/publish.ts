import { NextApiRequest, NextApiResponse } from 'next';
import { getApiUser, createApiSupabaseClient, sendAuthError, handleMethodNotAllowed } from '@/lib/api-auth';
import { upgradeExistingAssignments } from '@/lib/services/assessment-builder/autoAssignmentService';

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
 * POST /api/admin/assessment-builder/templates/[templateId]/publish
 *
 * Publishes a draft template:
 * 1. Validates template has at least 1 module with 1 indicator
 * 2. Creates an immutable snapshot with full nested data
 * 3. Increments the version number
 * 4. Sets status to 'published'
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

  const supabaseClient = await createApiSupabaseClient(req, res);

  // Permission check - query user_roles table
  const hasPermission = await hasAssessmentAdminPermission(supabaseClient, user.id);
  if (!hasPermission) {
    return res.status(403).json({ error: 'No tienes permiso para publicar templates' });
  }

  const { templateId } = req.query;
  if (!templateId || typeof templateId !== 'string') {
    return res.status(400).json({ error: 'templateId es requerido' });
  }

  try {
    // Get template with current status
    const { data: template, error: templateError } = await supabaseClient
      .from('assessment_templates')
      .select('*')
      .eq('id', templateId)
      .single();

    if (templateError || !template) {
      return res.status(404).json({ error: 'Template no encontrado' });
    }

    // Only draft templates can be published
    if (template.status !== 'draft') {
      return res.status(400).json({
        error: 'Solo los templates en estado borrador pueden ser publicados. Use "duplicar" para crear una nueva versión.',
      });
    }

    // Get all modules for this template
    const { data: modules, error: modulesError } = await supabaseClient
      .from('assessment_modules')
      .select('*')
      .eq('template_id', templateId)
      .order('display_order', { ascending: true });

    if (modulesError) {
      console.error('Error fetching modules:', modulesError);
      return res.status(500).json({ error: 'Error al cargar módulos' });
    }

    if (!modules || modules.length === 0) {
      return res.status(400).json({
        error: 'El template debe tener al menos un módulo para ser publicado',
      });
    }

    // Get all indicators for all modules
    const moduleIds = modules.map(m => m.id);
    const { data: allIndicators, error: indicatorsError } = await supabaseClient
      .from('assessment_indicators')
      .select('*')
      .in('module_id', moduleIds)
      .order('display_order', { ascending: true });

    if (indicatorsError) {
      console.error('Error fetching indicators:', indicatorsError);
      return res.status(500).json({ error: 'Error al cargar indicadores' });
    }

    if (!allIndicators || allIndicators.length === 0) {
      return res.status(400).json({
        error: 'El template debe tener al menos un indicador para ser publicado',
      });
    }

    // Get all year expectations for this template
    const { data: expectations, error: expectationsError } = await supabaseClient
      .from('assessment_year_expectations')
      .select('*')
      .eq('template_id', templateId);

    if (expectationsError) {
      console.error('Error fetching expectations:', expectationsError);
      return res.status(500).json({ error: 'Error al cargar expectativas' });
    }

    // Build expectations map by indicator ID
    const expectationsMap = new Map<string, any>();
    (expectations || []).forEach((exp: any) => {
      expectationsMap.set(exp.indicator_id, {
        year_1_expected: exp.year_1_expected,
        year_2_expected: exp.year_2_expected,
        year_3_expected: exp.year_3_expected,
        year_4_expected: exp.year_4_expected,
        year_5_expected: exp.year_5_expected,
        tolerance: exp.tolerance,
      });
    });

    // Build the snapshot data structure
    const snapshotData = {
      template: {
        id: template.id,
        name: template.name,
        description: template.description,
        area: template.area,
        scoring_config: template.scoring_config,
        created_at: template.created_at,
      },
      modules: modules.map(module => ({
        id: module.id,
        name: module.name,
        description: module.description,
        instructions: module.instructions,
        display_order: module.display_order,
        weight: module.weight,
        indicators: allIndicators
          .filter(ind => ind.module_id === module.id)
          .map(indicator => ({
            id: indicator.id,
            code: indicator.code,
            name: indicator.name,
            question: indicator.question,
            description: indicator.description,
            category: indicator.category,
            frequency_config: indicator.frequency_config,
            frequency_unit_options: indicator.frequency_unit_options,
            level_0_descriptor: indicator.level_0_descriptor,
            level_1_descriptor: indicator.level_1_descriptor,
            level_2_descriptor: indicator.level_2_descriptor,
            level_3_descriptor: indicator.level_3_descriptor,
            level_4_descriptor: indicator.level_4_descriptor,
            display_order: indicator.display_order,
            weight: indicator.weight,
            sub_questions: indicator.sub_questions,
            expectations: expectationsMap.get(indicator.id) || null,
          })),
      })),
      published_at: new Date().toISOString(),
      published_by: user.id,
    };

    // Calculate new version (increment from current)
    const currentVersion = template.version || '1.0.0';
    const versionParts = currentVersion.split('.').map(Number);
    // For publishing, increment minor version
    versionParts[1] = (versionParts[1] || 0) + 1;
    versionParts[2] = 0; // Reset patch
    const newVersion = versionParts.join('.');

    // Create the snapshot
    const { data: snapshot, error: snapshotError } = await supabaseClient
      .from('assessment_template_snapshots')
      .insert({
        template_id: templateId,
        version: newVersion,
        snapshot_data: snapshotData,
      })
      .select()
      .single();

    if (snapshotError) {
      console.error('Error creating snapshot:', snapshotError);
      return res.status(500).json({ error: 'Error al crear snapshot' });
    }

    // Update template status and version
    const { data: updatedTemplate, error: updateError } = await supabaseClient
      .from('assessment_templates')
      .update({
        status: 'published',
        version: newVersion,
      })
      .eq('id', templateId)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating template:', updateError);
      // Try to rollback snapshot
      await supabaseClient.from('assessment_template_snapshots').delete().eq('id', snapshot.id);
      return res.status(500).json({ error: 'Error al actualizar template' });
    }

    // Check if we should upgrade existing assignments
    const { upgradeExisting } = req.body || {};
    let upgradeResult = null;

    if (upgradeExisting) {
      // Create new instances for all existing assignees with the new snapshot
      upgradeResult = await upgradeExistingAssignments(
        templateId,
        snapshot.id,
        user.id
      );
    }

    return res.status(200).json({
      success: true,
      message: `Template publicado como versión ${newVersion}`,
      template: {
        id: updatedTemplate.id,
        name: updatedTemplate.name,
        area: updatedTemplate.area,
        status: updatedTemplate.status,
        version: updatedTemplate.version,
      },
      snapshot: {
        id: snapshot.id,
        version: snapshot.version,
        createdAt: snapshot.created_at,
      },
      upgrade: upgradeResult ? {
        instancesCreated: upgradeResult.instancesCreated,
        instancesSkipped: upgradeResult.instancesSkipped,
        errors: upgradeResult.errors.length > 0 ? upgradeResult.errors : undefined,
      } : undefined,
    });
  } catch (err: any) {
    console.error('Unexpected error publishing template:', err);
    return res.status(500).json({ error: err.message || 'Error al publicar template' });
  }
}
