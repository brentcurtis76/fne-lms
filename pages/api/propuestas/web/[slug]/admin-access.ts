import { NextApiRequest, NextApiResponse } from 'next';
import {
  checkIsAdmin,
  createServiceRoleClient,
  sendAuthError,
  sendApiResponse,
  handleMethodNotAllowed,
} from '@/lib/api-auth';

/**
 * Admin preview bypass for propuesta web view.
 * GET /api/propuestas/web/[slug]/admin-access
 * Returns the full snapshot_json if the user is an authenticated admin.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return handleMethodNotAllowed(res, ['GET']);

  const { slug } = req.query;
  if (!slug || typeof slug !== 'string') {
    return sendAuthError(res, 'Slug inválido', 400);
  }

  const { isAdmin, error } = await checkIsAdmin(req, res);
  if (error || !isAdmin) {
    return sendAuthError(res, 'Acceso solo para administradores', 403);
  }

  try {
    const serviceClient = createServiceRoleClient();

    const { data: propuesta, error: dbError } = await serviceClient
      .from('propuesta_generadas')
      .select('snapshot_json, web_status')
      .eq('web_slug', slug)
      .eq('estado', 'completada')
      .single();

    if (dbError || !propuesta) {
      return sendAuthError(res, 'Propuesta no encontrada', 404);
    }

    return sendApiResponse(res, {
      snapshot: propuesta.snapshot_json,
    });
  } catch (err) {
    console.error('[propuesta-web/admin-access]', err);
    return sendAuthError(res, 'Error interno del servidor', 500);
  }
}
