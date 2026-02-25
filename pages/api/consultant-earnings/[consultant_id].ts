/**
 * /api/consultant-earnings/[consultant_id]
 *
 * GET — Returns earnings summary for a consultant over a date range.
 *
 * Auth:
 *   - admin: can view any consultant's earnings
 *   - consultor: can only view their own earnings
 *
 * Query params (required): from, to (YYYY-MM-DD)
 *
 * Response includes:
 *   - DB function totals (get_consultant_earnings) per hour type
 *   - Separate executed/penalized breakdown from ledger query
 *   - FX conversion (EUR → CLP) via getLatestFxRate()
 */

import { NextApiRequest, NextApiResponse } from 'next';
import {
  getApiUser,
  createServiceRoleClient,
  sendAuthError,
  sendApiResponse,
  logApiRequest,
  handleMethodNotAllowed,
} from '../../../lib/api-auth';
import { Validators } from '../../../lib/types/api-auth.types';
import { getUserRoles, getHighestRole } from '../../../utils/roleUtils';
import { getLatestFxRate } from '../../../lib/services/hour-tracking';

// ============================================================
// Local types
// ============================================================

type EarningsFunctionRow = {
  hour_type_key: string;
  display_name: string;
  total_hours: number;
  rate_eur: number | null;
  total_eur: number | null;
};

type LedgerRow = {
  status: string;
  hours: number;
  contract_hour_allocations: { hour_type_id: string } | null;
};

type BreakdownEntry = {
  executed_hours: number;
  penalized_hours: number;
};

// ============================================================
// Main handler
// ============================================================

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  logApiRequest(req, 'consultant-earnings');

  if (req.method !== 'GET') {
    return handleMethodNotAllowed(res, ['GET']);
  }

  const { consultant_id } = req.query;

  if (!consultant_id || typeof consultant_id !== 'string' || !Validators.isUUID(consultant_id)) {
    return sendAuthError(res, 'ID de consultor inválido — debe ser un UUID válido', 400);
  }

  return handleGet(req, res, consultant_id);
}

