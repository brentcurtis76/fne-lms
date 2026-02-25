/**
 * /api/admin/consultant-rates/[id]
 *
 * NOTE: The [id] parameter is intentionally overloaded based on HTTP method:
 *   GET    → id = consultant_id — returns all rates for that consultant
 *   PATCH  → id = rate_id      — updates a specific rate record
 *   DELETE → id = rate_id      — soft-deletes (sets effective_to = CURRENT_DATE)
 *
 * Both interpret [id] as a UUID. The method determines the semantic.
 * Auth: admin for all methods; consultors may GET their own rates.
 */

import { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import {
  getApiUser,
  createServiceRoleClient,
  sendAuthError,
  sendApiResponse,
  logApiRequest,
  handleMethodNotAllowed,
} from '../../../../lib/api-auth';
import { Validators } from '../../../../lib/types/api-auth.types';
import { getUserRoles, getHighestRole } from '../../../../utils/roleUtils';

// ============================================================
// Zod schemas
// ============================================================

const PatchRateSchema = z.object({
  rate_eur: z
    .number()
    .min(0, 'La tarifa no puede ser negativa')
    .multipleOf(0.01, 'La tarifa debe tener como máximo 2 decimales')
    .optional(),
  effective_to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'effective_to debe tener el formato YYYY-MM-DD')
    .nullable()
    .optional(),
});

// ============================================================
// Main handler
// ============================================================

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  logApiRequest(req, 'admin-consultant-rates-by-id');

  const { id } = req.query;

  if (!id || typeof id !== 'string' || !Validators.isUUID(id)) {
    return sendAuthError(res, 'ID inválido — debe ser un UUID válido', 400);
  }

  if (req.method === 'GET') {
    return handleGet(req, res, id);
  }

  if (req.method === 'PATCH') {
    return handlePatch(req, res, id);
  }

  if (req.method === 'DELETE') {
    return handleDelete(req, res, id);
  }

  return handleMethodNotAllowed(res, ['GET', 'PATCH', 'DELETE']);
}

// ============================================================
// GET — returns all rates for consultant_id
// ============================================================

async function handleGet(req: NextApiRequest, res: NextApiResponse, consultantId: string) {
  const { user, error: authError } = await getApiUser(req, res);
  if (authError || !user) {
    return sendAuthError(res, 'Autenticación requerida', 401);
  }

  try {
    const serviceClient = createServiceRoleClient();
    const userRoles = await getUserRoles(serviceClient, user.id);
    const highestRole = getHighestRole(userRoles);

    // Admin can view anyone; consultor can only view their own rates
    if (highestRole !== 'admin') {
      if (highestRole === 'consultor' && consultantId !== user.id) {
        return sendAuthError(
          res,
          'Solo puede consultar sus propias tarifas',
          403
        );
      } else if (highestRole !== 'consultor') {
        return sendAuthError(res, 'Acceso denegado', 403);
      }
    }

    const { data: rates, error: dbError } = await serviceClient
      .from('consultant_rates')
      .select(
        `
        id,
        consultant_id,
        hour_type_id,
        rate_eur,
        effective_from,
        effective_to,
        created_at,
        updated_at,
        created_by,
        hour_types:hour_type_id ( id, key, display_name )
      `
      )
      .eq('consultant_id', consultantId)
      .order('effective_from', { ascending: false });

    if (dbError) {
      return sendAuthError(res, 'Error al obtener tarifas del consultor', 500, dbError.message);
    }

    return sendApiResponse(res, { rates: rates ?? [] });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    return sendAuthError(res, 'Error inesperado al obtener tarifas', 500, message);
  }
}

// ============================================================
// PATCH — update rate_eur or effective_to for a specific rate
// ============================================================

