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
 * GET /api/admin/assessment-builder/templates/[templateId]/expectations/[indicatorId]
 * Returns expectations for a single indicator
 *
 * PUT /api/admin/assessment-builder/templates/[templateId]/expectations/[indicatorId]
 * Update expectations for a single indicator
 *
 * DELETE /api/admin/assessment-builder/templates/[templateId]/expectations/[indicatorId]
 * Remove expectations for a single indicator
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'PUT' && req.method !== 'DELETE') {
    return handleMethodNotAllowed(res, ['GET', 'PUT', 'DELETE']);
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

  const { templateId, indicatorId } = req.query;
  if (!templateId || typeof templateId !== 'string') {
    return res.status(400).json({ error: 'templateId es requerido' });
  }
  if (!indicatorId || typeof indicatorId !== 'string') {
    return res.status(400).json({ error: 'indicatorId es requerido' });
  }

  // Verify indicator belongs to template
  const { data: indicator, error: indicatorError } = await supabaseClient
    .from('assessment_indicators')
    .select('id, name, assessment_modules!inner(template_id)')
    .eq('id', indicatorId)
    .eq('assessment_modules.template_id', templateId)
    .single();

  if (indicatorError || !indicator) {
    return res.status(404).json({ error: 'Indicador no encontrado en este template' });
  }

  if (req.method === 'GET') {
    return handleGet(req, res, supabaseClient, templateId, indicatorId);
  } else if (req.method === 'PUT') {
    return handlePut(req, res, supabaseClient, templateId, indicatorId);
  } else {
    return handleDelete(req, res, supabaseClient, templateId, indicatorId);
  }
}

async function handleGet(
  req: NextApiRequest,
  res: NextApiResponse,
  supabase: any,
  templateId: string,
  indicatorId: string
) {
  try {
    const { data: expectation, error } = await supabase
      .from('assessment_year_expectations')
      .select('*')
      .eq('template_id', templateId)
      .eq('indicator_id', indicatorId)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching expectation:', error);
      return res.status(500).json({ error: 'Error al cargar expectativa' });
    }

    if (!expectation) {
      return res.status(200).json({
        success: true,
        expectation: null,
        message: 'No hay expectativas definidas para este indicador',
      });
    }

    return res.status(200).json({
      success: true,
      expectation: {
        id: expectation.id,
        indicatorId: expectation.indicator_id,
        year1: expectation.year_1_expected,
        year2: expectation.year_2_expected,
        year3: expectation.year_3_expected,
        year4: expectation.year_4_expected,
        year5: expectation.year_5_expected,
        tolerance: expectation.tolerance,
      },
    });
  } catch (err: any) {
    console.error('Unexpected error fetching expectation:', err);
    return res.status(500).json({ error: err.message || 'Error al cargar expectativa' });
  }
}

async function handlePut(
  req: NextApiRequest,
  res: NextApiResponse,
  supabase: any,
  templateId: string,
  indicatorId: string
) {
  try {
    // Verify template is in draft status
    const { data: template, error: templateError } = await supabase
      .from('assessment_templates')
      .select('status, is_archived')
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

    const { year1, year2, year3, year4, year5, tolerance } = req.body;

    // Validate year values
    const validateYearValue = (value: any): number | null => {
      if (value === null || value === undefined) return null;
      const num = Number(value);
      if (isNaN(num) || num < 0 || num > 4) {
        throw new Error('Los valores de año deben ser 0-4 o null');
      }
      return num;
    };

    let validTolerance = 1;
    if (tolerance !== undefined) {
      const tol = Number(tolerance);
      if (isNaN(tol) || tol < 0 || tol > 2) {
        return res.status(400).json({ error: 'tolerance debe ser 0-2' });
      }
      validTolerance = tol;
    }

    const upsertData = {
      template_id: templateId,
      indicator_id: indicatorId,
      year_1_expected: validateYearValue(year1),
      year_2_expected: validateYearValue(year2),
      year_3_expected: validateYearValue(year3),
      year_4_expected: validateYearValue(year4),
      year_5_expected: validateYearValue(year5),
      tolerance: validTolerance,
    };

    const { data: savedExpectation, error: upsertError } = await supabase
      .from('assessment_year_expectations')
      .upsert(upsertData, {
        onConflict: 'template_id,indicator_id',
        ignoreDuplicates: false,
      })
      .select()
      .single();

    if (upsertError) {
      console.error('Error upserting expectation:', upsertError);
      return res.status(500).json({ error: 'Error al guardar expectativa' });
    }

    return res.status(200).json({
      success: true,
      message: 'Expectativa guardada',
      expectation: {
        id: savedExpectation.id,
        indicatorId: savedExpectation.indicator_id,
        year1: savedExpectation.year_1_expected,
        year2: savedExpectation.year_2_expected,
        year3: savedExpectation.year_3_expected,
        year4: savedExpectation.year_4_expected,
        year5: savedExpectation.year_5_expected,
        tolerance: savedExpectation.tolerance,
      },
    });
  } catch (err: any) {
    console.error('Unexpected error saving expectation:', err);
    return res.status(500).json({ error: err.message || 'Error al guardar expectativa' });
  }
}

async function handleDelete(
  req: NextApiRequest,
  res: NextApiResponse,
  supabase: any,
  templateId: string,
  indicatorId: string
) {
  try {
    // Verify template is not archived
    const { data: template, error: templateError } = await supabase
      .from('assessment_templates')
      .select('status, is_archived')
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

    const { error: deleteError } = await supabase
      .from('assessment_year_expectations')
      .delete()
      .eq('template_id', templateId)
      .eq('indicator_id', indicatorId);

    if (deleteError) {
      console.error('Error deleting expectation:', deleteError);
      return res.status(500).json({ error: 'Error al eliminar expectativa' });
    }

    return res.status(200).json({
      success: true,
      message: 'Expectativa eliminada',
    });
  } catch (err: any) {
    console.error('Unexpected error deleting expectation:', err);
    return res.status(500).json({ error: err.message || 'Error al eliminar expectativa' });
  }
}