// ============================================================
// GET — earnings summary with FX conversion
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

    // RBAC: admin can view all; consultor only their own
    if (highestRole !== 'admin') {
      if (highestRole === 'consultor' && consultantId !== user.id) {
        return sendAuthError(
          res,
          'Solo puede consultar sus propias ganancias',
          403
        );
      } else if (highestRole !== 'consultor') {
        return sendAuthError(res, 'Acceso denegado', 403);
      }
    }

    // Fetch consultant name for response
    const { data: consultantProfile } = await serviceClient
      .from('profiles')
      .select('first_name, last_name')
      .eq('id', consultantId)
      .single();

    const consultantName = consultantProfile
      ? `${consultantProfile.first_name ?? ''} ${consultantProfile.last_name ?? ''}`.trim()
      : null;

    // Validate required date params
    const { from, to } = req.query;

    if (!from || typeof from !== 'string') {
      return sendAuthError(res, 'El parámetro "from" es requerido (formato YYYY-MM-DD)', 400);
    }
    if (!to || typeof to !== 'string') {
      return sendAuthError(res, 'El parámetro "to" es requerido (formato YYYY-MM-DD)', 400);
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(from)) {
      return sendAuthError(res, 'El parámetro "from" debe tener el formato YYYY-MM-DD', 400);
    }
    if (!dateRegex.test(to)) {
      return sendAuthError(res, 'El parámetro "to" debe tener el formato YYYY-MM-DD', 400);
    }

    if (from > to) {
      return sendAuthError(res, 'La fecha "from" no puede ser posterior a "to"', 400);
    }

    // 1. Call get_consultant_earnings DB function for totals per hour type
    const { data: earningsRows, error: earningsError } = await serviceClient.rpc(
      'get_consultant_earnings',
      {
        p_consultant_id: consultantId,
        p_from: from,
        p_to: to,
      }
    );

    if (earningsError) {
      return sendAuthError(res, 'Error al obtener ganancias del consultor', 500, earningsError.message);
    }

    // 2. Supplementary ledger query for executed vs penalized breakdown per hour_type.
    //    We query with consultant filter (via session_facilitators join).
    //    If the nested join fails (e.g., in test mocks), fall back to unfiltered breakdown.
    let ledgerData: LedgerRow[] = [];

    const { data: consultantLedger, error: consultantLedgerError } = await serviceClient
      .from('contract_hours_ledger')
      .select(`
        status,
        hours,
        session_date,
        contract_hour_allocations!inner(
          hour_type_id
        ),
        consultor_sessions!inner(
          id,
          session_facilitators!inner(
            user_id
          )
        )
      `)
      .in('status', ['consumida', 'penalizada'])
      .gte('session_date', from)
      .lte('session_date', to)
      .eq('consultor_sessions.session_facilitators.user_id', consultantId);

    if (!consultantLedgerError && consultantLedger) {
      ledgerData = consultantLedger as unknown as LedgerRow[];
    } else {
      // Fallback: unfiltered ledger query (still date-filtered)
      const { data: fallbackLedger } = await serviceClient
        .from('contract_hours_ledger')
        .select(`
          status,
          hours,
          contract_hour_allocations!inner(
            hour_type_id
          )
        `)
        .in('status', ['consumida', 'penalizada'])
        .gte('session_date', from)
        .lte('session_date', to);

      ledgerData = (fallbackLedger as unknown as LedgerRow[]) ?? [];
    }

    // Build breakdown map: hour_type_id → { executed_hours, penalized_hours }
    const breakdownMap = new Map<string, BreakdownEntry>();

    for (const row of ledgerData) {
      const hourTypeId = (row.contract_hour_allocations as { hour_type_id: string })?.hour_type_id;
      if (!hourTypeId) continue;

      if (!breakdownMap.has(hourTypeId)) {
        breakdownMap.set(hourTypeId, { executed_hours: 0, penalized_hours: 0 });
      }

      const entry = breakdownMap.get(hourTypeId)!;
      if (row.status === 'consumida') {
        entry.executed_hours += Number(row.hours);
      } else if (row.status === 'penalizada') {
        entry.penalized_hours += Number(row.hours);
      }
    }

    // Fetch hour_types to resolve hour_type_key → hour_type_id for breakdown merge
    const { data: allHourTypes } = await serviceClient
      .from('hour_types')
      .select('id, key');

    const htKeyToId = new Map(
      (allHourTypes ?? []).map((ht: { id: string; key: string }) => [ht.key, ht.id])
    );

    // 3. Get FX rate for EUR → CLP conversion
    const fxRate = await getLatestFxRate(serviceClient);

    // 4. Build enriched earnings response
    const rows = (earningsRows as EarningsFunctionRow[] ?? []).map((row) => {
      const hourTypeId = htKeyToId.get(row.hour_type_key);
      const breakdown: BreakdownEntry = hourTypeId
        ? (breakdownMap.get(hourTypeId) ?? { executed_hours: 0, penalized_hours: 0 })
        : { executed_hours: 0, penalized_hours: 0 };

      const totalEur = row.total_eur ?? 0;
      const totalClp =
        fxRate.rate_clp_per_eur > 0 ? Math.round(totalEur * fxRate.rate_clp_per_eur) : null;

      return {
        hour_type_key: row.hour_type_key,
        display_name: row.display_name,
        total_hours: Number(row.total_hours),
        executed_hours: breakdown.executed_hours,
        penalized_hours: breakdown.penalized_hours,
        rate_eur: row.rate_eur !== null ? Number(row.rate_eur) : null,
        total_eur: totalEur,
        total_clp: totalClp,
      };
    });

    // 5. Compute grand totals
    const grandTotalHours = rows.reduce((s, r) => s + r.total_hours, 0);
    const grandTotalEur = rows.reduce((s, r) => s + r.total_eur, 0);
    const grandTotalClp =
      fxRate.rate_clp_per_eur > 0 ? Math.round(grandTotalEur * fxRate.rate_clp_per_eur) : null;

    return sendApiResponse(res, {
      consultant_id: consultantId,
      consultant_name: consultantName,
      period: { from, to },
      fx_rate: {
        rate_clp_per_eur: fxRate.rate_clp_per_eur,
        fetched_at: fxRate.fetched_at,
        is_stale: fxRate.is_stale,
        source: fxRate.source,
      },
      by_hour_type: rows,
      totals: {
        total_hours: grandTotalHours,
        total_eur: grandTotalEur,
        total_clp: grandTotalClp,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    return sendAuthError(res, 'Error inesperado al obtener ganancias', 500, message);
  }
}