async function handlePatch(req: NextApiRequest, res: NextApiResponse, rateId: string) {
  const { user, error: authError } = await getApiUser(req, res);
  if (authError || !user) {
    return sendAuthError(res, 'Autenticación requerida', 401);
  }

  try {
    const serviceClient = createServiceRoleClient();
    const userRoles = await getUserRoles(serviceClient, user.id);
    const highestRole = getHighestRole(userRoles);

    if (highestRole !== 'admin') {
      return sendAuthError(res, 'Solo administradores pueden modificar tarifas', 403);
    }

    const parsed = PatchRateSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendAuthError(
        res,
        `Datos inválidos: ${parsed.error.errors.map((e) => e.message).join(', ')}`,
        400
      );
    }

    if (parsed.data.rate_eur === undefined && parsed.data.effective_to === undefined) {
      return sendAuthError(res, 'Debe proporcionar al menos rate_eur o effective_to para actualizar', 400);
    }

    // Verify rate exists
    const { data: existingRate, error: rateError } = await serviceClient
      .from('consultant_rates')
      .select('id, consultant_id, hour_type_id, effective_from')
      .eq('id', rateId)
      .single();

    if (rateError || !existingRate) {
      return sendAuthError(res, 'Tarifa no encontrada', 404);
    }

    // Block modification if there are ledger entries for this rate
    // Ledger entries link to allocations, which link to hour_type+consultant
    // We check via: ledger → allocation → hour_type for this consultant in this period
    const { data: ledgerCheck, error: ledgerError } = await serviceClient
      .from('contract_hours_ledger')
      .select('id')
      .in('status', ['consumida', 'penalizada'])
      .gte('session_date', existingRate.effective_from)
      .limit(1);

    if (ledgerError) {
      return sendAuthError(res, 'Error al verificar registros del libro de horas', 500, ledgerError.message);
    }

    // If any ledger entries exist, check specifically for this rate's hour_type
    if (ledgerCheck && ledgerCheck.length > 0) {
      // Verify ledger entries tied to this rate's hour_type
      const { data: sessionCheck, error: sessionCheckError } = await serviceClient
        .from('contract_hours_ledger')
        .select(`
          id,
          contract_hour_allocations!inner(hour_type_id)
        `)
        .eq('contract_hour_allocations.hour_type_id', existingRate.hour_type_id)
        .in('status', ['consumida', 'penalizada'])
        .limit(1);

      if (sessionCheckError) {
        return sendAuthError(res, 'Error al verificar registros vinculados', 500, sessionCheckError.message);
      }

      if (sessionCheck && sessionCheck.length > 0) {
        return sendAuthError(
          res,
          'No se puede modificar esta tarifa porque ya existen horas consumidas o penalizadas asociadas a ella. Para cambiar la tarifa, cree una nueva entrada con las fechas vigentes correctas.',
          409
        );
      }
    }

    // Build update payload
    const updatePayload: { rate_eur?: number; effective_to?: string | null; updated_at: string } = {
      updated_at: new Date().toISOString(),
    };
    if (parsed.data.rate_eur !== undefined) {
      updatePayload.rate_eur = parsed.data.rate_eur;
    }
    if (parsed.data.effective_to !== undefined) {
      updatePayload.effective_to = parsed.data.effective_to;
    }

    const { data: updated, error: updateError } = await serviceClient
      .from('consultant_rates')
      .update(updatePayload)
      .eq('id', rateId)
      .select('*')
      .single();

    if (updateError) {
      if (updateError.code === '23P01') {
        return sendAuthError(
          res,
          'La actualización de fechas crearía un solapamiento con otra tarifa existente.',
          409
        );
      }
      return sendAuthError(res, 'Error al actualizar la tarifa', 500, updateError.message);
    }

    return sendApiResponse(res, { rate: updated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    return sendAuthError(res, 'Error inesperado al actualizar tarifa', 500, message);
  }
}

// ============================================================
// DELETE — soft delete: set effective_to = today
// ============================================================

async function handleDelete(req: NextApiRequest, res: NextApiResponse, rateId: string) {
  const { user, error: authError } = await getApiUser(req, res);
  if (authError || !user) {
    return sendAuthError(res, 'Autenticación requerida', 401);
  }

  try {
    const serviceClient = createServiceRoleClient();
    const userRoles = await getUserRoles(serviceClient, user.id);
    const highestRole = getHighestRole(userRoles);

    if (highestRole !== 'admin') {
      return sendAuthError(res, 'Solo administradores pueden desactivar tarifas', 403);
    }

    // Verify rate exists
    const { data: existingRate, error: rateError } = await serviceClient
      .from('consultant_rates')
      .select('id, effective_to')
      .eq('id', rateId)
      .single();

    if (rateError || !existingRate) {
      return sendAuthError(res, 'Tarifa no encontrada', 404);
    }

    if (existingRate.effective_to !== null) {
      return sendAuthError(res, 'Esta tarifa ya está desactivada', 400);
    }

    const today = new Date().toISOString().slice(0, 10);

    const { data: deactivated, error: updateError } = await serviceClient
      .from('consultant_rates')
      .update({ effective_to: today, updated_at: new Date().toISOString() })
      .eq('id', rateId)
      .select('*')
      .single();

    if (updateError) {
      return sendAuthError(res, 'Error al desactivar la tarifa', 500, updateError.message);
    }

    return sendApiResponse(res, { rate: deactivated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    return sendAuthError(res, 'Error inesperado al desactivar tarifa', 500, message);
  }
}
