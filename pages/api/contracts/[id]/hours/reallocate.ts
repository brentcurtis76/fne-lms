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

    // Resolve hour_type_keys to IDs
    const { data: hourTypes, error: htError } = await serviceClient
      .from('hour_types')
      .select('id, key')
      .in('key', [from_hour_type_key, to_hour_type_key]);

    if (htError) {
      return sendAuthError(res, 'Error al verificar tipos de hora', 500, htError.message);
    }

    const hourTypeMap = new Map<string, string>(
      (hourTypes || []).map((ht: { id: string; key: string }) => [ht.key, ht.id])
    );

    if (!hourTypeMap.has(from_hour_type_key)) {
      return sendAuthError(res, `La categoría de origen '${from_hour_type_key}' no existe.`, 400);
    }

    if (!hourTypeMap.has(to_hour_type_key)) {
      return sendAuthError(res, `La categoría de destino '${to_hour_type_key}' no existe.`, 400);
    }

    const fromHourTypeId = hourTypeMap.get(from_hour_type_key)!;
    const toHourTypeId = hourTypeMap.get(to_hour_type_key)!;

    // Get current allocations for both buckets
    const { data: allocations, error: allocError } = await serviceClient
      .from('contract_hour_allocations')
      .select('id, hour_type_id, allocated_hours')
      .eq('contrato_id', contratoId)
      .in('hour_type_id', [fromHourTypeId, toHourTypeId]);

    if (allocError) {
      return sendAuthError(res, 'Error al obtener asignaciones del contrato', 500, allocError.message);
    }

    const fromAlloc = (allocations || []).find(
      (a: { id: string; hour_type_id: string; allocated_hours: number }) =>
        a.hour_type_id === fromHourTypeId
    );
    const toAlloc = (allocations || []).find(
      (a: { id: string; hour_type_id: string; allocated_hours: number }) =>
        a.hour_type_id === toHourTypeId
    );

    if (!fromAlloc) {
      return sendAuthError(
        res,
        `El contrato no tiene asignación para la categoría de origen '${from_hour_type_key}'.`,
        404
      );
    }

    if (!toAlloc) {
      return sendAuthError(
        res,
        `El contrato no tiene asignación para la categoría de destino '${to_hour_type_key}'.`,
        404
      );
    }

    // Check available hours in the from bucket via get_bucket_summary
    const { data: bucketRows, error: bucketError } = await serviceClient.rpc('get_bucket_summary', {
      p_contrato_id: contratoId,
    });

    if (bucketError) {
      return sendAuthError(res, 'Error al verificar horas disponibles', 500, bucketError.message);
    }

    type BucketRow = {
      hour_type_key: string;
      available_hours: number;
      allocated_hours: number;
    };

    const fromBucket = (bucketRows || []).find(
      (b: BucketRow) => b.hour_type_key === from_hour_type_key
    );

    const availableHours = fromBucket?.available_hours ?? 0;

    if (availableHours < hours) {
      return sendAuthError(
        res,
        `No hay suficientes horas disponibles en la categoría origen (disponibles: ${availableHours}).`,
        400
      );
    }

    // Update from bucket (decrease allocated_hours)
    const newFromHours = Number(fromAlloc.allocated_hours) - hours;
    const { error: fromUpdateError } = await serviceClient
      .from('contract_hour_allocations')
      .update({ allocated_hours: newFromHours, updated_at: new Date().toISOString() })
      .eq('id', fromAlloc.id);

    if (fromUpdateError) {
      return sendAuthError(
        res,
        'Error al actualizar la categoría de origen',
        500,
        fromUpdateError.message
      );
    }

    // Update to bucket (increase allocated_hours) — with compensating logic on failure
    const newToHours = Number(toAlloc.allocated_hours) + hours;
    const { error: toUpdateError } = await serviceClient
      .from('contract_hour_allocations')
      .update({ allocated_hours: newToHours, updated_at: new Date().toISOString() })
      .eq('id', toAlloc.id);

    if (toUpdateError) {
      // Revert the first update (compensating action)
      await serviceClient
        .from('contract_hour_allocations')
        .update({ allocated_hours: fromAlloc.allocated_hours, updated_at: new Date().toISOString() })
        .eq('id', fromAlloc.id);

      return sendAuthError(
        res,
        'Error al actualizar la categoría de destino. Los cambios han sido revertidos.',
        500,
        toUpdateError.message
      );
    }

    // Insert reallocation log entry
    const { error: logError } = await serviceClient
      .from('contract_hour_reallocation_log')
      .insert({
        contrato_id: contratoId,
        from_hour_type_id: fromHourTypeId,
        to_hour_type_id: toHourTypeId,
        hours,
        reason,
        created_by: user!.id,
      });

    if (logError) {
      // Log error is non-fatal — the reallocation already succeeded
      // We do not revert the allocation changes for a log failure
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
