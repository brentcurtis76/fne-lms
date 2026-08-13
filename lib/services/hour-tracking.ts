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
  RescheduleHoursPayload,
  ApplySessionRescheduleResult,
  SessionRescheduleUpdates,
} from '../types/hour-tracking.types';
import { ConsultorSession } from '../types/consultor-sessions.types';
import { getSessionDateTime } from '../utils/session-timezone';

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
 *
 * `session_date` + `start_time` are Chile wall-clock (America/Santiago), so the
 * instant MUST be built through `getSessionDateTime`. The previous
 * `new Date(\`${date}T${time}\`)` resolved in server-local time, which on
 * Vercel (UTC) shifted every session start 3–4 h and could flip a cancellation
 * across the 48 h / 336 h clause boundaries — a live billing bug.
 */
export function calculateNoticeHours(
  sessionDate: string,
  startTime: string,
  cancelledAt: Date = new Date()
): number {
  const sessionStart = getSessionDateTime(sessionDate, startTime);
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
): Promise<
  | {
      kind: 'available';
      available_hours: number;
      allocated_hours: number;
      reserved_hours: number;
      consumed_hours: number;
    }
  | { kind: 'missing' }
> {
  const { data: summary, error } = await serviceClient
    .rpc('get_bucket_summary', { p_contrato_id: contratoId });

  if (error) {
    throw new Error('hour_availability_dependency_failed');
  }
  if (!Array.isArray(summary)) {
    throw new Error('hour_availability_invalid_response');
  }

  const bucket = (summary as BucketSummary[]).find(
    (b) => b.hour_type_key === hourTypeKey
  );

  if (!bucket) {
    // A successful empty result is a legitimate answer for a contract/type with no
    // allocation. createReservation separately proves an allocation exists first;
    // at that boundary this same result is therefore an inconsistent dependency.
    return { kind: 'missing' };
  }

  const numericValues = [
    bucket.available_hours,
    bucket.allocated_hours,
    bucket.reserved_hours,
    bucket.consumed_hours,
  ];
  if (!numericValues.every((value) => typeof value === 'number' && Number.isFinite(value))) {
    throw new Error('hour_availability_invalid_response');
  }

  return {
    kind: 'available',
    available_hours: bucket.available_hours,
    allocated_hours: bucket.allocated_hours,
    reserved_hours: bucket.reserved_hours,
    consumed_hours: bucket.consumed_hours,
  };
}

type ReservationAllocation = {
  id: string;
  contrato_id: string;
  hour_type_id: string;
  allocated_hours: number;
};

/** Generic API-safe copy for availability dependency failures. */
export const HOUR_AVAILABILITY_ERROR_ES = 'No se pudo verificar la disponibilidad de horas.';

export type ReservationPreparation =
  | { kind: 'skipped' }
  | {
      kind: 'ready';
      allocation: ReservationAllocation;
      durationMins: number;
      hours: number;
      isOverBudget: boolean;
    }
  | {
      kind: 'error';
      error: string;
      error_kind: 'validation' | 'dependency';
    };

/**
 * Resolve every read-only prerequisite for a reservation. Bulk approval runs this
 * for the whole batch before the first ledger INSERT, so a later availability
 * outage cannot leave earlier sessions reserved.
 */
export async function prepareReservation(
  serviceClient: SupabaseClient,
  session: ConsultorSession
): Promise<ReservationPreparation> {
  // Sessions outside hour tracking are the only legitimate successful-empty path.
  // They predate contract allocation and intentionally approve without a ledger row.
  if (!session.hour_type_key || !session.contrato_id) {
    return { kind: 'skipped' };
  }

  if (!session.start_time || !session.end_time) {
    return {
      kind: 'error',
      error: 'No se puede programar la sesion sin horario definido.',
      error_kind: 'validation',
    };
  }

  let durationMins: number;
  const scheduledMins = session.scheduled_duration_minutes;
  if (scheduledMins && scheduledMins > 0) {
    durationMins = scheduledMins;
  } else {
    const [startH, startM] = session.start_time.split(':').map(Number);
    const [endH, endM] = session.end_time.split(':').map(Number);
    durationMins = (endH * 60 + endM) - (startH * 60 + startM);
    if (durationMins <= 0) {
      return {
        kind: 'error',
        error: 'No se puede programar la sesion sin horario definido.',
        error_kind: 'validation',
      };
    }
  }

  const hours = calculateHours(durationMins);
  const allocation = await findMatchingAllocation(
    serviceClient,
    session.contrato_id,
    session.hour_type_key
  );
  if (!allocation) {
    return {
      kind: 'error',
      error: 'El contrato no tiene horas asignadas para este tipo de servicio.',
      error_kind: 'validation',
    };
  }

  try {
    const budgetInfo = await getAvailableHours(
      serviceClient,
      session.contrato_id,
      session.hour_type_key
    );
    if (budgetInfo.kind === 'missing') {
      // findMatchingAllocation just proved this bucket exists. A summary that omits
      // it is contradictory and must never authorize a financial write.
      return {
        kind: 'error',
        error: HOUR_AVAILABILITY_ERROR_ES,
        error_kind: 'dependency',
      };
    }
    return {
      kind: 'ready',
      allocation,
      durationMins,
      hours,
      isOverBudget: budgetInfo.available_hours < hours,
    };
  } catch {
    return {
      kind: 'error',
      error: HOUR_AVAILABILITY_ERROR_ES,
      error_kind: 'dependency',
    };
  }
}

/**
 * Create a reservation (ledger entry with status='reservada') when a session is approved.
 * Backward compatible: if hour_type_key or contrato_id is null, returns { skipped: true }.
 * Sequential with compensating logic (no PL/pgSQL).
 */
