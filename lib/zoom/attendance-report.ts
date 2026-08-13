/**
 * Report-batch completeness validation — a PURE module (plan §15.3.9; Z7-3).
 *
 * §15.3.9 defines when a candidate fetch of the participant report may become
 * authoritative: **every page traversed with unchanged query parameters until
 * `next_page_token` is empty, AND accumulated row count == `total_records`, AND
 * metadata consistent across pages.** Anything less — a page error, a token
 * rejection, count drift, an invalid interval — rejects the ENTIRE candidate batch.
 *
 * Pure so the matrix rows 12–14 are unit tests over plain data rather than
 * integration guesses: the job fetches pages (I/O) and hands the accumulated set
 * here; this module answers "complete or rejected, and why". The earlier contract
 * promoted "every row of a successful fetch" wholesale, and a 31-person meeting
 * would have silently lost participant 31 to pagination — that defect is the reason
 * this module exists as a testable unit.
 *
 * Interval validity reuses `readLifecycleInstant`'s plausibility band deliberately:
 * a report row's instants come off the same wire with the same failure modes, and a
 * fabricated or implausible instant must reject the batch rather than become a row
 * an admin reads as billable-presence evidence.
 */
import {
  isZoomReportParticipantRaw,
  MALFORMED_REPORT_PARTICIPANT_REASON,
  type ZoomReportParticipantRaw,
  type ZoomReportParticipantsPage,
} from './api';
import { readParticipantField, type ParticipantIdentity } from './attendance-identity';
import { readLifecycleInstant } from './webhook-lifecycle';

/** One validated report interval, ready for identity matching and promotion. */
export interface ReportInterval {
  joinedAt: string;
  leftAt: string;
  identity: ParticipantIdentity;
}

export type ReportBatchValidation =
  | {
      ok: true;
      rows: ReportInterval[];
      pageSize: number;
      pageCount: number;
      totalRecords: number;
    }
  | { ok: false; reason: string };

/**
 * Reads the three §15 identity-evidence fields off a report row. Field names differ
 * from the webhook shape (`name`/`user_email` vs `user_name`/`email` — §6.2), which
 * is one more reason no key may be shared across sources. `readParticipantField`
 * still turns Zoom's `""` into null, exactly as on the webhook path.
 */
export function readReportIdentity(row: ZoomReportParticipantRaw): ParticipantIdentity {
  return {
    customerKey: readParticipantField(row.customer_key),
    email: readParticipantField(row.user_email),
    displayName: readParticipantField(row.name),
  };
}

/**
 * The §15.3.9 complete-batch rule over an accumulated page set.
 *
 * The caller guarantees traversal order (page N's fetch used page N-1's token) and
 * unchanged query parameters; everything else is checked here. Rejection reasons are
 * stable strings — they land in `rejection_reason` and on the §18 health panel, so
 * they name the failed clause rather than the row.
 */
export function validateReportBatch(pages: ZoomReportParticipantsPage[]): ReportBatchValidation {
  if (pages.length === 0) {
    return { ok: false, reason: 'no_pages_fetched' };
  }

  const [first] = pages;
  for (const page of pages) {
    if (
      page.pageSize !== first.pageSize ||
      page.pageCount !== first.pageCount ||
      page.totalRecords !== first.totalRecords
    ) {
      return { ok: false, reason: 'metadata_drift_across_pages' };
    }
  }

  const last = pages[pages.length - 1];
  if (last.nextPageToken !== '') {
    // The empty token is the ONLY end-of-data signal; a caller that stopped early
    // hands in a truncated candidate, and truncation is exactly what must never
    // become authoritative.
    return { ok: false, reason: 'pagination_not_exhausted' };
  }
  for (const page of pages.slice(0, -1)) {
    if (page.nextPageToken === '') {
      return { ok: false, reason: 'pages_after_end_of_data' };
    }
  }

  const rawRows = pages.flatMap((page) => page.participants);
  if (rawRows.length !== first.totalRecords) {
    return { ok: false, reason: 'row_count_mismatch' };
  }

  const rows: ReportInterval[] = [];
  for (const raw of rawRows) {
    // Keep this pure validator total even if a non-live adapter or future caller
    // bypasses the API boundary's element guard. Runtime evidence is never trusted
    // merely because TypeScript declared the array's element type.
    if (!isZoomReportParticipantRaw(raw)) {
      return { ok: false, reason: MALFORMED_REPORT_PARTICIPANT_REASON };
    }
    const joinedAt = readLifecycleInstant(raw.join_time, undefined);
    const leftAt = readLifecycleInstant(raw.leave_time, undefined);
    // §6.2: report rows arrive already paired. A row missing either instant, or
    // whose leave precedes its join, is an invalid interval and rejects the batch —
    // never a repaired or half-kept row.
    if (joinedAt === null || leftAt === null) {
      return { ok: false, reason: 'invalid_interval_instant' };
    }
    if (Date.parse(leftAt) < Date.parse(joinedAt)) {
      return { ok: false, reason: 'invalid_interval_order' };
    }
    rows.push({ joinedAt, leftAt, identity: readReportIdentity(raw) });
  }

  return {
    ok: true,
    rows,
    pageSize: first.pageSize,
    pageCount: first.pageCount,
    totalRecords: first.totalRecords,
  };
}
