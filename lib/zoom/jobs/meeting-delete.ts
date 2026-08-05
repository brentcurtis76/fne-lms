/**
 * `meeting_delete` — takes a managed meeting off Zoom when its session is cancelled or
 * stops being remote (plan §8 lifecycle, §9 host reservation, §12 at-least-once).
 *
 * Before this handler existed a cancelled session left a live meeting on a booked host
 * forever: the `zoom_meetings` row kept an ACTIVE status, so the §9 EXCLUDE constraint
 * went on reserving that host for a window nobody would use, and the public projection
 * went on advertising a joinable meeting.
 *
 * Three steps, and the ORDER is the opposite of `meeting_sync`'s:
 *
 *  1. Zoom, by DELETE
 *  2. the internal row → `deleted`, which drops it out of `ZOOM_MEETING_ACTIVE_STATUSES`
 *     and therefore releases the host reservation
 *  3. the projection, through `sync_projection_from_meeting`, which maps
 *     `deleted → cancelled` — so the Z2-2a join endpoint answers 410
 *
 * Zoom first here because the desired end state is "no meeting", and there is no
 * constraint that can refuse step 2: `deleted` only ever RELEASES a reservation. Crashing
 * between 1 and 2 is safe and self-healing — the retry's DELETE answers 404, which is
 * success (below), and the remaining steps run.
 *
 * ## A Zoom 404 on delete is SUCCESS (PM ruling 2)
 *
 * The meeting is gone; that is precisely the state being asked for. Treating it as a
 * failure would dead-letter the job and leave the projection permanently stale —
 * advertising a joinable meeting that does not exist, which is the exact opposite of the
 * goal. So a 404 completes the job, moves the row terminal and publishes. `meeting_sync`
 * treats the same status as a terminal failure, and that asymmetry is the point: there,
 * a missing meeting means we have lost track of one; here, it means the work is done.
 *
 * ## The one row it refuses to release
 *
 * A `zoom_meetings` row with NO meeting number that is parked under
 * `ambiguous_create_outcome` is not an empty reservation — it is a reservation held
 * BECAUSE a meeting may exist at Zoom under a number nobody could read
 * (`meeting-provision.ts`, Sol F4). `meeting_provision`'s own eligibility path refuses to
 * release such a row for that reason, and so does this handler: releasing it would free a
 * host that may genuinely be occupied. It fails non-retryably instead, and the resolution
 * is the one already documented on the park — a human reconciles against Zoom.
 *
 * ## Idempotent by construction (§12)
 *
 * Everything here converges: DELETE on an already-deleted meeting answers 404 (success),
 * the row transition is a set-to-constant, and the projection RPC is monotonic and
 * refuses to move backwards. A redelivered job produces the same world as the first.
 */
import { getZoomApi, type ZoomApi } from '../api';
import { isZoomError, ZoomNonRetryableError } from '../errors';
import { createZoomServiceClient, zoomInternalSchema } from '../service-client';
import { ZoomJobLeaseLostError, type ZoomJobHandler } from './types';
import {
  isAmbiguousCreateMarker,
  type ProjectionSyncOutcome,
  type ProvisionMeetingRow,
  type ProvisionSessionRow,
} from './meeting-provision';
import type { ZoomSurfaceType } from '../db-types';
import type { SupabaseClient } from '@supabase/supabase-js';

/** The operation name every failure from this module carries. */
const OPERATION = 'meeting_delete';

/**
 * The terminal status a deleted meeting lands on. `deleted` rather than `cancelled`
 * because the meeting was genuinely removed at Zoom — `cancelled` is what a released
 * reservation that never reached Zoom gets. `sync_projection_from_meeting` maps BOTH to
 * the public `cancelled`, so the badge and the 410 are identical either way; the internal
 * distinction is what makes the row an honest record of what happened.
 */
export const DELETED_MEETING_STATUS = 'deleted' as const;

// ---------------------------------------------------------------------------
// Failure taxonomy
// ---------------------------------------------------------------------------

/** The surface's session row is gone, so the projection cannot be published correctly. */
export class ZoomDeleteSessionMissingError extends ZoomNonRetryableError {
  readonly reason = 'session_missing';

