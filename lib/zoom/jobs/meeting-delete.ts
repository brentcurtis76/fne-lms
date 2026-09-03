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
 * ## The two rows it refuses to release
 *
 * A `zoom_meetings` row with NO meeting number that is parked under
 * `ambiguous_create_outcome` is not an empty reservation — it is a reservation held
 * BECAUSE a meeting may exist at Zoom under a number nobody could read
 * (`meeting-provision.ts`, Sol F4). `meeting_provision`'s own eligibility path refuses to
 * release such a row for that reason, and so does this handler: releasing it would free a
 * host that may genuinely be occupied. It fails non-retryably instead, and the resolution
 * is the one already documented on the park — a human reconciles against Zoom.
 *
 * The second is `compensation_failed` (Sol item 5). There the meeting number is KNOWN —
 * a provisioner created a meeting, found the surface retained underneath it, tried to
 * delete it at Zoom and could not. Same rule, sharper reason: the host is occupied by a
 * meeting we can name, and retiring the row would both free that host and overwrite the
 * marker that names it.
 *
 * ## This handler is one half of a coordination (Sol item 5)
 *
 * `claim_zoom_jobs` leases with `FOR UPDATE SKIP LOCKED`, which stops two tickers taking
 * the same job ROW and says nothing about a `meeting_provision` for the same SURFACE
 * running at the same time. The other half of the fix lives in `meeting-provision.ts`:
 * it re-reads the source session after `createMeeting` returns and before it persists,
 * and it treats a persist CAS lost to a RETIRED row the same way — in both cases it
 * deletes the meeting it just created. Nothing in THIS handler changed for that; it is
 * the provisioner that yields, because it is the one holding an unpersisted meeting.
 *
 * ## A missing row is TWO different facts (Sol S1, r27)
 *
 * `meeting_delete` finding no `zoom_meetings` row used to be one terminal failure. r24's
 * own module header explains why it is two: a delete that finds NO row must have read
 * before the reservation INSERT, which happens inside a `meeting_provision` run that is
 * therefore STILL IN FLIGHT. That provisioner re-reads the source session after
 * `createMeeting` and compensates — it deletes the meeting at Zoom and releases or leaves
 * the row alone. The end state is already correct, and dead-lettering over it produces a
 * red job for a race the system handles. Dead-letters that mean nothing train people to
 * ignore the ones that do.
 *
 * So the check is not removed, it is SPLIT, on the one observable that answers "will a row
 * ever exist for this surface?":
 *
 *  - **A `meeting_provision` job for the same surface is still `pending` or `leased`** ⇒
 *    that run owns this surface's meeting and will not leave one standing. Nothing here to
 *    remove and nothing for a human to do: complete, with `deferred_to_provisioner`.
 *  - **No such job** ⇒ nothing is going to create a row and none exists. That is the
 *    anomaly the original check is for — a delete enqueued for a surface that never had a
 *    meeting and never will, or one whose row was removed under us. Still terminal, still
 *    dead-lettered, unchanged.
 *
 * `done`, `failed` and `dead` are deliberately NOT deferred to: a job in one of those
 * states will not run again, so it can no longer explain the missing row.
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
  parseCompensationFailedMarker,
  type ProjectionSyncOutcome,
  type ProvisionMeetingRow,
  type ProvisionSessionRow,
} from './meeting-provision';
import type { ZoomSurfaceType } from '../db-types';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  defaultZoomTenantGate,
  enforceZoomTenantBoundary,
  type ZoomTenantGate,
} from '../tenant-boundary';

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
 * There is no internal row for this surface, and nothing is coming that would create one
 * (PM ruling 6, narrowed in r27). Terminal, and it writes nothing.
 *
 * Not silently treated as "already clean": a cancel enqueues this job only for a session
 * whose durable managed intent is set, so a missing row with no provisioner still to run
 * means either the provisioner never ran at all or the row was removed under us. Both are
 * worth a human seeing, and neither is improved by a retry.
 *
 * The case this NO LONGER covers is the one r27 split out — see
 * `MeetingDeleteDeferredResult`.
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

/** The `reason` a delete against a failed-compensation park is refused under. */
export const COMPENSATION_PARK_REASON = 'delete_compensation_parked';

/**
 * The row is a numberless reservation parked because `meeting_provision`'s COMPENSATING
 * delete failed (Sol item 5): a meeting IS standing at Zoom under the number in the
 * marker, and the reservation is deliberately still holding that host.
 *
 * The same rule as the ambiguous park, for a sharper reason — here the meeting number is
 * KNOWN. Retiring the row would free a host a live meeting occupies, and would replace
 * the one durable record naming that meeting with a clean `deleted`. Terminal, writes
 * NOTHING, and its evidence carries the number a human cancels at Zoom.
 */
export class ZoomDeleteCompensationParkedError extends ZoomNonRetryableError {
  readonly reason = COMPENSATION_PARK_REASON;
  readonly evidence: { meeting_id: string; zoom_meeting_number: number };

  constructor(meetingId: string, zoomMeetingNumber: number) {
    super(
      `meeting_delete refused zoom_meetings ${meetingId}: a failed provisioning compensation left zoom meeting ${zoomMeetingNumber} standing, and this reservation is holding its host. Cancel that meeting AT ZOOM, then clear the row's last_error.`,
      { operation: OPERATION }
    );
    this.evidence = { meeting_id: meetingId, zoom_meeting_number: zoomMeetingNumber };
  }
}

