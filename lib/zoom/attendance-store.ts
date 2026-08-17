/**
 * Persistence seam for participant ingestion (plan §6/§7; Z7-2 under §15.3.9).
 *
 * Structural, exactly like `webhook-store.ts` and `token.ts`: production speaks
 * `serviceClient` across two schemas, and the suites hand in a plain object rather than
 * standing up Postgres.
 *
 * ## Why this is a SEPARATE interface from `ZoomWebhookStore`
 *
 * Two reasons, and the second is the load-bearing one:
 *
 *  1. Widening `ZoomWebhookStore` would force every existing route/sweep test double to
 *     implement methods those callers never reach — the same argument its own header
 *     makes for keeping `ZoomWebhookSweepStore` separate.
 *  2. **It cannot write `zoom_meetings` and there is no method here that could.** A
 *     participant event must never move `status` or `meeting_status`: a `started` write
 *     would re-enter the §9 EXCLUDE active set and re-acquire a host for a window that
 *     may be over. Keeping the two stores apart makes that a property of the TYPE
 *     rather than of the applier's discipline — the participant path is handed an
 *     object that has no way to do it.
 *
 * Surface resolution therefore READS `zoom_meetings` and nothing more: occurrence uuid
 * first (Zoom's own key for the occurrence, written by `meeting.started`), then meeting
 * number (which covers a participant event that arrives before `meeting.started`, when
 * the uuid column is still NULL). Unresolved is not an error — a meeting created outside
 * the LMS produces participant events too, and the ledger row is the whole of the work.
 *
 * ## The leave path is ONE store call, because it is ONE transaction (§15.3.9)
 *
 * `insertInterval` and `applyLeave` map onto occurrence-authoritative database RPCs.
 * Each atomically claims a NULL meeting occurrence or matches the established value
 * before writing, closing the meeting-number lookup/write race without moving status.
 * `applyLeave` then records the observation and performs any eligible close inside a
 * single database transaction.
 * The decision itself — close only via a Zoom-minted `participant_uuid` matching
 * exactly one open row — lives in that function, next to the row locks that make it
 * race-proof. There is deliberately no `listOpenIntervals`/`closeInterval` pair here
 * any more: a two-call shape is exactly what allowed one application to close the
 * interval while a concurrent one logged the same delivery as unmatched.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { createZoomServiceClient, zoomInternalSchema } from './service-client';
import type { ZoomSurfaceType } from './db-types';
import type { AttendeeCandidate } from './attendance-identity';

/** The surface a participant event belongs to, plus the §6 school scope its row needs. */
export interface AttendanceSurface {
  surfaceType: ZoomSurfaceType;
  surfaceId: string;
  schoolId: number;
  /** The occurrence uuid as recorded on the meeting row; null before `meeting.started`. */
  zoomMeetingUuid: string | null;
}

/** A row to insert. Mirrors the table; `source` is always `'webhook'` here. */
export interface AttendanceIntervalInsert {
  surfaceType: ZoomSurfaceType;
  surfaceId: string;
  schoolId: number;
  zoomMeetingUuid: string;
  participantUuid: string | null;
  userId: string | null;
  customerKey: string | null;
  displayName: string | null;
  transientEmail: string | null;
  matchedBy: string;
  joinedAt: string;
  /** Every identity rank this participant presented, strongest first — evidence only. */
  identityTokens: string[];
  /** The ledger dedupe_key of the delivery that produced this row. UNIQUE. */
  sourceEventKey: string | null;
}

/** Database outcomes for one occurrence-authoritative participant join. */
export type AttendanceInsertResult = 'inserted' | 'duplicate' | 'occurrence_mismatch';

/**
 * One `participant_left` delivery, handed to the database whole. Everything the
 * observation row persists (§15.3.9) plus the two values the close decision needs:
 * the instant and the only token that may authorise it.
 */
export interface LeaveApplication {
  surfaceType: ZoomSurfaceType;
  surfaceId: string;
  schoolId: number;
  zoomMeetingUuid: string;
  /** The delivery's ledger dedupe_key. The observation's UNIQUE idempotency key. */
  sourceEventKey: string;
  /** The leave instant, or null when the delivery carried no usable one. */
  observedAt: string | null;
  participantUuid: string | null;
  customerKey: string | null;
  displayName: string | null;
  transientEmail: string | null;
  identityTokens: string[];
}

/**
 * What `zoom_internal.apply_participant_leave` decided. The first four are recorded on
 * the observation row; `observation_duplicate` means another application of this same
 * delivery already committed, and this call's work — including any close — was rolled
 * back in full.
 */
export type LeaveApplyOutcome =
  | 'interval_closed'
  | 'no_open_interval'
  | 'unpairable_leave'
  | 'no_instant'
  | 'observation_duplicate'
  | 'occurrence_mismatch';

