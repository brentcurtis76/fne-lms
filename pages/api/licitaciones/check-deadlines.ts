/**
 * POST /api/licitaciones/check-deadlines
 *
 * Server-side endpoint for triggering deadline reminder notifications.
 * Called fire-and-forget from page useEffect hooks (dashboard + detail page).
 *
 * Auth required: any authenticated user with licitacion access.
 * Rate limiting is handled by the notification idempotency key (daily granularity).
 */

import { NextApiRequest, NextApiResponse } from 'next';
import {
  getApiUser,
  createServiceRoleClient,
  sendAuthError,
  sendApiResponse,
  logApiRequest,
  handleMethodNotAllowed,
} from '@/lib/api-auth';
import { getUserRoles } from '@/utils/roleUtils';
import { checkAndFireDeadlineReminders } from '@/lib/licitacionDeadlineChecker';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  logApiRequest(req, 'licitaciones-check-deadlines');

  if (req.method !== 'POST') {
    return handleMethodNotAllowed(res, ['POST']);
  }

  const { user, error: authError } = await getApiUser(req, res);
  if (authError || !user) {
    return sendAuthError(res, 'No autorizado', 401);
  }

  try {
    const serviceClient = createServiceRoleClient();
    const userRoles = await getUserRoles(serviceClient, user.id);
    const roleTypes = userRoles.map(r => r.role_type);
    const isAdmin = roleTypes.includes('admin');
    const isEncargado = roleTypes.includes('encargado_licitacion');

    // Only users with licitacion access can trigger deadline checks
    if (!isAdmin && !isEncargado) {
      return sendAuthError(res, 'No tiene permisos para ejecutar revision de plazos', 403);
    }

    const notificationsFired = await checkAndFireDeadlineReminders(serviceClient);

    return sendApiResponse(res, {
      message: 'Revision de plazos completada',
      notifications_fired: notificationsFired,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error inesperado';
    return sendAuthError(res, 'Error al revisar plazos de licitaciones', 500, message);
  }
}