// ---------------------------------------------------------------------------
// Store seam
// ---------------------------------------------------------------------------

/**
 * The `zoom_jobs` statuses from which a job will still run. `pending` is queued or backing
 * off, `leased` is running now; `done`, `failed` and `dead` are terminal and can no longer
 * explain a missing `zoom_meetings` row. Mirrors the CHECK constraint in
 * `supabase/migrations/20260729120100_zoom_internal_tables.sql`.
 */
export const LIVE_JOB_STATUSES = ['pending', 'leased'] as const;

export interface MeetingDeleteStore {
  readSession(surfaceId: string): Promise<ProvisionSessionRow | null>;
  findMeetingBySurface(
    surfaceType: ZoomSurfaceType,
    surfaceId: string
  ): Promise<ProvisionMeetingRow | null>;
  /**
   * The id of a `meeting_provision` job for this surface that has not reached a terminal
   * status, or `null`. Read ONLY to tell an in-flight provisioner apart from an
   * unexplained missing row — never to coordinate with one, which is what the
   * provisioner's own re-check and compensation are for.
   */
  findLiveProvisionJob(
    surfaceType: ZoomSurfaceType,
    surfaceId: string
  ): Promise<{ id: string; status: string } | null>;
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

/** The filter chain both internal reads use. Structural, like every other seam here. */
interface MeetingDeleteInternalQuery {
  eq(column: string, value: string | number): MeetingDeleteInternalQuery;
  in(column: string, values: readonly string[]): MeetingDeleteInternalQuery;
  contains(column: string, value: Record<string, unknown>): MeetingDeleteInternalQuery;
  limit(count: number): MeetingDeleteInternalQuery;
  maybeSingle(): PostgrestResult<Record<string, unknown>>;
}

export interface MeetingDeleteInternalClient {
  rpc(
    fn: string,
    args: Record<string, unknown>
  ): PromiseLike<{ data: unknown; error: PostgrestError | null }>;
  from(table: string): {
    select(columns: string): MeetingDeleteInternalQuery;
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

    async findLiveProvisionJob(surfaceType, surfaceId) {
      // `@>` on the payload, not two arrow filters: the payload IS the surface identity a
      // provision job carries, and matching it whole cannot half-match one of the pair.
      const { data, error } = await internalClient
        .from('zoom_jobs')
        .select('id, status')
        .eq('job_type', 'meeting_provision')
        .contains('payload', { surface_type: surfaceType, surface_id: surfaceId })
        .in('status', LIVE_JOB_STATUSES)
        .limit(1)
        .maybeSingle();
      // A failed read is NOT "no provisioner": it is not knowing, and not knowing must not
      // be spent on the benign answer. Throw and let the job retry.
      if (error) throw new Error(`zoom_jobs provision lookup failed: ${error.message}`);
      if (data === null) return null;
      return { id: String(data.id), status: String(data.status) };
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
  tenantGate?: ZoomTenantGate;
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

/**
 * The surface has no row yet because a `meeting_provision` run is still in flight, and
 * that run — not this one — owns the meeting it is holding (see the module header). A
 * SUCCESS: nothing was left standing and nothing needs a human. Distinguishable from an
 * ordinary delete by `deferred_to_provisioner`, so an operator reading job results can
 * still see that this job removed nothing.
 */
export interface MeetingDeleteDeferredResult extends Record<string, unknown> {
  meeting_id: null;
  zoom_meeting_number: null;
  deleted: false;
  zoom_missing: false;
  projection: null;
  deferred_to_provisioner: true;
  /** The in-flight job that explains the missing row, for triage from the result alone. */
  provision_job_id: string;
  provision_job_status: string;
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

    const qaSuppression = await enforceZoomTenantBoundary({
      schoolId: session.school_id,
      operation: OPERATION,
      gate: deps.tenantGate ?? defaultZoomTenantGate(env),
    });
    if (qaSuppression) return qaSuppression;

    const row = await store.findMeetingBySurface(surfaceType, surfaceId);
    if (row === null) {
      // The check is not skipped, it is qualified — see the module header. Only an
      // in-flight provisioner explains a missing row; anything else is still the anomaly
      // this failure was written for.
      const inFlight = await store.findLiveProvisionJob(surfaceType, surfaceId);
      if (inFlight === null) throw new ZoomDeleteMeetingRowMissingError(surfaceId);

      console.warn(
        `[meeting-delete] consultor_session ${surfaceId} has no zoom_meetings row yet because meeting_provision job ${inFlight.id} is still '${inFlight.status}'. That run compensates its own meeting for a retired surface, so nothing is left standing and this job removes nothing.`
      );
      const deferred: MeetingDeleteDeferredResult = {
        meeting_id: null,
        zoom_meeting_number: null,
        deleted: false,
        zoom_missing: false,
        projection: null,
        deferred_to_provisioner: true,
        provision_job_id: inFlight.id,
        provision_job_status: inFlight.status,
      };
      return deferred;
    }

    // The two reservations this handler must not free. See the module header.
    if (row.zoom_meeting_number === null && isAmbiguousCreateMarker(row.last_error)) {
      throw new ZoomDeleteAmbiguousParkedError(row.id);
    }
    if (row.zoom_meeting_number === null) {
      const compensationPark = parseCompensationFailedMarker(row.last_error);
      if (compensationPark !== null) {
        throw new ZoomDeleteCompensationParkedError(
          row.id,
          compensationPark.zoom_meeting_number
        );
      }
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
