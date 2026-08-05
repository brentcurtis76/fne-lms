/**
 * `meeting_sync` — tells Zoom that a managed session moved (plan §8 reschedule, §10
 * timezone rules, §12 at-least-once).
 *
 * Z2-3a made a pre-execution reschedule update the hours ledger atomically. Nothing
 * told Zoom: a rescheduled session kept its ORIGINAL Zoom time, so the ledger, the
 * projection and the meeting a consultant actually joins disagreed. This handler is the
 * missing leg.
 *
 * ## Three writes, in this order, and the order is the whole design
 *
 *  1. the `zoom_internal.zoom_meetings` row's `starts_at` / `duration_minutes`
 *  2. the Zoom meeting, by PATCH
 *  3. the projection, through `sync_projection_from_meeting`
 *
 * The database FIRST, even though the chunk is called "telling Zoom". The row's interval
 * is a §9 host reservation enforced by `zoom_meetings_host_no_overlap`, so moving it can
 * raise 23P01 — the new window may collide with another meeting already booked on this
 * host. That refusal is PERMANENT: no backoff frees a host, and host reassignment is a
 * later phase. Discovering it before the Zoom call leaves both sides consistent (Zoom at
 * the old time, the row at the old time, the job terminally failed for a human). The
 * reverse order would leave Zoom moved onto a window the database has just refused to
 * reserve — a host genuinely double-booked, and no retry that repairs it.
 *
 * The residual of doing it this way is bounded and recoverable: a Zoom PATCH that fails
 * leaves the row ahead of Zoom, and the retry re-PATCHes (unlike `createMeeting`, PATCH
 * is idempotent, so replaying it costs nothing and creates nothing).
 *
 * ## Chile wall-clock, never a UTC instant (§10)
 *
 * Zoom's `start_time` takes a LOCAL time paired with `timezone`. Sending a UTC-converted
 * instant mis-schedules the meeting across a DST boundary — and Chile has two a year.
 * Both values come from `lib/utils/session-timezone.ts`, the one module allowed to
 * construct a session instant; `new Date(`${date}T${time}`)` never appears here.
 *
 * ## Eligibility is re-checked on CLAIM, not just at enqueue
 *
 * The queue is at-least-once and a job may run hours after it was minted. A session
 * cancelled in between must not have its meeting quietly moved to a time nobody will
 * attend, so `checkSessionEligibility` — the SAME gate the enqueue side and the
 * provisioner use — runs again here and refuses non-retryably. Handlers own their own
 * correctness.
 *
 * ## A Zoom 404 is a FAILURE here, and that asymmetry with `meeting_delete` is deliberate
 *
 * On delete a 404 means the desired state was already reached. On sync it means the
 * meeting we believe we own does not exist, and the honest response is to say so: record
 * it on the row and fail terminally. Re-creating would mint a second meeting outside
 * `meeting_provision`'s host reservation, which is exactly what §9 exists to prevent —
 * re-provisioning is that handler's job, not this one's.
 */
import { SESSION_TIMEZONE } from '../../utils/session-timezone';
import { getZoomApi, type ZoomApi } from '../api';
import { isZoomError, ZoomNonRetryableError } from '../errors';
import { createZoomServiceClient, zoomInternalSchema } from '../service-client';
import { ZoomJobLeaseLostError, type ZoomJobHandler } from './types';
import {
  checkSessionEligibility,
  deriveDurationMinutes,
  sessionStartsAtIso,
  toZoomWallClock,
  type ProjectionSyncOutcome,
  type ProvisionMeetingRow,
  type ProvisionSessionRow,
  type SessionEligibilityCheck,
} from './meeting-provision';
import type { ZoomMeetingStatus, ZoomSurfaceType } from '../db-types';
import type { SupabaseClient } from '@supabase/supabase-js';

/** The operation name every failure from this module carries. */
const OPERATION = 'meeting_sync';

