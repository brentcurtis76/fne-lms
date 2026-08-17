/**
 * Persistence seam for the Zoom webhook route (plan §4 webhook architecture, §8
 * lifecycle). Structural on purpose, exactly like `token.ts:ZoomTokenCacheStore`:
 * production speaks `serviceClient.schema('zoom_internal')`, and the route's suite
 * hands in a plain object rather than standing up Postgres.
 *
 * The store is dumb about POLICY — what is a duplicate, when `processed_at` is
 * written, which event types mean anything — and that all lives in the route.
 *
 * It is NOT dumb about ORDER. `setMeetingStatus` / `setProjectionStatus` are
 * conditional UPDATEs whose `WHERE ... status IN (...)` guard is the monotonicity
 * rule itself (Sol F1). An in-process "read the row, decide, write it" check would be
 * a TOCTOU race between the route and a concurrent `webhook_sweep`; expressing the
 * guard as the UPDATE's own predicate makes the two converge no matter which one runs
 * first, because whichever loses simply matches zero rows.
 *
 * Z7-1 moved `setMeetingStatus` from a PostgREST `UPDATE` onto the
 * `zoom_internal.apply_meeting_lifecycle` RPC. The guard did not move: it is still the
 * same predicate inside the same single statement, now sent as `p_applies_from`
 * instead of as a `.in(...)` filter. What the RPC adds is a SET list that can read the
 * existing row, which PostgREST cannot express and which the observed instants need —
 * see the migration `20260811130100_zoom_meeting_actual_instants.sql`.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { createZoomServiceClient, zoomInternalSchema } from './service-client';
import type { SessionMeetingPublicStatus, ZoomSurfaceType } from './db-types';

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

/** The two statuses a lifecycle event can move a meeting to (§8). */
export type ZoomLifecycleStatus = 'started' | 'ended';

/**
 * The monotonicity rule, as the two `WHERE status IN (...)` sets that enforce it.
 *
 * `started` may only overwrite a status that has not yet run its course, so a late or
 * swept `meeting.started` can never reopen a meeting that already `ended` — nor one an
 * operator `cancelled`/`deleted`. That refusal is also what keeps the §9 EXCLUDE
 * predicate (`status IN ('pending','provisioned','started')`) from re-acquiring a host
 * for a window that is over.
 *
 * `ended` may overwrite anything EXCEPT `cancelled`/`deleted` — including `pending`
 * and `provisioned`, because an `ended` that arrives before its `started` (Zoom does
 * not order deliveries) must still land, and including `error`, whose row is not
 * holding a reservation anyway. Both sets contain their own target status, so a
 * duplicate delivery re-applies harmlessly — which is what lets the sweep finish an
 * event the route may or may not have already applied.
 */
export const LIFECYCLE_STARTED_APPLIES_FROM = ['pending', 'provisioned', 'started'] as const;
export const LIFECYCLE_ENDED_APPLIES_FROM = [
  'pending',
  'provisioned',
  'started',
  'ended',
  'error',
] as const;

/**
 * Same rule on the public projection: `live` never overwrites a finished row, and
 * neither status overwrites `cancelled` (a cancelled session's badge is not the
 * lifecycle's to reopen). `scheduled` is the projection's initial value, written by
 * `meeting_provision`; the lifecycle only ever drives it forward from there.
 *
 * DRIFT WARNING (Z1b-sol6). These two sets have SQL twins with no shared code:
 * the `ON CONFLICT ... WHERE` of `zoom_internal.sync_projection_from_meeting`
 * (`supabase/migrations/20260731120000_zoom_provision_rpcs.sql`, section 3) applies
 * the identical rule when `meeting_provision` republishes a projection derived from
 * the internal row. Its `live` arm is this file's `PROJECTION_LIVE_APPLIES_FROM` and
 * its `ended` arm is `PROJECTION_ENDED_APPLIES_FROM`; that function's header carries
 * the reciprocal pointer back here. Change one, change the other.
 */
export const PROJECTION_LIVE_APPLIES_FROM = ['scheduled', 'live'] as const;
export const PROJECTION_ENDED_APPLIES_FROM = ['scheduled', 'live', 'ended'] as const;

/** The two projection statuses the lifecycle drives — never `scheduled`/`cancelled`. */
export type ProjectionLifecycleStatus = Extract<SessionMeetingPublicStatus, 'live' | 'ended'>;

