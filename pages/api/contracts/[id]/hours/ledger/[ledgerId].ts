import { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import {
  checkIsAdmin,
  createServiceRoleClient,
  sendAuthError,
  sendApiResponse,
  logApiRequest,
  handleMethodNotAllowed,
} from '../../../../../../lib/api-auth';
import { Validators } from '../../../../../../lib/types/api-auth.types';

const LedgerOverrideSchema = z.object({
  status: z.enum(['devuelta', 'penalizada']),
  admin_override_reason: z.string().min(1, 'La razón de la anulación es requerida').max(500),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  logApiRequest(req, 'contracts-hours-ledger-entry');

  if (req.method !== 'PATCH') {
    return handleMethodNotAllowed(res, ['PATCH']);
  }

  const { id, ledgerId } = req.query;

  if (!id || typeof id !== 'string' || !Validators.isUUID(id)) {
    return sendAuthError(res, 'ID de contrato inválido', 400);
  }

  if (!ledgerId || typeof ledgerId !== 'string' || !Validators.isUUID(ledgerId)) {
    return sendAuthError(res, 'ID de entrada del libro de horas inválido', 400);
  }

  const { isAdmin, user, error: authError } = await checkIsAdmin(req, res);
  if (authError || !isAdmin) {
    return sendAuthError(res, 'Solo administradores pueden modificar entradas del libro de horas', 403);
  }

  const parsed = LedgerOverrideSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendAuthError(
      res,
      `Datos inválidos: ${parsed.error.errors.map((e) => e.message).join(', ')}`,
      400
    );
  }

  const { status, admin_override_reason } = parsed.data;

  try {
    const serviceClient = createServiceRoleClient();

    // Verify the ledger entry belongs to this contract
    const { data: existing, error: findError } = await serviceClient
      .from('contract_hours_ledger')
      .select('id, allocation_id, status, allocation:contract_hour_allocations!allocation_id(contrato_id)')
      .eq('id', ledgerId)
      .single();

    if (findError || !existing) {
      return sendAuthError(res, 'Entrada del libro de horas no encontrada', 404);
    }

    const allocationContratoId = Array.isArray(existing.allocation)
      ? existing.allocation[0]?.contrato_id
      : (existing.allocation as { contrato_id: string } | null)?.contrato_id;

    if (allocationContratoId !== id) {
      return sendAuthError(res, 'Esta entrada no pertenece al contrato especificado', 403);
    }

    // Only allow override of devuelta <-> penalizada (cancellation entries)
    if (existing.status !== 'devuelta' && existing.status !== 'penalizada') {
      return sendAuthError(
        res,
        `Solo se pueden anular entradas en estado 'devuelta' o 'penalizada'. Estado actual: ${existing.status}`,
        400
      );
    }

    const { data: updatedEntry, error: updateError } = await serviceClient
      .from('contract_hours_ledger')
      .update({
        status,
        admin_override: true,
        admin_override_reason,
        updated_at: new Date().toISOString(),
        updated_by: user!.id,
      })
      .eq('id', ledgerId)
      .select('*')
      .single();

    if (updateError) {
      return sendAuthError(res, 'Error al actualizar entrada del libro de horas', 500, updateError.message);
    }

    return sendApiResponse(res, { ledger_entry: updatedEntry });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    return sendAuthError(res, 'Error inesperado al actualizar entrada del libro de horas', 500, message);
  }
}
