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

const AllocationItemSchema = z.object({
  hour_type_key: z.string().min(1, 'hour_type_key es requerido'),
  hours: z
    .number()
    .min(0, 'Las horas no pueden ser negativas')
    .multipleOf(0.01, 'Las horas deben tener como máximo 2 decimales'),
  is_fixed: z.boolean().default(false),
  adds_to_contrato_id: z.string().uuid('adds_to_contrato_id debe ser un UUID válido').optional(),
});

const AllocateBucketsSchema = z.object({
  allocations: z
    .array(AllocationItemSchema)
    .min(1, 'Se requiere al menos una asignación')
    .max(9, 'No se pueden asignar más de 9 categorías'),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  logApiRequest(req, 'contracts-hours-allocate');

  const { id } = req.query;

  if (!id || typeof id !== 'string' || !Validators.isUUID(id)) {
    return sendAuthError(res, 'ID de contrato inválido', 400);
  }

  if (req.method === 'POST') {
    return handlePost(req, res, id);
  }

  if (req.method === 'DELETE') {
    return handleDelete(req, res, id);
  }

  return handleMethodNotAllowed(res, ['POST', 'DELETE']);
}

async function handlePost(req: NextApiRequest, res: NextApiResponse, contratoId: string) {
  const { isAdmin, user, error: authError } = await checkIsAdmin(req, res);
  if (authError || !isAdmin) {
    return sendAuthError(res, 'Solo administradores pueden distribuir horas de contrato', 403);
  }

  const parsed = AllocateBucketsSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendAuthError(
      res,
      `Datos inválidos: ${parsed.error.errors.map((e) => e.message).join(', ')}`,
      400
    );
  }

  const { allocations } = parsed.data;

  try {
    const serviceClient = createServiceRoleClient();

    // Verify contract exists, is activo, and has horas_contratadas
    const { data: contrato, error: contratoError } = await serviceClient
      .from('contratos')
      .select('id, estado, horas_contratadas')
      .eq('id', contratoId)
      .single();

    if (contratoError || !contrato) {
      return sendAuthError(res, 'Contrato no encontrado', 404);
    }

    if (contrato.estado !== 'activo') {
      return sendAuthError(res, 'Solo se pueden asignar horas a contratos activos', 400);
    }

    if (contrato.horas_contratadas === null || contrato.horas_contratadas === undefined) {
      return sendAuthError(res, 'El contrato no tiene horas contratadas definidas', 400);
    }

    // Check contract does not already have allocations
    const { data: existingAllocs, error: existingError } = await serviceClient
      .from('contract_hour_allocations')
      .select('id')
      .eq('contrato_id', contratoId)
      .limit(1);

    if (existingError) {
      return sendAuthError(res, 'Error al verificar asignaciones existentes', 500, existingError.message);
    }

    if (existingAllocs && existingAllocs.length > 0) {
      return sendAuthError(res, 'Este contrato ya tiene horas asignadas. Elimine la distribución actual antes de crear una nueva.', 400);
    }

    // Validate sum equals horas_contratadas (with floating-point tolerance)
    const totalHours = allocations.reduce((sum, a) => sum + a.hours, 0);
    const horasContratadas = Number(contrato.horas_contratadas);

    if (Math.abs(totalHours - horasContratadas) >= 0.005) {
      return sendAuthError(
        res,
        `El total de horas distribuidas (${totalHours}) no coincide con las horas contratadas (${horasContratadas}).`,
        400
      );
    }

    // Validate no duplicate keys
    const keys = allocations.map((a) => a.hour_type_key);
    const uniqueKeys = new Set(keys);
    if (uniqueKeys.size !== keys.length) {
      return sendAuthError(res, 'Cada categoría de hora solo puede aparecer una vez en la distribución.', 400);
    }

    // Resolve hour_type_keys to IDs in a single batch query
    const { data: hourTypes, error: htError } = await serviceClient
      .from('hour_types')
      .select('id, key, is_active')
      .in('key', keys);

    if (htError) {
      return sendAuthError(res, 'Error al verificar tipos de hora', 500, htError.message);
    }

    const hourTypeMap = new Map<string, string>(
      (hourTypes || []).map((ht: { id: string; key: string }) => [ht.key, ht.id])
    );

    // Verify all keys exist
    for (const key of keys) {
      if (!hourTypeMap.has(key)) {
        return sendAuthError(res, `La categoría de hora '${key}' no existe en el sistema.`, 400);
      }
    }

    // Validate is_fixed only for online_learning
    for (const alloc of allocations) {
      if (alloc.is_fixed && alloc.hour_type_key !== 'online_learning') {
        return sendAuthError(
          res,
          `La opción 'fijo' solo es válida para la categoría 'Cursos Online (LMS)'.`,
          400
        );
      }
    }

    // Handle annex support: validate adds_to_contrato_id references
    const annexAllocations = allocations.filter((a) => a.adds_to_contrato_id);
    const annexParentAllocationMap = new Map<string, string>(); // hour_type_key -> adds_to_allocation_id

    for (const annexAlloc of annexAllocations) {
      const hourTypeId = hourTypeMap.get(annexAlloc.hour_type_key)!;
      const { data: parentAlloc, error: parentError } = await serviceClient
        .from('contract_hour_allocations')
        .select('id')
        .eq('contrato_id', annexAlloc.adds_to_contrato_id!)
        .eq('hour_type_id', hourTypeId)
        .single();

      if (parentError || !parentAlloc) {
        return sendAuthError(
          res,
          `El contrato padre no tiene asignación para la categoría '${annexAlloc.hour_type_key}'.`,
          400
        );
      }

      annexParentAllocationMap.set(annexAlloc.hour_type_key, parentAlloc.id);
    }

    // Build insert rows
    const insertRows = allocations.map((alloc) => ({
      contrato_id: contratoId,
      hour_type_id: hourTypeMap.get(alloc.hour_type_key)!,
      allocated_hours: alloc.hours,
      is_fixed_allocation: alloc.is_fixed,
      adds_to_allocation_id: annexParentAllocationMap.get(alloc.hour_type_key) ?? null,
      created_by: user!.id,
    }));

    const { data: inserted, error: insertError } = await serviceClient
      .from('contract_hour_allocations')
      .insert(insertRows)
      .select('*');

    if (insertError) {
      // Handle unique constraint violation gracefully
      if (insertError.code === '23505') {
        return sendAuthError(
          res,
          'Ya existe una asignación para una o más de las categorías indicadas. Verifique la distribución.',
          409
        );
      }
      return sendAuthError(res, 'Error al crear asignaciones de horas', 500, insertError.message);
    }

    return sendApiResponse(res, { allocations: inserted }, 201);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    return sendAuthError(res, 'Error inesperado al crear asignaciones de horas', 500, message);
  }
}