/** Which projection status each lifecycle event drives the projection to (§6/§7). */
export const PROJECTION_STATUS_FOR: Record<ZoomLifecycleStatus, ProjectionLifecycleStatus> = {
  started: 'live',
  ended: 'ended',
};

/** The surface keys a meeting row carries — the projection's own primary key. */
export interface MeetingSurfaceKeys {
  surfaceType: ZoomSurfaceType;
  surfaceId: string;
}

/**
 * The observed instants a lifecycle event offers (§11 quantity (3); Z7-1).
 *
 * BOTH are offered on `meeting.ended`, because that event's payload states when the
 * occurrence began as well as when it finished — and when Zoom delivers `ended`
 * before `started` (it does not order deliveries), the `started` that follows is
 * refused by the monotonicity guard and would otherwise never record its instant.
 * The RPC fills each column only while it is NULL, so offering a value the row
 * already holds is inert.
 */
export interface LifecycleInstants {
  actualStartedAt: string | null;
  actualEndedAt: string | null;
}

/**
 * What a guarded transition did.
 *
 * `applied: false` is the ordinary refusal (the row is already past this status), not
 * an error — the caller marks the event processed either way, because "applied to no
 * effect, deliberately" is still applied.
 */
export interface LifecycleTransition {
  applied: boolean;
  /** Non-null only when the transition applied — it comes from the UPDATE's RETURNING. */
  surface: MeetingSurfaceKeys | null;
}

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
   * Applies a lifecycle transition through `zoom_internal.apply_meeting_lifecycle` —
   * ONE atomic statement whose `WHERE ... status = ANY (applies_from)` is the
   * monotonicity guard, never a read-then-write in this process. The set is sent from
   * here so the exported constants above stay the single source of truth.
   *
   * `occurrenceUuid` is written ONLY when non-null, so an event that omits it cannot
   * blank a uuid an earlier event captured.
   *
   * `instants` (Z7-1, C6 amendment) ride the SAME statement, so neither can be written
   * for a transition the guard refused, and the RPC's `COALESCE(existing, offered)`
   * fills each column only while NULL — a swept or out-of-order replay is inert.
   * Optional so the existing three-argument test doubles remain valid.
   *
   * Returns the row's surface keys when (and only when) the transition applied, so the
   * caller can move the projection with it without a second lookup.
   */
  setMeetingStatus(
    meetingId: string,
    status: ZoomLifecycleStatus,
    occurrenceUuid: string | null,
    instants?: LifecycleInstants
  ): Promise<LifecycleTransition>;
  /**
   * Moves `public.session_meetings_public.meeting_status` under the same monotonic
   * guard. A surface with no projection row — a meeting created outside the LMS, or
   * one whose projection the provisioner has not written yet — matches zero rows and
   * is a silent no-op, which is the correct outcome for both.
   */
  setProjectionStatus(
    surface: MeetingSurfaceKeys,
    status: ProjectionLifecycleStatus
  ): Promise<void>;
}

/** A ledger row the sweep has to finish. `raw_payload` is null once scrubbed. */
export interface UnappliedWebhookEvent {
  dedupe_key: string;
  event_type: string;
  raw_payload: Record<string, unknown> | null;
}

/**
 * The route's contract plus the one query only the `webhook_sweep` job needs.
 *
 * Deliberately a SEPARATE interface rather than two more methods on
 * `ZoomWebhookStore`: the route neither needs nor should be able to reach a bulk scan
 * of the ledger, and widening the base interface would force every route test double
 * to implement a method the route never calls.
 */
export interface ZoomWebhookSweepStore extends ZoomWebhookStore {
  /**
   * Ledger rows with `processed_at IS NULL` received before `receivedBeforeIso`,
   * oldest first, capped at `limit`. The age floor is what keeps the sweep from
   * racing a delivery the route is still handling right now.
   */
  listUnappliedEvents(receivedBeforeIso: string, limit: number): Promise<UnappliedWebhookEvent[]>;
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

/** What the guarded status UPDATE returns: zero rows = the guard refused it. */
interface MeetingSurfaceRow {
  surface_type: ZoomSurfaceType;
  surface_id: string;
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
      is(
        column: string,
        value: null
      ): {
        lt(
          column: string,
          value: string
        ): {
          order(
            column: string,
            options: { ascending: boolean }
          ): {
            limit(count: number): PromiseLike<{
              data: UnappliedWebhookEvent[] | null;
              error: PostgrestError | null;
            }>;
          };
        };
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
      eq(column: string, value: string | number): PromiseLike<{ error: PostgrestError | null }>;
    };
  };
  /**
   * The guarded lifecycle transition. Declared here rather than on a shared client
   * type because this store is its only caller — the same one-honest-interface rule
   * `service-client.ts` states for `.from()`.
   */
  rpc(
    fn: string,
    args: Record<string, unknown>
  ): PromiseLike<{ data: MeetingSurfaceRow[] | null; error: PostgrestError | null }>;
}

