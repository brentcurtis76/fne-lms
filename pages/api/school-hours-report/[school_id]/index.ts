/**
 * GET /api/school-hours-report/[school_id]
 *
 * Returns the full school hours report: programs → contracts → buckets → sessions.
 *
 * Auth:
 *   - admin: can view any school
 *   - equipo_directivo: can only view their own school (resolved via user_roles.school_id)
 *   - All other roles: 403
 *
 * school_id is INTEGER (not UUID). Validated with parseInt() + isNaN().
 *
 * Sessions are capped at 500 per bucket to prevent PDF DoS.
 * attendance is always null — session_attendance table does not exist yet.
 */

import { NextApiRequest, NextApiResponse } from 'next';
import {
  getApiUser,
  createServiceRoleClient,
  sendAuthError,
  sendApiResponse,
  logApiRequest,
  handleMethodNotAllowed,
} from '../../../../lib/api-auth';
import { getUserRoles, getHighestRole } from '../../../../utils/roleUtils';
import { fetchSchoolReportData } from '../../../../lib/services/school-hours-report';

// ============================================================
// Main handler
// ============================================================

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  logApiRequest(req, 'school-hours-report');

  if (req.method !== 'GET') {
    return handleMethodNotAllowed(res, ['GET']);
  }

  const { school_id } = req.query;

  if (!school_id || typeof school_id !== 'string') {
    return sendAuthError(res, 'ID de escuela inválido', 400);
  }

  const parsedSchoolId = parseInt(school_id, 10);
  if (isNaN(parsedSchoolId)) {
    return sendAuthError(res, 'ID de escuela inválido', 400);
  }

  return handleGet(req, res, parsedSchoolId);
}

async function handleGet(req: NextApiRequest, res: NextApiResponse, schoolId: number) {
  const { user, error: authError } = await getApiUser(req, res);
  if (authError || !user) {
    return sendAuthError(res, 'Autenticación requerida', 401);
  }

  try {
    const serviceClient = createServiceRoleClient();

    // RBAC
    const userRoles = await getUserRoles(serviceClient, user.id);
    const highestRole = getHighestRole(userRoles);

    if (highestRole === 'equipo_directivo') {
      // Resolve school_id from user_roles (NOT profiles — see architect-review.md)
      const userSchoolIds = userRoles
        .filter((r) => r.school_id !== undefined && r.school_id !== null)
        .map((r) => String(r.school_id));

      if (!userSchoolIds.includes(String(schoolId))) {
        return sendAuthError(res, 'No tiene permisos para ver el reporte de esta escuela', 403);
      }
    } else if (highestRole !== 'admin') {
      return sendAuthError(res, 'Acceso denegado', 403);
    }

    const result = await fetchSchoolReportData(serviceClient, schoolId);

    if (!result) {
      return sendAuthError(res, 'Escuela no encontrada', 404);
    }

    return sendApiResponse(res, result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    return sendAuthError(res, 'Error inesperado al obtener el reporte de horas', 500, message);
  }
}
