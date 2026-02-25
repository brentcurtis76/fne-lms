/**
 * Hour Tracking Service — Phase 2
 * Business logic for reservation, consumption, cancellation clause evaluation,
 * budget checking, and FX rate management.
 *
 * Sequential operations with compensating logic (no PL/pgSQL transactions).
 * Every hook starts with a null guard for backward compatibility.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import {
  ReservationResult,
  CancellationClauseResult,
  CancellationParams,
  CancellationClause,
  FxRateResponse,
  BucketSummary,
  LedgerEntryStatus,
} from '../types/hour-tracking.types';
import { ConsultorSession } from '../types/consultor-sessions.types';

// ============================================================
// PURE FUNCTIONS (no DB)
// ============================================================

/**
 * Evaluate which cancellation clause applies based on modality, canceller, and notice period.
 * Pure function — no side effects.
 *
 * Clause QUINTO rules:
 * 1: Online / School / >= 48h  → devuelta, no pay, 30 days
 * 2: Online / School / < 48h   → penalizada, pay, N/A
 * 3: Presencial / School / >= 336h (2 weeks) → devuelta, no pay, 30 days
 * 4: Presencial / School / < 336h → penalizada, pay, N/A
 * 5: Any / Force majeure         → devuelta, no pay, 30 days
 * 6: Any / FNE                   → devuelta, no pay, 30 days (max contract end)
 */
export function evaluateCancellationClause(
  modality: 'presencial' | 'online' | 'hibrida' | string,
  cancelledBy: 'school' | 'fne' | 'force_majeure',
  noticeHours: number
): CancellationClauseResult {
  // Clause 6: FNE cancels
  if (cancelledBy === 'fne') {
    return {
      clause: 'clause_6',
      ledger_status: 'devuelta',
      consultant_paid: false,
      rescheduling_deadline_days: 30,
      description_es:
        'Clausula 6 — Cancelación por FNE: las horas se devuelven y se debe reprogramar dentro de 30 días (máximo hasta el fin del contrato).',
    };
  }

  // Clause 5: Force majeure
  if (cancelledBy === 'force_majeure') {
    return {
      clause: 'clause_5',
      ledger_status: 'devuelta',
      consultant_paid: false,
      rescheduling_deadline_days: 30,
      description_es:
        'Clausula 5 — Cancelación por fuerza mayor: las horas se devuelven y se debe reprogramar dentro de 30 días.',
    };
  }

  // School cancellation — depends on modality
  const isOnline = modality === 'online';
  const isPresencial = modality === 'presencial' || modality === 'hibrida';

  if (isOnline) {
    if (noticeHours >= 48) {
      // Clause 1
      return {
        clause: 'clause_1',
        ledger_status: 'devuelta',
        consultant_paid: false,
        rescheduling_deadline_days: 30,
        description_es:
          'Clausula 1 — Cancelación online con aviso >= 48 horas: las horas se devuelven. Se debe reprogramar dentro de 30 días.',
      };
    } else {
      // Clause 2
      return {
        clause: 'clause_2',
        ledger_status: 'penalizada',
        consultant_paid: true,
        rescheduling_deadline_days: null,
        description_es:
          'Clausula 2 — Cancelación online con aviso < 48 horas: las horas se penalizan y el consultor tiene derecho a pago.',
      };
    }
  }

  if (isPresencial) {
    const twoWeeksHours = 336; // 14 * 24
    if (noticeHours >= twoWeeksHours) {
      // Clause 3
      return {
        clause: 'clause_3',
        ledger_status: 'devuelta',
        consultant_paid: false,
        rescheduling_deadline_days: 30,
        description_es:
          'Clausula 3 — Cancelación presencial con aviso >= 2 semanas: las horas se devuelven. Se debe reprogramar dentro de 30 días.',
      };
    } else {
      // Clause 4
      return {
        clause: 'clause_4',
        ledger_status: 'penalizada',
        consultant_paid: true,
        rescheduling_deadline_days: null,
        description_es:
          'Clausula 4 — Cancelación presencial con aviso < 2 semanas: las horas se penalizan y el consultor tiene derecho a pago.',
      };
    }
  }

  // Fallback: treat as online
  if (noticeHours >= 48) {
    return {
      clause: 'clause_1',
      ledger_status: 'devuelta',
      consultant_paid: false,
      rescheduling_deadline_days: 30,
      description_es:
        'Clausula 1 — Cancelación con aviso >= 48 horas: las horas se devuelven. Se debe reprogramar dentro de 30 días.',
    };
  }
  return {
    clause: 'clause_2',
    ledger_status: 'penalizada',
    consultant_paid: true,
    rescheduling_deadline_days: null,
    description_es:
      'Clausula 2 — Cancelación con aviso < 48 horas: las horas se penalizan y el consultor tiene derecho a pago.',
  };
}