/**
 * The only `zoom_meetings.status` a schedule change may be pushed to Zoom for.
 *
 * Deliberately just the one value. `pending` is either a bare reservation (no meeting at
 * Zoom yet) or the operator-recovery state `meeting_provision` owns; `started` means
 * reality has already overtaken the reschedule; `ended`, `cancelled`, `deleted` and
 * `error` have nothing joinable to move. Each of those is a real state and none of them
 * is a schedule this handler may push.
 */
export const SYNCABLE_MEETING_STATUSES = ['provisioned'] as const satisfies readonly ZoomMeetingStatus[];

export function isSyncableMeetingStatus(status: ZoomMeetingStatus): boolean {
  return (SYNCABLE_MEETING_STATUSES as readonly string[]).includes(status);
}

// ---------------------------------------------------------------------------
// Failure taxonomy
// ---------------------------------------------------------------------------

/** The surface's session row is gone. Nothing can be derived, so nothing is written. */
export class ZoomSyncSessionMissingError extends ZoomNonRetryableError {
  readonly reason = 'session_missing';

  constructor(surfaceId: string) {
    super(`meeting_sync found no consultor_session ${surfaceId}.`, { operation: OPERATION });
  }
}

/**
 * The session is no longer one a managed meeting may be scheduled for — cancelled,
 * soft-deleted, flipped to `presencial`, or unmanaged since the job was minted.
 * Terminal: no backoff turns a cancelled session back into a scheduled one.
 */
export class ZoomSyncSessionIneligibleError extends ZoomNonRetryableError {
  readonly reason = 'session_ineligible';
  /** WHICH check refused, so triage does not re-derive it. */
  readonly detail: SessionEligibilityCheck;

  constructor(surfaceId: string, check: SessionEligibilityCheck) {
    super(`meeting_sync refused session ${surfaceId}: ${check}.`, { operation: OPERATION });
    this.detail = check;
  }
}

/** The `reason` a sync against a surface with no `zoom_meetings` row fails under. */
export const NO_MEETING_ROW_REASON = 'no_meeting_row';

/**
 * There is no internal row for this surface (plan §12, ruling: handlers re-check on
 * claim). Terminal, and it writes nothing: a sync cannot invent the meeting it is
 * supposed to be moving, and a retry would find the same absence.
 */
export class ZoomSyncMeetingRowMissingError extends ZoomNonRetryableError {
  readonly reason = NO_MEETING_ROW_REASON;

  constructor(surfaceId: string) {
    super(`meeting_sync found no zoom_meetings row for consultor_session ${surfaceId}.`, {
      operation: OPERATION,
    });
  }
}

/** The row exists but its status is not one a schedule change may be pushed from. */
export class ZoomSyncMeetingNotSyncableError extends ZoomNonRetryableError {
  readonly reason = 'meeting_not_syncable';
  readonly detail: ZoomMeetingStatus;

  constructor(meetingId: string, status: ZoomMeetingStatus) {
    super(`meeting_sync cannot move zoom_meetings ${meetingId} in status '${status}'.`, {
      operation: OPERATION,
    });
    this.detail = status;
  }
}

/**
 * Moving the reservation raised 23P01: this host already holds a meeting overlapping the
 * NEW window (§9). Terminal, because no backoff frees a host and host reassignment is a
 * later phase — the job goes to triage with both intervals in `evidence`, and Zoom was
 * never told, so the two sides still agree on the old time.
 */
export class ZoomSyncHostBusyError extends ZoomNonRetryableError {
  readonly reason = 'sync_host_busy';
  readonly evidence: {
    meeting_id: string;
    target_starts_at: string;
    target_duration_minutes: number;
  };

  constructor(meetingId: string, startsAt: string, durationMinutes: number) {
    super(
      `meeting_sync could not move zoom_meetings ${meetingId} to ${startsAt}: the host is busy for that window.`,
      { operation: OPERATION }
    );
    this.evidence = {
      meeting_id: meetingId,
      target_starts_at: startsAt,
      target_duration_minutes: durationMinutes,
    };
  }
}

/** The `reason` a 404 from Zoom's PATCH fails under. */
export const MEETING_GONE_REASON = 'sync_meeting_gone';

