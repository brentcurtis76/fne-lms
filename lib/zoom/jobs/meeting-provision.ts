/**
 * `meeting_provision` — creates the Zoom meeting for an LMS surface under a host the
 * database itself reserved (plan §8 provisioning lifecycle, §9 host resolution + the
 * EXCLUDE reservation, §10 timezone rules, §12 staged idempotent pipelines).
 *
 * ## Eligibility comes before everything (Sol F3)
 *
 * The handler used to validate the schedule FIELDS and nothing about the session
 * itself, so a cancelled, draft, soft-deleted, `presencial` or Google-Meet session was
 * provisioned exactly like a live one — a real Zoom meeting, on a real licensed host,
 * for something that will never happen. `checkSessionEligibility` runs first, before a
 * host is resolved and before any row is written, and refuses non-retryably: no backoff
 * turns a cancelled session into a scheduled one.
 *
 * The one write that CAN happen on that path is a release. A previous attempt may
 * already hold a bare reservation for this surface, and a session cancelled after the
 * fact must not keep blocking a host for a window nobody will use — so an unfulfilled
 * reservation is dropped to `cancelled`, a status outside the EXCLUDE predicate. A row
 * that already carries a `zoom_meeting_number` is left alone: a meeting genuinely
 * exists at Zoom for that interval, and freeing it would let a second meeting be booked
 * onto an occupied host.
 *
 * ## The INSERT is the reservation
 *
 * §9's concurrency rule is not enforced by a query that looks for a free host and then
 * uses it — that is a TOCTOU race two overlapping ticks would lose. It is enforced by
 * `zoom_meetings_host_no_overlap`, an EXCLUDE constraint over
 * `(host_zoom_user_id, meeting_reservation_window(starts_at, duration_minutes))`
 * restricted to the ACTIVE statuses. So the row INSERT *is* the reservation: it either
 * succeeds (the host is ours for that window) or raises 23P01 (host busy), at which
 * point we try the next candidate. Nothing is "released" on a conflict, because
 * nothing was held — the failed INSERT wrote no row.
 *
 * The same is true of the resume path: flipping a row from `error` back to `pending`
 * re-enters the constraint's WHERE clause, so the UPDATE re-checks it and can itself
 * raise 23P01. That is deliberate — a resumed job must re-prove the host is free.
 *
 * And a resumed `pending` reservation must re-prove it is protecting the RIGHT window.
 * The session may have been rescheduled between the reservation and the retry, in which
 * case the interval the constraint is defending is not the interval about to be sent to
 * Zoom — the host is then double-bookable for the time the meeting will actually
 * occupy. `reservationMatchesSource` compares the row against the current source; on
 * drift the row is re-reserved by UPDATE with the new interval, which re-enters the
 * predicate and can 23P01 like any other reservation, at which point the candidate walk
 * takes over. The checkpoint-adopt path is EXEMPT: Zoom already holds that meeting at
 * the old time, so moving our reservation would protect an interval Zoom knows nothing
 * about. Reconciling a rescheduled meeting with Zoom is Z2's reschedule sync.
 *
 * Host *load* is only a preference. `countHostLoads` orders candidates least-loaded
 * first, and it is allowed to be approximate: the constraint, not the count, is what
 * makes double-booking impossible. This is why the overlap band below can be computed
 * in TypeScript without risking correctness.
 *
 * ## Two clocks, and neither is `new Date(date + 'T' + time)`
 *
 * §10: session times are Chile wall-clock. Two different values are derived, from the
 * one helper (`lib/utils/session-timezone.ts`) that knows the zone:
 *
 *  - `starts_at` — a real UTC instant, for the reservation row and the projection.
 *  - the wall-clock string + `timezone: 'America/Santiago'` — for Zoom's create, which
 *    wants local time plus a zone and would mis-schedule a UTC-converted value across
 *    a DST boundary.
 *
 * Constructing `new Date(`${date}T${time}`)` would silently mean *server* local time,
 * which is UTC on Vercel and Chile nowhere. It never appears in this module.
 *
 * ## The uuid stays NULL
 *
 * `zoom_meeting_uuid` is NOT written here even though the create response carries one.
 * Zoom mints a new uuid per occurrence (routed Z0B finding; `api.ts` names the field
 * `uuidAtRead` for exactly this reason), so the provision-time value is not the key
 * recordings and reports hang off. `meeting.started` captures it — see
 * `lib/zoom/webhook-lifecycle.ts`. The column is nullable to make room for that.
 *
 * ## Idempotent and resumable (§12, at-least-once)
 *
 * Zoom's create API takes NO idempotency key, so "create exactly once" cannot be bought
 * from the provider — it is reconstructed from two anchors, checked in this order:
 *
 *  1. `zoom_meetings.zoom_meeting_number`. Once it is set the meeting exists at Zoom and
 *     no re-run may create a second one; the re-run only finishes the remaining steps.
 *  2. failing that, a `stage: 'created'` checkpoint in the job's own `stage_state`,
 *     written by the heartbeat IMMEDIATELY after `createMeeting` returns. A re-run that
 *     finds one ADOPTS it — `markProvisioned` from the checkpoint — and does not create.
 *
 * Only when NEITHER anchor exists does the handler reserve a host and create. Every
 * other write is absolute, never a guarded transition.
 *
 * Note the `complete_zoom_job` contract (Z1b-3 finding ③): completion REPLACES
 * `stage_state` with the handler's return value. That is exactly why anchor 1 is the ROW
 * and not the checkpoint — the checkpoint only has to survive a FAILED attempt, and
 * `fail_zoom_job` leaves `stage_state` untouched. It is in-run progress that outlives
 * the run that wrote it, nothing more.
 *
 * ### RESIDUAL — the window that stays open
 *
 * The checkpoint NARROWS the create→persist window; it does not close it. If the process
 * dies between `createMeeting` returning and the checkpoint landing — or the lease is
 * lost, so the heartbeat returns false and nothing is written at all — the retry sees
 * neither anchor and creates a SECOND meeting at Zoom. The first is then orphaned:
 * scheduled, never joined, pointed at by no row. The same holds if the `zoom_meetings`
 * row is missing when a checkpoint is read, because there is nothing to adopt it onto.
 * This is irreducible without a Zoom-side idempotency key.
 *
 * What the checkpoint buys when it DOES land is that the orphan is NAMED:
 * `zoom_jobs.stage_state.meeting.number` on the failed job is the meeting number a human
 * can cancel. Dead-job triage is the cleanup path — plan §16 puts its procedure in
 * `docs/runbooks/zoom.md`, which is NOT written yet (later phase); until it is, the
 * path is a human reading `zoom_jobs.last_error` and `stage_state` directly.
 *
 * ### The third case: create failed, and we do not know whether it landed (Sol F4)
 *
 * The two anchors answer "did a PREVIOUS attempt create?". Neither answers "did the
 * attempt that just threw create?" — and `createMeeting` can fail in ways that do not
 * rule it out: a transport throw, a 5xx, a 2xx whose body is unreadable or empty. The
 * client labels every error `outcome: 'not_executed' | 'ambiguous'` so this handler
 * never has to reconstruct that from status codes.
 *
 *  - DEFINITE (`not_executed`): Zoom answered and refused. `markError` → status `error`
 *    → the interval is released → rethrow, and the retry re-reserves and creates. This
 *    is the pre-existing behaviour and it is correct for this class.
 *  - AMBIGUOUS: the row is NOT moved to `error`, because that would release the interval
 *    and the retry would create a second meeting against a host we had just declared
 *    free. `last_error` is written WITHOUT a status change, so the reservation keeps
 *    blocking, and the job fails NON-retryably under reason `ambiguous_create_outcome`.
 *
 * Be honest about the limit: an ambiguous failure CANNOT NAME the possible first
 * meeting. There is no id — either the response never arrived or it was unreadable — so
 * `x-zm-request-id` (when Zoom sent one) is all the record carries, and only
 * reconciliation against Zoom can identify a meeting if one exists. The BLOCKED HOST
 * INTERVAL is the safety here, not knowledge.
 */
