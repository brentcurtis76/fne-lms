import { NextApiRequest, NextApiResponse } from 'next';
import { getApiUser, createApiSupabaseClient, sendAuthError, handleMethodNotAllowed } from '@/lib/api-auth';
import type {
  AssessmentTemplate,
  TransformationArea,
  CreateTemplateRequest
} from '@/types/assessment-builder';

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

// Generate next version number for an area
async function getNextVersion(supabaseClient: any, area: TransformationArea): Promise<string> {
  const { data: existing } = await supabaseClient
    .from('assessment_templates')
    .select('version')
    .eq('area', area)
    .order('version', { ascending: false })
    .limit(1);

  if (!existing || existing.length === 0) {
    return '1.0.0';
  }

  // Parse version and increment
  const currentVersion = existing[0].version;
  const parts = currentVersion.split('.').map(Number);
  parts[2] = (parts[2] || 0) + 1; // Increment patch version
  return parts.join('.');
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
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
      return handleGet(req, res, supabaseClient);
    case 'POST':
      return handlePost(req, res, supabaseClient, user.id);
    default:
      return handleMethodNotAllowed(res, ['GET', 'POST']);
  }
}

// GET /api/admin/assessment-builder/templates
async function handleGet(
  req: NextApiRequest,
  res: NextApiResponse,
  supabaseClient: any
) {
  try {
    const { area, status, archived } = req.query;

    let query = supabaseClient
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
        created_by,
        created_at,
        updated_at,
        is_archived,
        archived_at,
        archived_by,
        grade_id,
        grade:ab_grades (
          id,
          name,
          sort_order,
          is_always_gt
        )
      `)
      .order('area', { ascending: true })
      .order('version', { ascending: false });

    // Filter by area if provided
    if (area && typeof area === 'string') {
      query = query.eq('area', area);
    }

    // Filter by status if provided
    if (status && typeof status === 'string') {
      query = query.eq('status', status);
    }

    // Filter by archived status - defaults to showing non-archived
    if (archived === 'true') {
      query = query.eq('is_archived', true);
    } else if (archived === 'false' || archived === undefined) {
      query = query.eq('is_archived', false);
    }
    // If archived === 'all', don't filter by is_archived

    const { data: templates, error } = await query;

    if (error) {
      console.error('Error fetching templates:', error);
      return res.status(500).json({ error: 'Error al obtener los templates' });
    }

    // Get module counts for each template
    const templateIds = templates?.map((t: any) => t.id) || [];

    let moduleCounts: Record<string, number> = {};
    if (templateIds.length > 0) {
      const { data: modules } = await supabaseClient
        .from('assessment_modules')
        .select('template_id')
        .in('template_id', templateIds);

      if (modules) {
        moduleCounts = modules.reduce((acc: Record<string, number>, m: any) => {
          acc[m.template_id] = (acc[m.template_id] || 0) + 1;
          return acc;
        }, {});
      }
    }

    // Add module count to each template
    const templatesWithCounts = templates?.map((t: any) => ({
      ...t,
      module_count: moduleCounts[t.id] || 0
    })) || [];

    return res.status(200).json({
      success: true,
      templates: templatesWithCounts
    });

  } catch (err: any) {
    console.error('Unexpected error fetching templates:', err);
    return res.status(500).json({ error: err.message || 'Error al obtener templates' });
  }
}

// POST /api/admin/assessment-builder/templates
async function handlePost(
  req: NextApiRequest,
  res: NextApiResponse,
  supabaseClient: any,
  userId: string
) {
  try {
    const { area, name, description, grade_id } = req.body as CreateTemplateRequest;

    // Validation
    if (!area || !name) {
      return res.status(400).json({ error: 'Área y nombre son requeridos' });
    }

    if (!grade_id) {
      return res.status(400).json({ error: 'El nivel es requerido' });
    }

    // Validate area
    const validAreas: TransformationArea[] = [
      'personalizacion', 'aprendizaje', 'evaluacion',
      'proposito', 'familias', 'trabajo_docente', 'liderazgo'
    ];
    if (!validAreas.includes(area)) {
      return res.status(400).json({ error: 'Área de transformación inválida' });
    }

    // Generate version
    const version = await getNextVersion(supabaseClient, area);

    // Create template
    const { data: template, error } = await supabaseClient
      .from('assessment_templates')
      .insert({
        area,
        version,
        name,
        description: description || null,
        grade_id,
        status: 'draft',
        created_by: userId,
        scoring_config: {
          level_thresholds: {
            consolidated: 87.5,
            advanced: 62.5,
            developing: 37.5,
            emerging: 12.5
          },
          default_weights: {
            module: 1.0,
            indicator: 1.0
          }
        }
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

    if (error) {
      console.error('Error creating template:', error);

      // Check for unique constraint violation
      if (error.code === '23505') {
        return res.status(409).json({ error: 'Ya existe un template con esta área y versión' });
      }

      return res.status(500).json({ error: 'Error al crear el template' });
    }

    return res.status(201).json({
      success: true,
      template
    });

  } catch (err: any) {
    console.error('Unexpected error creating template:', err);
    return res.status(500).json({ error: err.message || 'Error al crear template' });
  }
}
