/**
 * Persistence seam for the Zoom webhook route (plan §4 webhook architecture, §8
 * lifecycle). Structural on purpose, exactly like `token.ts:ZoomTokenCacheStore`:
 * production speaks `serviceClient.schema('zoom_internal')`, and the route's suite
 * hands in a plain object rather than standing up Postgres.
 *
 * The store is deliberately dumb. Every decision that matters — what is a duplicate,
 * which statuses a lifecycle event applies, when `processed_at` is written — lives in
 * the route, where it is testable without a database.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { createZoomServiceClient, zoomInternalSchema } from './service-client';

/** The columns the route writes to `zoom_internal.zoom_webhook_events`. */
export interface ZoomWebhookEventInsert {
  dedupe_key: string;
  event_type: string;
  /** `payload.object.uuid` when the event carries one; null otherwise. */
  zoom_meeting_uuid: string | null;
  raw_payload: Record<string, unknown>;
}

/** Outcome of the idempotent ledger insert. */
export type LedgerWriteResult = 'inserted' | 'duplicate';

export interface ZoomWebhookStore {
  /**
   * `INSERT ... ON CONFLICT (dedupe_key) DO NOTHING`. `'duplicate'` means Zoom
   * retried a body we already hold — the absorbed replay the §3 dedupe ledger exists
   * for. Throws on any other database error (the route answers 500 and Zoom retries).
   */
  recordEvent(event: ZoomWebhookEventInsert): Promise<LedgerWriteResult>;
  /**
   * `processed_at` of an existing ledger row: a timestamp when the event was already
   * applied, `null` when it was recorded but never applied, `undefined` when no row
   * exists. The route uses the `null` case to finish a replay whose first delivery
   * died between the insert and the application.
   */
  readProcessedAt(dedupeKey: string): Promise<string | null | undefined>;
  markProcessed(dedupeKey: string, processedAt: string): Promise<void>;
  /** `zoom_internal.zoom_meetings.id` for a meeting number, or null when unknown. */
  findMeetingIdByNumber(meetingNumber: number): Promise<string | null>;
  /**
   * Applies a lifecycle transition. `occurrenceUuid` is written ONLY when non-null,
   * so an event that omits it cannot blank a uuid an earlier event captured.
   */
  setMeetingStatus(
    meetingId: string,
    status: 'started' | 'ended',
    occurrenceUuid: string | null
  ): Promise<void>;
}

// ---------------------------------------------------------------------------
// Supabase-backed store
// ---------------------------------------------------------------------------

interface PostgrestError {
  message: string;
}

interface WebhookEventIdRow {
  id: string;
}

interface WebhookEventProcessedRow {
  processed_at: string | null;
}

interface MeetingIdRow {
  id: string;
}

/**
 * Minimal structural view of the supabase-js surface this store uses — the ONLY
 * untyped boundary in the module. See `service-client.ts` for why the cast exists.
 */
export interface WebhookSchemaClient {
  from(table: string): {
    select(columns: string): {
      eq(
        column: string,
        value: string | number
      ): {
        maybeSingle(): PromiseLike<{
          data: WebhookEventProcessedRow | MeetingIdRow | null;
          error: PostgrestError | null;
        }>;
      };
    };
    upsert(
      values: Record<string, unknown>,
      options: { onConflict: string; ignoreDuplicates: boolean }
    ): {
      select(columns: string): PromiseLike<{
        data: WebhookEventIdRow[] | null;
        error: PostgrestError | null;
      }>;
    };
    update(values: Record<string, unknown>): {
      eq(
        column: string,
        value: string | number
      ): PromiseLike<{ error: PostgrestError | null }>;
    };
  };
}

export function createSupabaseWebhookStore(client: WebhookSchemaClient): ZoomWebhookStore {
  return {
    async recordEvent(event) {
      // `ignoreDuplicates: true` is PostgREST's ON CONFLICT DO NOTHING. The
      // `.select()` is what makes the outcome observable: a conflict returns zero
      // rows rather than an error, so a retry is not a failure path.
      const { data, error } = await client
        .from('zoom_webhook_events')
        .upsert(
          {
            dedupe_key: event.dedupe_key,
            event_type: event.event_type,
            zoom_meeting_uuid: event.zoom_meeting_uuid,
            raw_payload: event.raw_payload,
          },
          { onConflict: 'dedupe_key', ignoreDuplicates: true }
        )
        .select('id');

      if (error) {
        throw new Error(`zoom_webhook_events insert failed: ${error.message}`);
      }
      return data && data.length > 0 ? 'inserted' : 'duplicate';
    },

    async readProcessedAt(dedupeKey) {
      const { data, error } = await client
        .from('zoom_webhook_events')
        .select('processed_at')
        .eq('dedupe_key', dedupeKey)
        .maybeSingle();

      if (error) {
        throw new Error(`zoom_webhook_events read failed: ${error.message}`);
      }
      if (!data) return undefined;
      return (data as WebhookEventProcessedRow).processed_at ?? null;
    },

    async markProcessed(dedupeKey, processedAt) {
      const { error } = await client
        .from('zoom_webhook_events')
        .update({ processed_at: processedAt })
        .eq('dedupe_key', dedupeKey);

      if (error) {
        throw new Error(`zoom_webhook_events processed_at update failed: ${error.message}`);
      }
    },

    async findMeetingIdByNumber(meetingNumber) {
      const { data, error } = await client
        .from('zoom_meetings')
        .select('id')
        .eq('zoom_meeting_number', meetingNumber)
        .maybeSingle();

      if (error) {
        throw new Error(`zoom_meetings lookup failed: ${error.message}`);
      }
      return data ? (data as MeetingIdRow).id : null;
    },

    async setMeetingStatus(meetingId, status, occurrenceUuid) {
      const patch: Record<string, unknown> = {
        status,
        updated_at: new Date().toISOString(),
      };
      // Only written when present. A `meeting.ended` that omitted the uuid must not
      // erase the occurrence uuid `meeting.started` captured.
      if (occurrenceUuid !== null) {
        patch.zoom_meeting_uuid = occurrenceUuid;
      }

      const { error } = await client.from('zoom_meetings').update(patch).eq('id', meetingId);
      if (error) {
        throw new Error(`zoom_meetings status update failed: ${error.message}`);
      }
    },
  };
}

/** Lazily builds the production store. Never called at module scope. */
export function defaultZoomWebhookStore(
  env: NodeJS.ProcessEnv = process.env,
  clientFactory: (env: NodeJS.ProcessEnv) => SupabaseClient = createZoomServiceClient
): ZoomWebhookStore {
  return createSupabaseWebhookStore(
    zoomInternalSchema<WebhookSchemaClient>(clientFactory(env))
  );
}
