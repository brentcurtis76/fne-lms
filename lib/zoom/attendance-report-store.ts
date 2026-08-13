/**
 * Persistence seam for Z7-3 report reconciliation (plan §15.3.9).
 *
 * Same structural idiom as `attendance-store.ts`: production speaks `serviceClient`
 * across the two schemas; suites hand in plain objects. Kept SEPARATE from
 * `ZoomAttendanceStore` because the reconcile job is the only caller of the batch
 * machinery, and because this store deliberately has NO interval-write member — a
 * report row reaches `public.zoom_attendance` exclusively through
 * `zoom_internal.promote_attendance_report_batch`, where the rows and the batch's
 * flip to `complete` share one transaction. A client-side row insert here would be
 * a second, non-atomic path to exactly the half-promoted state §15.3.9 forbids.
 *
 * Webhook rows are structurally untouchable from this interface too: no member
 * updates or deletes attendance rows, so "webhook rows are never edited, closed or
 * deleted by reconcile" is a property of the TYPE, not of the job's discipline.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { createZoomServiceClient, zoomInternalSchema } from './service-client';
import type { ZoomSurfaceType } from './db-types';

/** The slice of `zoom_internal.zoom_meetings` the reconcile job reads. */
export interface ReconcileMeeting {
  meetingId: string;
  surfaceType: ZoomSurfaceType;
  surfaceId: string;
  schoolId: number;
  zoomMeetingUuid: string | null;
  status: string;
}

/** One matched report interval, ready for atomic promotion. */
export interface ReportRowInsert {
  userId: string | null;
  customerKey: string | null;
  displayName: string | null;
  transientEmail: string | null;
  matchedBy: string;
  joinedAt: string;
  leftAt: string;
  identityTokens: string[];
}

export interface PromoteBatchInput {
  batchId: string;
  rows: ReportRowInsert[];
  pageSize: number;
  pageCount: number;
  totalRecords: number;
  /** Audit only — authority is the batch's DB-assigned seq + status. */
  reportFetchedAt: string;
}

export type PromoteBatchResult = 'promoted' | 'batch_not_pending' | 'batch_not_found';

/** An occurrence whose report has not yet been captured as a complete batch. */
export interface ReconcileCandidate {
  meetingId: string;
  zoomMeetingUuid: string;
}

export interface ZoomAttendanceReportStore {
  /** The meeting row a job payload names. Reads; never writes. */
  readMeeting(meetingId: string): Promise<ReconcileMeeting | null>;
  /**
   * Opens a candidate batch (`pending`). Its DB-assigned `seq` is minted here, so
   * batch AUTHORITY is decided by the database even though completion comes later.
   * A crash after this point leaves a visible pending row and zero attendance rows.
   */
  createPendingBatch(meeting: {
    schoolId: number;
    surfaceType: ZoomSurfaceType;
    surfaceId: string;
    zoomMeetingUuid: string;
  }): Promise<string>;
  /** Marks a candidate rejected, with the §15.3.9 clause that failed. */
  rejectBatch(batchId: string, reason: string): Promise<void>;
  /** The atomic promotion — rows + flip in one transaction, via the RPC. */
  promoteBatch(input: PromoteBatchInput): Promise<PromoteBatchResult>;
  /**
   * Ended meetings in the window whose occurrence has NO complete batch yet — the
   * enqueue set for `attendance_reconcile`.
   */
  listReconcileCandidates(receivedAfterIso: string, limit: number): Promise<ReconcileCandidate[]>;
}

// ---------------------------------------------------------------------------
// Supabase-backed store
// ---------------------------------------------------------------------------

interface PostgrestError {
  message: string;
  code?: string;
}

interface MeetingRow {
  id: string;
  surface_type: ZoomSurfaceType;
  surface_id: string;
  school_id: number;
  zoom_meeting_uuid: string | null;
  status: string;
}

interface BatchIdRow {
  id: string;
}

interface CandidateMeetingRow {
  id: string;
  zoom_meeting_uuid: string | null;
}

interface CompleteBatchRow {
  zoom_meeting_uuid: string;
}

/** The three read chains this store issues, all hanging off one `eq` filter. */
interface CandidateRangeChain {
  order(column: string, options: { ascending: boolean }): CandidateRangeChain;
  range(from: number, to: number): PromiseLike<{
    data: CandidateMeetingRow[] | null;
    error: PostgrestError | null;
  }>;
}

interface ReportSelectChain {
  maybeSingle(): PromiseLike<{ data: MeetingRow | null; error: PostgrestError | null }>;
  in(
    column: string,
    values: string[]
  ): PromiseLike<{ data: CompleteBatchRow[] | null; error: PostgrestError | null }>;
  gte(
    column: string,
    value: string
  ): CandidateRangeChain;
}

/** The narrow `zoom_internal` surface this store speaks. */
export interface ReportInternalClient {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): ReportSelectChain;
    };
    insert(values: Record<string, unknown>): {
      select(columns: string): {
        single(): PromiseLike<{ data: BatchIdRow | null; error: PostgrestError | null }>;
      };
    };
    update(values: Record<string, unknown>): {
      eq(column: string, value: string): PromiseLike<{ error: PostgrestError | null }>;
    };
  };
  rpc(
    fn: string,
    args: Record<string, unknown>
  ): PromiseLike<{ data: unknown; error: PostgrestError | null }>;
}

const PROMOTE_RESULTS: readonly PromoteBatchResult[] = [
  'promoted',
  'batch_not_pending',
  'batch_not_found',
];

