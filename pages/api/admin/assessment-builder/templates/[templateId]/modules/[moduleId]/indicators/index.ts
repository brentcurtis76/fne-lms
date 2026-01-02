import { NextApiRequest, NextApiResponse } from 'next';
import { getApiUser, createApiSupabaseClient, sendAuthError, handleMethodNotAllowed } from '@/lib/api-auth';
import { IndicatorCategory } from '@/types/assessment-builder';
import { updatePublishedTemplateSnapshot } from '@/lib/services/assessment-builder/autoAssignmentService';

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
 * GET /api/admin/assessment-builder/templates/[templateId]/modules/[moduleId]/indicators
 * Returns all indicators for a module
 *
 * POST /api/admin/assessment-builder/templates/[templateId]/modules/[moduleId]/indicators
 * Creates a new indicator in the module
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return handleMethodNotAllowed(res, ['GET', 'POST']);
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
    return res.status(403).json({ error: 'No tienes permiso para gestionar indicadores' });
  }

  const { templateId, moduleId } = req.query;
  if (!templateId || typeof templateId !== 'string') {
    return res.status(400).json({ error: 'templateId es requerido' });
  }
  if (!moduleId || typeof moduleId !== 'string') {
    return res.status(400).json({ error: 'moduleId es requerido' });
  }

  // Verify module exists and belongs to the template
  const { data: module, error: moduleError } = await supabaseClient
    .from('assessment_modules')
    .select('id, template_id')
    .eq('id', moduleId)
    .eq('template_id', templateId)
    .single();

  if (moduleError || !module) {
    return res.status(404).json({ error: 'Módulo no encontrado' });
  }

  if (req.method === 'GET') {
    // GET is allowed for any template status (to view indicators)
    return handleGet(req, res, supabaseClient, moduleId);
  } else {
    // POST - blocked only for archived templates
    const { data: template, error: templateError } = await supabaseClient
      .from('assessment_templates')
      .select('status, is_archived')
      .eq('id', templateId)
      .single();

    if (templateError || !template) {
      return res.status(404).json({ error: 'Template no encontrado' });
    }

    if (template.is_archived) {
      return res.status(400).json({ error: 'Los templates archivados no pueden ser modificados' });
    }

    return handlePost(req, res, supabaseClient, templateId, moduleId, user.id);
  }
}

async function handleGet(
  req: NextApiRequest,
  res: NextApiResponse,
  supabaseClient: any,
  moduleId: string
) {
  try {
    const { data: indicators, error } = await supabaseClient
      .from('assessment_indicators')
      .select('*')
      .eq('module_id', moduleId)
      .order('display_order', { ascending: true });

    if (error) {
      console.error('Error fetching indicators:', error);
      return res.status(500).json({ error: 'Error al cargar indicadores' });
    }

    return res.status(200).json({
      success: true,
      indicators: indicators.map((ind: any) => ({
        id: ind.id,
        moduleId: ind.module_id,
        code: ind.code,
        name: ind.name,
        question: ind.question,
        description: ind.description,
        category: ind.category,
        frequencyConfig: ind.frequency_config,
        frequencyUnitOptions: ind.frequency_unit_options,
        level0Descriptor: ind.level_0_descriptor,
        level1Descriptor: ind.level_1_descriptor,
        level2Descriptor: ind.level_2_descriptor,
        level3Descriptor: ind.level_3_descriptor,
        level4Descriptor: ind.level_4_descriptor,
        displayOrder: ind.display_order,
        weight: ind.weight,
        createdAt: ind.created_at,
        updatedAt: ind.updated_at,
      })),
    });
  } catch (err: any) {
    console.error('Unexpected error fetching indicators:', err);
    return res.status(500).json({ error: err.message || 'Error al cargar indicadores' });
  }
}