/**
 * Zoom answered 404: the meeting this row names does not exist (PM ruling 3). Terminal,
 * and it deliberately does NOT re-create — a second creator here would mint a meeting
 * outside the §9 host reservation `meeting_provision` holds. The number is carried in
 * `evidence` because that is what a Zoom support ticket or a manual reconcile needs.
 */
export class ZoomSyncMeetingGoneError extends ZoomNonRetryableError {
  readonly reason = MEETING_GONE_REASON;
  readonly detail: string;
  readonly evidence: { meeting_id: string; zoom_meeting_number: number };

  constructor(meetingId: string, zoomMeetingNumber: number, requestId: string | undefined) {
    super(
      `meeting_sync: Zoom reports meeting ${zoomMeetingNumber} does not exist; not re-creating.`,
      { operation: OPERATION, requestId }
    );
    this.detail = String(zoomMeetingNumber);
    this.evidence = { meeting_id: meetingId, zoom_meeting_number: zoomMeetingNumber };
  }
}

/**
 * The projection republish came back `missing` or `not_publishable` (the Sol R7 ②
 * precedent: an anomaly is not an outcome). Terminal — a vanished row and an
 * unannounceable status are both things a human resolves, and a green job would hide
 * them behind a `console.warn` nobody reads.
 */
export class ZoomSyncProjectionAnomalyError extends ZoomNonRetryableError {
  readonly reason: 'sync_missing_row' | 'sync_not_publishable';
  readonly detail: string;
  readonly evidence: {
    meeting_id: string;
    zoom_meeting_number: number;
    sync_outcome: 'missing' | 'not_publishable';
  };

  constructor(
    outcome: 'missing' | 'not_publishable',
    meetingId: string,
    zoomMeetingNumber: number
  ) {
    super(
      `meeting_sync republished the projection for zoom_meetings ${meetingId} and got '${outcome}'.`,
      { operation: OPERATION }
    );
    this.reason = outcome === 'missing' ? 'sync_missing_row' : 'sync_not_publishable';
    this.detail = String(zoomMeetingNumber);
    this.evidence = {
      meeting_id: meetingId,
      zoom_meeting_number: zoomMeetingNumber,
      sync_outcome: outcome,
    };
  }
}

/** The structural marker recorded on a row whose Zoom meeting turned out to be gone. */
export function meetingGoneMarker(zoomMeetingNumber: number, message: string): string {
  return JSON.stringify({
    reason: MEETING_GONE_REASON,
    zoom_meeting_number: zoomMeetingNumber,
    message: message.slice(0, 300),
  });
}

// ---------------------------------------------------------------------------
// Store seam
// ---------------------------------------------------------------------------

export interface MeetingSyncStore {
  readSession(surfaceId: string): Promise<ProvisionSessionRow | null>;
  findMeetingBySurface(
    surfaceType: ZoomSurfaceType,
    surfaceId: string
  ): Promise<ProvisionMeetingRow | null>;
  /**
   * Moves the row's reservation to the new interval. `false` = 23P01: the EXCLUDE
   * constraint refused because the host is busy for that window. It must NEVER surface
   * as a throw — the caller turns it into a terminal, triageable failure.
   */
  updateMeetingSchedule(
    meetingId: string,
    startsAt: string,
    durationMinutes: number
  ): Promise<boolean>;
  /** The guarded, never-backward projection publish. Never a hand-written upsert. */
  syncProjectionFromMeeting(
    meetingId: string,
    growthCommunityId: string | null
  ): Promise<ProjectionSyncOutcome>;
  /** Writes `last_error` and nothing else — the status and the reservation are kept. */
  recordLastError(meetingId: string, lastError: string): Promise<void>;
}

interface PostgrestError {
  message: string;
  /** Postgres SQLSTATE. `23P01` is the §9 host-busy signal. */
  code?: string;
}

type PostgrestResult<T> = PromiseLike<{ data: T | null; error: PostgrestError | null }>;