async function handleDelete(req: NextApiRequest, res: NextApiResponse, contratoId: string) {
  const { isAdmin, error: authError } = await checkIsAdmin(req, res);
  if (authError || !isAdmin) {
    return sendAuthError(res, 'Solo administradores pueden eliminar asignaciones de horas', 403);
  }

  try {
    const serviceClient = createServiceRoleClient();

    // Get all allocation IDs for this contract
    const { data: allocations, error: allocError } = await serviceClient
      .from('contract_hour_allocations')
      .select('id')
      .eq('contrato_id', contratoId);

    if (allocError) {
      return sendAuthError(res, 'Error al obtener asignaciones del contrato', 500, allocError.message);
    }

    if (!allocations || allocations.length === 0) {
      return sendAuthError(res, 'Este contrato no tiene asignaciones de horas para eliminar.', 404);
    }

    const allocationIds = allocations.map((a: { id: string }) => a.id);

    // Check for any ledger entries linked to these allocations
    const { data: ledgerEntries, error: ledgerError } = await serviceClient
      .from('contract_hours_ledger')
      .select('id')
      .in('allocation_id', allocationIds)
      .limit(1);

    if (ledgerError) {
      return sendAuthError(res, 'Error al verificar registros del libro de horas', 500, ledgerError.message);
    }

    if (ledgerEntries && ledgerEntries.length > 0) {
      return sendAuthError(
        res,
        'No se pueden eliminar las asignaciones porque ya existen registros en el libro de horas.',
        409
      );
    }

    // Delete all allocations for this contract
    const { error: deleteError } = await serviceClient
      .from('contract_hour_allocations')
      .delete()
      .eq('contrato_id', contratoId);

    if (deleteError) {
      return sendAuthError(res, 'Error al eliminar asignaciones de horas', 500, deleteError.message);
    }

    return sendApiResponse(res, { deleted: allocationIds.length });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    return sendAuthError(res, 'Error inesperado al eliminar asignaciones de horas', 500, message);
  }
}