/** Bounded PostgREST page; scanning may continue, but history is never loaded whole. */
export const RECONCILE_CANDIDATE_PAGE_SIZE = 100;

export function createSupabaseAttendanceReportStore(
  internalClient: ReportInternalClient
): ZoomAttendanceReportStore {
  return {
    async readMeeting(meetingId) {
      const { data, error } = await internalClient
        .from('zoom_meetings')
        .select('id, surface_type, surface_id, school_id, zoom_meeting_uuid, status')
        .eq('id', meetingId)
        .maybeSingle();
      if (error) {
        throw new Error(`zoom_meetings reconcile read failed: ${error.message}`);
      }
      if (!data) return null;
      return {
        meetingId: data.id,
        surfaceType: data.surface_type,
        surfaceId: data.surface_id,
        schoolId: data.school_id,
        zoomMeetingUuid: data.zoom_meeting_uuid,
        status: data.status,
      };
    },

    async createPendingBatch(meeting) {
      const { data, error } = await internalClient
        .from('zoom_attendance_report_batches')
        .insert({
          school_id: meeting.schoolId,
          surface_type: meeting.surfaceType,
          surface_id: meeting.surfaceId,
          zoom_meeting_uuid: meeting.zoomMeetingUuid,
          status: 'pending',
        })
        .select('id')
        .single();
      if (error || !data) {
        throw new Error(`report batch insert failed: ${error?.message ?? 'no row returned'}`);
      }
      return data.id;
    },

    async rejectBatch(batchId, reason) {
      const { error } = await internalClient
        .from('zoom_attendance_report_batches')
        .update({ status: 'rejected', rejection_reason: reason, updated_at: new Date().toISOString() })
        .eq('id', batchId);
      if (error) {
        throw new Error(`report batch reject failed: ${error.message}`);
      }
    },

    async promoteBatch(input) {
      const { data, error } = await internalClient.rpc('promote_attendance_report_batch', {
        p_batch_id: input.batchId,
        p_rows: input.rows.map((row) => ({
          user_id: row.userId,
          customer_key: row.customerKey,
          display_name: row.displayName,
          transient_email: row.transientEmail,
          matched_by: row.matchedBy,
          joined_at: row.joinedAt,
          left_at: row.leftAt,
          identity_tokens: row.identityTokens,
        })),
        p_page_size: input.pageSize,
        p_page_count: input.pageCount,
        p_total_records: input.totalRecords,
        p_report_fetched_at: input.reportFetchedAt,
      });
      if (error) {
        throw new Error(`promote_attendance_report_batch failed: ${error.message}`);
      }
      if (
        typeof data !== 'string' ||
        !(PROMOTE_RESULTS as readonly string[]).includes(data)
      ) {
        throw new Error(
          `promote_attendance_report_batch returned an unknown result: ${String(data)}`
        );
      }
      return data as PromoteBatchResult;
    },

    async listReconcileCandidates(receivedAfterIso, limit) {
      if (limit <= 0) return [];

      // PostgREST cannot express the cross-table NOT EXISTS here, so scan bounded,
      // deterministic pages until the requested UNRESOLVED limit is filled. Limiting
      // the meeting query before filtering complete batches starves every occurrence
      // behind a full first page of completed work (Z7-R3).
      const unresolved: ReconcileCandidate[] = [];
      let offset = 0;

      while (unresolved.length < limit) {
        const { data: meetings, error: meetingsError } = await internalClient
          .from('zoom_meetings')
          .select('id, zoom_meeting_uuid')
          .eq('status', 'ended')
          .gte('updated_at', receivedAfterIso)
          .order('updated_at', { ascending: false })
          .order('id', { ascending: true })
          .range(offset, offset + RECONCILE_CANDIDATE_PAGE_SIZE - 1);
        if (meetingsError) {
          throw new Error(`reconcile candidate read failed: ${meetingsError.message}`);
        }

        const page = meetings ?? [];
        const candidates = page.filter(
          (row): row is CandidateMeetingRow & { zoom_meeting_uuid: string } =>
            row.zoom_meeting_uuid !== null
        );

        if (candidates.length > 0) {
          const { data: complete, error: batchesError } = await internalClient
            .from('zoom_attendance_report_batches')
            .select('zoom_meeting_uuid')
            .eq('status', 'complete')
            .in(
              'zoom_meeting_uuid',
              candidates.map((row) => row.zoom_meeting_uuid)
            );
          if (batchesError) {
            throw new Error(`reconcile batch read failed: ${batchesError.message}`);
          }
          const done = new Set((complete ?? []).map((row) => row.zoom_meeting_uuid));
          for (const row of candidates) {
            if (!done.has(row.zoom_meeting_uuid)) {
              unresolved.push({ meetingId: row.id, zoomMeetingUuid: row.zoom_meeting_uuid });
              if (unresolved.length === limit) break;
            }
          }
        }

        if (page.length < RECONCILE_CANDIDATE_PAGE_SIZE) break;
        offset += RECONCILE_CANDIDATE_PAGE_SIZE;
      }

      return unresolved;
    },
  };
}

/** Lazily builds the production store. Never called at module scope. */
export function defaultZoomAttendanceReportStore(
  env: NodeJS.ProcessEnv = process.env,
  clientFactory: (env: NodeJS.ProcessEnv) => SupabaseClient = createZoomServiceClient
): ZoomAttendanceReportStore {
  const client = clientFactory(env);
  return createSupabaseAttendanceReportStore(zoomInternalSchema<ReportInternalClient>(client));
}
