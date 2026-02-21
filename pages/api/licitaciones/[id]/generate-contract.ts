/**
 * Generate Contract API
 * POST /api/licitaciones/[id]/generate-contract
 *
 * Links a newly created contract to a licitacion.
 * Validates ALL preconditions server-side:
 * - estado must be 'contrato_pendiente'
 * - ganador_es_fne must be true
 * - contrato_id must be NULL (or same contrato_id for idempotency)
 * - carta_adjudicacion_url must not be null
 *
 * Admin-only: only admins can generate contracts from licitaciones.
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
import { uuidSchema } from '@/lib/validation/schemas';
import { GenerateContractSchema } from '@/types/licitaciones';
import { linkContractToLicitacion } from '@/lib/licitacionService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  logApiRequest(req, 'licitaciones-generate-contract');

  if (req.method !== 'POST') {
    return handleMethodNotAllowed(res, ['POST']);
  }

  const { id } = req.query;
  const idParse = uuidSchema.safeParse(id);
  if (!idParse.success) {
    return sendAuthError(res, 'ID de licitacion invalido', 400);
  }
  const licitacionId = idParse.data;

  const { user, error: authError } = await getApiUser(req, res);
  if (authError || !user) {
    return sendAuthError(res, 'No autorizado', 401);
  }

  try {
    const serviceClient = createServiceRoleClient();
    const userRoles = await getUserRoles(serviceClient, user.id);
    const roleTypes = userRoles.map(r => r.role_type);
    const isAdmin = roleTypes.includes('admin');

    // Admin-only: per Role Access Matrix, only admins can generate contracts
    if (!isAdmin) {
      return sendAuthError(res, 'Solo administradores pueden generar contratos desde licitaciones', 403);
    }

    // Validate input body
    const parseResult = GenerateContractSchema.safeParse(req.body);
    if (!parseResult.success) {
      const errors = parseResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
      return sendAuthError(res, `Datos invalidos: ${errors}`, 400);
    }

    const { contrato_id } = parseResult.data;

    // Validate contrato_id is a valid UUID
    const contratoIdParse = uuidSchema.safeParse(contrato_id);
    if (!contratoIdParse.success) {
      return sendAuthError(res, 'UUID de contrato invalido', 400);
    }

    // Execute contract linking (handles all preconditions + state transition + historial)
    const updated = await linkContractToLicitacion(
      serviceClient,
      licitacionId,
      contratoIdParse.data,
      user.id
    );

    return sendApiResponse(res, { licitacion: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error inesperado';
    const isBizError =
      message.includes('estado') ||
      message.includes('contrato') ||
      message.includes('adjudicada') ||
      message.includes('carta') ||
      message.includes('externo');
    return sendAuthError(res, message, isBizError ? 400 : 500);
  }
}