import { randomInt } from 'crypto';
import { getSessionDateTime, SESSION_TIMEZONE } from '../../utils/session-timezone';
import { getZoomApi, type ZoomApi, type ZoomMeetingSettings } from '../api';
import { isZoomError, ZoomNonRetryableError } from '../errors';
import { createZoomServiceClient, zoomInternalSchema } from '../service-client';
import { ZoomJobLeaseLostError, type ZoomJobHandler } from './types';
import {
  ZOOM_MEETING_ACTIVE_STATUSES,
  type SessionMeetingPublicStatus,
  type ZoomMeetingStatus,
  type ZoomSurfaceType,
} from '../db-types';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * The §8 provisioning settings. Sent on every create, and re-read off the RESPONSE
 * because Zoom reflects effective values on a capability mismatch rather than failing.
 */
export const PROVISION_MEETING_SETTINGS: ZoomMeetingSettings = {
  join_before_host: false,
  waiting_room: false,
  auto_recording: 'none',
};

/**
 * The reservation window's buffers, mirroring
 * `zoom_internal.meeting_reservation_window`: early joins (−15 min) and overruns
 * (+45 min). Duplicated here ONLY to bound the load-count query; the constraint in
 * `20260729120100_zoom_internal_tables.sql` remains the single authority on overlap.
 */
export const RESERVATION_LEAD_MINUTES = 15;
export const RESERVATION_TRAIL_MINUTES = 45;

/** Postgres exclusion-violation. The §9 "host busy" signal. */
export const EXCLUSION_VIOLATION = '23P01';

const MINUTE_MS = 60_000;

// ---------------------------------------------------------------------------
// Source-state eligibility (Sol F3)
// ---------------------------------------------------------------------------

/**
 * The only `consultor_sessions.status` a meeting may be provisioned for: approved and
 * scheduled, and not yet under way.
 *
 * Deliberately a single value rather than "anything not cancelled". `borrador` and
 * `pendiente_aprobacion` are pre-approval — plan §8 is explicit that creating a session
 * as `borrador` makes NO Zoom call — and `en_progreso` / `pendiente_informe` /
 * `completada` are at-or-past execution, where creating a scheduled meeting produces a
 * link nobody will ever use while holding a host slot that is already spent.
 */
export const PROVISION_ELIGIBLE_SESSION_STATUSES = ['programada'] as const;

/**
 * Modalities with a remote leg. `hibrida` is IN: a hybrid session has attendees joining
 * remotely and is exactly as entitled to a meeting as an `online` one. `presencial` is
 * the exclusion — there is nothing to join.
 */
export const PROVISION_ELIGIBLE_MODALITIES = ['online', 'hibrida'] as const;

/**
 * §8/ledger item 21: managed intent is spelled `meeting_provider = 'zoom'` — NOT a new
 * enum value, which would violate the live CHECK constraint (baseline:7740).
 */
export const PROVISION_ELIGIBLE_PROVIDER = 'zoom';

/** Which gate refused the session. Stored structurally as the failure's `detail`. */
export type SessionEligibilityCheck =
  | 'status'
  | 'is_active'
  | 'modality'
  | 'meeting_provider';

/**
 * The §8 eligibility gate: the first failed check, or `null` when the session may be
 * provisioned for. Order is deliberate — `is_active` first, because a soft-deleted
 * session is the least interesting reason to look further.
 *
 * SEAM (Z2): `is_zoom_managed` — the durable managed-intent flag from plan §8/ledger
 * item 22 — joins this list as one more check as soon as Z2's additive migration adds
 * the column. It is NOT added here: inventing the column now would be a rival mechanism
 * to the one the plan already specifies, and `meeting_provider = 'zoom'` is the intent
 * signal that exists today. When the flag lands, `is_zoom_managed !== true` becomes a
 * `'is_zoom_managed'` member of `SessionEligibilityCheck` and a branch below.
 */
export function checkSessionEligibility(
  session: ProvisionSessionRow
): SessionEligibilityCheck | null {
  if (session.is_active !== true) return 'is_active';
  if (!(PROVISION_ELIGIBLE_SESSION_STATUSES as readonly string[]).includes(session.status)) {
    return 'status';
  }
  if (!(PROVISION_ELIGIBLE_MODALITIES as readonly string[]).includes(session.modality)) {
    return 'modality';
  }
  if (session.meeting_provider !== PROVISION_ELIGIBLE_PROVIDER) return 'meeting_provider';
  return null;
}

/**
 * Does the reservation this row is holding still describe the CURRENT session?
 *
 * Compared as instants, not strings: `starts_at` comes back from Postgres as
 * `+00:00`-suffixed and goes in as `Z`-suffixed, so a string compare would report drift
 * on every single resume.
 */
export function reservationMatchesSource(
  row: ProvisionMeetingRow,
  startsAtIso: string,
  durationMinutes: number
): boolean {
  return (
    Date.parse(row.starts_at) === Date.parse(startsAtIso) &&
    row.duration_minutes === durationMinutes
  );
}

// ---------------------------------------------------------------------------
// Failure taxonomy
// ---------------------------------------------------------------------------

/**
 * Every candidate host was busy for this window (§9). Terminal: no backoff creates a
 * host, so the job goes to triage and the health panel rather than spinning. The
 * `reason` field is what makes it structurally greppable in `zoom_jobs.last_error` —
 * triage keys on it, never on the message.
 */