const LEAVE_APPLY_OUTCOMES: readonly LeaveApplyOutcome[] = [
  'interval_closed',
  'no_open_interval',
  'unpairable_leave',
  'no_instant',
  'observation_duplicate',
  'occurrence_mismatch',
];

export interface ZoomAttendanceStore {
  /** Occurrence uuid → surface. Reads `zoom_internal.zoom_meetings`; writes nothing. */
  findSurfaceByOccurrence(occurrenceUuid: string): Promise<AttendanceSurface | null>;
  /** Meeting number → surface, for events that beat `meeting.started` to the row. */
  findSurfaceByMeetingNumber(meetingNumber: number): Promise<AttendanceSurface | null>;
  /** `profiles.id` when that row exists — a decoded key that names nobody is no match. */
  profileExists(profileId: string): Promise<boolean>;
  /** `profiles.id` for an e-mail, case-insensitively; null when nobody holds it. */
  findProfileIdByEmail(email: string): Promise<string | null>;
  /** The expected attendees of this surface — the ONLY pool a name may match. */
  listExpectedAttendees(surface: AttendanceSurface): Promise<AttendeeCandidate[]>;
  /** Insert one interval. Reports the unique-index conflict as `'duplicate'`. */
  insertInterval(row: AttendanceIntervalInsert): Promise<AttendanceInsertResult>;
  /**
   * Record one leave observation and perform any eligible close, atomically
   * (`zoom_internal.apply_participant_leave`). The §15.3.9 decision happens inside
   * the database transaction, not here.
   */
  applyLeave(leave: LeaveApplication): Promise<LeaveApplyOutcome>;
}

// ---------------------------------------------------------------------------
// Supabase-backed store
// ---------------------------------------------------------------------------

interface PostgrestError {
  message: string;
  code?: string;
}

interface MeetingSurfaceRow {
  surface_type: ZoomSurfaceType;
  surface_id: string;
  school_id: number;
  zoom_meeting_uuid: string | null;
}

interface IdRow {
  id: string;
}

interface AttendeeRow {
  user_id: string;
  profiles?: { name: string | null } | { name: string | null }[] | null;
}

/**
 * The `zoom_internal` half — one surface lookup and the leave RPC, and deliberately no
 * `update` or `insert` member. See the module header: the participant path's inability
 * to move a meeting's status is expressed in this type.
 */
export interface AttendanceInternalClient {
  from(table: string): {
    select(columns: string): {
      eq(
        column: string,
        value: string | number
      ): {
        maybeSingle(): PromiseLike<{
          data: MeetingSurfaceRow | null;
          error: PostgrestError | null;
        }>;
      };
    };
  };
  /**
   * `zoom_internal.apply_participant_leave` — the one-transaction leave applier.
   * Declared here rather than on a shared client type because this store is its only
   * caller.
   */
  rpc(
    fn: string,
    args: Record<string, unknown>
  ): PromiseLike<{ data: unknown; error: PostgrestError | null }>;
}

/** The `public` half: attendance rows, profiles, and the two expected-attendee tables. */
export interface AttendancePublicClient {
  from(table: string): {
    select(columns: string): {
      eq(
        column: string,
        value: string | number
      ): PromiseLike<{ data: AttendeeRow[] | null; error: PostgrestError | null }> & {
        maybeSingle(): PromiseLike<{ data: IdRow | null; error: PostgrestError | null }>;
      };
      ilike(
        column: string,
        value: string
      ): {
        limit(count: number): PromiseLike<{
          data: IdRow[] | null;
          error: PostgrestError | null;
        }>;
      };
    };
  };
}

/** Which table lists the expected attendees of each surface type. */
const EXPECTED_ATTENDEE_SOURCE: Record<
  ZoomSurfaceType,
  { table: string; surfaceColumn: string }
> = {
  consultor_session: { table: 'session_attendees', surfaceColumn: 'session_id' },
  community_meeting: { table: 'meeting_attendees', surfaceColumn: 'meeting_id' },
};

function readCandidateName(row: AttendeeRow): string | null {
  const joined = row.profiles;
  if (joined === null || joined === undefined) return null;
  const profile = Array.isArray(joined) ? joined[0] : joined;
  return profile?.name ?? null;
}

