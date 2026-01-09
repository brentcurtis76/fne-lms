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
 * GET /api/admin/assessment-builder/templates/[templateId]/snapshots/[snapshotId]
 *
 * Returns the full snapshot data for a specific version.
 * Includes all modules and indicators as they were at publish time.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return handleMethodNotAllowed(res, ['GET']);
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
    return res.status(403).json({ error: 'No tienes permiso para ver snapshots' });
  }

  const { templateId, snapshotId } = req.query;
  if (!templateId || typeof templateId !== 'string') {
    return res.status(400).json({ error: 'templateId es requerido' });
  }
  if (!snapshotId || typeof snapshotId !== 'string') {
    return res.status(400).json({ error: 'snapshotId es requerido' });
  }

  try {
    // Get snapshot and verify it belongs to the template
    const { data: snapshot, error: snapshotError } = await supabaseClient
      .from('assessment_template_snapshots')
      .select('*')
      .eq('id', snapshotId)
      .eq('template_id', templateId)
      .single();

    if (snapshotError || !snapshot) {
      return res.status(404).json({ error: 'Snapshot no encontrado' });
    }

    const snapshotData = snapshot.snapshot_data || {};

    // Calculate stats
    const modules = snapshotData.modules || [];
    let totalIndicators = 0;
    const categoryCounts: Record<string, number> = {
      cobertura: 0,
      frecuencia: 0,
      profundidad: 0,
    };

    modules.forEach((m: any) => {
      (m.indicators || []).forEach((ind: any) => {
        totalIndicators++;
        if (ind.category && categoryCounts[ind.category] !== undefined) {
          categoryCounts[ind.category]++;
        }
      });
    });

    return res.status(200).json({
      success: true,
      snapshot: {
        id: snapshot.id,
        templateId: snapshot.template_id,
        version: snapshot.version,
        createdAt: snapshot.created_at,
        publishedAt: snapshotData.published_at,
        publishedBy: snapshotData.published_by,
      },
      template: snapshotData.template,
      modules: modules.map((m: any) => ({
        id: m.id,
        name: m.name,
        description: m.description,
        instructions: m.instructions,
        displayOrder: m.display_order,
        weight: m.weight,
        indicators: (m.indicators || []).map((ind: any) => ({
          id: ind.id,
          code: ind.code,
          name: ind.name,
          description: ind.description,
          category: ind.category,
          frequencyConfig: ind.frequency_config,
          level0Descriptor: ind.level_0_descriptor,
          level1Descriptor: ind.level_1_descriptor,
          level2Descriptor: ind.level_2_descriptor,
          level3Descriptor: ind.level_3_descriptor,
          level4Descriptor: ind.level_4_descriptor,
          displayOrder: ind.display_order,
          weight: ind.weight,
        })),
      })),
      stats: {
        modules: modules.length,
        indicators: totalIndicators,
        byCategory: categoryCounts,
      },
    });
  } catch (err: any) {
    console.error('Unexpected error fetching snapshot:', err);
    return res.status(500).json({ error: err.message || 'Error al cargar snapshot' });
  }
}
