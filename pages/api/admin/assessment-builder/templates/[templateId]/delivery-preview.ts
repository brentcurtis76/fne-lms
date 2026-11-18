import { NextApiRequest, NextApiResponse } from 'next';
import {
  getApiUser,
  createApiSupabaseClient,
  createServiceRoleClient,
  sendAuthError,
  handleMethodNotAllowed,
} from '@/lib/api-auth';
import { hasAssessmentWritePermission } from '@/lib/assessment-permissions';
import { uuidSchema } from '@/lib/validation/schemas';

/**
 * GET /api/admin/assessment-builder/templates/[templateId]/delivery-preview
 *
 * GC-3c: how many courses (course_docente vías) or schools
 * (school_responsible vías) would receive this template if it were published
 * now. Read only; works on a draft. Same sign-in and permission checks as the
 * publish route.
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

  const hasPermission = await hasAssessmentWritePermission(supabaseClient, user.id);
  if (!hasPermission) {
    return res.status(403).json({ error: 'No tienes permiso para publicar templates' });
  }

  const { templateId } = req.query;
  if (!templateId || typeof templateId !== 'string') {
    return res.status(400).json({ error: 'templateId es requerido' });
  }
  if (!uuidSchema.safeParse(templateId).success) {
    return res.status(400).json({ error: 'templateId no es válido' });
  }

  try {
    const { data, error } = await createServiceRoleClient().rpc('preview_template_delivery', {
      p_template_id: templateId,
    });
    if (error) {
      console.error('Delivery preview failed:', templateId, error.message);
      return res.status(500).json({ error: 'No se pudo calcular el envío' });
    }
    const row = (data ?? {}) as { target?: unknown; courses?: unknown; schools?: unknown };
    return res.status(200).json({
      target: row.target === 'course_docente' || row.target === 'school_responsible' ? row.target : null,
      courses: typeof row.courses === 'number' ? row.courses : 0,
      schools: typeof row.schools === 'number' ? row.schools : 0,
    });
  } catch (err) {
    console.error('Delivery preview failed:', templateId, err instanceof Error ? err.message : String(err));
    return res.status(500).json({ error: 'No se pudo calcular el envío' });
  }
}