  constructor(surfaceId: string) {
    super(`meeting_delete found no consultor_session ${surfaceId}.`, { operation: OPERATION });
  }
}

/** The `reason` a delete against a surface with no `zoom_meetings` row fails under. */
export const NO_MEETING_ROW_REASON = 'no_meeting_row';

/**
 * There is no internal row for this surface (PM ruling 6). Terminal, and it writes
 * nothing.
 *
 * Not silently treated as "already clean": a cancel enqueues this job only for a session
 * whose durable managed intent is set, so a missing row means either the provisioner
 * never ran or the row was removed under us. Both are worth a human seeing, and neither
 * is improved by a retry.
 */
export class ZoomDeleteMeetingRowMissingError extends ZoomNonRetryableError {
  readonly reason = NO_MEETING_ROW_REASON;

  constructor(surfaceId: string) {
    super(`meeting_delete found no zoom_meetings row for consultor_session ${surfaceId}.`, {
      operation: OPERATION,
    });
  }
}

/** The `reason` a delete against an unresolved ambiguous-create park is refused under. */
export const AMBIGUOUS_PARK_REASON = 'delete_ambiguous_parked';

/**
 * The row is a numberless reservation parked by an unresolved ambiguous create. Terminal,
 * and it writes NOTHING — not the row, not Zoom. See the module header: the reservation
 * is protecting a host against a meeting that MAY exist under an unknown number, and
 * releasing it on the strength of a cancellation would undo the one safety that park has.
 */
export class ZoomDeleteAmbiguousParkedError extends ZoomNonRetryableError {
  readonly reason = AMBIGUOUS_PARK_REASON;
  readonly evidence: { meeting_id: string };

  constructor(meetingId: string) {
    super(
      `meeting_delete refused zoom_meetings ${meetingId}: an unresolved ambiguous create still holds this reservation.`,
      { operation: OPERATION }
    );
    this.evidence = { meeting_id: meetingId };
  }
}

/**
 * The projection republish came back `missing` or `not_publishable` after the row was
 * moved terminal. Terminal, on the Sol R7 ② precedent — the row is `deleted` by then, so
 * both outcomes mean something changed underneath us and a human should see it rather
 * than a green job hiding a projection that still advertises a joinable meeting.
 */
export class ZoomDeleteProjectionAnomalyError extends ZoomNonRetryableError {
  readonly reason: 'sync_missing_row' | 'sync_not_publishable';
  readonly evidence: {
    meeting_id: string;
    zoom_meeting_number: number | null;
    sync_outcome: 'missing' | 'not_publishable';
  };

  constructor(
    outcome: 'missing' | 'not_publishable',
    meetingId: string,
    zoomMeetingNumber: number | null
  ) {
    super(
      `meeting_delete republished the projection for zoom_meetings ${meetingId} and got '${outcome}'.`,
      { operation: OPERATION }
    );
    this.reason = outcome === 'missing' ? 'sync_missing_row' : 'sync_not_publishable';
    this.evidence = {
      meeting_id: meetingId,
      zoom_meeting_number: zoomMeetingNumber,
      sync_outcome: outcome,
    };
  }
}

// ---------------------------------------------------------------------------
// Store seam
// ---------------------------------------------------------------------------

export interface MeetingDeleteStore {
  readSession(surfaceId: string): Promise<ProvisionSessionRow | null>;
  findMeetingBySurface(
    surfaceType: ZoomSurfaceType,
    surfaceId: string
  ): Promise<ProvisionMeetingRow | null>;
  /**
   * Moves the row to `deleted`. Outside `ZOOM_MEETING_ACTIVE_STATUSES`, so the §9 EXCLUDE
   * predicate stops covering it and the host slot is freed. Never raises 23P01: leaving a
   * constraint's WHERE clause cannot conflict with anything.
   */
  markMeetingDeleted(meetingId: string, lastError: string | null): Promise<void>;
  /** The guarded, never-backward projection publish. Never a hand-written upsert. */
  syncProjectionFromMeeting(
    meetingId: string,
    growthCommunityId: string | null
  ): Promise<ProjectionSyncOutcome>;
}