/**
 * Calculate hours from a duration in minutes, rounded to 2 decimal places (ROUND_HALF_UP).
 */
export function calculateHours(durationMinutes: number): number {
  return Math.round((durationMinutes / 60) * 100) / 100;
}

/**
 * Calculate notice hours between now and the session's scheduled start.
 */
export function calculateNoticeHours(
  sessionDate: string,
  startTime: string,
  cancelledAt: Date = new Date()
): number {
  const sessionStart = new Date(`${sessionDate}T${startTime}`);
  const diff = sessionStart.getTime() - cancelledAt.getTime();
  return Math.max(0, diff / (1000 * 60 * 60));
}

// ============================================================
// DB-DEPENDENT FUNCTIONS
// ============================================================

/**
 * Find the matching contract_hour_allocation for a session.
 * Returns the allocation or null if not found.
 */
export async function findMatchingAllocation(
  serviceClient: SupabaseClient,
  contratoId: string,
  hourTypeKey: string
): Promise<{ id: string; contrato_id: string; hour_type_id: string; allocated_hours: number } | null> {
  // First resolve hour_type_key -> hour_type_id
  const { data: hourType, error: htError } = await serviceClient
    .from('hour_types')
    .select('id')
    .eq('key', hourTypeKey)
    .eq('is_active', true)
    .single();

  if (htError || !hourType) {
    return null;
  }

  // Find allocation for this contract + hour type
  const { data: allocation, error: allocError } = await serviceClient
    .from('contract_hour_allocations')
    .select('id, contrato_id, hour_type_id, allocated_hours')
    .eq('contrato_id', contratoId)
    .eq('hour_type_id', hourType.id)
    .single();

  if (allocError || !allocation) {
    return null;
  }

  return allocation;
}

/**
 * Get available hours for a specific contract and hour type.
 * Uses get_bucket_summary DB function.
 */
export async function getAvailableHours(
  serviceClient: SupabaseClient,
  contratoId: string,
  hourTypeKey: string
): Promise<{ available_hours: number; allocated_hours: number; reserved_hours: number; consumed_hours: number } | null> {
  const { data: summary, error } = await serviceClient
    .rpc('get_bucket_summary', { p_contrato_id: contratoId });

  if (error || !summary) {
    return null;
  }

  const bucket = (summary as BucketSummary[]).find(
    (b) => b.hour_type_key === hourTypeKey
  );

  if (!bucket) {
    return null;
  }

  return {
    available_hours: bucket.available_hours,
    allocated_hours: bucket.allocated_hours,
    reserved_hours: bucket.reserved_hours,
    consumed_hours: bucket.consumed_hours,
  };
}

/**
 * Create a reservation (ledger entry with status='reservada') when a session is approved.
 * Backward compatible: if hour_type_key or contrato_id is null, returns { skipped: true }.
 * Sequential with compensating logic (no PL/pgSQL).
 */
export async function createReservation(
  serviceClient: SupabaseClient,
  session: ConsultorSession,
  userId: string
): Promise<ReservationResult & { error?: string }> {
  // Backward compatibility: null guard
  if (!session.hour_type_key || !session.contrato_id) {
    return { skipped: true };
  }

  // Validate duration exists
  if (!session.start_time || !session.end_time) {
    return {
      skipped: false,
      error: 'No se puede programar la sesion sin horario definido.',
    };
  }

  // Calculate duration minutes — use DB generated column or compute from times
  let durationMins: number;
  const scheduledMins = session.scheduled_duration_minutes;
  if (scheduledMins && scheduledMins > 0) {
    durationMins = scheduledMins;
  } else {
    // Compute from start/end times as fallback
    const [startH, startM] = session.start_time.split(':').map(Number);
    const [endH, endM] = session.end_time.split(':').map(Number);
    durationMins = (endH * 60 + endM) - (startH * 60 + startM);
    if (durationMins <= 0) {
      return {
        skipped: false,
        error: 'No se puede programar la sesion sin horario definido.',
      };
    }
  }

  const hours = calculateHours(durationMins);

  // Find matching allocation
  const allocation = await findMatchingAllocation(
    serviceClient,
    session.contrato_id,
    session.hour_type_key
  );

  if (!allocation) {
    return {
      skipped: false,
      error: 'El contrato no tiene horas asignadas para este tipo de servicio.',
    };
  }

  // Budget check
  const budgetInfo = await getAvailableHours(
    serviceClient,
    session.contrato_id,
    session.hour_type_key
  );

  const isOverBudget = budgetInfo
    ? budgetInfo.available_hours < hours
    : false;

  // Create ledger entry
  const { data: ledgerEntry, error: ledgerError } = await serviceClient
    .from('contract_hours_ledger')
    .insert({
      allocation_id: allocation.id,
      session_id: session.id,
      hours,
      status: 'reservada' as LedgerEntryStatus,
      session_date: session.session_date,
      recorded_by: userId,
      is_over_budget: isOverBudget,
      is_manual: false,
    })
    .select('id')
    .single();

  if (ledgerError || !ledgerEntry) {
    return {
      skipped: false,
      error: `Error al crear entrada en el libro de horas: ${ledgerError?.message || 'Unknown error'}`,
    };
  }

  return {
    skipped: false,
    ledger_entry_id: ledgerEntry.id,
    hours,
    is_over_budget: isOverBudget,
    allocation_id: allocation.id,
  };
}

