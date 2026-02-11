import { NextApiRequest, NextApiResponse } from 'next';
import {
  checkIsAdmin,
  createServiceRoleClient,
  sendAuthError,
  sendApiResponse,
  logApiRequest,
  handleMethodNotAllowed,
} from '../../../lib/api-auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  logApiRequest(req, 'admin-consultants');

  if (req.method !== 'GET') {
    return handleMethodNotAllowed(res, ['GET']);
  }

  const { isAdmin, user, error: authError } = await checkIsAdmin(req, res);

  if (!isAdmin) {
    return sendAuthError(res, 'Solo administradores pueden consultar facilitadores', 403);
  }

  const { school_id } = req.query;

  if (!school_id || isNaN(Number(school_id))) {
    return sendAuthError(res, 'school_id es requerido y debe ser un número', 400);
  }

  try {
    const serviceClient = createServiceRoleClient();

    const { data, error } = await serviceClient
      .from('user_roles')
      .select('user_id, profiles(id, first_name, last_name, email)')
      .eq('school_id', Number(school_id))
      .eq('role_type', 'consultor')
      .eq('is_active', true);

    if (error) {
      console.error('Error fetching consultants:', error);
      return sendAuthError(res, 'Error al consultar facilitadores', 500, error.message);
    }

    const consultants = (data || [])
      .filter((item: any) => item.profiles)
      .map((item: any) => ({
        id: item.profiles.id,
        first_name: item.profiles.first_name || '',
        last_name: item.profiles.last_name || '',
        email: item.profiles.email || '',
      }));

    return sendApiResponse(res, { consultants });
  } catch (error: any) {
    console.error('Admin consultants error:', error);
    return sendAuthError(res, 'Error inesperado', 500, error.message);
  }
}
