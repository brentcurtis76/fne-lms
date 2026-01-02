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
 * GET /api/admin/assessment-builder/templates/[templateId]/versions
 *
 * Returns all published versions (snapshots) for a template.
 * Includes version info, creation date, and summary stats.
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
    return res.status(403).json({ error: 'No tienes permiso para ver versiones' });
  }

  const { templateId } = req.query;
  if (!templateId || typeof templateId !== 'string') {
    return res.status(400).json({ error: 'templateId es requerido' });
  }

  try {
    // Verify template exists
    const { data: template, error: templateError } = await supabaseClient
      .from('assessment_templates')
      .select('id, name, area, status, version')
      .eq('id', templateId)
      .single();

    if (templateError || !template) {
      return res.status(404).json({ error: 'Template no encontrado' });
    }

    // Get all snapshots for this template
    const { data: snapshots, error: snapshotsError } = await supabaseClient
      .from('assessment_template_snapshots')
      .select('id, version, snapshot_data, created_at')
      .eq('template_id', templateId)
      .order('created_at', { ascending: false });

    if (snapshotsError) {
      console.error('Error fetching snapshots:', snapshotsError);
      return res.status(500).json({ error: 'Error al cargar versiones' });
    }

    // Format response with summary stats
    const versions = (snapshots || []).map((snapshot: any) => {
      const data = snapshot.snapshot_data || {};
      const modules = data.modules || [];
      let totalIndicators = 0;
      modules.forEach((m: any) => {
        totalIndicators += (m.indicators || []).length;
      });

      return {
        id: snapshot.id,
        version: snapshot.version,
        createdAt: snapshot.created_at,
        publishedBy: data.published_by,
        publishedAt: data.published_at,
        stats: {
          modules: modules.length,
          indicators: totalIndicators,
        },
      };
    });

    return res.status(200).json({
      success: true,
      template: {
        id: template.id,
        name: template.name,
        area: template.area,
        currentStatus: template.status,
        currentVersion: template.version,
      },
      versions,
      totalVersions: versions.length,
    });
  } catch (err: any) {
    console.error('Unexpected error fetching versions:', err);
    return res.status(500).json({ error: err.message || 'Error al cargar versiones' });
  }
}
