import { NextApiRequest, NextApiResponse } from 'next';
import { getApiUser, createApiSupabaseClient, sendAuthError, handleMethodNotAllowed } from '@/lib/api-auth';

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
 * POST /api/admin/assessment-builder/templates/[templateId]/duplicate
 *
 * Creates a new draft version from a published template:
 * 1. Duplicates the template with 'draft' status
 * 2. Copies all modules and indicators
 * 3. Increments major version number
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
    return res.status(403).json({ error: 'No tienes permiso para duplicar templates' });
  }

  const { templateId } = req.query;
  if (!templateId || typeof templateId !== 'string') {
    return res.status(400).json({ error: 'templateId es requerido' });
  }

  try {
    // Get source template
    const { data: sourceTemplate, error: templateError } = await supabaseClient
      .from('assessment_templates')
      .select('*')
      .eq('id', templateId)
      .single();

    if (templateError || !sourceTemplate) {
      return res.status(404).json({ error: 'Template no encontrado' });
    }

    // Calculate new version (increment major version)
    const currentVersion = sourceTemplate.version || '1.0.0';
    const versionParts = currentVersion.split('.').map(Number);
    versionParts[0] = (versionParts[0] || 1) + 1; // Increment major
    versionParts[1] = 0; // Reset minor
    versionParts[2] = 0; // Reset patch
    const newVersion = versionParts.join('.');

    // Create new template as draft
    const { data: newTemplate, error: newTemplateError } = await supabaseClient
      .from('assessment_templates')
      .insert({
        name: sourceTemplate.name,
        description: sourceTemplate.description,
        area: sourceTemplate.area,
        status: 'draft',
        version: newVersion,
        scoring_config: sourceTemplate.scoring_config,
        created_by: user.id,
      })
      .select()
      .single();

    if (newTemplateError) {
      console.error('Error creating new template:', newTemplateError);
      return res.status(500).json({ error: 'Error al crear nuevo template' });
    }

    // Get all modules from source
    const { data: sourceModules, error: modulesError } = await supabaseClient
      .from('assessment_modules')
      .select('*')
      .eq('template_id', templateId)
      .order('display_order', { ascending: true });

    if (modulesError) {
      console.error('Error fetching source modules:', modulesError);
      // Cleanup: delete the new template
      await supabaseClient.from('assessment_templates').delete().eq('id', newTemplate.id);
      return res.status(500).json({ error: 'Error al cargar módulos' });
    }

    // Copy modules and track ID mapping
    const moduleIdMap: Record<string, string> = {};

    for (const sourceModule of sourceModules || []) {
      const { data: newModule, error: newModuleError } = await supabaseClient
        .from('assessment_modules')
        .insert({
          template_id: newTemplate.id,
          name: sourceModule.name,
          description: sourceModule.description,
          instructions: sourceModule.instructions,
          display_order: sourceModule.display_order,
          weight: sourceModule.weight,
        })
        .select()
        .single();

      if (newModuleError) {
        console.error('Error copying module:', newModuleError);
        // Cleanup: delete everything we created
        await supabaseClient.from('assessment_modules').delete().eq('template_id', newTemplate.id);
        await supabaseClient.from('assessment_templates').delete().eq('id', newTemplate.id);
        return res.status(500).json({ error: 'Error al copiar módulos' });
      }

      moduleIdMap[sourceModule.id] = newModule.id;
    }

    // Get all indicators from source modules
    if (Object.keys(moduleIdMap).length > 0) {
      const sourceModuleIds = Object.keys(moduleIdMap);
      const { data: sourceIndicators, error: indicatorsError } = await supabaseClient
        .from('assessment_indicators')
        .select('*')
        .in('module_id', sourceModuleIds)
        .order('display_order', { ascending: true });

      if (indicatorsError) {
        console.error('Error fetching source indicators:', indicatorsError);
        // Cleanup
        await supabaseClient.from('assessment_modules').delete().eq('template_id', newTemplate.id);
        await supabaseClient.from('assessment_templates').delete().eq('id', newTemplate.id);
        return res.status(500).json({ error: 'Error al cargar indicadores' });
      }

      // Copy indicators
      for (const sourceIndicator of sourceIndicators || []) {
        const newModuleId = moduleIdMap[sourceIndicator.module_id];
        if (!newModuleId) continue;

        const { error: newIndicatorError } = await supabaseClient
          .from('assessment_indicators')
          .insert({
            module_id: newModuleId,
            code: sourceIndicator.code,
            name: sourceIndicator.name,
            question: sourceIndicator.question,
            description: sourceIndicator.description,
            category: sourceIndicator.category,
            frequency_config: sourceIndicator.frequency_config,
            frequency_unit_options: sourceIndicator.frequency_unit_options,
            level_0_descriptor: sourceIndicator.level_0_descriptor,
            level_1_descriptor: sourceIndicator.level_1_descriptor,
            level_2_descriptor: sourceIndicator.level_2_descriptor,
            level_3_descriptor: sourceIndicator.level_3_descriptor,
            level_4_descriptor: sourceIndicator.level_4_descriptor,
            display_order: sourceIndicator.display_order,
            weight: sourceIndicator.weight,
          });

        if (newIndicatorError) {
          console.error('Error copying indicator:', newIndicatorError);
          // Continue - don't fail entire operation for one indicator
        }
      }
    }

    // Count modules and indicators in new template
    const { count: moduleCount } = await supabaseClient
      .from('assessment_modules')
      .select('*', { count: 'exact', head: true })
      .eq('template_id', newTemplate.id);

    const newModuleIds = Object.values(moduleIdMap);
    let indicatorCount = 0;
    if (newModuleIds.length > 0) {
      const { count } = await supabaseClient
        .from('assessment_indicators')
        .select('*', { count: 'exact', head: true })
        .in('module_id', newModuleIds);
      indicatorCount = count || 0;
    }

    return res.status(201).json({
      success: true,
      message: `Template duplicado como versión ${newVersion} (borrador)`,
      template: {
        id: newTemplate.id,
        name: newTemplate.name,
        area: newTemplate.area,
        status: newTemplate.status,
        version: newTemplate.version,
      },
      stats: {
        modules: moduleCount || 0,
        indicators: indicatorCount,
      },
      sourceTemplateId: templateId,
    });
  } catch (err: any) {
    console.error('Unexpected error duplicating template:', err);
    return res.status(500).json({ error: err.message || 'Error al duplicar template' });
  }
}
