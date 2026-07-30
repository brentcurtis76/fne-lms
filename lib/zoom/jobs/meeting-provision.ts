/**
 * `meeting_provision` — creates the Zoom meeting for an LMS surface under a host the
 * database itself reserved (plan §8 provisioning lifecycle, §9 host resolution + the
 * EXCLUDE reservation, §10 timezone rules, §12 staged idempotent pipelines).
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
 * `zoom_meeting_number` is the anchor: once it is set, the meeting exists at Zoom and
 * NO re-run may create a second one. A re-run then only finishes the remaining steps.
 * Everything else is an absolute write, never a guarded transition.
 *
 * Note the `complete_zoom_job` contract (Z1b-3 finding ③): completion REPLACES
 * `stage_state` with the handler's return value, so nothing that must survive across
 * attempts is parked there. Cross-attempt state lives in the `zoom_meetings` row
 * itself; `heartbeat(stage_state)` carries only in-run progress.
 */
import { randomInt } from 'crypto';
import { getSessionDateTime, SESSION_TIMEZONE } from '../../utils/session-timezone';
import { getZoomApi, type ZoomApi, type ZoomMeetingSettings } from '../api';
import { ZoomNonRetryableError } from '../errors';
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
  starts_at: string;
  duration_minutes: number;
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
          'id, school_id, growth_community_id, title, session_date, start_time, end_time, scheduled_duration_minutes'
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
        .select('id, status, host_zoom_user_id, zoom_meeting_number, starts_at, duration_minutes')
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
        .select('id, status, host_zoom_user_id, zoom_meeting_number, starts_at, duration_minutes')
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

    // The idempotence anchor: a meeting number means Zoom already holds a meeting for
    // this surface. Never create a second one — just finish the remaining steps.
    const alreadyCreated = existing !== null && existing.zoom_meeting_number !== null;

    if (alreadyCreated) {
      meetingId = existing.id;
      hostZoomUserId = existing.host_zoom_user_id ?? '';
    } else if (existing !== null && existing.status === 'pending' && existing.host_zoom_user_id) {
      // Crashed between the reservation and the create. The reservation is still held
      // by this very row, so re-resolving a host would only fight our own constraint.
      meetingId = existing.id;
      hostZoomUserId = existing.host_zoom_user_id;
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

    // The reservation is held; the Zoom call is the slow part. Checkpoint before it so
    // a lost lease is noticed before we spend a network round trip on it.
    const alive = await ctx.heartbeat({ meeting_id: meetingId, stage: 'reserved' });
    if (!alive) throw new ZoomJobLeaseLostError(ctx.job.id);

    // --- Create at Zoom ---------------------------------------------------
    let zoomMeetingNumber: number;
    let effectiveAutoRecording: string;

    if (alreadyCreated) {
      zoomMeetingNumber = existing.zoom_meeting_number as number;
      // Nothing is re-read from Zoom: the row already holds the effective settings the
      // create returned, and a GET here would cost a round trip to learn nothing new.
      effectiveAutoRecording = 'none';
    } else {
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
        // Park the failure on the row, then rethrow so `fail_zoom_job` applies its own
        // backoff / dead-letter rules. `error` is NOT an active status, so this also
        // RELEASES the reservation — the EXCLUDE WHERE covers pending/provisioned/
        // started only, and a host held by a job that is not progressing is worse than
        // one that has to be re-reserved on the retry.
        const message = error instanceof Error ? error.message : String(error);
        await store.markError(meetingId, message.slice(0, 500));
        throw error;
      }

      // Read the RESPONSE, never the request: Zoom reflects EFFECTIVE settings on a
      // capability mismatch (§20) rather than refusing.
      effectiveAutoRecording = String(created.settings.auto_recording ?? 'none');

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
      created: !alreadyCreated,
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