export async function createReservation(
  serviceClient: SupabaseClient,
  session: ConsultorSession,
  userId: string,
  preparation?: ReservationPreparation
): Promise<ReservationResult> {
  const prepared = preparation ?? await prepareReservation(serviceClient, session);
  if (prepared.kind === 'skipped') {
    return { skipped: true };
  }
  if (prepared.kind === 'error') {
    return {
      skipped: false,
      error: prepared.error,
      error_kind: prepared.error_kind,
    };
  }
  const { allocation, durationMins, hours, isOverBudget } = prepared;

  // Create ledger entry.
  // planned_minutes_snapshot (Zoom plan §11, Z1b slice): the approved duration
  // in minutes captured at reservation time — durationMins IS the session's
  // scheduled_duration_minutes (or the identical start/end computation when
  // the generated column is absent), the same figure `hours` bills from.
  // Zoom execution data never changes it; only the Z2 pre-execution reschedule
  // RPC (and the Z7 admin override) may.
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
      planned_minutes_snapshot: durationMins,
    })
    .select('id')
    .single();

  if (ledgerError || !ledgerEntry) {
    return {
      skipped: false,
      error: `Error al crear entrada en el libro de horas: ${ledgerError?.message || 'Unknown error'}`,
      error_kind: 'write',
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
    const { data: hourType, error: hourTypeError } = await serviceClient
      .from('hour_types')
      .select('modality')
      .eq('key', session.hour_type_key)
      .single();

    // r29 (Sol R-C): this read used to swallow its error, and `modality` then stayed at
    // its `'online'` initialiser — so a PRESENCIAL session cancelled 120 h out was
    // evaluated under online thresholds and written to the ledger as `devuelta`
    // (consultant unpaid) instead of `penalizada` (consultant paid). A durably wrong
    // MONEY status, produced by a transient failure and indistinguishable afterwards
    // from a correct one. Nothing has been written at this point, so failing here costs
    // the caller a 500 and costs the ledger nothing. A key with no row is still not an
    // error: `hourType` stays null and the pre-existing fallback below applies.
    if (hourTypeError && hourTypeError.code !== 'PGRST116') {
      console.error(
        `[HourTracking] hour_types lookup failed (session=${session.id}, key=${session.hour_type_key}):`,
        hourTypeError
      );
      throw new Error(
        `No se pudo determinar la modalidad de la hora (${session.hour_type_key}); la cancelación no se aplicó.`
      );
    }

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
// PRE-EXECUTION RESCHEDULE (Z2-3a, plan §11)
// ============================================================

/**
 * The session fields whose change can move the billed duration or the ledger's
 * `session_date`. `start_time`/`end_time` drive `scheduled_duration_minutes`;
 * `session_date` moves the date the ledger row carries but not the duration.
 */
export const DURATION_RELEVANT_SESSION_FIELDS = [
  'session_date',
  'start_time',
  'end_time',
] as const;

/** True when a reschedule touched anything the ledger row has to follow. */
export function isDurationRelevantChange(fieldsChanged: readonly string[]): boolean {
  return fieldsChanged.some((field) =>
    (DURATION_RELEVANT_SESSION_FIELDS as readonly string[]).includes(field)
  );
}

/**
 * Apply a reschedule — the session write AND the ledger write — in ONE transaction.
 *
 * This is the single entry point for BOTH reschedule flows: the admin PUT
 * (`pages/api/sessions/[id]/index.ts`) and the edit-request approval
 * (`pages/api/sessions/edit-requests/[eid].ts`). One implementation, so the two
 * cannot drift.
 *
 * Before r21 each route updated `consultor_sessions` through PostgREST and then
 * called `reschedule_session_hours` as a SECOND call. A failure between the two left
 * the session moved and the ledger billing the old duration, with nothing to roll
 * back. `apply_session_reschedule`
 * (supabase/migrations/20260808120000_session_reschedule_atomic.sql) does the source
 * update, the optimistic-concurrency guard and — through the unchanged
 * `reschedule_session_hours` — the ledger hours, the planned snapshot, the ledger
 * date, the over-budget state and the append-only revision row, or none of it.
 *
 * `ok: false` therefore means NOTHING was written. `hoursFailure` says the failure
 * was the ledger reconciliation rather than the update itself, which the routes turn
 * into different Spanish copy.
 */
export async function applySessionReschedule(
  serviceClient: SupabaseClient,
  sessionId: string,
  userId: string,
  updates: SessionRescheduleUpdates,
  ifUpdatedAt?: string | null
): Promise<ApplySessionRescheduleResult> {
  const { data, error } = await serviceClient.rpc('apply_session_reschedule', {
    p_session_id: sessionId,
    p_actor_id: userId,
    p_updates: updates,
    p_if_updated_at: ifUpdatedAt ?? null,
  });

  if (error) {
    return {
      ok: false,
      error: error.message,
      // The RPC re-raises anything thrown by the ledger reconciliation under this
      // hint; a plain update failure (constraint, bad value) carries no hint.
      hoursFailure: (error as { hint?: string }).hint === 'reschedule_hours',
    };
  }

  const payload = (data || {}) as {
    conflict?: boolean;
    current?: Record<string, any> | null;
    session?: Record<string, any>;
    hours?: RescheduleHoursPayload | null;
  };

  if (payload.conflict) {
    return { ok: true, conflict: true, current: payload.current ?? null };
  }

  return {
    ok: true,
    conflict: false,
    session: payload.session,
    hours: payload.hours ?? null,
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
