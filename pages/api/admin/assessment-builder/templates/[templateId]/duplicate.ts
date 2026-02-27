import { NextApiRequest, NextApiResponse } from 'next';
import { getApiUser, createApiSupabaseClient, sendAuthError, handleMethodNotAllowed } from '@/lib/api-auth';
import { hasAssessmentWritePermission } from '@/lib/assessment-permissions';

/**
 * POST /api/admin/assessment-builder/templates/[templateId]/duplicate
 *
 * Duplicates a template with all nested data:
 * 1. Creates new template with 'draft' status and version '1.0.0'
 * 2. Copies all modules (new IDs, same sort_order)
 * 3. Copies all indicators under each module (new IDs)
 * 4. Copies all expectations for each indicator (new IDs, linked to new indicator)
 *
 * Request body: { name: string, grade_id: number }
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
  const hasPermission = await hasAssessmentWritePermission(supabaseClient, user.id);
  if (!hasPermission) {
    return res.status(403).json({ error: 'No tienes permiso para duplicar templates' });
  }

  const { templateId } = req.query;
  if (!templateId || typeof templateId !== 'string') {
    return res.status(400).json({ error: 'templateId es requerido' });
  }

  try {
    // Parse request body
    const { name, grade_id } = req.body;

    // Validate required fields
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'El nombre es requerido' });
    }

    if (!grade_id || typeof grade_id !== 'number') {
      return res.status(400).json({ error: 'El nivel es requerido' });
    }

    // Get source template
    const { data: sourceTemplate, error: templateError } = await supabaseClient
      .from('assessment_templates')
      .select('*')
      .eq('id', templateId)
      .single();

    if (templateError || !sourceTemplate) {
      return res.status(404).json({ error: 'Template no encontrado' });
    }

    // New template always starts as draft v1.0.0
    const newVersion = '1.0.0';

    // Create new template as draft with provided name and grade
    const { data: newTemplate, error: newTemplateError } = await supabaseClient
      .from('assessment_templates')
      .insert({
        name: name.trim(),
        description: sourceTemplate.description,
        area: sourceTemplate.area,
        grade_id: grade_id,
        status: 'draft',
        version: newVersion,
        scoring_config: sourceTemplate.scoring_config,
        created_by: user.id,
      })
      .select(`
        *,
        grade:ab_grades (
          id,
          name,
          sort_order,
          is_always_gt
        )
      `)
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

    // Get all indicators from source modules and track ID mapping
    const indicatorIdMap: Record<string, string> = {};

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

      // Copy indicators and track ID mapping
      for (const sourceIndicator of sourceIndicators || []) {
        const newModuleId = moduleIdMap[sourceIndicator.module_id];
        if (!newModuleId) continue;

        const { data: newIndicator, error: newIndicatorError } = await supabaseClient
          .from('assessment_indicators')
          .insert({
            module_id: newModuleId,
            code: sourceIndicator.code,
            name: sourceIndicator.name,
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
          })
          .select('id')
          .single();

        if (newIndicatorError || !newIndicator) {
          console.error('Error copying indicator:', newIndicatorError);
          // Continue - don't fail entire operation for one indicator
        } else {
          indicatorIdMap[sourceIndicator.id] = newIndicator.id;
        }
      }
    }

    // Copy expectations for all indicators
    let expectationCount = 0;
    if (Object.keys(indicatorIdMap).length > 0) {
      const sourceIndicatorIds = Object.keys(indicatorIdMap);
      const { data: sourceExpectations, error: expectationsError } = await supabaseClient
        .from('assessment_year_expectations')
        .select('*')
        .in('indicator_id', sourceIndicatorIds);

      if (expectationsError) {
        console.error('Error fetching source expectations:', expectationsError);
        // Don't fail - expectations are optional
      } else if (sourceExpectations && sourceExpectations.length > 0) {
        for (const sourceExpectation of sourceExpectations) {
          const newIndicatorId = indicatorIdMap[sourceExpectation.indicator_id];
          if (!newIndicatorId) continue;

          const { error: newExpectationError } = await supabaseClient
            .from('assessment_year_expectations')
            .insert({
              template_id: newTemplate.id,
              indicator_id: newIndicatorId,
              generation_type: sourceExpectation.generation_type,
              year_1_expected: sourceExpectation.year_1_expected,
              year_1_expected_unit: sourceExpectation.year_1_expected_unit,
              year_2_expected: sourceExpectation.year_2_expected,
              year_2_expected_unit: sourceExpectation.year_2_expected_unit,
              year_3_expected: sourceExpectation.year_3_expected,
              year_3_expected_unit: sourceExpectation.year_3_expected_unit,
              year_4_expected: sourceExpectation.year_4_expected,
              year_4_expected_unit: sourceExpectation.year_4_expected_unit,
              year_5_expected: sourceExpectation.year_5_expected,
              year_5_expected_unit: sourceExpectation.year_5_expected_unit,
              tolerance: sourceExpectation.tolerance,
            });

          if (newExpectationError) {
            console.error('Error copying expectation:', newExpectationError);
            // Continue - don't fail entire operation for one expectation
          } else {
            expectationCount++;
          }
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
        grade_id: newTemplate.grade_id,
        grade: newTemplate.grade,
      },
      stats: {
        modules: moduleCount || 0,
        indicators: indicatorCount,
        expectations: expectationCount,
      },
      sourceTemplateId: templateId,
    });
  } catch (err: any) {
    console.error('Unexpected error duplicating template:', err);
    return res.status(500).json({ error: err.message || 'Error al duplicar template' });
  }
}