/**
 * Mark a ledger entry as 'consumida' when a session is finalized.
 * Backward compatible: if no ledger entry found, skips silently.
 */
export async function completeReservation(
  serviceClient: SupabaseClient,
  sessionId: string,
  userId: string
): Promise<{ skipped: boolean; error?: string }> {
  // Find existing reservada ledger entry for this session
  const { data: ledgerEntry, error: findError } = await serviceClient
    .from('contract_hours_ledger')
    .select('id')
    .eq('session_id', sessionId)
    .eq('status', 'reservada')
    .maybeSingle();

  if (findError) {
    return {
      skipped: false,
      error: `Error al buscar entrada en el libro de horas: ${findError.message}`,
    };
  }

  // Legacy session or no tracking — skip
  if (!ledgerEntry) {
    return { skipped: true };
  }

  // Update to consumida
  const { error: updateError } = await serviceClient
    .from('contract_hours_ledger')
    .update({
      status: 'consumida' as LedgerEntryStatus,
      updated_at: new Date().toISOString(),
      updated_by: userId,
    })
    .eq('id', ledgerEntry.id);

  if (updateError) {
    return {
      skipped: false,
      error: `Error al actualizar libro de horas: ${updateError.message}`,
    };
  }

  return { skipped: false };
}

/**
 * Execute cancellation with clause evaluation.
 * Updates ledger entry first, then session (compensating logic pattern).
 *
 * TODO: add program_hours_ledger backward compat entry if program_enrollment_id set (out of scope P2)
 */
export async function executeCancellation(
  serviceClient: SupabaseClient,
  session: ConsultorSession,
  params: CancellationParams,
  userId: string
): Promise<{
  success: boolean;
  clause_result?: CancellationClauseResult;
  error?: string;
  cancelled_notice_hours?: number;
}> {
  const now = new Date();

  // Calculate notice hours
  const noticeHours = session.session_date && session.start_time
    ? calculateNoticeHours(session.session_date, session.start_time, now)
    : 0;

  // Get modality from hour_types table if hour_type_key is set
  let modality: string = 'online';
  if (session.hour_type_key) {
    const { data: hourType } = await serviceClient
      .from('hour_types')
      .select('modality')
      .eq('key', session.hour_type_key)
      .single();
    if (hourType) {
      // Map hour_types.modality ('presencial'|'online'|'both') to session modality logic
      modality = hourType.modality === 'both' ? session.modality : hourType.modality;
    }
  } else {
    // Fall back to session modality
    modality = session.modality;
  }

  // Evaluate clause
  const clauseResult = evaluateCancellationClause(
    modality,
    params.cancelled_by_party,
    noticeHours
  );

  // Determine final ledger status (admin can override)
  const finalLedgerStatus: 'devuelta' | 'penalizada' =
    params.admin_override_status ?? clauseResult.ledger_status;
  const isAdminOverride = !!params.admin_override_status;

  // Step 1: Update ledger entry (if it exists)
  let ledgerEntryId: string | null = null;
  if (session.hour_type_key && session.contrato_id) {
    const { data: ledgerEntry, error: findError } = await serviceClient
      .from('contract_hours_ledger')
      .select('id')
      .eq('session_id', session.id)
      .in('status', ['reservada'])
      .maybeSingle();

    if (findError) {
      return {
        success: false,
        error: `Error al buscar entrada en el libro de horas: ${findError.message}`,
      };
    }

    if (ledgerEntry) {
      ledgerEntryId = ledgerEntry.id;

      const { error: ledgerUpdateError } = await serviceClient
        .from('contract_hours_ledger')
        .update({
          status: finalLedgerStatus as LedgerEntryStatus,
          cancellation_clause: clauseResult.clause,
          cancellation_reason: params.reason,
          admin_override: isAdminOverride,
          admin_override_reason: params.admin_override_reason ?? null,
          updated_at: new Date().toISOString(),
          updated_by: userId,
        })
        .eq('id', ledgerEntry.id);

      if (ledgerUpdateError) {
        return {
          success: false,
          error: `Error al actualizar libro de horas: ${ledgerUpdateError.message}`,
        };
      }
    }
  }

  // Step 2: Update session to cancelada
  const { error: sessionUpdateError } = await serviceClient
    .from('consultor_sessions')
    .update({
      status: 'cancelada',
      cancelled_by: userId,
      cancelled_at: now.toISOString(),
      cancellation_reason: params.reason,
      cancelled_notice_hours: noticeHours,
    })
    .eq('id', session.id);

  if (sessionUpdateError) {
    // Compensating action: revert ledger entry if we updated it
    if (ledgerEntryId) {
      await serviceClient
        .from('contract_hours_ledger')
        .update({
          status: 'reservada' as LedgerEntryStatus,
          cancellation_clause: null,
          cancellation_reason: null,
          admin_override: false,
          admin_override_reason: null,
          updated_at: new Date().toISOString(),
          updated_by: userId,
        })
        .eq('id', ledgerEntryId);
    }

    return {
      success: false,
      error: `Error al cancelar sesión: ${sessionUpdateError.message}`,
    };
  }

  return {
    success: true,
    clause_result: clauseResult,
    cancelled_notice_hours: noticeHours,
  };
}