export class ZoomNoHostAvailableError extends ZoomNonRetryableError {
  readonly reason = 'no_host_available';

  constructor(message: string, candidatesTried: number) {
    super(message, { operation: 'meeting_provision' });
    this.candidatesTried = candidatesTried;
  }

  readonly candidatesTried: number;
}

/** The `reason` an ambiguous create parks under. Triage and §18 alerting key on it. */
export const AMBIGUOUS_CREATE_REASON = 'ambiguous_create_outcome';

/**
 * `createMeeting` failed in a way that CANNOT rule out a meeting having been created
 * (Sol F4). Terminal on purpose: the job must never retry, because a retry is exactly
 * the second create this class exists to prevent.
 *
 * What it can and cannot tell you is worth being blunt about. It carries the provider's
 * `x-zm-request-id` when Zoom sent one, which is what a support ticket needs — but it
 * CANNOT name the meeting. There is no id to record: either the response never arrived
 * or it was unreadable. Only reconciliation against Zoom (list the host's meetings
 * around that window and match the topic and start time) can identify a first meeting
 * if one exists. The blocked host interval is the safety here, not knowledge: the
 * reservation stays `pending`, so nothing else is booked onto that host for that window
 * while a human resolves it via dead-job triage (see the module header: the runbook
 * that will carry the procedure is a later phase).
 */
export class ZoomAmbiguousCreateError extends ZoomNonRetryableError {
  readonly reason = AMBIGUOUS_CREATE_REASON;

  constructor(message: string, requestId: string | undefined) {
    super(message, { operation: 'meeting_provision', requestId });
  }
}

/**
 * The marker `recordLastError` leaves on a row whose create outcome is unresolved.
 * Structural — parsed and read by field, never matched as a substring.
 */
export function ambiguousCreateMarker(
  requestId: string | undefined,
  message: string
): string {
  return JSON.stringify({
    reason: AMBIGUOUS_CREATE_REASON,
    request_id: requestId ?? null,
    message: message.slice(0, 300),
  });
}

/** Is this row's `last_error` an unresolved ambiguous create? */
export function isAmbiguousCreateMarker(lastError: string | null): boolean {
  if (lastError === null) return false;
  try {
    const parsed = JSON.parse(lastError) as { reason?: unknown };
    return parsed.reason === AMBIGUOUS_CREATE_REASON;
  } catch {
    return false;
  }
}

/**
 * The source session is not one this job may provision for (§8; Sol F3). Terminal for
 * the same reason as `no_host_available`: no backoff turns a cancelled session into a
 * scheduled one. `reason` + `detail` are what triage keys on — never the message.
 */
export class ZoomSessionIneligibleError extends ZoomNonRetryableError {
  readonly reason = 'session_ineligible';
  /** WHICH check failed, so triage does not have to re-derive it. */
  readonly detail: SessionEligibilityCheck;

  constructor(message: string, check: SessionEligibilityCheck) {
    super(message, { operation: 'meeting_provision' });
    this.detail = check;
  }
}

// ---------------------------------------------------------------------------
// Row shapes
// ---------------------------------------------------------------------------

export interface ProvisionSessionRow {
  id: string;
  school_id: number;
  growth_community_id: string | null;
  title: string;
  /** DATE `YYYY-MM-DD`, Chile local. */
  session_date: string;
  /** TIME `HH:MM[:SS]`, Chile local. */
  start_time: string;
  end_time: string;
  /**
   * Generated column, VERIFIED present on the live table as
   * `((EXTRACT(epoch FROM (end_time - start_time)) / 60))::integer`. Nullable, so the
   * §10 fallback below still has to exist.
   */
  scheduled_duration_minutes: number | null;
  /**
   * The eligibility columns. All four VERIFIED against the live table in
   * `supabase/migrations/00000000000000_baseline.sql:7703-7742`:
   *   status          NOT NULL, CHECK IN (borrador, pendiente_aprobacion, programada,
   *                   en_progreso, pendiente_informe, completada, cancelada)
   *   is_active       NOT NULL DEFAULT true
   *   modality        NOT NULL, CHECK IN (presencial, online, hibrida)
   *   meeting_provider NULLABLE, CHECK IN (zoom, google_meet, teams, otro)
   */
  status: string;
  is_active: boolean;
  modality: string;
  meeting_provider: string | null;
}

export interface SessionFacilitatorRow {
  user_id: string;
  is_lead: boolean;
}

export interface ProvisionHostRow {
  zoom_user_id: string;
  /** NULL = org pool host (§9). */
  profile_id: string | null;
}

/** The `zoom_meetings` columns this handler reads back. */
export interface ProvisionMeetingRow {
  id: string;
  status: ZoomMeetingStatus;
  host_zoom_user_id: string | null;
  zoom_meeting_number: number | null;
  /**
   * The EFFECTIVE settings the create response carried, as persisted. Read back so a
   * resume DERIVES the §9.4 drift signal from what Zoom actually said instead of
   * assuming it — see `readAutoRecording`.
   */
  effective_settings: Record<string, unknown> | null;
  starts_at: string;
  duration_minutes: number;
  /**
   * Read back so the eligibility release can tell an ordinary bare reservation from one
   * parked by an UNRESOLVED ambiguous create — the second must not be released, because
   * a meeting may exist at Zoom for that interval (Sol F4).
   */
  last_error: string | null;
}

export interface ReservationInsert {
  surface_type: ZoomSurfaceType;
  surface_id: string;
  school_id: number;
  host_zoom_user_id: string;
  starts_at: string;
  duration_minutes: number;
}

export interface ProvisionedMeetingPatch {
  zoom_meeting_number: number;
  passcode: string;
  join_url: string;
  effective_settings: Record<string, unknown>;
  status: ZoomMeetingStatus;
}

export interface ProjectionUpsert {
  surface_type: ZoomSurfaceType;
  surface_id: string;
  school_id: number;
  growth_community_id: string | null;
  meeting_status: SessionMeetingPublicStatus;
  starts_at: string;
  ends_at: string;
}

/** `true` = reserved; `false` = 23P01, the host is busy for this window. */
export type ReservationOutcome = { reserved: true; row: ProvisionMeetingRow } | { reserved: false };

// ---------------------------------------------------------------------------
// Store seam
// ---------------------------------------------------------------------------

