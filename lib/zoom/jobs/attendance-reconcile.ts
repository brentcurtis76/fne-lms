/**
 * `attendance_reconcile` — captures the authoritative participant report for one
 * ended occurrence as a COMPLETE batch, or rejects the candidate whole
 * (plan §15.3.9; Z7-3).
 *
 * ## The shape of the work
 *
 *  1. Open a `pending` batch row — its DB-assigned `seq` is the authority order, and
 *     a crash from here on leaves a visible pending row and ZERO attendance rows.
 *  2. Traverse EVERY page of `GET /report/meetings/{uuid}/participants` with
 *     unchanged query parameters until the empty `next_page_token`. Nothing is
 *     written per page.
 *  3. Validate the accumulated candidate against the §15.3.9 completeness rule
 *     (`attendance-report.ts`). Any page error, count drift or invalid interval
 *     rejects the ENTIRE candidate — the batch is marked `rejected` with the failed
 *     clause and the job retries bounded, then dead-letters onto the §18 panel.
 *  4. Match each row to a person under the §15 identity hierarchy — the SAME
 *     resolver the webhook path uses (`resolveParticipantMatch`), so the two
 *     sources cannot drift on who a row is about. Matching decides `user_id`
 *     EVIDENCE only; no row is ever matched against a webhook row (§15.3.9 forbids
 *     cross-source matching outright — no key exists).
 *  5. Promote atomically: `promote_attendance_report_batch` inserts all rows and
 *     flips pending→complete in ONE transaction. Only then does the batch become
 *     the occurrence's effective set (`attendance-effective.ts`).
 *
 * ## What this job never does
 *
 * It never edits, closes or deletes a webhook row (the store has no member that
 * could); it never writes `contract_hours_ledger` anything (§11); it never
 * fabricates an interval for a missing report — absence keeps the webhook rows
 * effective and PROVISIONAL, which Z7-5 renders as a state.
 *
 * A rejected candidate never displaces anything: the prior complete batch (or the
 * webhook set) stays effective because effectiveness is READ from the highest-seq
 * complete batch, and a rejected batch never becomes one.
 */
import type { ZoomApi, ZoomReportParticipantsPage } from '../api';
import { getZoomApi } from '../api';
import { identityTokens } from '../attendance-identity';
import { validateReportBatch } from '../attendance-report';
import {
  defaultZoomAttendanceReportStore,
  type ReportRowInsert,
  type ZoomAttendanceReportStore,
} from '../attendance-report-store';
import { defaultZoomAttendanceStore } from '../attendance-store';
import {
  resolveParticipantMatch,
  type ParticipantMatchLookups,
} from '../participant-lifecycle';
import { ZoomError, ZoomNonRetryableError, ZoomRetryableError } from '../errors';
import { ZoomJobLeaseLostError, type ZoomJobHandler } from './types';

/**
 * Requested on EVERY page — §15.3.9's "unchanged query parameters". 100 is inside
 * the documented cap for heavy-data endpoints, so Zoom will not silently coerce it;
 * consistency is still asserted from the RESPONSE metadata, not assumed from this
 * constant.
 */
export const REPORT_PAGE_SIZE = 100;

/**
 * A runaway-token backstop, far above any real session (100 pages × 100 rows). A
 * traversal that hits it rejects the candidate rather than looping forever inside a
 * lease.
 */
export const REPORT_MAX_PAGES = 100;

/** Heartbeat cadence while matching rows — enough to keep a long batch's lease. */
const MATCH_HEARTBEAT_EVERY = 25;

export interface AttendanceReconcileDeps {
  api?: ZoomApi;
  reportStore?: ZoomAttendanceReportStore;
  /** The §15 identity lookups — the same slice the webhook applier resolves with. */
  matchLookups?: ParticipantMatchLookups;
  env?: NodeJS.ProcessEnv;
  now?: () => number;
}

function readMeetingIdFromPayload(payload: Record<string, unknown>): string {
  const meetingId = payload.meeting_id;
  if (typeof meetingId !== 'string' || meetingId.length === 0) {
    throw new ZoomNonRetryableError('attendance_reconcile payload is missing meeting_id.', {
      operation: 'attendance_reconcile',
    });
  }
  return meetingId;
}

/** Zoom's "no report (yet)" — a timing fact, not a terminal one. */
function isReportNotReady(error: unknown): boolean {
  return error instanceof ZoomError && error.status === 404;
}

