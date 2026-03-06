import { NextApiRequest, NextApiResponse } from 'next';
import { getApiUser, createApiSupabaseClient, sendAuthError, handleMethodNotAllowed } from '@/lib/api-auth';
import type { GenerationType } from '@/types/assessment-builder';
import { hasAssessmentReadPermission, hasAssessmentWritePermission } from '@/lib/assessment-permissions';

/**
 * GET /api/admin/assessment-builder/templates/[templateId]/expectations
 * Returns all year expectations for indicators in a template, grouped by module
 * Now includes generation_type (GT/GI) for dual expectations
 *
 * PUT /api/admin/assessment-builder/templates/[templateId]/expectations
 * Bulk update expectations for multiple indicators
 * Supports generation_type for GT/GI dual expectations
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'PUT') {
    return handleMethodNotAllowed(res, ['GET', 'PUT']);
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
    return res.status(403).json({ error: 'No tienes permiso para acceder a expectativas' });
  }

  const { templateId } = req.query;
  if (!templateId || typeof templateId !== 'string') {
    return res.status(400).json({ error: 'templateId es requerido' });
  }

  if (req.method === 'GET') {
    return handleGet(req, res, supabaseClient, templateId);
  } else {
    // PUT requires write access (admin only)
    const canWrite = await hasAssessmentWritePermission(supabaseClient, user.id);
    if (!canWrite) {
      return res.status(403).json({ error: 'Solo administradores pueden modificar expectativas' });
    }
    return handlePut(req, res, supabaseClient, templateId, user.id);
  }
}

async function handleGet(
  req: NextApiRequest,
  res: NextApiResponse,
  supabase: any,
  templateId: string
) {
  try {
    // Verify template exists and get grade info
    const { data: template, error: templateError } = await supabase
      .from('assessment_templates')
      .select(`
        id, name, area, status, grade_id,
        grade:ab_grades (
          id, name, sort_order, is_always_gt
        )
      `)
      .eq('id', templateId)
      .single();

    if (templateError || !template) {
      return res.status(404).json({ error: 'Template no encontrado' });
    }

    // Determine if this template needs dual expectations
    const isAlwaysGT = template.grade?.is_always_gt ?? true;
    const requiresDualExpectations = !isAlwaysGT;

    // Get all objectives with weights for this template (needed for weight distributor)
    const { data: objectives, error: objectivesError } = await supabase
      .from('assessment_objectives')
      .select('id, name, display_order, weight')
      .eq('template_id', templateId)
      .order('display_order');

    if (objectivesError) {
      console.error('Error fetching objectives:', objectivesError);
      return res.status(500).json({ error: 'Error al cargar objetivos' });
    }

    // Get all modules with indicators for this template
    const { data: modules, error: modulesError } = await supabase
      .from('assessment_modules')
      .select(`
        id,
        name,
        display_order,
        weight,
        objective_id,
        assessment_indicators (
          id,
          code,
          name,
          category,
          display_order,
          weight,
          frequency_unit_options,
          level_0_descriptor,
          level_1_descriptor,
          level_2_descriptor,
          level_3_descriptor,
          level_4_descriptor,
          detalle_options
        )
      `)
      .eq('template_id', templateId)
      .order('display_order');

    if (modulesError) {
      console.error('Error fetching modules:', modulesError);
      return res.status(500).json({ error: 'Error al cargar módulos' });
    }

    // Get all expectations for this template (both GT and GI)
    const { data: expectations, error: expectationsError } = await supabase
      .from('assessment_year_expectations')
      .select('*')
      .eq('template_id', templateId);

    if (expectationsError) {
      console.error('Error fetching expectations:', expectationsError);
      return res.status(500).json({ error: 'Error al cargar expectativas' });
    }

    // Build expectations map by indicator ID and generation_type
    // Key format: `${indicator_id}_${generation_type}`
    const expectationsMap = new Map<string, any>();
    (expectations || []).forEach((exp: any) => {
      const key = `${exp.indicator_id}_${exp.generation_type || 'GT'}`;
      expectationsMap.set(key, exp);
    });

    // Helper to format expectation data
    const formatExpectation = (exp: any) => exp ? {
      id: exp.id,
      generationType: exp.generation_type || 'GT',
      year1: exp.year_1_expected,
      year1Unit: exp.year_1_expected_unit,
      year2: exp.year_2_expected,
      year2Unit: exp.year_2_expected_unit,
      year3: exp.year_3_expected,
      year3Unit: exp.year_3_expected_unit,
      year4: exp.year_4_expected,
      year4Unit: exp.year_4_expected_unit,
      year5: exp.year_5_expected,
      year5Unit: exp.year_5_expected_unit,
      tolerance: exp.tolerance,
    } : null;

    // Format response with modules and their indicators with expectations
    const formattedModules = (modules || []).map((module: any) => ({
      moduleId: module.id,
      moduleName: module.name,
      moduleOrder: module.display_order,
      moduleWeight: module.weight,
      objectiveId: module.objective_id,
      indicators: (module.assessment_indicators || [])
        .sort((a: any, b: any) => a.display_order - b.display_order)
        .map((indicator: any) => {
          const gtKey = `${indicator.id}_GT`;
          const giKey = `${indicator.id}_GI`;
          const gtExp = expectationsMap.get(gtKey);
          const giExp = expectationsMap.get(giKey);

          return {
            indicatorId: indicator.id,
            indicatorCode: indicator.code,
            indicatorName: indicator.name,
            indicatorCategory: indicator.category,
            indicatorWeight: indicator.weight,
            frequencyUnitOptions: indicator.frequency_unit_options,
            displayOrder: indicator.display_order,
            levelDescriptors: indicator.category === 'profundidad' ? {
              level0: indicator.level_0_descriptor,
              level1: indicator.level_1_descriptor,
              level2: indicator.level_2_descriptor,
              level3: indicator.level_3_descriptor,
              level4: indicator.level_4_descriptor,
            } : undefined,
            detalleOptions: indicator.category === 'detalle' ? (indicator.detalle_options || null) : undefined,
            // For always_gt templates: only GT expectations
            // For non-always_gt templates: both GT and GI expectations
            expectationsGT: formatExpectation(gtExp),
            expectationsGI: requiresDualExpectations ? formatExpectation(giExp) : null,
          };
        }),
    }));

    // Calculate stats
    const totalIndicators = formattedModules.reduce(
      (sum: number, m: any) => sum + m.indicators.length,
      0
    );

    // For always_gt: count indicators with GT expectations
    // For non-always_gt: count indicators with BOTH GT and GI expectations
    const indicatorsWithCompleteExpectations = formattedModules.reduce(
      (sum: number, m: any) => sum + m.indicators.filter((i: any) => {
        if (requiresDualExpectations) {
          return i.expectationsGT && i.expectationsGI;
        }
        return i.expectationsGT;
      }).length,
      0
    );

    // Build objectives hierarchy for weight distributor
    const formattedObjectives = (objectives || []).map((obj: any) => ({
      objectiveId: obj.id,
      objectiveName: obj.name,
      objectiveOrder: obj.display_order,
      objectiveWeight: obj.weight,
      modules: formattedModules.filter((m: any) => m.objectiveId === obj.id).map((m: any) => ({
        moduleId: m.moduleId,
        moduleName: m.moduleName,
        moduleOrder: m.moduleOrder,
        moduleWeight: m.moduleWeight,
        indicators: m.indicators.map((i: any) => ({
          indicatorId: i.indicatorId,
          indicatorName: i.indicatorName,
          indicatorCategory: i.indicatorCategory,
          indicatorWeight: i.indicatorWeight,
        })),
      })),
    }));

    return res.status(200).json({
      success: true,
      template: {
        id: template.id,
        name: template.name,
        area: template.area,
        status: template.status,
        gradeId: template.grade_id,
        grade: template.grade,
        isAlwaysGT,
        requiresDualExpectations,
      },
      objectives: formattedObjectives,
      modules: formattedModules,
      stats: {
        totalIndicators,
        indicatorsWithCompleteExpectations,
        coverage: totalIndicators > 0
          ? Math.round((indicatorsWithCompleteExpectations / totalIndicators) * 100)
          : 0,
      },
    });
  } catch (err: any) {
    console.error('Unexpected error fetching expectations:', err);
    return res.status(500).json({ error: err.message || 'Error al cargar expectativas' });
  }
}

async function handlePut(
  req: NextApiRequest,
  res: NextApiResponse,
  supabase: any,
  templateId: string,
  userId: string
) {
  try {
    const { expectations, weights } = req.body as {
      expectations?: Array<{
        indicatorId: string;
        generationType: GenerationType; // 'GT' or 'GI'
        year1?: number | null;
        year1Unit?: string | null;
        year2?: number | null;
        year2Unit?: string | null;
        year3?: number | null;
        year3Unit?: string | null;
        year4?: number | null;
        year4Unit?: string | null;
        year5?: number | null;
        year5Unit?: string | null;
        tolerance?: number;
      }>;
      weights?: {
        objectives?: Array<{ id: string; weight: number }>;
        modules?: Array<{ id: string; weight: number }>;
        indicators?: Array<{ id: string; weight: number }>;
      };
    };

    if (!expectations && !weights) {
      return res.status(400).json({ error: 'Se requiere expectations o weights' });
    }

    if (expectations !== undefined && !Array.isArray(expectations)) {
      return res.status(400).json({ error: 'Se requiere un array de expectativas' });
    }

    // Verify template exists and is not archived, get grade info
    const { data: template, error: templateError } = await supabase
      .from('assessment_templates')
      .select(`
        id, status, is_archived, grade_id,
        grade:ab_grades (
          id, name, is_always_gt
        )
      `)
      .eq('id', templateId)
      .single();

    if (templateError || !template) {
      return res.status(404).json({ error: 'Template no encontrado' });
    }

    if (template.is_archived) {
      return res.status(400).json({
        error: 'Los templates archivados no pueden ser modificados',
      });
    }

    const isAlwaysGT = template.grade?.is_always_gt ?? true;

    // Get all indicator IDs for this template to validate (including category for weight validation)
    const { data: indicators, error: indicatorsError } = await supabase
      .from('assessment_indicators')
      .select('id, module_id, category, assessment_modules!inner(template_id)')
      .eq('assessment_modules.template_id', templateId);

    if (indicatorsError) {
      console.error('Error fetching indicators:', indicatorsError);
      return res.status(500).json({ error: 'Error al validar indicadores' });
    }

    const validIndicatorIds = new Set((indicators || []).map((i: any) => i.id));

    // ---- Handle weight updates ----
    let weightsSaved = 0;
    if (weights) {
      // Fetch full DB groups for completeness validation
      const { data: dbObjectives } = await supabase
        .from('assessment_objectives')
        .select('id, weight')
        .eq('template_id', templateId);

      const { data: dbModules } = await supabase
        .from('assessment_modules')
        .select('id, weight, objective_id')
        .eq('template_id', templateId);

      const { data: dbIndicators } = await supabase
        .from('assessment_indicators')
        .select('id, weight, module_id, category')
        .in('module_id', (dbModules || []).map((m: any) => m.id));

      const validObjectiveIds = new Set((dbObjectives || []).map((o: any) => o.id));
      const validModuleIds = new Set((dbModules || []).map((m: any) => m.id));

      // Validate and save objective weights
      if (weights.objectives && weights.objectives.length > 0) {
        // Fix 2: Require weights for ALL objectives in the template
        const allObjectiveIds = (dbObjectives || []).map((o: any) => o.id);
        if (allObjectiveIds.length > 1) {
          const submittedIds = new Set(weights.objectives.map(o => o.id));
          const missing = allObjectiveIds.filter((id: string) => !submittedIds.has(id));
          if (missing.length > 0) {
            return res.status(400).json({
              error: 'Debe incluir pesos para todos los Procesos Generativos del template',
            });
          }
        }
        for (const obj of weights.objectives) {
          if (!validObjectiveIds.has(obj.id)) {
            return res.status(400).json({ error: `Objetivo ${obj.id} no pertenece a este template` });
          }
          const w = Number(obj.weight);
          if (isNaN(w) || w < 0) {
            return res.status(400).json({ error: `Peso inválido para objetivo ${obj.id}` });
          }
        }
        if (weights.objectives.length > 1) {
          const objSum = weights.objectives.reduce((s, o) => s + Number(o.weight), 0);
          if (Math.abs(objSum - 100) > 0.5) {
            return res.status(400).json({
              error: `Los pesos de los procesos deben sumar 100% (suma actual: ${objSum.toFixed(1)}%)`,
            });
          }
        }
        for (const obj of weights.objectives) {
          const { error: updateError } = await supabase
            .from('assessment_objectives')
            .update({ weight: Number(obj.weight) })
            .eq('id', obj.id);
          if (updateError) {
            console.error('Error updating objective weight:', updateError);
            return res.status(500).json({ error: `Error al guardar peso del proceso: ${updateError.message}` });
          }
          weightsSaved++;
        }
      }

      // Validate and save module weights (group by objective for sum validation)
      if (weights.modules && weights.modules.length > 0) {
        for (const mod of weights.modules) {
          if (!validModuleIds.has(mod.id)) {
            return res.status(400).json({ error: `Módulo ${mod.id} no pertenece a este template` });
          }
          const w = Number(mod.weight);
          if (isNaN(w) || w < 0) {
            return res.status(400).json({ error: `Peso inválido para módulo ${mod.id}` });
          }
        }
        // Fix 2: For each objective with submitted modules, require ALL modules in that objective
        const modulesByObjective = new Map<string, Array<{ id: string; weight: number }>>();
        for (const mod of weights.modules) {
          const dbMod = (dbModules || []).find((m: any) => m.id === mod.id);
          const objId = dbMod?.objective_id || '__none__';
          if (!modulesByObjective.has(objId)) modulesByObjective.set(objId, []);
          modulesByObjective.get(objId)!.push(mod);
        }
        for (const [objId, mods] of modulesByObjective.entries()) {
          const allModsInObj = (dbModules || []).filter((m: any) => m.objective_id === objId);
          if (allModsInObj.length > 1) {
            const submittedIds = new Set(mods.map(m => m.id));
            const missing = allModsInObj.filter((m: any) => !submittedIds.has(m.id));
            if (missing.length > 0) {
              return res.status(400).json({
                error: `Debe incluir pesos para todas las prácticas del proceso ${objId}`,
              });
            }
          }
          if (mods.length <= 1) continue;
          const modSum = mods.reduce((s, m) => s + Number(m.weight), 0);
          if (Math.abs(modSum - 100) > 0.5) {
            return res.status(400).json({
              error: `Los pesos de las prácticas del proceso ${objId} deben sumar 100% (suma actual: ${modSum.toFixed(1)}%)`,
            });
          }
        }
        for (const mod of weights.modules) {
          const { error: updateError } = await supabase
            .from('assessment_modules')
            .update({ weight: Number(mod.weight) })
            .eq('id', mod.id);
          if (updateError) {
            console.error('Error updating module weight:', updateError);
            return res.status(500).json({ error: `Error al guardar peso de la práctica: ${updateError.message}` });
          }
          weightsSaved++;
        }
      }

      // Validate and save indicator weights (group by module for sum validation)
      if (weights.indicators && weights.indicators.length > 0) {
        for (const ind of weights.indicators) {
          if (!validIndicatorIds.has(ind.id)) {
            return res.status(400).json({ error: `Indicador ${ind.id} no pertenece a este template` });
          }
          // R4: All categories (including detalle/traspaso) may now participate in weight distribution.
          // The category rejection has been removed.
          const w = Number(ind.weight);
          if (isNaN(w) || w < 0) {
            return res.status(400).json({ error: `Peso inválido para indicador ${ind.id}` });
          }
        }
        // Fix 2: For each module with submitted indicators, require ALL indicators (R5: all 5 categories)
        const indicatorsByModule = new Map<string, Array<{ id: string; weight: number }>>();
        for (const ind of weights.indicators) {
          const dbInd = (dbIndicators || []).find((i: any) => i.id === ind.id);
          const modId = dbInd?.module_id || '__none__';
          if (!indicatorsByModule.has(modId)) indicatorsByModule.set(modId, []);
          indicatorsByModule.get(modId)!.push(ind);
        }
        for (const [modId, inds] of indicatorsByModule.entries()) {
          // R5: Get ALL indicators in this module (all 5 categories participate in sum-to-100 check)
          const allScoredInMod = (dbIndicators || []).filter(
            (i: any) => i.module_id === modId
          );
          if (allScoredInMod.length > 1) {
            const submittedIds = new Set(inds.map(i => i.id));
            const missing = allScoredInMod.filter((i: any) => !submittedIds.has(i.id));
            if (missing.length > 0) {
              return res.status(400).json({
                error: `Debe incluir pesos para todos los indicadores del módulo ${modId}`,
              });
            }
          }
          if (inds.length <= 1) continue;
          const indSum = inds.reduce((s, i) => s + Number(i.weight), 0);
          if (Math.abs(indSum - 100) > 0.5) {
            return res.status(400).json({
              error: `Los pesos de los indicadores del módulo ${modId} deben sumar 100% (suma actual: ${indSum.toFixed(1)}%)`,
            });
          }
        }
        for (const ind of weights.indicators) {
          const { error: updateError } = await supabase
            .from('assessment_indicators')
            .update({ weight: Number(ind.weight) })
            .eq('id', ind.id);
          if (updateError) {
            console.error('Error updating indicator weight:', updateError);
            return res.status(500).json({ error: `Error al guardar peso del indicador: ${updateError.message}` });
          }
          weightsSaved++;
        }
      }
    }

    // ---- Handle expectations updates ----
    if (!expectations || expectations.length === 0) {
      return res.status(200).json({
        success: true,
        message: `${weightsSaved} pesos guardados`,
        weightsSaved,
      });
    }

    // Validate and prepare upsert data
    const errors: string[] = [];
    const upsertData: any[] = [];

    // Valid frequency units
    const validUnits = ['dia', 'semana', 'mes', 'trimestre', 'semestre', 'año'];

    for (const exp of expectations) {
      if (!exp.indicatorId) {
        errors.push('indicatorId es requerido para cada expectativa');
        continue;
      }

      if (!validIndicatorIds.has(exp.indicatorId)) {
        errors.push(`Indicador ${exp.indicatorId} no pertenece a este template`);
        continue;
      }

      // Validate generation_type
      const generationType = exp.generationType || 'GT';
      if (!['GT', 'GI'].includes(generationType)) {
        errors.push(`Indicador ${exp.indicatorId}: generationType debe ser GT o GI`);
        continue;
      }

      // For always_gt templates, only accept GT expectations
      if (isAlwaysGT && generationType !== 'GT') {
        errors.push(`Indicador ${exp.indicatorId}: Este template solo acepta expectativas GT (es un nivel siempre GT)`);
        continue;
      }

      // Validate year values (allow larger values for frequency indicators)
      const validateYearValue = (value: any, yearNum: number): number | null => {
        if (value === null || value === undefined) return null;
        const num = Number(value);
        if (isNaN(num) || num < 0) {
          errors.push(`Indicador ${exp.indicatorId}: year${yearNum} debe ser >= 0 o null`);
          return null;
        }
        return num;
      };

      // Validate unit values
      const validateUnitValue = (value: any): string | null => {
        if (value === null || value === undefined) return null;
        if (!validUnits.includes(value)) {
          return null;
        }
        return value;
      };

      const year1 = validateYearValue(exp.year1, 1);
      const year1Unit = validateUnitValue(exp.year1Unit);
      const year2 = validateYearValue(exp.year2, 2);
      const year2Unit = validateUnitValue(exp.year2Unit);
      const year3 = validateYearValue(exp.year3, 3);
      const year3Unit = validateUnitValue(exp.year3Unit);
      const year4 = validateYearValue(exp.year4, 4);
      const year4Unit = validateUnitValue(exp.year4Unit);
      const year5 = validateYearValue(exp.year5, 5);
      const year5Unit = validateUnitValue(exp.year5Unit);

      // Validate tolerance (0-2)
      let tolerance = 1;
      if (exp.tolerance !== undefined) {
        const tol = Number(exp.tolerance);
        if (isNaN(tol) || tol < 0 || tol > 2) {
          errors.push(`Indicador ${exp.indicatorId}: tolerance debe ser 0-2`);
        } else {
          tolerance = tol;
        }
      }

      upsertData.push({
        template_id: templateId,
        indicator_id: exp.indicatorId,
        generation_type: generationType,
        year_1_expected: year1,
        year_1_expected_unit: year1Unit,
        year_2_expected: year2,
        year_2_expected_unit: year2Unit,
        year_3_expected: year3,
        year_3_expected_unit: year3Unit,
        year_4_expected: year4,
        year_4_expected_unit: year4Unit,
        year_5_expected: year5,
        year_5_expected_unit: year5Unit,
        tolerance,
      });
    }

    if (upsertData.length === 0) {
      return res.status(400).json({
        error: 'No hay expectativas válidas para guardar',
        details: errors,
      });
    }

    // Upsert expectations (new unique constraint includes generation_type)
    const { data: savedExpectations, error: upsertError } = await supabase
      .from('assessment_year_expectations')
      .upsert(upsertData, {
        onConflict: 'template_id,indicator_id,generation_type',
        ignoreDuplicates: false,
      })
      .select();

    if (upsertError) {
      console.error('Error upserting expectations:', upsertError);
      return res.status(500).json({ error: 'Error al guardar expectativas' });
    }

    return res.status(200).json({
      success: true,
      message: `${savedExpectations?.length || 0} expectativas guardadas`,
      saved: savedExpectations?.length || 0,
      weightsSaved,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err: any) {
    console.error('Unexpected error saving expectations:', err);
    return res.status(500).json({ error: err.message || 'Error al guardar expectativas' });
  }
}