export interface MeetingProvisionStore {
  readSession(surfaceId: string): Promise<ProvisionSessionRow | null>;
  listFacilitators(sessionId: string): Promise<SessionFacilitatorRow[]>;
  /** Active hosts only — `host_sync` flips `is_active` rather than deleting. */
  listActiveHosts(): Promise<ProvisionHostRow[]>;
  /**
   * `host_zoom_user_id → count` of ACTIVE meetings whose reservation window overlaps
   * `[boundLowerIso, boundUpperIso)`. Advisory ordering only — see the module header.
   */
  countHostLoads(boundLowerIso: string, boundUpperIso: string): Promise<Record<string, number>>;
  findMeetingBySurface(
    surfaceType: ZoomSurfaceType,
    surfaceId: string
  ): Promise<ProvisionMeetingRow | null>;
  /** The reservation. 23P01 must surface as `{ reserved: false }`, never as a throw. */
  insertReservation(row: ReservationInsert): Promise<ReservationOutcome>;
  /**
   * Re-enters a non-active row into `pending` under `hostZoomUserId`, re-checking the
   * EXCLUDE constraint. `false` = 23P01.
   */
  reserveExistingMeeting(
    meetingId: string,
    hostZoomUserId: string,
    startsAt: string,
    durationMinutes: number
  ): Promise<boolean>;
  markProvisioned(meetingId: string, patch: ProvisionedMeetingPatch): Promise<void>;
  markError(meetingId: string, lastError: string): Promise<void>;
  /**
   * Writes `last_error` and NOTHING else — the status is deliberately untouched.
   * `markError` would move the row to `error`, which is outside the EXCLUDE predicate
   * and therefore RELEASES the host; that is right for a definite failure and wrong for
   * an ambiguous one, where a meeting may already exist on that host at that time
   * (Sol F4).
   */
  recordLastError(meetingId: string, lastError: string): Promise<void>;
  /**
   * Drops a reservation into `cancelled` — a status the §9 EXCLUDE `WHERE` ignores, so
   * the host slot is freed. Used only for a reservation held on behalf of a session
   * that turned out to be ineligible: leaving it `pending` would block that host for
   * the window of a meeting nobody is ever going to hold.
   */
  releaseReservation(meetingId: string, lastError: string): Promise<void>;
  upsertProjection(row: ProjectionUpsert): Promise<void>;
}

// ---------------------------------------------------------------------------
// Supabase-backed store
// ---------------------------------------------------------------------------

interface PostgrestError {
  message: string;
  /** Postgres SQLSTATE. `23P01` is the §9 host-busy signal. */
  code?: string;
}

type PostgrestResult<T> = PromiseLike<{ data: T | null; error: PostgrestError | null }>;

/** The ONLY untyped boundaries in this module. See `service-client.ts`. */
export interface ProvisionPublicClient {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string | number): {
        maybeSingle(): PostgrestResult<Record<string, unknown>>;
      } & PostgrestResult<Record<string, unknown>[]>;
    };
    upsert(
      values: Record<string, unknown>,
      options: { onConflict: string }
    ): PromiseLike<{ error: PostgrestError | null }>;
  };
}

export interface ProvisionInternalClient {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string | number): {
        eq(column: string, value: string | number): {
          maybeSingle(): PostgrestResult<Record<string, unknown>>;
        };
      } & PostgrestResult<Record<string, unknown>[]>;
      in(column: string, values: readonly string[]): {
        lt(column: string, value: string): {
          gt(column: string, value: string): PostgrestResult<Record<string, unknown>[]>;
        };
      };
    };
    insert(values: Record<string, unknown>): {
      select(columns: string): {
        single(): PostgrestResult<Record<string, unknown>>;
      };
    };
    update(values: Record<string, unknown>): {
      eq(column: string, value: string | number): PromiseLike<{ error: PostgrestError | null }>;
    };
  };
}

function isExclusionViolation(error: PostgrestError | null): boolean {
  return error?.code === EXCLUSION_VIOLATION;
}