/** The ONLY untyped boundaries in this module. See `service-client.ts`. */
export interface MeetingSyncPublicClient {
  from(table: string): {
    select(columns: string): {
      eq(
        column: string,
        value: string | number
      ): { maybeSingle(): PostgrestResult<Record<string, unknown>> };
    };
  };
}

export interface MeetingSyncInternalClient {
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

/** Postgres exclusion-violation — the §9 "host busy" signal, same code as §9's INSERT. */
const EXCLUSION_VIOLATION = '23P01';

export function createSupabaseMeetingSyncStore(
  publicClient: MeetingSyncPublicClient,
  internalClient: MeetingSyncInternalClient
): MeetingSyncStore {
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

    async updateMeetingSchedule(meetingId, startsAt, durationMinutes) {
      const { error } = await internalClient
        .from('zoom_meetings')
        .update({
          starts_at: startsAt,
          duration_minutes: durationMinutes,
          updated_at: new Date().toISOString(),
        })
        .eq('id', meetingId);
      // 23P01 is not an error condition here — it is the answer "that host is busy
      // for the window you are trying to move into".
      if (error?.code === EXCLUSION_VIOLATION) return false;
      if (error) throw new Error(`zoom_meetings reschedule failed: ${error.message}`);
      return true;
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

    async recordLastError(meetingId, lastError) {
      const { error } = await internalClient
        .from('zoom_meetings')
        // No `status` key: the row keeps whatever status it has.
        .update({ last_error: lastError, updated_at: new Date().toISOString() })
        .eq('id', meetingId);
      if (error) throw new Error(`zoom_meetings last_error write failed: ${error.message}`);
    },
  };
}

export function defaultMeetingSyncStore(
  env: NodeJS.ProcessEnv = process.env,
  clientFactory: (env: NodeJS.ProcessEnv) => SupabaseClient = createZoomServiceClient
): MeetingSyncStore {
  const client = clientFactory(env);
  return createSupabaseMeetingSyncStore(
    client as unknown as MeetingSyncPublicClient,
    zoomInternalSchema<MeetingSyncInternalClient>(client)
  );
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export interface MeetingSyncDeps {
  api?: ZoomApi;
  store?: MeetingSyncStore;
  env?: NodeJS.ProcessEnv;
}

export interface MeetingSyncResult extends Record<string, unknown> {
  meeting_id: string;
  zoom_meeting_number: number;
  synced: true;
  starts_at: string;
  duration_minutes: number;
  timezone: string;
  projection: ProjectionSyncOutcome;
}

/**
 * The reschedule landed BEFORE the meeting was ever created, so there is nothing at Zoom
 * to move.
 *
 * A completion rather than a failure, and not a shrug: `meeting_provision` reads the
 * session fresh and re-proves its reservation against the CURRENT schedule
 * (`reservationMatchesSource`), so it will create the meeting at the new time on its own.
 * There is no action for a human, and nothing to retry.
 */
export interface MeetingSyncNotProvisionedResult extends Record<string, unknown> {
  meeting_id: string;
  synced: false;
  reason: 'not_provisioned';
}

interface SyncPayload {
  surface_type: ZoomSurfaceType;
  surface_id: string;
}

/** Community surfaces arrive in Z6; until then anything else is a programming error. */
function readPayload(payload: Record<string, unknown>): SyncPayload {
  const surfaceType = payload.surface_type;
  const surfaceId = payload.surface_id;

  if (surfaceType !== 'consultor_session') {
    throw new ZoomNonRetryableError(
      `meeting_sync supports surface_type 'consultor_session' only; received '${String(surfaceType)}'.`,
      { operation: OPERATION }
    );
  }
  if (typeof surfaceId !== 'string' || surfaceId === '') {
    throw new ZoomNonRetryableError('meeting_sync payload is missing surface_id.', {
      operation: OPERATION,
    });
  }
  return { surface_type: surfaceType, surface_id: surfaceId };
}

export function createMeetingSyncHandler(deps: MeetingSyncDeps = {}): ZoomJobHandler {
  return async (ctx) => {
    const env = deps.env ?? process.env;
    const { surface_type: surfaceType, surface_id: surfaceId } = readPayload(ctx.job.payload);

    const store = deps.store ?? defaultMeetingSyncStore(env);

    // --- Re-check eligibility on CLAIM (PM ruling 6) -------------------------
    const session = await store.readSession(surfaceId);
    if (session === null) throw new ZoomSyncSessionMissingError(surfaceId);

    const refusal = checkSessionEligibility(session);
    if (refusal !== null) throw new ZoomSyncSessionIneligibleError(surfaceId, refusal);

    const row = await store.findMeetingBySurface(surfaceType, surfaceId);
    if (row === null) throw new ZoomSyncMeetingRowMissingError(surfaceId);

    // No number ⇒ no meeting at Zoom. Not an anomaly: the reschedule simply beat the
    // provisioner, which will create at the current time. See the result type.
    if (row.zoom_meeting_number === null) {
      const result: MeetingSyncNotProvisionedResult = {
        meeting_id: row.id,
        synced: false,
        reason: 'not_provisioned',
      };
      return result;
    }

    if (!isSyncableMeetingStatus(row.status)) {
      throw new ZoomSyncMeetingNotSyncableError(row.id, row.status);
    }

    // --- §10: two values, one helper, no `new Date(date + 'T' + time)` -------
    // Via `.getTime()`, exactly as `meeting_provision` does it: `TZDate.toISOString()`
    // renders the ZONED form (`…T17:00:00.000-04:00`), and while Postgres parses that to
    // the same instant, the two handlers must write `starts_at` in one shape.
    const startsAtIso = sessionStartsAtIso(session);
    const wallClock = toZoomWallClock(session.session_date, session.start_time);
    const durationMinutes =
      session.scheduled_duration_minutes ??
      deriveDurationMinutes(session.session_date, session.start_time, session.end_time);

    if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
      throw new ZoomNonRetryableError(
        `consultor_session ${surfaceId} has a non-positive duration (${durationMinutes} min).`,
        { operation: OPERATION }
      );
    }

    // The lease is checked once, immediately before the first write: everything above is
    // reads, and a worker that has lost its lease must write nothing at all.
    if (!(await ctx.heartbeat())) throw new ZoomJobLeaseLostError(ctx.job.id);

    // 1. The reservation moves FIRST — see the module header for why.
    const moved = await store.updateMeetingSchedule(row.id, startsAtIso, durationMinutes);
    if (!moved) throw new ZoomSyncHostBusyError(row.id, startsAtIso, durationMinutes);

    // 2. Zoom. Chile wall-clock + the zone, never a UTC instant.
    const api = deps.api ?? getZoomApi(env);
    try {
      await api.patchMeeting(row.zoom_meeting_number, {
        startTime: wallClock,
        durationMinutes,
        timezone: SESSION_TIMEZONE,
      });
    } catch (error: unknown) {
      // PM ruling 3: a 404 on sync is a NON-RETRYABLE FAILURE, not a success. Record it
      // on the row so triage can see it there too, then fail terminally without
      // re-creating.
      if (isZoomError(error) && error.status === 404) {
        await store.recordLastError(
          row.id,
          meetingGoneMarker(row.zoom_meeting_number, error.message)
        );
        throw new ZoomSyncMeetingGoneError(row.id, row.zoom_meeting_number, error.requestId);
      }
      throw error;
    }

    // 3. The projection, through the monotonic RPC (PM ruling 7).
    const projection = await store.syncProjectionFromMeeting(row.id, session.growth_community_id);
    if (projection === 'missing' || projection === 'not_publishable') {
      throw new ZoomSyncProjectionAnomalyError(projection, row.id, row.zoom_meeting_number);
    }

    const result: MeetingSyncResult = {
      meeting_id: row.id,
      zoom_meeting_number: row.zoom_meeting_number,
      synced: true,
      starts_at: startsAtIso,
      duration_minutes: durationMinutes,
      timezone: SESSION_TIMEZONE,
      projection,
    };
    return result;
  };
}

export const meetingSyncJobHandler: ZoomJobHandler = (ctx) => createMeetingSyncHandler()(ctx);
