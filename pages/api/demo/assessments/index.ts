import { NextApiRequest, NextApiResponse } from 'next';
import { getApiUser, createApiSupabaseClient, sendAuthError, handleMethodNotAllowed } from '@/lib/api-auth';
import { AREA_LABELS, TransformationArea } from '@/types/assessment-builder';

/**
 * GET /api/demo/assessments
 *
 * Returns all assessment templates the user has demo access to.
 * Admins get ALL published templates.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return handleMethodNotAllowed(res, ['GET']);
  }

  const { user, error: authError } = await getApiUser(req, res);
  if (authError || !user) {
    return sendAuthError(res, 'Autenticación requerida');
  }

  const supabaseClient = await createApiSupabaseClient(req, res);

  try {
    // Check if user is admin
    const { data: rolesData } = await supabaseClient
      .from('user_roles')
      .select('role_type')
      .eq('user_id', user.id)
      .eq('is_active', true);

    const isAdmin = (rolesData || []).some((r: any) => r.role_type === 'admin');

    if (isAdmin) {
      // Admin: return all published (non-archived) templates
      const { data: templates, error: tplError } = await supabaseClient
        .from('assessment_templates')
        .select('id, name, area, version, description, created_at')
        .eq('status', 'published')
        .or('is_archived.is.null,is_archived.eq.false')
        .order('name');

      if (tplError) throw tplError;

      const demos = (templates || []).map((t: any) => ({
        templateId: t.id,
        name: t.name,
        area: t.area,
        areaLabel: AREA_LABELS[t.area as TransformationArea] || t.area,
        version: t.version,
        description: t.description || '',
        grantedAt: t.created_at,
      }));

      return res.status(200).json({ demos });
    }

    // Non-admin: return templates user has demo access to
    const { data: accessRows, error: accessError } = await supabaseClient
      .from('assessment_demo_access')
      .select('template_id, granted_at')
      .eq('user_id', user.id);

    if (accessError) throw accessError;

    if (!accessRows || accessRows.length === 0) {
      return res.status(200).json({ demos: [] });
    }

    const templateIds = accessRows.map((r: any) => r.template_id);
    const grantedAtMap = new Map(accessRows.map((r: any) => [r.template_id, r.granted_at]));

    const { data: templates, error: tplError } = await supabaseClient
      .from('assessment_templates')
      .select('id, name, area, version, description')
      .in('id', templateIds)
      .eq('status', 'published')
      .or('is_archived.is.null,is_archived.eq.false')
      .order('name');

    if (tplError) throw tplError;

    const demos = (templates || []).map((t: any) => ({
      templateId: t.id,
      name: t.name,
      area: t.area,
      areaLabel: AREA_LABELS[t.area as TransformationArea] || t.area,
      version: t.version,
      description: t.description || '',
      grantedAt: grantedAtMap.get(t.id) || null,
    }));

    return res.status(200).json({ demos });
  } catch (err: any) {
    console.error('Error fetching demo assessments:', err);
    return res.status(500).json({ error: err.message || 'Error al obtener demos' });
  }
}