interface PostgrestError {
  message: string;
  code?: string;
}

type PostgrestResult<T> = PromiseLike<{ data: T | null; error: PostgrestError | null }>;

/** The ONLY untyped boundaries in this module. See `service-client.ts`. */
export interface MeetingDeletePublicClient {
  from(table: string): {
    select(columns: string): {
      eq(
        column: string,
        value: string | number
      ): { maybeSingle(): PostgrestResult<Record<string, unknown>> };
    };
  };
}

export interface MeetingDeleteInternalClient {
  rpc(
    fn: string,
    args: Record<string, unknown>
  ): PromiseLike<{ data: unknown; error: PostgrestError | null }>;
  from(table: string): {
    select(columns: string): {
      eq(
        column: string,
        value: string | number
      ): {
        eq(
          column: string,
          value: string | number
        ): { maybeSingle(): PostgrestResult<Record<string, unknown>> };
      };
    };
    update(values: Record<string, unknown>): {
      eq(column: string, value: string | number): PromiseLike<{ error: PostgrestError | null }>;
    };
  };
}

export function createSupabaseMeetingDeleteStore(
  publicClient: MeetingDeletePublicClient,
  internalClient: MeetingDeleteInternalClient
): MeetingDeleteStore {
  return {
    async readSession(surfaceId) {
      const { data, error } = await publicClient
        .from('consultor_sessions')
        .select(
          'id, school_id, growth_community_id, title, session_date, start_time, end_time, scheduled_duration_minutes, status, is_active, modality, meeting_provider, is_zoom_managed'
        )
        .eq('id', surfaceId)
        .maybeSingle();
      if (error) throw new Error(`consultor_sessions read failed: ${error.message}`);
      return (data as unknown as ProvisionSessionRow) ?? null;
    },

    async findMeetingBySurface(surfaceType, surfaceId) {
      const { data, error } = await internalClient
        .from('zoom_meetings')
        .select(
          'id, status, host_zoom_user_id, zoom_meeting_number, effective_settings, starts_at, duration_minutes, last_error'
        )
        .eq('surface_type', surfaceType)
        .eq('surface_id', surfaceId)
        .maybeSingle();
      if (error) throw new Error(`zoom_meetings lookup failed: ${error.message}`);
      return (data as unknown as ProvisionMeetingRow) ?? null;
    },

    async markMeetingDeleted(meetingId, lastError) {
      const { error } = await internalClient
        .from('zoom_meetings')
        .update({
          status: DELETED_MEETING_STATUS,
          last_error: lastError,
          updated_at: new Date().toISOString(),
        })
        .eq('id', meetingId);
      if (error) throw new Error(`zoom_meetings delete transition failed: ${error.message}`);
    },

    async syncProjectionFromMeeting(meetingId, growthCommunityId) {
      const { data, error } = await internalClient.rpc('sync_projection_from_meeting', {
        p_meeting_id: meetingId,
        p_growth_community_id: growthCommunityId,
      });
      if (error) throw new Error(`sync_projection_from_meeting failed: ${error.message}`);
      if (
        data === 'published' ||
        data === 'blocked' ||
        data === 'not_publishable' ||
        data === 'missing'
      ) {
        return data;
      }
      throw new Error(`sync_projection_from_meeting returned an unknown outcome: ${String(data)}`);
    },
  };
}

