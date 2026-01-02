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
 * GET /api/admin/assessment-builder/templates/[templateId]/expectations
 * Returns all year expectations for indicators in a template, grouped by module
 *
 * PUT /api/admin/assessment-builder/templates/[templateId]/expectations
 * Bulk update expectations for multiple indicators
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

  // Permission check - query user_roles table
  const hasPermission = await hasAssessmentAdminPermission(supabaseClient, user.id);
  if (!hasPermission) {
    return res.status(403).json({ error: 'No tienes permiso para gestionar expectativas' });
  }

  const { templateId } = req.query;
  if (!templateId || typeof templateId !== 'string') {
    return res.status(400).json({ error: 'templateId es requerido' });
  }

  if (req.method === 'GET') {
    return handleGet(req, res, supabaseClient, templateId);
  } else {
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
    // Verify template exists
    const { data: template, error: templateError } = await supabase
      .from('assessment_templates')
      .select('id, name, area, status')
      .eq('id', templateId)
      .single();

    if (templateError || !template) {
      return res.status(404).json({ error: 'Template no encontrado' });
    }

    // Get all modules with indicators for this template
    const { data: modules, error: modulesError } = await supabase
      .from('assessment_modules')
      .select(`
        id,
        name,
        display_order,
        assessment_indicators (
          id,
          code,
          name,
          category,
          display_order,
          frequency_unit_options
        )
      `)
      .eq('template_id', templateId)
      .order('display_order');

    if (modulesError) {
      console.error('Error fetching modules:', modulesError);
      return res.status(500).json({ error: 'Error al cargar módulos' });
    }

    // Get all expectations for this template
    const { data: expectations, error: expectationsError } = await supabase
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
      expectationsMap.set(exp.indicator_id, exp);
    });

    // Format response with modules and their indicators with expectations
    // Field names must match frontend expectations (indicatorId, indicatorName, etc.)
    const formattedModules = (modules || []).map((module: any) => ({
      moduleId: module.id,
      moduleName: module.name,
      moduleOrder: module.display_order,
      indicators: (module.assessment_indicators || [])
        .sort((a: any, b: any) => a.display_order - b.display_order)
        .map((indicator: any) => {
          const exp = expectationsMap.get(indicator.id);
          return {
            indicatorId: indicator.id,
            indicatorCode: indicator.code,
            indicatorName: indicator.name,
            indicatorCategory: indicator.category,
            frequencyUnitOptions: indicator.frequency_unit_options,
            displayOrder: indicator.display_order,
            expectations: exp
              ? {
                  id: exp.id,
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
                }
              : null,
          };
        }),
    }));

    // Calculate stats
    const totalIndicators = formattedModules.reduce(
      (sum: number, m: any) => sum + m.indicators.length,
      0
    );
    const indicatorsWithExpectations = formattedModules.reduce(
      (sum: number, m: any) => sum + m.indicators.filter((i: any) => i.expectations).length,
      0
    );

    return res.status(200).json({
      success: true,
      template: {
        id: template.id,
        name: template.name,
        area: template.area,
        status: template.status,
      },
      modules: formattedModules,
      stats: {
        totalIndicators,
        indicatorsWithExpectations,
        coverage: totalIndicators > 0 ? Math.round((indicatorsWithExpectations / totalIndicators) * 100) : 0,
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
    const { expectations } = req.body as {
      expectations: Array<{
        indicatorId: string;
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
    };

    if (!expectations || !Array.isArray(expectations)) {
      return res.status(400).json({ error: 'Se requiere un array de expectativas' });
    }

    // Verify template exists and is not archived
    const { data: template, error: templateError } = await supabase
      .from('assessment_templates')
      .select('id, status, is_archived')
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

    // Get all indicator IDs for this template to validate
    const { data: indicators, error: indicatorsError } = await supabase
      .from('assessment_indicators')
      .select('id, module_id, assessment_modules!inner(template_id)')
      .eq('assessment_modules.template_id', templateId);

    if (indicatorsError) {
      console.error('Error fetching indicators:', indicatorsError);
      return res.status(500).json({ error: 'Error al validar indicadores' });
    }

    const validIndicatorIds = new Set((indicators || []).map((i: any) => i.id));

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

    // Upsert expectations
    const { data: savedExpectations, error: upsertError } = await supabase
      .from('assessment_year_expectations')
      .upsert(upsertData, {
        onConflict: 'template_id,indicator_id',
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
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err: any) {
    console.error('Unexpected error saving expectations:', err);
    return res.status(500).json({ error: err.message || 'Error al guardar expectativas' });
  }
}
