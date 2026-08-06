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
 * none — legacy sessions predating the ledger, and sessions that were never approved.
 * Those fall back to `scheduledDurationMinutes`, which is behaviour-preserving (the old
 * `actual_duration_minutes` read was a copy of the scheduled value anyway) and keeps them
 * from silently dropping out of a school's report. A report that quietly under-reports is
 * worse than one that errors.
 */
export function billableHours(
  entry: BillableLedgerEntry | null | undefined,
  scheduledDurationMinutes: number | null | undefined,
  mode: BillableHoursMode
): number {
  if (!entry) {
    return (scheduledDurationMinutes ?? 0) / 60;
  }

  if (mode === 'charged_total' && !isChargedStatus(entry.status)) {
    return 0;
  }

  // ── SEAM: Z7-EFFECTIVE-MINUTES ────────────────────────────────────────────────
  // Z7 adds `effective_minutes` to `contract_hours_ledger` (additive migration, plan
  // §11) and this single return becomes §11's
  //     coalesce(effective_minutes / 60.0, hours)
  // i.e. `entry.effective_minutes != null ? entry.effective_minutes / 60 : entry.hours`.
  // That column does NOT exist today — nothing before Z7 may add it — and no other line
  // in this module changes when it lands. Same device `lib/zoom/jobs/meeting-provision.ts`
  // used for `is_zoom_managed` before Z2-1 closed that seam.
  //
  // `hours` is NOT NULL with CHECK (hours > 0) in the schema; the `?? 0` is for the
  // type, not for a row the database can produce.
  return entry.hours ?? 0;
  // ──────────────────────────────────────────────────────────────────────────────
}
