/**
 * Billable hours — the ONE derivation of "how many hours does this session bill",
 * shared by every consumer that reports session hours to a school or to FNE
 * (Zoom plan §11, hours-consumer audit).
 *
 * ## Why this module exists
 *
 * `consultor_sessions.actual_duration_minutes` is named for a measurement nobody takes.
 * It has exactly two writes: `pages/api/sessions/index.ts` sets it NULL at creation, and
 * `pages/api/sessions/[id]/finalize.ts` writes `actual_duration_minutes ??
 * scheduled_duration_minutes` at finalize. Nothing ever measures a session, so the column
 * only ever holds the SCHEDULED value, and only for sessions that reached finalize.
 * Reporting it as "actual" reported a copy.
 *
 * `contract_hours_ledger` is the real record. Its `hours` is what the school was billed:
 * already adjusted when an admin overrode a cancellation, and updated in place by the
 * pre-execution reschedule RPC. Both hour consumers — the school hours report drill-down
 * and the session-analytics KPIs — read billable time through this module and nowhere
 * else.
 */

import type { LedgerEntryStatus } from '../types/hour-tracking.types';

/** The subset of a `contract_hours_ledger` row this derivation reads. */
export interface BillableLedgerEntry {
  status: LedgerEntryStatus | string;
  hours: number | null;
  /**
   * Admin-overridden billable minutes (§11, Z7-4). NULL/undefined = no override,
   * `hours` governs. 0 is a full waiver ("Sesión eximida"). Optional so existing
   * callers that never select the column keep compiling — an absent field reads
   * exactly as an un-overridden row.
   */
  effective_minutes?: number | null;
}

/**
 * How the caller intends to use the number.
 *
 * - `per_session_display` — one row of a drill-down that renders the ledger status
 *   beside the number. Every status yields the row's `hours` verbatim.
 * - `charged_total` — an aggregate answering "what was this school charged". Only
 *   statuses in {@link CHARGED_LEDGER_STATUSES} contribute.
 */
export type BillableHoursMode = 'per_session_display' | 'charged_total';

/**
 * The ledger statuses whose hours the school was actually charged for.
 *
 * `contract_hours_ledger.status` is constrained to exactly four values:
 *
 * - `reservada`   — reserved at approval; the session has not happened. NOT charged.
 * - `consumida`   — the session happened and was finalized. Charged.
 * - `devuelta`    — cancelled with enough notice; the hours went back to the school.
 *                   NOT charged.
 * - `penalizada`  — cancelled inside the notice window; the school pays anyway. Charged.
 *
 * The trap this list exists to avoid: `executeCancellation`
 * (`lib/services/hour-tracking.ts`) updates only `status`, the cancellation fields and the
 * override fields — it NEVER rewrites `hours`. A `devuelta` row therefore still holds the
 * full originally-reserved amount, so summing `hours` across all statuses would bill a
 * school for hours it was given back.
 */
export const CHARGED_LEDGER_STATUSES: readonly LedgerEntryStatus[] = ['consumida', 'penalizada'];

function isChargedStatus(status: LedgerEntryStatus | string): boolean {
  return (CHARGED_LEDGER_STATUSES as readonly string[]).includes(status);
}

/**
 * Hours billed for one session.
 *
 * `entry` is the session's `contract_hours_ledger` row, or null/undefined when it has
 * none — legacy sessions predating the ledger, and sessions that were never approved
 * (`borrador`, `pendiente_aprobacion`). The two modes answer that case differently,
 * because they are answering different questions:
 *
 * - `charged_total` → **0**. The aggregate answers "what does our billing record say this
 *   school was charged". A session with no ledger row has no billing record — it was never
 *   reserved and certainly never charged — so the ledger-derived KPI must not claim it was.
 *   Anything else contradicts this module's own treatment of `reservada`, which returns 0
 *   for a session that at least reached approval. In this mode, only a ledger row with a
 *   charged status ever contributes.
 * - `per_session_display` → `scheduledDurationMinutes`. The drill-down renders one row per
 *   session and must show something meaningful for a session that is not ledgered yet. The
 *   fallback is behaviour-preserving there (the old `actual_duration_minutes` read was a
 *   copy of the scheduled value anyway) and keeps those rows from silently dropping out of
 *   a school's report.
 */
export function billableHours(
  entry: BillableLedgerEntry | null | undefined,
  scheduledDurationMinutes: number | null | undefined,
  mode: BillableHoursMode
): number {
  if (!entry) {
    if (mode === 'charged_total') {
      return 0;
    }
    return (scheduledDurationMinutes ?? 0) / 60;
  }

  if (mode === 'charged_total' && !isChargedStatus(entry.status)) {
    return 0;
  }

  // §11's coalesce, closed by Z7-4: the admin-adjusted `effective_minutes` when set
  // (0 = full waiver, so `!= null`, never truthiness), else the ledger `hours`. The
  // division applies the §11 "one rounding rule" — minutes/60 to two decimals,
  // half-up, exactly `calculateHours` (lib/services/hour-tracking.ts) and exactly
  // the SQL twin in `get_bucket_summary` (round(effective_minutes/60.0, 2)) — so
  // every consumer derives the same figure from the same row.
  //
  // Zoom data never reaches this input: `effective_minutes` is written only by
  // `apply_session_hour_override`, which requires an authenticated admin inside
  // the function itself.
  if (entry.effective_minutes !== null && entry.effective_minutes !== undefined) {
    return Math.round((entry.effective_minutes / 60) * 100) / 100;
  }
  // `hours` is NOT NULL with CHECK (hours > 0) in the schema; the `?? 0` is for the
  // type, not for a row the database can produce.
  return entry.hours ?? 0;
}
