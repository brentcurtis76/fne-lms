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

    // Find highest existing version for this area + grade combo
    const { data: existingVersions } = await supabaseClient
      .from('assessment_templates')
      .select('version')
      .eq('area', sourceTemplate.area)
      .eq('grade_id', grade_id)
      .order('version', { ascending: false })
      .limit(10);

    let newVersion = '1.0.0';
    if (existingVersions && existingVersions.length > 0) {
      let maxMajor = 0, maxMinor = 0, maxPatch = 0;
      for (const ev of existingVersions) {
        const parts = (ev.version || '0.0.0').split('.').map(Number);
        const [maj = 0, min = 0, pat = 0] = parts;
        if (maj > maxMajor || (maj === maxMajor && min > maxMinor) || (maj === maxMajor && min === maxMinor && pat > maxPatch)) {
          maxMajor = maj; maxMinor = min; maxPatch = pat;
        }
      }
      newVersion = `${maxMajor}.${maxMinor}.${maxPatch + 1}`;
    }

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

    // Get all objectives from source and copy them first
    const { data: sourceObjectives, error: objectivesError } = await supabaseClient
      .from('assessment_objectives')
      .select('*')
      .eq('template_id', templateId)
      .order('display_order', { ascending: true });

    if (objectivesError) {
      console.error('Error fetching source objectives:', objectivesError);
      await supabaseClient.from('assessment_templates').delete().eq('id', newTemplate.id);
      return res.status(500).json({ error: 'Error al cargar objetivos' });
    }

    // Copy objectives and track ID mapping (old objective ID -> new objective ID)
    const objectiveIdMap: Record<string, string> = {};

    for (const sourceObjective of sourceObjectives || []) {
      const { data: newObjective, error: newObjectiveError } = await supabaseClient
        .from('assessment_objectives')
        .insert({
          template_id: newTemplate.id,
          name: sourceObjective.name,
          description: sourceObjective.description,
          display_order: sourceObjective.display_order,
          weight: sourceObjective.weight,
        })
        .select()
        .single();

      if (newObjectiveError) {
        console.error('Error copying objective:', newObjectiveError);
        await supabaseClient.from('assessment_objectives').delete().eq('template_id', newTemplate.id);
        await supabaseClient.from('assessment_templates').delete().eq('id', newTemplate.id);
        return res.status(500).json({ error: 'Error al copiar objetivos' });
      }

      objectiveIdMap[sourceObjective.id] = newObjective.id;
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
      await supabaseClient.from('assessment_objectives').delete().eq('template_id', newTemplate.id);
      await supabaseClient.from('assessment_templates').delete().eq('id', newTemplate.id);
      return res.status(500).json({ error: 'Error al cargar módulos' });
    }

    // Copy modules and track ID mapping (with remapped objective_id)
    const moduleIdMap: Record<string, string> = {};

    for (const sourceModule of sourceModules || []) {
      // Remap objective_id to the new objective's ID
      const newObjectiveId = sourceModule.objective_id
        ? objectiveIdMap[sourceModule.objective_id] || null
        : null;

      const { data: newModule, error: newModuleError } = await supabaseClient
        .from('assessment_modules')
        .insert({
          template_id: newTemplate.id,
          name: sourceModule.name,
          description: sourceModule.description,
          instructions: sourceModule.instructions,
          display_order: sourceModule.display_order,
          weight: sourceModule.weight,
          objective_id: newObjectiveId,
        })
        .select()
        .single();

      if (newModuleError) {
        console.error('Error copying module:', newModuleError);
        // Cleanup: delete everything we created
        await supabaseClient.from('assessment_modules').delete().eq('template_id', newTemplate.id);
        await supabaseClient.from('assessment_objectives').delete().eq('template_id', newTemplate.id);
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
            detalle_options: sourceIndicator.detalle_options,
            evaluation_guidance: sourceIndicator.evaluation_guidance,
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

    // Copy per-year weight distributions
    let yearWeightCount = 0;
    const { data: sourceYearWeights, error: yearWeightsError } = await supabaseClient
      .from('assessment_entity_year_weights')
      .select('*')
      .eq('template_id', templateId);

    if (yearWeightsError) {
      console.error('Error fetching source year weights:', yearWeightsError);
      // Don't fail - year weights are optional enhancement
    } else if (sourceYearWeights && sourceYearWeights.length > 0) {
      for (const sw of sourceYearWeights) {
        // Remap entity_id based on entity_type
        let newEntityId: string | undefined;
        if (sw.entity_type === 'objective') {
          newEntityId = objectiveIdMap[sw.entity_id];
        } else if (sw.entity_type === 'module') {
          newEntityId = moduleIdMap[sw.entity_id];
        } else if (sw.entity_type === 'indicator') {
          newEntityId = indicatorIdMap[sw.entity_id];
        }
        if (!newEntityId) continue;

        const { error: insertError } = await supabaseClient
          .from('assessment_entity_year_weights')
          .insert({
            template_id: newTemplate.id,
            entity_type: sw.entity_type,
            entity_id: newEntityId,
            year: sw.year,
            weight: sw.weight,
          });

        if (insertError) {
          console.error('Error copying year weight:', insertError);
        } else {
          yearWeightCount++;
        }
      }
    }

    // Count objectives, modules and indicators in new template
    const { count: objectiveCount } = await supabaseClient
      .from('assessment_objectives')
      .select('*', { count: 'exact', head: true })
      .eq('template_id', newTemplate.id);

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
        objectives: objectiveCount || 0,
        modules: moduleCount || 0,
        indicators: indicatorCount,
        expectations: expectationCount,
        yearWeights: yearWeightCount,
      },
      sourceTemplateId: templateId,
    });
  } catch (err: any) {
    console.error('Unexpected error duplicating template:', err);
    return res.status(500).json({ error: err.message || 'Error al duplicar template' });
  }
}
