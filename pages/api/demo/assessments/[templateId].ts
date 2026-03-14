import { NextApiRequest, NextApiResponse } from 'next';
import { getApiUser, createApiSupabaseClient, sendAuthError, handleMethodNotAllowed } from '@/lib/api-auth';

/**
 * GET /api/demo/assessments/[templateId]?year=N&generationType=GT|GI
 *
 * Returns the published template's snapshot data for demo/preview mode.
 * Auth: user must have assessment_demo_access for this template, or be admin.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return handleMethodNotAllowed(res, ['GET']);
  }

  const { user, error: authError } = await getApiUser(req, res);
  if (authError || !user) {
    return sendAuthError(res, 'Autenticación requerida');
  }

  const { templateId, year: yearParam, generationType: genParam } = req.query;
  if (!templateId || typeof templateId !== 'string') {
    return res.status(400).json({ error: 'templateId es requerido' });
  }

  const year = parseInt(yearParam as string, 10) || 1;
  const generationType = (genParam === 'GI' ? 'GI' : 'GT') as 'GT' | 'GI';

  if (year < 1 || year > 5) {
    return res.status(400).json({ error: 'year debe ser entre 1 y 5' });
  }

  const supabaseClient = await createApiSupabaseClient(req, res);

  try {
    // Check if user has demo access or is admin
    const [demoAccessResult, rolesResult] = await Promise.all([
      supabaseClient
        .from('assessment_demo_access')
        .select('id')
        .eq('template_id', templateId)
        .eq('user_id', user.id)
        .maybeSingle(),
      supabaseClient
        .from('user_roles')
        .select('role_type')
        .eq('user_id', user.id)
        .eq('is_active', true),
    ]);

    const isAdmin = (rolesResult.data || []).some((r: any) => r.role_type === 'admin');
    const hasDemoAccess = !!demoAccessResult.data;

    if (!isAdmin && !hasDemoAccess) {
      return res.status(403).json({ error: 'No tienes acceso demo a este template' });
    }

    // Fetch the latest snapshot for this published template
    const { data: snapshot, error: snapError } = await supabaseClient
      .from('assessment_template_snapshots')
      .select('id, template_id, version, snapshot_data, created_at')
      .eq('template_id', templateId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (snapError || !snapshot) {
      return res.status(404).json({ error: 'No se encontró snapshot publicado para este template' });
    }

    const snapshotData = (snapshot as any).snapshot_data || {};

    // Fetch year expectations for isActiveThisYear
    const yearKey = `year_${year}_expected`;
    const { data: expData } = await supabaseClient
      .from('assessment_year_expectations')
      .select('*')
      .eq('template_id', templateId)
      .eq('generation_type', generationType);

    let activeExpectationsMap: Map<string, boolean> | null = null;
    if (expData && expData.length > 0) {
      activeExpectationsMap = new Map<string, boolean>();
      for (const row of expData) {
        const expectedValue = row[yearKey];
        activeExpectationsMap.set(row.indicator_id, expectedValue !== null && expectedValue !== undefined);
      }
    }

    // Map module data to frontend shape (same as docente endpoint)
    const mapModule = (module: any) => ({
      id: module.id,
      name: module.name,
      description: module.description,
      instructions: module.instructions,
      displayOrder: module.display_order,
      weight: module.weight,
      objectiveId: module.objective_id || null,
      indicators: (module.indicators || []).map((indicator: any) => ({
        id: indicator.id,
        code: indicator.code,
        name: indicator.name,
        description: indicator.description,
        category: indicator.category,
        frequencyConfig: indicator.frequency_config,
        frequencyUnitOptions: indicator.frequency_unit_options,
        level0Descriptor: indicator.level_0_descriptor,
        level1Descriptor: indicator.level_1_descriptor,
        level2Descriptor: indicator.level_2_descriptor,
        level3Descriptor: indicator.level_3_descriptor,
        level4Descriptor: indicator.level_4_descriptor,
        detalle_options: indicator.detalle_options || null,
        displayOrder: indicator.display_order,
        weight: indicator.weight,
        isActiveThisYear: activeExpectationsMap !== null
          ? (activeExpectationsMap.get(indicator.id) ?? false)
          : true,
      })),
    });

    const snapshotObjectives = snapshotData.objectives || [];
    const flatModules = snapshotData.modules || [];

    const objectives = snapshotObjectives.map((obj: any) => ({
      id: obj.id,
      name: obj.name,
      description: obj.description,
      displayOrder: obj.display_order,
      weight: obj.weight,
      modules: (obj.modules || []).map(mapModule),
    }));

    return res.status(200).json({
      success: true,
      template: {
        id: snapshot.template_id,
        version: snapshot.version,
        name: snapshotData.template?.name || 'Sin título',
        area: snapshotData.template?.area || 'personalizacion',
        description: snapshotData.template?.description,
        scoringConfig: snapshotData.template?.scoring_config,
      },
      objectives,
      modules: flatModules.map(mapModule),
      expectations: expData || [],
    });
  } catch (err: any) {
    console.error('Error fetching demo assessment:', err);
    return res.status(500).json({ error: err.message || 'Error al obtener datos demo' });
  }
}