export function createSupabaseMeetingProvisionStore(
  publicClient: ProvisionPublicClient,
  internalClient: ProvisionInternalClient
): MeetingProvisionStore {
  return {
    async readSession(surfaceId) {
      const { data, error } = await publicClient
        .from('consultor_sessions')
        .select(
          'id, school_id, growth_community_id, title, session_date, start_time, end_time, scheduled_duration_minutes, status, is_active, modality, meeting_provider'
        )
        .eq('id', surfaceId)
        .maybeSingle();
      if (error) throw new Error(`consultor_sessions read failed: ${error.message}`);
      return (data as unknown as ProvisionSessionRow) ?? null;
    },

    async listFacilitators(sessionId) {
      const { data, error } = await publicClient
        .from('session_facilitators')
        .select('user_id, is_lead')
        .eq('session_id', sessionId);
      if (error) throw new Error(`session_facilitators read failed: ${error.message}`);
      return (data as unknown as SessionFacilitatorRow[]) ?? [];
    },

    async listActiveHosts() {
      const { data, error } = await internalClient
        .from('zoom_hosts')
        .select('zoom_user_id, profile_id')
        .eq('is_active', true as unknown as string);
      if (error) throw new Error(`zoom_hosts read failed: ${error.message}`);
      return (data as unknown as ProvisionHostRow[]) ?? [];
    },

    async countHostLoads(boundLowerIso, boundUpperIso) {
      // Overlap of reservation windows, expressed on the stored columns so PostgREST
      // can run it: window(other) ∩ window(mine) ≠ ∅
      //   ⇔ other.starts_at < mine.ends_at + 60min AND other.ends_at > mine.starts_at − 60min
      // (the 60 = the 15-min lead plus the 45-min trail). `ends_at` is a STORED
      // generated column, so both sides are real columns.
      const { data, error } = await internalClient
        .from('zoom_meetings')
        .select('host_zoom_user_id')
        .in('status', ZOOM_MEETING_ACTIVE_STATUSES)
        .lt('starts_at', boundUpperIso)
        .gt('ends_at', boundLowerIso);
      if (error) throw new Error(`zoom_meetings load read failed: ${error.message}`);

      const loads: Record<string, number> = {};
      for (const row of (data as unknown as { host_zoom_user_id: string | null }[]) ?? []) {
        if (row.host_zoom_user_id === null) continue;
        loads[row.host_zoom_user_id] = (loads[row.host_zoom_user_id] ?? 0) + 1;
      }
      return loads;
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

    async insertReservation(row) {
      const { data, error } = await internalClient
        .from('zoom_meetings')
        .insert({ ...row, status: 'pending' })
        .select(
          'id, status, host_zoom_user_id, zoom_meeting_number, effective_settings, starts_at, duration_minutes, last_error'
        )
        .single();
      // 23P01 is not an error condition here — it is the answer "that host is busy".
      if (isExclusionViolation(error)) return { reserved: false };
      if (error) throw new Error(`zoom_meetings reservation failed: ${error.message}`);
      return { reserved: true, row: data as unknown as ProvisionMeetingRow };
    },

    async reserveExistingMeeting(meetingId, hostZoomUserId, startsAt, durationMinutes) {
      const { error } = await internalClient
        .from('zoom_meetings')
        .update({
          host_zoom_user_id: hostZoomUserId,
          starts_at: startsAt,
          duration_minutes: durationMinutes,
          // Re-entering an ACTIVE status is what re-arms the EXCLUDE constraint.
          status: 'pending',
          last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', meetingId);
      if (isExclusionViolation(error)) return false;
      if (error) throw new Error(`zoom_meetings re-reservation failed: ${error.message}`);
      return true;
    },

    async markProvisioned(meetingId, patch) {
      const { error } = await internalClient
        .from('zoom_meetings')
        .update({ ...patch, last_error: null, updated_at: new Date().toISOString() })
        .eq('id', meetingId);
      if (error) throw new Error(`zoom_meetings provision write failed: ${error.message}`);
    },

    async markError(meetingId, lastError) {
      const { error } = await internalClient
        .from('zoom_meetings')
        .update({ status: 'error', last_error: lastError, updated_at: new Date().toISOString() })
        .eq('id', meetingId);
      if (error) throw new Error(`zoom_meetings error write failed: ${error.message}`);
    },

    async recordLastError(meetingId, lastError) {
      const { error } = await internalClient
        .from('zoom_meetings')
        // No `status` key: the row keeps whatever status it has, and keeps its
        // reservation with it.
        .update({ last_error: lastError, updated_at: new Date().toISOString() })
        .eq('id', meetingId);
      if (error) throw new Error(`zoom_meetings last_error write failed: ${error.message}`);
    },

    async releaseReservation(meetingId, lastError) {
      const { error } = await internalClient
        .from('zoom_meetings')
        .update({
          status: 'cancelled',
          last_error: lastError,
          updated_at: new Date().toISOString(),
        })
        .eq('id', meetingId);
      if (error) throw new Error(`zoom_meetings release failed: ${error.message}`);
    },

    async upsertProjection(row) {
      const { error } = await publicClient
        .from('session_meetings_public')
        .upsert(
          { ...row, provider: 'zoom', updated_at: new Date().toISOString() },
          { onConflict: 'surface_type,surface_id' }
        );
      if (error) throw new Error(`session_meetings_public upsert failed: ${error.message}`);
    },
  };
}

export function defaultMeetingProvisionStore(
  env: NodeJS.ProcessEnv = process.env,
  clientFactory: (env: NodeJS.ProcessEnv) => SupabaseClient = createZoomServiceClient
): MeetingProvisionStore {
  const client = clientFactory(env);
  return createSupabaseMeetingProvisionStore(
    client as unknown as ProvisionPublicClient,
    zoomInternalSchema<ProvisionInternalClient>(client)
  );
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/** `HH:MM` / `HH:MM:SS` → `HH:MM:SS`. Zoom wants a full wall-clock timestamp. */
function normalizeTime(time: string): string {
  return time.length === 5 ? `${time}:00` : time.slice(0, 8);
}

/**
 * The wall-clock string Zoom's `start_time` takes, paired with `timezone`. NOT a UTC
 * instant, and deliberately not built with `new Date(...)` — see the module header.
 */
export function toZoomWallClock(sessionDate: string, startTime: string): string {
  return `${sessionDate}T${normalizeTime(startTime)}`;
}

/**
 * Minutes between two Chile wall-clock times on the same session date, via the §10
 * helper. The fallback for a NULL `scheduled_duration_minutes`.
 */
export function deriveDurationMinutes(
  sessionDate: string,
  startTime: string,
  endTime: string
): number {
  const start = getSessionDateTime(sessionDate, normalizeTime(startTime));
  const end = getSessionDateTime(sessionDate, normalizeTime(endTime));
  return Math.round((end.getTime() - start.getTime()) / MINUTE_MS);
}

/**
 * The band `countHostLoads` queries. Mirrors the SQL window's buffers — see the
 * constants' comment for why duplicating them here is safe.
 */
export function reservationOverlapBounds(
  startsAtMs: number,
  durationMinutes: number
): { boundLowerIso: string; boundUpperIso: string } {
  const buffer = (RESERVATION_LEAD_MINUTES + RESERVATION_TRAIL_MINUTES) * MINUTE_MS;
  const endsAtMs = startsAtMs + durationMinutes * MINUTE_MS;
  return {
    boundLowerIso: new Date(startsAtMs - buffer).toISOString(),
    boundUpperIso: new Date(endsAtMs + buffer).toISOString(),
  };
}

/**
 * §9 candidate order: hosts mapped to the session's facilitators first (the LEAD
 * facilitator's host ahead of the others — `session_facilitators.is_lead` is the live
 * column that distinguishes one), then org pool hosts (`profile_id IS NULL`).
 *
 * Within each tier, least-loaded first. The tie-break is `zoom_user_id` ascending so
 * two workers racing on identical inputs try candidates in the SAME order — which
 * makes the 23P01 path deterministic and therefore testable, instead of leaving which
 * worker wins to chance.
 */
export function orderHostCandidates(
  hosts: ProvisionHostRow[],
  facilitators: SessionFacilitatorRow[],
  loads: Record<string, number>
): ProvisionHostRow[] {
  const leadIds = new Set(facilitators.filter((f) => f.is_lead).map((f) => f.user_id));
  const facilitatorIds = new Set(facilitators.map((f) => f.user_id));

  // 0 = lead facilitator's host, 1 = other facilitator's host, 2 = org pool.
  // A host mapped to a profile that is NOT a facilitator of this session is somebody
  // else's personal host and is never a candidate.
  const tierOf = (host: ProvisionHostRow): number | null => {
    if (host.profile_id === null) return 2;
    if (leadIds.has(host.profile_id)) return 0;
    if (facilitatorIds.has(host.profile_id)) return 1;
    return null;
  };

  return hosts
    .map((host) => ({ host, tier: tierOf(host) }))
    .filter((entry): entry is { host: ProvisionHostRow; tier: number } => entry.tier !== null)
    .sort((a, b) => {
      if (a.tier !== b.tier) return a.tier - b.tier;
      const loadDelta = (loads[a.host.zoom_user_id] ?? 0) - (loads[b.host.zoom_user_id] ?? 0);
      if (loadDelta !== 0) return loadDelta;
      return a.host.zoom_user_id < b.host.zoom_user_id ? -1 : 1;
    })
    .map((entry) => entry.host);
}

/**
 * §9.4's drift signal, derived from EFFECTIVE settings — the create response, or what a
 * previous attempt persisted from one. Never a constant: a resume that assumed `'none'`
 * would report a clean run for a meeting Zoom is silently recording.
 *
 * A missing/NULL settings object floors to `'none'`. `markProvisioned` writes the number
 * and the settings in one UPDATE, so "has a meeting number, has no settings" is not a
 * state this handler can produce; the floor is the type-level bottom, not a claim.
 */
export function readAutoRecording(settings: Record<string, unknown> | null | undefined): string {
  return String(settings?.auto_recording ?? 'none');
}

/** The `stage_state.stage` value that marks a landed post-create checkpoint. */
export const CREATED_CHECKPOINT_STAGE = 'created';

/** What a `stage: 'created'` checkpoint carries — enough to persist without Zoom. */
export interface CreatedMeetingCheckpoint {
  meetingId: string;
  number: number;
  passcode: string;
  joinUrl: string;
  settings: Record<string, unknown>;
}

/**
 * Reads a post-create checkpoint out of the claimed job's `stage_state` (anchor 2 in the
 * module header). Total and defensive: `stage_state` is jsonb written by a *previous*
 * deploy of this handler, so anything short of a complete, well-typed checkpoint returns
 * `null` and the caller falls through to the create path. A partial checkpoint must never
 * be persisted as if it were a real meeting.
 */
export function readCreatedCheckpoint(
  stageState: Record<string, unknown> | null | undefined
): CreatedMeetingCheckpoint | null {
  if (!stageState || stageState.stage !== CREATED_CHECKPOINT_STAGE) return null;

  const meetingId = stageState.meeting_id;
  const meeting = stageState.meeting;
  if (typeof meetingId !== 'string' || meetingId === '') return null;
  if (typeof meeting !== 'object' || meeting === null) return null;

  const { number, passcode, join_url: joinUrl, settings } = meeting as Record<string, unknown>;
  if (typeof number !== 'number' || !Number.isFinite(number)) return null;
  if (typeof passcode !== 'string' || passcode === '') return null;
  if (typeof joinUrl !== 'string' || joinUrl === '') return null;
  if (typeof settings !== 'object' || settings === null) return null;

  return {
    meetingId,
    number,
    passcode,
    joinUrl,
    settings: settings as Record<string, unknown>,
  };
}

/**
 * Server-generated, never derived from anything about the session. 10 chars from an
 * unambiguous alphanumeric alphabet, drawn with `crypto.randomInt` (rejection-sampled,
 * so no modulo bias). Zoom allows up to 10 characters for a meeting passcode.
 */
export function generateMeetingPasscode(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  let passcode = '';
  for (let index = 0; index < 10; index += 1) {
    passcode += alphabet[randomInt(alphabet.length)];
  }
  return passcode;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export interface MeetingProvisionDeps {
  api?: ZoomApi;
  store?: MeetingProvisionStore;
  env?: NodeJS.ProcessEnv;
  passcodeFactory?: () => string;
}

export interface MeetingProvisionResult extends Record<string, unknown> {
  meeting_id: string;
  zoom_meeting_number: number;
  host_zoom_user_id: string;
  /** false = a previous attempt had already created it (§12 resume). */
  created: boolean;
  candidates_tried: number;
  /** §9.4: effective `auto_recording` came back as something other than 'none'. */
  settings_drift: boolean;
  effective_auto_recording: string;
}

interface ProvisionPayload {
  surface_type: ZoomSurfaceType;
  surface_id: string;
}

/**
 * Community surfaces arrive in Z6. Until then an unexpected surface type is a
 * programming error, not a transient one — retrying it forever would hide it.
 */
function readPayload(payload: Record<string, unknown>): ProvisionPayload {
  const surfaceType = payload.surface_type;
  const surfaceId = payload.surface_id;

  if (surfaceType !== 'consultor_session') {
    throw new ZoomNonRetryableError(
      `meeting_provision supports surface_type 'consultor_session' only; received '${String(surfaceType)}'.`,
      { operation: 'meeting_provision' }
    );
  }
  if (typeof surfaceId !== 'string' || surfaceId === '') {
    throw new ZoomNonRetryableError('meeting_provision payload is missing surface_id.', {
      operation: 'meeting_provision',
    });
  }
  return { surface_type: surfaceType, surface_id: surfaceId };
}

export function createMeetingProvisionHandler(deps: MeetingProvisionDeps = {}): ZoomJobHandler {
  return async (ctx) => {
    const env = deps.env ?? process.env;
    const api = deps.api ?? getZoomApi(env);
    const store = deps.store ?? defaultMeetingProvisionStore(env);
    const makePasscode = deps.passcodeFactory ?? generateMeetingPasscode;

    const { surface_type: surfaceType, surface_id: surfaceId } = readPayload(ctx.job.payload);

    const session = await store.readSession(surfaceId);
    if (session === null) {
      throw new ZoomNonRetryableError(
        `consultor_session ${surfaceId} does not exist; nothing to provision.`,
        { operation: 'meeting_provision' }
      );
    }

    // --- §8 eligibility, BEFORE any reservation ---------------------------
    // The handler used to validate only the schedule FIELDS, so a cancelled, draft,
    // soft-deleted, `presencial` or non-Zoom session went all the way to `createMeeting`
    // (Sol F3). This gate runs before a host is even resolved, so the ordinary refusal
    // costs one read and writes nothing.
    const ineligible = checkSessionEligibility(session);
    if (ineligible !== null) {
      // ...but a PREVIOUS attempt may already hold a reservation for this surface, and a
      // session that has since been cancelled must not go on blocking a host for a
      // window nobody will use. Release it — but only when it is a bare reservation.
      // A row carrying `zoom_meeting_number` has a real meeting behind it at Zoom, and
      // freeing that interval would let a second meeting be booked onto a host who is
      // genuinely occupied; deleting the Zoom meeting is Z2's cancel flow, not this
      // job's. Same for a live post-create checkpoint.
      const held = await store.findMeetingBySurface(surfaceType, surfaceId);
      const checkpointHere = readCreatedCheckpoint(ctx.job.stage_state);
      const isBareReservation =
        held !== null &&
        held.zoom_meeting_number === null &&
        (ZOOM_MEETING_ACTIVE_STATUSES as readonly string[]).includes(held.status) &&
        !(checkpointHere !== null && checkpointHere.meetingId === held.id) &&
        // ...and not a row parked by an UNRESOLVED ambiguous create: it has no meeting
        // number precisely because we never learned one, which is not the same as
        // knowing no meeting exists (Sol F4).
        !isAmbiguousCreateMarker(held.last_error);

      if (isBareReservation) {
        await store.releaseReservation(
          (held as ProvisionMeetingRow).id,
          `session_ineligible:${ineligible}`
        );
      }

      throw new ZoomSessionIneligibleError(
        `consultor_session ${surfaceId} is not eligible for Zoom provisioning (${ineligible}).`,
        ineligible
      );
    }

    // --- §10 instants -----------------------------------------------------
    const startsAtMs = getSessionDateTime(
      session.session_date,
      normalizeTime(session.start_time)
    ).getTime();
    const startsAtIso = new Date(startsAtMs).toISOString();
    const wallClock = toZoomWallClock(session.session_date, session.start_time);

    const durationMinutes =
      session.scheduled_duration_minutes ??
      deriveDurationMinutes(session.session_date, session.start_time, session.end_time);
    if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
      throw new ZoomNonRetryableError(
        `consultor_session ${surfaceId} has a non-positive duration (${durationMinutes} min).`,
        { operation: 'meeting_provision' }
      );
    }
    const endsAtIso = new Date(startsAtMs + durationMinutes * MINUTE_MS).toISOString();

    // --- Reservation ------------------------------------------------------
    const existing = await store.findMeetingBySurface(surfaceType, surfaceId);

    let meetingId: string;
    let hostZoomUserId: string;
    let candidatesTried = 0;

    // Anchor 1 (module header): a meeting number means Zoom already holds a meeting for
    // this surface. Never create a second one — just finish the remaining steps.
    const alreadyCreated = existing !== null && existing.zoom_meeting_number !== null;

    // Anchor 2: the previous attempt created at Zoom and checkpointed, then died before
    // `markProvisioned` landed. The checkpoint is only adoptable onto the row it names —
    // a checkpoint whose `meeting_id` is not this surface's row is stale, and writing it
    // anywhere else would corrupt a different reservation.
    const checkpoint = readCreatedCheckpoint(ctx.job.stage_state);
    const adoption =
      !alreadyCreated && existing !== null && checkpoint !== null && checkpoint.meetingId === existing.id
        ? { row: existing, checkpoint }
        : null;

    // The crashed-pre-create path: a `pending` row under a host, no meeting at Zoom.
    // Reusing it blindly was Sol F3's second half — the session may have been
    // RESCHEDULED since, in which case the interval the EXCLUDE constraint is
    // protecting is not the interval about to be sent to Zoom, and the host is
    // double-bookable for the time the meeting will actually occupy.
    const heldReservation =
      !alreadyCreated &&
      adoption === null &&
      existing !== null &&
      existing.status === 'pending' &&
      existing.host_zoom_user_id !== null
        ? existing
        : null;

    let resumedHost: string | null = null;
    if (heldReservation !== null) {
      if (reservationMatchesSource(heldReservation, startsAtIso, durationMinutes)) {
        resumedHost = heldReservation.host_zoom_user_id;
      } else {
        // Re-reserve ATOMICALLY on the host we already hold: the UPDATE carries the new
        // interval through the same EXCLUDE predicate, so it either moves the
        // reservation or answers 23P01 because the new window collides with somebody
        // else. There is no moment in between where the row protects neither interval.
        const rereserved = await store.reserveExistingMeeting(
          heldReservation.id,
          heldReservation.host_zoom_user_id as string,
          startsAtIso,
          durationMinutes
        );
        // 23P01 ⇒ this host is busy at the NEW time. Fall through and walk candidates
        // exactly as the fresh path does; the row is still ours to re-point.
        if (rereserved) resumedHost = heldReservation.host_zoom_user_id;
      }
    }

    if (alreadyCreated) {
      meetingId = existing.id;
      hostZoomUserId = existing.host_zoom_user_id ?? '';
    } else if (adoption !== null) {
      meetingId = adoption.row.id;
      hostZoomUserId = adoption.row.host_zoom_user_id ?? '';
    } else if (resumedHost !== null) {
      // Crashed between the reservation and the create, and the reservation still
      // matches the source (either it never drifted, or we just moved it). Re-resolving
      // a host from scratch would only fight our own constraint.
      meetingId = (heldReservation as ProvisionMeetingRow).id;
      hostZoomUserId = resumedHost;
    } else {
      const [hosts, facilitators] = await Promise.all([
        store.listActiveHosts(),
        store.listFacilitators(session.id),
      ]);
      const { boundLowerIso, boundUpperIso } = reservationOverlapBounds(
        startsAtMs,
        durationMinutes
      );
      const loads = await store.countHostLoads(boundLowerIso, boundUpperIso);
      const candidates = orderHostCandidates(hosts, facilitators, loads);

      let reservedId: string | null = null;
      let reservedHost: string | null = null;

      for (const candidate of candidates) {
        candidatesTried += 1;

        if (existing === null) {
          const outcome = await store.insertReservation({
            surface_type: surfaceType,
            surface_id: surfaceId,
            school_id: session.school_id,
            host_zoom_user_id: candidate.zoom_user_id,
            starts_at: startsAtIso,
            duration_minutes: durationMinutes,
          });
          // 23P01 → this host is busy for the window. Nothing was written, so there is
          // nothing to release; try the next candidate.
          if (outcome.reserved === false) continue;
          reservedId = outcome.row.id;
        } else {
          // Resume from `error` (or any other non-active status): the UPDATE back into
          // `pending` re-checks the EXCLUDE constraint, so it can 23P01 too.
          const ok = await store.reserveExistingMeeting(
            existing.id,
            candidate.zoom_user_id,
            startsAtIso,
            durationMinutes
          );
          if (!ok) continue;
          reservedId = existing.id;
        }
        reservedHost = candidate.zoom_user_id;
        break;
      }

      if (reservedId === null || reservedHost === null) {
        // §9: terminal, and visible on the health panel. The ticker stores this
        // structurally — triage keys on `reason`, never on the message.
        throw new ZoomNoHostAvailableError(
          `No Zoom host is free for consultor_session ${surfaceId} at ${startsAtIso} (+${durationMinutes} min); ${candidatesTried} candidate(s) tried.`,
          candidatesTried
        );
      }
      meetingId = reservedId;
      hostZoomUserId = reservedHost;
    }

    // --- Create at Zoom ---------------------------------------------------
    let zoomMeetingNumber: number;
    let effectiveAutoRecording: string;

    if (alreadyCreated) {
      zoomMeetingNumber = existing.zoom_meeting_number as number;
      // Nothing is re-read from Zoom: the row already holds the effective settings the
      // create returned, and a GET here would cost a round trip to learn nothing new.
      // DERIVED from those persisted settings, never assumed — a row provisioned with
      // drifted `auto_recording` must still report the drift on every replay.
      effectiveAutoRecording = readAutoRecording(existing.effective_settings);
    } else if (adoption !== null) {
      // Anchor 2. Zoom already holds this meeting; the only thing the crashed attempt
      // owed the row is this write. No create, and no heartbeat before it — the
      // checkpoint in `stage_state` is the only copy of these values, and a heartbeat
      // carrying a different stage would overwrite it.
      await store.markProvisioned(adoption.row.id, {
        zoom_meeting_number: adoption.checkpoint.number,
        passcode: adoption.checkpoint.passcode,
        join_url: adoption.checkpoint.joinUrl,
        effective_settings: adoption.checkpoint.settings,
        status: 'provisioned',
      });
      zoomMeetingNumber = adoption.checkpoint.number;
      effectiveAutoRecording = readAutoRecording(adoption.checkpoint.settings);
    } else {
      // The reservation is held; the Zoom call is the slow part. Checkpoint before it so
      // a lost lease is noticed before we spend a network round trip on it. Only on this
      // path: the resume paths above must not touch `stage_state`.
      const alive = await ctx.heartbeat({ meeting_id: meetingId, stage: 'reserved' });
      if (!alive) throw new ZoomJobLeaseLostError(ctx.job.id);

      let created;
      try {
        created = await api.createMeeting({
          hostZoomUserId,
          // Staff-authored session title, verbatim. Participant names are NEVER
          // appended — the topic is visible to everyone who joins (§8, Ley 21.719).
          topic: session.title,
          startTime: wallClock,
          durationMinutes,
          timezone: SESSION_TIMEZONE,
          passcode: makePasscode(),
          settings: PROVISION_MEETING_SETTINGS,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        // Did the request reach Zoom? The client answers that, so nothing here does
        // status-code archaeology. A non-`ZoomError` escaping `createMeeting` is treated
        // as ambiguous too: an untyped throw is precisely the case where we do not know.
        const ambiguous = !isZoomError(error) || error.outcome === 'ambiguous';

        if (ambiguous) {
          // NOT markError. Moving the row to `error` would release the interval, and a
          // meeting may exist at Zoom on that host at that time — the retry would then
          // create a SECOND one against a host we had just declared free (Sol F4). The
          // row keeps its `pending` status and its reservation; only `last_error` is
          // written, and the job fails NON-retryably so nothing auto-creates again.
          const requestId = isZoomError(error) ? error.requestId : undefined;
          await store.recordLastError(meetingId, ambiguousCreateMarker(requestId, message));
          throw new ZoomAmbiguousCreateError(
            `createMeeting for consultor_session ${surfaceId} failed with an AMBIGUOUS outcome; a meeting may exist at Zoom and cannot be named from here. Reconcile against Zoom${
              requestId === undefined ? '' : ` (x-zm-request-id ${requestId})`
            }.`,
            requestId
          );
        }

        // DEFINITE pre-create rejection: Zoom answered, and answered without creating.
        // Park the failure on the row and rethrow so `fail_zoom_job` applies its own
        // backoff / dead-letter rules. `error` is NOT an active status, so this also
        // RELEASES the reservation — the EXCLUDE WHERE covers pending/provisioned/
        // started only, and a host held by a job that is not progressing is worse than
        // one that has to be re-reserved on the retry.
        await store.markError(meetingId, message.slice(0, 500));
        throw error;
      }

      // Zoom's create has no idempotency key, so THIS is the irreversible step and the
      // next line is the narrowest the window gets: checkpoint what Zoom just minted
      // into the job's own `stage_state`, atomically with the lease extension, so a
      // crash before `markProvisioned` resumes by ADOPTING rather than creating again.
      // The plaintext passcode is safe here in the §5 sense and adds no surface:
      // `stage_state` lives in `zoom_internal.zoom_jobs`, whose grants are service-role
      // only — the same exposure `zoom_meetings.passcode` already has.
      // Lease lost ⇒ ZoomJobLeaseLostError and NO markError: this worker no longer owns
      // the job, so it must not write its verdict onto another worker's row. Nothing is
      // checkpointed in that case — see the module header's RESIDUAL.
      const stillLeased = await ctx.heartbeat({
        meeting_id: meetingId,
        stage: CREATED_CHECKPOINT_STAGE,
        meeting: {
          number: created.id,
          passcode: created.passcode,
          join_url: created.joinUrl,
          settings: created.settings,
        },
      });
      if (!stillLeased) throw new ZoomJobLeaseLostError(ctx.job.id);

      // Read the RESPONSE, never the request: Zoom reflects EFFECTIVE settings on a
      // capability mismatch (§20) rather than refusing.
      effectiveAutoRecording = readAutoRecording(created.settings);

      await store.markProvisioned(meetingId, {
        zoom_meeting_number: created.id,
        passcode: created.passcode,
        join_url: created.joinUrl,
        // Persisted verbatim. This is also where the §9.4 drift signal LIVES: a value
        // other than 'none' in `effective_settings.auto_recording` is the alert. Drift
        // never keys on `recording_disclaimer` (ledger §9.4).
        effective_settings: created.settings as Record<string, unknown>,
        status: 'provisioned',
      });
      // zoom_meeting_uuid is deliberately NOT written — see the module header.
      zoomMeetingNumber = created.id;
    }

    // --- Projection -------------------------------------------------------
    // `consultor_sessions.meeting_link` is NEVER written: §8 keeps it NULL for managed
    // sessions, so the join path stays the authorized endpoint rather than a bare URL
    // sitting in a public column.
    await store.upsertProjection({
      surface_type: surfaceType,
      surface_id: surfaceId,
      school_id: session.school_id,
      // Carried through so the §7 growth-community SELECT policy can match; a NULL
      // here would make the row invisible to exactly the members it is for.
      growth_community_id: session.growth_community_id,
      meeting_status: 'scheduled',
      starts_at: startsAtIso,
      ends_at: endsAtIso,
    });

    const settingsDrift = effectiveAutoRecording !== 'none';
    if (settingsDrift) {
      console.warn(
        `[meeting-provision] §9.4 settings drift on meeting ${zoomMeetingNumber}: auto_recording='${effectiveAutoRecording}'`
      );
    }

    const result: MeetingProvisionResult = {
      meeting_id: meetingId,
      zoom_meeting_number: zoomMeetingNumber,
      host_zoom_user_id: hostZoomUserId,
      // Both resume anchors mean a PREVIOUS attempt created it at Zoom.
      created: !alreadyCreated && adoption === null,
      candidates_tried: candidatesTried,
      settings_drift: settingsDrift,
      effective_auto_recording: effectiveAutoRecording,
    };
    return result;
  };
}

/** The registry entry. Built per invocation so it can close over deps in tests. */
export const meetingProvisionJobHandler: ZoomJobHandler = (ctx) =>
  createMeetingProvisionHandler()(ctx);
