import { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import {
  checkIsAdmin,
  createServiceRoleClient,
  sendAuthError,
  sendApiResponse,
  logApiRequest,
  handleMethodNotAllowed,
} from '../../../../../lib/api-auth';
import { Validators } from '../../../../../lib/types/api-auth.types';

const ReallocateSchema = z.object({
  from_hour_type_key: z.string().min(1, 'from_hour_type_key es requerido'),
  to_hour_type_key: z.string().min(1, 'to_hour_type_key es requerido'),
  hours: z.number().positive('Las horas deben ser un número positivo'),
  reason: z.string().min(10, 'El motivo debe tener al menos 10 caracteres'),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  logApiRequest(req, 'contracts-hours-reallocate');

  const { id } = req.query;

  if (!id || typeof id !== 'string' || !Validators.isUUID(id)) {
    return sendAuthError(res, 'ID de contrato inválido', 400);
  }

  if (req.method === 'PATCH') {
    return handlePatch(req, res, id);
  }

  return handleMethodNotAllowed(res, ['PATCH']);
}

async function handlePatch(req: NextApiRequest, res: NextApiResponse, contratoId: string) {
  const { isAdmin, user, error: authError } = await checkIsAdmin(req, res);
  if (authError || !isAdmin) {
    return sendAuthError(res, 'Solo administradores pueden redistribuir horas de contrato', 403);
  }

  const parsed = ReallocateSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendAuthError(
      res,
      `Datos inválidos: ${parsed.error.errors.map((e) => e.message).join(', ')}`,
      400
    );
  }

  const { from_hour_type_key, to_hour_type_key, hours, reason } = parsed.data;

  // Validate from != to
  if (from_hour_type_key === to_hour_type_key) {
    return sendAuthError(res, 'Las categorías de origen y destino deben ser diferentes.', 400);
  }

  // Block online_learning
  if (from_hour_type_key === 'online_learning' || to_hour_type_key === 'online_learning') {
    return sendAuthError(
      res,
      'No se pueden redistribuir horas desde/hacia Cursos Online (LMS).',
      400
    );
  }

  try {
    const serviceClient = createServiceRoleClient();

    // Move the hours: ONE database function locks both allocation rows (in id
    // order), checks the available hours inside the lock (get_bucket_summary),
    // changes both rows by increment and writes the history line — all or
    // nothing (migration 20261119103000_reallocate_hours_atomic.sql).
    const { error: moveError } = await serviceClient.rpc('reallocate_contract_hours', {
      p_contrato_id: contratoId,
      p_from: from_hour_type_key,
      p_to: to_hour_type_key,
      p_hours: hours,
      p_reason: reason,
      p_actor: user!.id,
    });

    if (moveError) {
      const refusal = refusalFor(moveError, from_hour_type_key, to_hour_type_key);
      if (refusal) {
        return sendAuthError(res, refusal.message, refusal.status);
      }
      return sendAuthError(res, 'Error inesperado al redistribuir horas', 500, moveError.message);
    }

    // Return updated bucket summary
    const { data: updatedBuckets, error: updatedError } = await serviceClient.rpc(
      'get_bucket_summary',
      { p_contrato_id: contratoId }
    );

    if (updatedError) {
      // Return success with empty buckets if summary fails
      return sendApiResponse(res, { buckets: [] });
    }

    type BucketRowFull = {
      hour_type_key: string;
      display_name: string;
      allocated_hours: number;
      reserved_hours: number;
      consumed_hours: number;
      available_hours: number;
      is_fixed_allocation: boolean;
      annex_hours: number;
    };

    const buckets = (updatedBuckets || []).map((row: BucketRowFull) => ({
      hour_type_key: row.hour_type_key,
      display_name: row.display_name,
      allocated: row.allocated_hours,
      reserved: row.reserved_hours,
      consumed: row.consumed_hours,
      available: row.available_hours,
      is_fixed: row.is_fixed_allocation,
      annex_hours: row.annex_hours,
    }));

    return sendApiResponse(res, { buckets });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    return sendAuthError(res, 'Error inesperado al redistribuir horas', 500, message);
  }
}

type MoveError = { code?: string; message?: string; details?: string | null };

/** The function's refusals, told with the sentences this route has always answered. */
function refusalFor(
  error: MoveError,
  fromKey: string,
  toKey: string
): { message: string; status: number } | null {
  if (error.code !== 'P0001') return null;
  switch (error.message) {
    case 'invalid_hours':
      return { message: 'Datos inválidos: Las horas deben ser un número positivo', status: 400 };
    case 'same_category':
      return { message: 'Las categorías de origen y destino deben ser diferentes.', status: 400 };
    case 'reserved_category':
      return {
        message: 'No se pueden redistribuir horas desde/hacia Cursos Online (LMS).',
        status: 400,
      };
    case 'from_category_not_found':
      return { message: `La categoría de origen '${fromKey}' no existe.`, status: 400 };
    case 'to_category_not_found':
      return { message: `La categoría de destino '${toKey}' no existe.`, status: 400 };
    case 'from_allocation_missing':
      return {
        message: `El contrato no tiene asignación para la categoría de origen '${fromKey}'.`,
        status: 404,
      };
    case 'to_allocation_missing':
      return {
        message: `El contrato no tiene asignación para la categoría de destino '${toKey}'.`,
        status: 404,
      };
    case 'insufficient_hours': {
      const availableHours = Number(error.details ?? 0);
      return {
        message: `No hay suficientes horas disponibles en la categoría origen (disponibles: ${availableHours}).`,
        status: 400,
      };
    }
    default:
      return null;
  }
}
