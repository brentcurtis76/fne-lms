/**
 * The effective attendance set for an occurrence (plan §15.3.9; Z7-3/Z7-5).
 *
 * Supersession is a READ-TIME rule, on purpose: "the complete report supersedes
 * webhook attendance wholesale per occurrence" while "webhook rows are never edited,
 * closed or deleted by reconcile". So nothing is merged and nothing is rewritten —
 * this module simply answers WHICH rows count:
 *
 *   · the rows of the HIGHEST-seq `complete` batch, when one exists — the report is
 *     authoritative and the webhook rows become audit history;
 *   · else the webhook rows, marked PROVISIONAL — the §15.3.9 delay/absence rule,
 *     which Z7-5 must render as a state, never as a settled number;
 *   · never a union, and never a row matched across sources — no cross-source key
 *     exists (§6.2: report rows carry no participant_uuid), and inventing one is
 *     the indistinguishability defect the contract removed.
 *
 * Presence totals over the returned rows come from `attendance-intervals.ts` — the
 * same pure merge both sources share, which is why reconnects cannot double-count
 * whichever source is effective.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { createZoomServiceClient, zoomInternalSchema } from './service-client';
import type { AttendanceMatchedBy } from './attendance-identity';

/** One effective interval, whichever source supplied it. */
export interface EffectiveAttendanceRow {
  id: string;
  userId: string | null;
  customerKey: string | null;
  displayName: string | null;
  transientEmail: string | null;
  matchedBy: AttendanceMatchedBy;
  joinedAt: string;
  /** Null only ever on the webhook source — report rows are closed by CHECK. */
  leftAt: string | null;
  source: 'webhook' | 'report';
}

export interface EffectiveAttendance {
  /** `none`: no rows from either source — an occurrence nothing was observed for. */
  source: 'report' | 'webhook' | 'none';
  /**
   * True unless a complete report batch is effective. Provisional data renders as a
   * STATE in Z7-5 ("datos provisionales de webhook"), never as a settled number.
   */
  provisional: boolean;
  /** The winning batch, when the report is effective. */
  batchId: string | null;
  rows: EffectiveAttendanceRow[];
}

export interface AttendanceEffectiveStore {
  /** The highest-seq COMPLETE batch for the occurrence, or null. */
  findWinningBatchId(occurrenceUuid: string): Promise<string | null>;
  /** The report rows of exactly that batch. */
  listReportRows(occurrenceUuid: string, batchId: string): Promise<EffectiveAttendanceRow[]>;
  /** The webhook rows of the occurrence. */
  listWebhookRows(occurrenceUuid: string): Promise<EffectiveAttendanceRow[]>;
}

export async function resolveEffectiveAttendance(
  store: AttendanceEffectiveStore,
  occurrenceUuid: string
): Promise<EffectiveAttendance> {
  const batchId = await store.findWinningBatchId(occurrenceUuid);
  if (batchId !== null) {
    return {
      source: 'report',
      provisional: false,
      batchId,
      rows: await store.listReportRows(occurrenceUuid, batchId),
    };
  }
  const rows = await store.listWebhookRows(occurrenceUuid);
  return {
    source: rows.length > 0 ? 'webhook' : 'none',
    provisional: true,
    batchId: null,
    rows,
  };
}

// ---------------------------------------------------------------------------
// Supabase-backed store
// ---------------------------------------------------------------------------

interface PostgrestError {
  message: string;
  code?: string;
}

interface WinningBatchRow {
  id: string;
}

interface AttendanceRow {
  id: string;
  user_id: string | null;
  customer_key: string | null;
  display_name: string | null;
  transient_email: string | null;
  matched_by: AttendanceMatchedBy;
  joined_at: string;
  left_at: string | null;
  source: 'webhook' | 'report';
}

export interface EffectiveInternalClient {
  from(table: string): {
    select(columns: string): {
      eq(
        column: string,
        value: string
      ): {
        eq(
          column: string,
          value: string
        ): {
          order(
            column: string,
            options: { ascending: boolean }
          ): {
            limit(count: number): PromiseLike<{
              data: WinningBatchRow[] | null;
              error: PostgrestError | null;
            }>;
          };
        };
      };
    };
  };
}

export interface EffectivePublicClient {
  from(table: string): {
    select(columns: string): {
      eq(
        column: string,
        value: string
      ): {
        eq(
          column: string,
          value: string
        ): {
          order(
            column: string,
            options: { ascending: boolean }
          ): PromiseLike<{ data: AttendanceRow[] | null; error: PostgrestError | null }>;
        };
      };
    };
  };
}

function toEffectiveRow(row: AttendanceRow): EffectiveAttendanceRow {
  return {
    id: row.id,
    userId: row.user_id,
    customerKey: row.customer_key,
    displayName: row.display_name,
    transientEmail: row.transient_email,
    matchedBy: row.matched_by,
    joinedAt: row.joined_at,
    leftAt: row.left_at,
    source: row.source,
  };
}

export function createSupabaseAttendanceEffectiveStore(
  internalClient: EffectiveInternalClient,
  publicClient: EffectivePublicClient
): AttendanceEffectiveStore {
  return {
    async findWinningBatchId(occurrenceUuid) {
      const { data, error } = await internalClient
        .from('zoom_attendance_report_batches')
        .select('id')
        .eq('zoom_meeting_uuid', occurrenceUuid)
        .eq('status', 'complete')
        .order('seq', { ascending: false })
        .limit(1);
      if (error) {
        throw new Error(`winning batch lookup failed: ${error.message}`);
      }
      return data && data.length > 0 ? data[0].id : null;
    },

    async listReportRows(occurrenceUuid, batchId) {
      const { data, error } = await publicClient
        .from('zoom_attendance')
        .select(
          'id, user_id, customer_key, display_name, transient_email, matched_by, joined_at, left_at, source'
        )
        .eq('zoom_meeting_uuid', occurrenceUuid)
        .eq('report_batch_id', batchId)
        .order('joined_at', { ascending: true });
      if (error) {
        throw new Error(`report row read failed: ${error.message}`);
      }
      return (data ?? []).map(toEffectiveRow);
    },

    async listWebhookRows(occurrenceUuid) {
      const { data, error } = await publicClient
        .from('zoom_attendance')
        .select(
          'id, user_id, customer_key, display_name, transient_email, matched_by, joined_at, left_at, source'
        )
        .eq('zoom_meeting_uuid', occurrenceUuid)
        .eq('source', 'webhook')
        .order('joined_at', { ascending: true });
      if (error) {
        throw new Error(`webhook row read failed: ${error.message}`);
      }
      return (data ?? []).map(toEffectiveRow);
    },
  };
}

/** Lazily builds the production store. Never called at module scope. */
export function defaultAttendanceEffectiveStore(
  env: NodeJS.ProcessEnv = process.env,
  clientFactory: (env: NodeJS.ProcessEnv) => SupabaseClient = createZoomServiceClient
): AttendanceEffectiveStore {
  const client = clientFactory(env);
  return createSupabaseAttendanceEffectiveStore(
    zoomInternalSchema<EffectiveInternalClient>(client),
    client as unknown as EffectivePublicClient
  );
}