async function handlePost(
  req: NextApiRequest,
  res: NextApiResponse,
  supabaseClient: any,
  templateId: string,
  moduleId: string,
  userId: string
) {
  try {
    const {
      code,
      name,
      question,
      description,
      category,
      frequencyConfig,
      frequencyUnitOptions,
      level0Descriptor,
      level1Descriptor,
      level2Descriptor,
      level3Descriptor,
      level4Descriptor,
      weight,
    } = req.body;

    // Validation
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'El nombre del indicador es requerido' });
    }

    const validCategories: IndicatorCategory[] = ['cobertura', 'frecuencia', 'profundidad'];
    if (!category || !validCategories.includes(category)) {
      return res.status(400).json({
        error: 'Categoría inválida. Debe ser: cobertura, frecuencia, o profundidad',
      });
    }

    // For profundidad, require at least some level descriptors
    if (category === 'profundidad') {
      const hasDescriptors =
        level0Descriptor || level1Descriptor || level2Descriptor || level3Descriptor || level4Descriptor;
      if (!hasDescriptors) {
        return res.status(400).json({
          error: 'Los indicadores de profundidad requieren al menos un descriptor de nivel',
        });
      }
    }

    // For frecuencia, validate frequency config if provided
    if (category === 'frecuencia' && frequencyConfig) {
      if (typeof frequencyConfig !== 'object') {
        return res.status(400).json({ error: 'Configuración de frecuencia inválida' });
      }
    }

    // Get max display_order for this module
    const { data: maxOrderResult } = await supabaseClient
      .from('assessment_indicators')
      .select('display_order')
      .eq('module_id', moduleId)
      .order('display_order', { ascending: false })
      .limit(1);

    const nextOrder = maxOrderResult && maxOrderResult.length > 0
      ? (maxOrderResult[0].display_order || 0) + 1
      : 1;

    // Insert indicator
    // Note: expectations are in assessment_year_expectations table
    // Note: sub_questions are in assessment_sub_questions table
    const { data: indicator, error } = await supabaseClient
      .from('assessment_indicators')
      .insert({
        module_id: moduleId,
        code: code?.trim() || null,
        name: name.trim(),
        question: question?.trim() || null,
        description: description?.trim() || null,
        category,
        frequency_config: category === 'frecuencia' ? (frequencyConfig || { unit: 'veces' }) : null,
        frequency_unit_options: category === 'frecuencia' ? (frequencyUnitOptions || ['dia', 'semana', 'mes', 'trimestre', 'semestre', 'año']) : null,
        level_0_descriptor: category === 'profundidad' ? (level0Descriptor?.trim() || null) : null,
        level_1_descriptor: category === 'profundidad' ? (level1Descriptor?.trim() || null) : null,
        level_2_descriptor: category === 'profundidad' ? (level2Descriptor?.trim() || null) : null,
        level_3_descriptor: category === 'profundidad' ? (level3Descriptor?.trim() || null) : null,
        level_4_descriptor: category === 'profundidad' ? (level4Descriptor?.trim() || null) : null,
        display_order: nextOrder,
        weight: weight || 1.0,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating indicator:', error);
      return res.status(500).json({ error: 'Error al crear indicador' });
    }

    // Update the snapshot for published templates
    const snapshotResult = await updatePublishedTemplateSnapshot(templateId, userId);
    if (!snapshotResult.success) {
      console.error('Failed to update snapshot:', snapshotResult.error);
    }

    return res.status(201).json({
      success: true,
      indicator: {
        id: indicator.id,
        moduleId: indicator.module_id,
        code: indicator.code,
        name: indicator.name,
        question: indicator.question,
        description: indicator.description,
        category: indicator.category,
        frequencyConfig: indicator.frequency_config,
        frequencyUnitOptions: indicator.frequency_unit_options,
        level0Descriptor: indicator.level_0_descriptor,
        level1Descriptor: indicator.level_1_descriptor,
        level2Descriptor: indicator.level_2_descriptor,
        level3Descriptor: indicator.level_3_descriptor,
        level4Descriptor: indicator.level_4_descriptor,
        displayOrder: indicator.display_order,
        weight: indicator.weight,
        createdAt: indicator.created_at,
        updatedAt: indicator.updated_at,
      },
      snapshotUpdated: snapshotResult.success,
    });
  } catch (err: any) {
    console.error('Unexpected error creating indicator:', err);
    return res.status(500).json({ error: err.message || 'Error al crear indicador' });
  }
}