// ============================================================
// FX RATE FUNCTIONS
// ============================================================

const FX_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const FX_API_URL = 'https://api.exchangerate-api.com/v4/latest/EUR';
const FX_API_TIMEOUT_MS = 5000;

/**
 * Get the latest cached FX rate. Auto-refreshes if > 1 hour stale.
 * Graceful degradation: returns cached rate with is_stale=true if API unreachable.
 */
export async function getLatestFxRate(
  serviceClient: SupabaseClient
): Promise<FxRateResponse & { error?: string }> {
  // Get most recent cached rate
  const { data: cached, error: dbError } = await serviceClient
    .from('fx_rates')
    .select('rate, fetched_at, source')
    .order('fetched_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const now = new Date();

  // Check if cache is fresh (< 1 hour old)
  if (cached && !dbError) {
    const cacheAge = now.getTime() - new Date(cached.fetched_at).getTime();
    if (cacheAge < FX_CACHE_TTL_MS) {
      return {
        rate_clp_per_eur: cached.rate,
        fetched_at: cached.fetched_at,
        is_stale: false,
        source: cached.source,
      };
    }
  }

  // Cache is stale or empty — try to refresh from external API
  try {
    const freshRate = await fetchFxRateFromApi(serviceClient);
    return freshRate;
  } catch {
    // API unreachable — return stale cache with is_stale=true
    if (cached) {
      return {
        rate_clp_per_eur: cached.rate,
        fetched_at: cached.fetched_at,
        is_stale: true,
        source: cached.source,
      };
    }

    return {
      rate_clp_per_eur: 0,
      fetched_at: now.toISOString(),
      is_stale: true,
      source: 'no_data',
      error: 'No hay tipo de cambio disponible y la API externa no está accesible.',
    };
  }
}

/**
 * Force-refresh FX rate from external API.
 */
export async function fetchFxRateFromApi(
  serviceClient: SupabaseClient
): Promise<FxRateResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FX_API_TIMEOUT_MS);

  let rawData: Record<string, unknown>;
  try {
    const response = await fetch(FX_API_URL, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }
    rawData = await response.json() as Record<string, unknown>;
  } finally {
    clearTimeout(timeoutId);
  }

  const rates = rawData.rates as Record<string, number> | undefined;
  const clpRate = rates?.CLP;

  if (!clpRate || typeof clpRate !== 'number') {
    throw new Error('Invalid FX rate response: CLP rate not found');
  }

  const fetchedAt = new Date().toISOString();

  // Insert into cache (append-only)
  const { error: insertError } = await serviceClient
    .from('fx_rates')
    .insert({
      from_currency: 'EUR',
      to_currency: 'CLP',
      rate: clpRate,
      fetched_at: fetchedAt,
      source: 'api',
    });

  if (insertError) {
    // Don't fail the request even if caching fails — return the rate anyway
  }

  return {
    rate_clp_per_eur: clpRate,
    fetched_at: fetchedAt,
    is_stale: false,
    source: 'api',
  };
}