export function createSupabaseAttendanceStore(
  internalClient: AttendanceInternalClient,
  publicClient: AttendancePublicClient
): ZoomAttendanceStore {
  async function readSurface(
    column: string,
    value: string | number
  ): Promise<AttendanceSurface | null> {
    const { data, error } = await internalClient
      .from('zoom_meetings')
      .select('surface_type, surface_id, school_id, zoom_meeting_uuid')
      .eq(column, value)
      .maybeSingle();

    if (error) {
      throw new Error(`zoom_meetings surface lookup failed: ${error.message}`);
    }
    if (!data) return null;
    return {
      surfaceType: data.surface_type,
      surfaceId: data.surface_id,
      schoolId: data.school_id,
      zoomMeetingUuid: data.zoom_meeting_uuid,
    };
  }

  return {
    findSurfaceByOccurrence(occurrenceUuid) {
      return readSurface('zoom_meeting_uuid', occurrenceUuid);
    },

    findSurfaceByMeetingNumber(meetingNumber) {
      return readSurface('zoom_meeting_number', meetingNumber);
    },

    async profileExists(profileId) {
      const { data, error } = await publicClient
        .from('profiles')
        .select('id')
        .eq('id', profileId)
        .maybeSingle();

      if (error) {
        throw new Error(`profiles lookup failed: ${error.message}`);
      }
      return data !== null;
    },

    async findProfileIdByEmail(email) {
      // `ilike` without wildcards is an exact case-insensitive compare. Zoom lower-cases
      // inconsistently across events, and an e-mail is the same identity either way.
      //
      // `profiles.email` is NOT database-unique (Codex ruling), so this takes two rows
      // and treats two as AMBIGUOUS — the same rule the name branch applies, and for the
      // same reason: picking one of two people is a coin flip presented to an admin as
      // evidence. `.maybeSingle()` would instead THROW on the duplicate, which from
      // inside the webhook route is a 500 and a Zoom retry loop against a body that can
      // never succeed.
      const { data, error } = await publicClient
        .from('profiles')
        .select('id')
        .ilike('email', email)
        .limit(2);

      if (error) {
        throw new Error(`profiles e-mail lookup failed: ${error.message}`);
      }
      return (data ?? []).length === 1 ? data![0].id : null;
    },

    async listExpectedAttendees(surface) {
      const source = EXPECTED_ATTENDEE_SOURCE[surface.surfaceType];
      const { data, error } = await publicClient
        .from(source.table)
        .select('user_id, profiles(name)')
        .eq(source.surfaceColumn, surface.surfaceId);

      if (error) {
        throw new Error(`${source.table} attendee lookup failed: ${error.message}`);
      }
      return (data ?? []).map((row) => ({
        userId: row.user_id,
        name: readCandidateName(row),
      }));
    },

    async insertInterval(row) {
      const { data, error } = await internalClient.rpc('apply_participant_join', {
        p_surface_type: row.surfaceType,
        p_surface_id: row.surfaceId,
        p_school_id: row.schoolId,
        p_zoom_meeting_uuid: row.zoomMeetingUuid,
        p_participant_uuid: row.participantUuid,
        p_user_id: row.userId,
        p_customer_key: row.customerKey,
        p_display_name: row.displayName,
        p_transient_email: row.transientEmail,
        p_matched_by: row.matchedBy,
        p_joined_at: row.joinedAt,
        p_identity_tokens: row.identityTokens.length > 0 ? row.identityTokens : null,
        p_source_event_key: row.sourceEventKey,
      });

      if (error) {
        throw new Error(`apply_participant_join failed: ${error.message}`);
      }
      if (data === 'interval_opened') return 'inserted';
      if (data === 'interval_duplicate') return 'duplicate';
      if (data === 'occurrence_mismatch') return 'occurrence_mismatch';
      throw new Error(`apply_participant_join returned an unknown outcome: ${String(data)}`);
    },

    async applyLeave(leave) {
      const { data, error } = await internalClient.rpc('apply_participant_leave', {
        p_surface_type: leave.surfaceType,
        p_surface_id: leave.surfaceId,
        p_school_id: leave.schoolId,
        p_zoom_meeting_uuid: leave.zoomMeetingUuid,
        p_source_event_key: leave.sourceEventKey,
        p_observed_at: leave.observedAt,
        p_participant_uuid: leave.participantUuid,
        p_customer_key: leave.customerKey,
        p_display_name: leave.displayName,
        p_transient_email: leave.transientEmail,
        p_identity_tokens: leave.identityTokens.length > 0 ? leave.identityTokens : null,
      });

      if (error) {
        throw new Error(`apply_participant_leave failed: ${error.message}`);
      }
      if (
        typeof data !== 'string' ||
        !(LEAVE_APPLY_OUTCOMES as readonly string[]).includes(data)
      ) {
        // A shape this store does not recognise is a deploy-order problem (function
        // and code out of step), which no retry fixes silently — say so.
        throw new Error(`apply_participant_leave returned an unknown outcome: ${String(data)}`);
      }
      return data as LeaveApplyOutcome;
    },
  };
}

/** Lazily builds the production store. Never called at module scope. */
export function defaultZoomAttendanceStore(
  env: NodeJS.ProcessEnv = process.env,
  clientFactory: (env: NodeJS.ProcessEnv) => SupabaseClient = createZoomServiceClient
): ZoomAttendanceStore {
  const client = clientFactory(env);
  return createSupabaseAttendanceStore(
    zoomInternalSchema<AttendanceInternalClient>(client),
    client as unknown as AttendancePublicClient
  );
}
