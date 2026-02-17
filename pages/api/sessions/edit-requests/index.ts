import { NextApiRequest, NextApiResponse } from 'next';
import {
  checkIsAdmin,
  createServiceRoleClient,
  sendAuthError,
  sendApiResponse,
  logApiRequest,
  handleMethodNotAllowed,
} from '../../../../lib/api-auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  logApiRequest(req, 'sessions-edit-requests-list');

  if (req.method !== 'GET') {
    return handleMethodNotAllowed(res, ['GET']);
  }

  const { isAdmin, user, error: authError } = await checkIsAdmin(req, res);

  if (!user) {
    return sendAuthError(res, 'No autenticado', 401);
  }
  if (!isAdmin) {
    return sendAuthError(res, 'Solo administradores pueden listar todas las solicitudes de cambio', 403);
  }

  try {
    const serviceClient = createServiceRoleClient();

    // Parse status filter (default: pending)
    const statusFilter = (req.query.status as string) || 'pending';
    const validStatuses = ['all', 'pending', 'approved', 'rejected'];

    if (!validStatuses.includes(statusFilter)) {
      return sendAuthError(res, 'Filtro de estado inválido. Use: all, pending, approved, rejected', 400);
    }

    // Build query
    let query = serviceClient
      .from('session_edit_requests')
      .select(`
        *,
        consultor_sessions(title, session_date),
        profiles:requested_by(first_name, last_name, email)
      `);

    if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter);
    }

    const { data: editRequests, error: fetchError } = await query.order('created_at', {
      ascending: true, // FIFO
    });

    if (fetchError) {
      console.error('Database error fetching edit requests:', fetchError);
      return sendAuthError(res, 'Error al obtener solicitudes de cambio', 500, fetchError.message);
    }

    return sendApiResponse(res, { edit_requests: editRequests || [] });
  } catch (error: any) {
    console.error('List edit requests error:', error);
    return sendAuthError(res, 'Error inesperado al obtener solicitudes de cambio', 500, error.message);
  }
}