/**
 * The `public` half — one table, one guarded UPDATE. Separate from
 * `WebhookSchemaClient` because it speaks the DEFAULT schema: the projection lives in
 * `public` precisely so the UI can read it, and `zoomInternalSchema()` would point it
 * at a table that does not exist there.
 */
export interface WebhookPublicClient {
  from(table: string): {
    update(values: Record<string, unknown>): {
      eq(
        column: string,
        value: string
      ): {
        eq(
          column: string,
          value: string
        ): {
          in(
            column: string,
            values: readonly string[]
          ): PromiseLike<{ error: PostgrestError | null }>;
        };
      };
    };
  };
}

export function createSupabaseWebhookStore(
  client: WebhookSchemaClient,
  publicClient: WebhookPublicClient
): ZoomWebhookSweepStore {
  return {
    async listUnappliedEvents(receivedBeforeIso, limit) {
      const { data, error } = await client
        .from('zoom_webhook_events')
        .select('dedupe_key, event_type, raw_payload')
        .is('processed_at', null)
        .lt('received_at', receivedBeforeIso)
        .order('received_at', { ascending: true })
        .limit(limit);

      if (error) {
        throw new Error(`zoom_webhook_events sweep read failed: ${error.message}`);
      }
      return data ?? [];
    },

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

    async setMeetingStatus(meetingId, status, occurrenceUuid, instants) {
      // `p_applies_from` IS the monotonicity guard, evaluated by Postgres inside the
      // function's single UPDATE — so a route and a sweep racing on the same meeting
      // cannot both win. It is sent from here, rather than hard-coded in SQL, so the
      // exported sets above remain the one definition of the rule.
      //
      // The offered instants are filled by the function only while the column is NULL,
      // which is why a null here is a no-op rather than a blanking write.
      //
      // Rows returned = applied; zero rows = the row was already past this status and
      // nothing was written.
      const { data, error } = await client.rpc('apply_meeting_lifecycle', {
        p_meeting_id: meetingId,
        p_status: status,
        p_applies_from: [
          ...(status === 'started'
            ? LIFECYCLE_STARTED_APPLIES_FROM
            : LIFECYCLE_ENDED_APPLIES_FROM),
        ],
        p_occurrence_uuid: occurrenceUuid,
        p_actual_started_at: instants?.actualStartedAt ?? null,
        p_actual_ended_at: instants?.actualEndedAt ?? null,
      });

      if (error) {
        throw new Error(`zoom_meetings status update failed: ${error.message}`);
      }
      const row = data && data.length > 0 ? data[0] : null;
      return {
        applied: row !== null,
        surface:
          row === null ? null : { surfaceType: row.surface_type, surfaceId: row.surface_id },
      };
    },

    async setProjectionStatus(surface, status) {
      const { error } = await publicClient
        .from('session_meetings_public')
        .update({ meeting_status: status, updated_at: new Date().toISOString() })
        .eq('surface_type', surface.surfaceType)
        .eq('surface_id', surface.surfaceId)
        .in(
          'meeting_status',
          status === 'live' ? PROJECTION_LIVE_APPLIES_FROM : PROJECTION_ENDED_APPLIES_FROM
        );

      if (error) {
        throw new Error(`session_meetings_public status update failed: ${error.message}`);
      }
    },
  };
}

/** Lazily builds the production store. Never called at module scope. */
export function defaultZoomWebhookStore(
  env: NodeJS.ProcessEnv = process.env,
  clientFactory: (env: NodeJS.ProcessEnv) => SupabaseClient = createZoomServiceClient
): ZoomWebhookSweepStore {
  const client = clientFactory(env);
  return createSupabaseWebhookStore(
    zoomInternalSchema<WebhookSchemaClient>(client),
    client as unknown as WebhookPublicClient
  );
}