export function defaultMeetingDeleteStore(
  env: NodeJS.ProcessEnv = process.env,
  clientFactory: (env: NodeJS.ProcessEnv) => SupabaseClient = createZoomServiceClient
): MeetingDeleteStore {
  const client = clientFactory(env);
  return createSupabaseMeetingDeleteStore(
    client as unknown as MeetingDeletePublicClient,
    zoomInternalSchema<MeetingDeleteInternalClient>(client)
  );
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export interface MeetingDeleteDeps {
  api?: ZoomApi;
  store?: MeetingDeleteStore;
  env?: NodeJS.ProcessEnv;
}

export interface MeetingDeleteResult extends Record<string, unknown> {
  meeting_id: string;
  /** `null` when the row never reached Zoom — a bare reservation being released. */
  zoom_meeting_number: number | null;
  /** Did THIS run call Zoom's DELETE and get an answer other than 404? */
  deleted: boolean;
  /** Zoom answered 404: the meeting was already gone. Success — see the module header. */
  zoom_missing: boolean;
  projection: ProjectionSyncOutcome;
}

interface DeletePayload {
  surface_type: ZoomSurfaceType;
  surface_id: string;
}

/** Community surfaces arrive in Z6; until then anything else is a programming error. */
function readPayload(payload: Record<string, unknown>): DeletePayload {
  const surfaceType = payload.surface_type;
  const surfaceId = payload.surface_id;

  if (surfaceType !== 'consultor_session') {
    throw new ZoomNonRetryableError(
      `meeting_delete supports surface_type 'consultor_session' only; received '${String(surfaceType)}'.`,
      { operation: OPERATION }
    );
  }
  if (typeof surfaceId !== 'string' || surfaceId === '') {
    throw new ZoomNonRetryableError('meeting_delete payload is missing surface_id.', {
      operation: OPERATION,
    });
  }
  return { surface_type: surfaceType, surface_id: surfaceId };
}

export function createMeetingDeleteHandler(deps: MeetingDeleteDeps = {}): ZoomJobHandler {
  return async (ctx) => {
    const env = deps.env ?? process.env;
    const { surface_type: surfaceType, surface_id: surfaceId } = readPayload(ctx.job.payload);

    const store = deps.store ?? defaultMeetingDeleteStore(env);

    // The session is read for `growth_community_id`, which the projection carries. NOT
    // for eligibility: this job exists precisely for sessions that have STOPPED being
    // eligible — cancelled, or flipped to `presencial`.
    const session = await store.readSession(surfaceId);
    if (session === null) throw new ZoomDeleteSessionMissingError(surfaceId);

    const row = await store.findMeetingBySurface(surfaceType, surfaceId);
    if (row === null) throw new ZoomDeleteMeetingRowMissingError(surfaceId);

    // The one reservation this handler must not free. See the module header.
    if (row.zoom_meeting_number === null && isAmbiguousCreateMarker(row.last_error)) {
      throw new ZoomDeleteAmbiguousParkedError(row.id);
    }

    // Everything above is reads; a worker that has lost its lease writes nothing.
    if (!(await ctx.heartbeat())) throw new ZoomJobLeaseLostError(ctx.job.id);

    let deleted = false;
    let zoomMissing = false;

    // A row with no number never reached Zoom — there is nothing to delete, only a
    // reservation to release. A row already `deleted` has been here before; the DELETE
    // would answer 404 anyway, so the round trip is skipped rather than replayed.
    if (row.zoom_meeting_number !== null && row.status !== DELETED_MEETING_STATUS) {
      const api = deps.api ?? getZoomApi(env);
      try {
        await api.deleteMeeting(row.zoom_meeting_number);
        deleted = true;
      } catch (error: unknown) {
        // PM ruling 2: a 404 IS the desired state. Fall through to the row transition
        // and the projection publish rather than dead-lettering over it.
        if (isZoomError(error) && error.status === 404) {
          zoomMissing = true;
        } else {
          throw error;
        }
      }
    }

    // `last_error` is cleared: the row reached its intended terminal state, so leaving a
    // stale failure marker on it would misdescribe a clean outcome.
    await store.markMeetingDeleted(row.id, null);

    const projection = await store.syncProjectionFromMeeting(row.id, session.growth_community_id);
    if (projection === 'missing' || projection === 'not_publishable') {
      throw new ZoomDeleteProjectionAnomalyError(projection, row.id, row.zoom_meeting_number);
    }

    const result: MeetingDeleteResult = {
      meeting_id: row.id,
      zoom_meeting_number: row.zoom_meeting_number,
      deleted,
      zoom_missing: zoomMissing,
      projection,
    };
    return result;
  };
}

export const meetingDeleteJobHandler: ZoomJobHandler = (ctx) => createMeetingDeleteHandler()(ctx);