export function createAttendanceReconcileHandler(
  deps: AttendanceReconcileDeps = {}
): ZoomJobHandler {
  return async (ctx) => {
    const env = deps.env ?? process.env;
    const now = deps.now ?? (() => Date.now());
    const api = deps.api ?? getZoomApi(env);
    const store = deps.reportStore ?? defaultZoomAttendanceReportStore(env);
    const lookups = deps.matchLookups ?? defaultZoomAttendanceStore(env);

    const meetingId = readMeetingIdFromPayload(ctx.job.payload);
    const meeting = await store.readMeeting(meetingId);
    // Ledger-only outcomes, not errors: a meeting row that vanished, or one whose
    // occurrence never started, has no report to capture and never will through
    // this payload.
    if (meeting === null) return { skipped: 'meeting_not_found' };
    if (meeting.zoomMeetingUuid === null) return { skipped: 'no_occurrence_uuid' };
    const occurrenceUuid = meeting.zoomMeetingUuid;

    const batchId = await store.createPendingBatch({
      schoolId: meeting.schoolId,
      surfaceType: meeting.surfaceType,
      surfaceId: meeting.surfaceId,
      zoomMeetingUuid: occurrenceUuid,
    });

    // ---- 2. Traverse every page, unchanged parameters, nothing written ---------
    const pages: ZoomReportParticipantsPage[] = [];
    try {
      let nextPageToken: string | undefined;
      do {
        if (pages.length >= REPORT_MAX_PAGES) {
          await store.rejectBatch(batchId, 'page_cap_exceeded');
          throw new ZoomRetryableError(
            `attendance_reconcile: pagination did not terminate within ${REPORT_MAX_PAGES} pages.`,
            { operation: 'attendance_reconcile' }
          );
        }
        const page = await api.listReportParticipants(occurrenceUuid, {
          pageSize: REPORT_PAGE_SIZE,
          nextPageToken,
        });
        pages.push(page);
        nextPageToken = page.nextPageToken;
        const alive = await ctx.heartbeat({ stage: 'fetching', pages: pages.length });
        if (!alive) throw new ZoomJobLeaseLostError(ctx.job.id);
      } while (nextPageToken !== '');
    } catch (error) {
      if (error instanceof ZoomJobLeaseLostError) throw error;
      // §15.3.9: any page error or rejected token rejects the ENTIRE candidate. The
      // batch is marked so the failure is visible, then the job retries bounded —
      // a NEW candidate each attempt — and dead-letters onto the health panel.
      await store.rejectBatch(
        batchId,
        `page_fetch_failed: ${error instanceof Error ? error.message : String(error)}`
      );
      if (isReportNotReady(error)) {
        // Zoom generates the report minutes after the meeting ends; 404 now is a
        // timing fact. Terminal-failing here would dead-letter every prompt enqueue.
        throw new ZoomRetryableError('Participant report not yet available for this occurrence.', {
          status: 404,
          operation: 'attendance_reconcile',
        });
      }
      throw error;
    }

    // ---- 3. The completeness rule, over the whole candidate --------------------
    const validation = validateReportBatch(pages);
    if (validation.ok === false) {
      await store.rejectBatch(batchId, validation.reason);
      throw new ZoomRetryableError(
        `attendance_reconcile: candidate batch rejected (${validation.reason}).`,
        { operation: 'attendance_reconcile' }
      );
    }

    // ---- 4. Identity evidence, same hierarchy as the webhook path --------------
    const surface = {
      surfaceType: meeting.surfaceType,
      surfaceId: meeting.surfaceId,
      schoolId: meeting.schoolId,
      zoomMeetingUuid: occurrenceUuid,
    };
    const rows: ReportRowInsert[] = [];
    for (const [index, row] of validation.rows.entries()) {
      if (index > 0 && index % MATCH_HEARTBEAT_EVERY === 0) {
        const alive = await ctx.heartbeat({ stage: 'matching', matched: index });
        if (!alive) throw new ZoomJobLeaseLostError(ctx.job.id);
      }
      const match = await resolveParticipantMatch(lookups, surface, row.identity);
      rows.push({
        userId: match.userId,
        customerKey: row.identity.customerKey,
        displayName: row.identity.displayName,
        transientEmail: row.identity.email,
        matchedBy: match.matchedBy,
        joinedAt: row.joinedAt,
        leftAt: row.leftAt,
        identityTokens: identityTokens(row.identity),
      });
    }

    // ---- 5. Atomic promotion ---------------------------------------------------
    let promoted: Awaited<ReturnType<ZoomAttendanceReportStore['promoteBatch']>>;
    try {
      promoted = await store.promoteBatch({
        batchId,
        rows,
        pageSize: validation.pageSize,
        pageCount: validation.pageCount,
        totalRecords: validation.totalRecords,
        reportFetchedAt: new Date(now()).toISOString(),
      });
    } catch (error) {
      // The function aborted — count mismatch or a constraint refused a row. The
      // batch is still pending; mark it rejected so the candidate is closed out.
      await store.rejectBatch(
        batchId,
        `promotion_failed: ${error instanceof Error ? error.message : String(error)}`
      );
      throw error instanceof ZoomError
        ? error
        : new ZoomRetryableError(
            `attendance_reconcile: promotion failed (${
              error instanceof Error ? error.message : String(error)
            }).`,
            { operation: 'attendance_reconcile' }
          );
    }

    if (promoted === 'batch_not_found') {
      throw new ZoomNonRetryableError('attendance_reconcile: candidate batch row vanished.', {
        operation: 'attendance_reconcile',
      });
    }

    return {
      batch_id: batchId,
      batch: promoted,
      occurrence_uuid: occurrenceUuid,
      pages: pages.length,
      rows: rows.length,
      matched_rows: rows.filter((row) => row.userId !== null).length,
    };
  };
}

/** The registry entry. Built per invocation so it can close over deps in tests. */
export const attendanceReconcileJobHandler: ZoomJobHandler = (ctx) =>
  createAttendanceReconcileHandler()(ctx);
