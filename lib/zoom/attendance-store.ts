/**
 * Persistence seam for participant ingestion (plan §6/§7; Z7-2).
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
 *  2. **It cannot write `zoom_meetings` and there is no method here that could** ([R2],
 *     `[B8]`). A participant event must never move `status` or `meeting_status`: a
 *     `started` write would re-enter the §9 EXCLUDE active set and re-acquire a host for
 *     a window that may be over. Keeping the two stores apart makes that a property of
 *     the TYPE rather than of the applier's discipline — the participant path is handed
 *     an object that has no way to do it.
 *
 * Surface resolution therefore READS `zoom_meetings` and nothing more: occurrence uuid
 * first (Zoom's own key for the occurrence, written by `meeting.started`), then meeting
 * number (which covers a participant event that arrives before `meeting.started`, when
 * the uuid column is still NULL). Unresolved is not an error — a meeting created outside
 * the LMS produces participant events too, and the ledger row is the whole of the work.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { createZoomServiceClient, zoomInternalSchema } from './service-client';
import type { ZoomSurfaceType } from './db-types';
import type { AttendeeCandidate } from './attendance-identity';
import type { StoredInterval } from './attendance-intervals';

/** The surface a participant event belongs to, plus the §6 school scope its row needs. */
export interface AttendanceSurface {
  surfaceType: ZoomSurfaceType;
  surfaceId: string;
  schoolId: number;
  /** The occurrence uuid as recorded on the meeting row; null before `meeting.started`. */
  zoomMeetingUuid: string | null;
}

/** A row to insert. Mirrors the table; `source` is always `'webhook'` here ([R9]). */
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
  /** EVERY fallback rank this participant presented, strongest first ([R3]). */
  identityTokens: string[];
  /** The ledger dedupe_key of the delivery that produced this row. UNIQUE. */
  sourceEventKey: string | null;
}

/** `'duplicate'` = the partial unique index absorbed a redelivery. Never an error. */
export type AttendanceInsertResult = 'inserted' | 'duplicate';

/**
 * How to find the open intervals a `participant_left` might close.
 *
 * Exactly TWO keys, in [R3]'s order. There is deliberately no way to express "match any
 * of these identity columns" — OR-ing them was the first Codex `FAIL`.
 *
 * `identityToken` is the LEAVE's own strongest token, and it is matched against the
 * stored `identity_tokens` ARRAY by containment. The asymmetry is the fix for the second
 * `FAIL`: widening what a join is findable BY (every rank it presented) lets a leave that
 * presented fewer fields still find its own row, while keeping the leave's own search key
 * at its strongest rank so a strong-evidence leave is never matched by name.
 */
export interface OpenIntervalQuery {
  zoomMeetingUuid: string;
  /** Preferred key when Zoom supplied one ([R3]). */
  participantUuid: string | null;
  /** The LEAVE's strongest token; matched against the stored array by containment. */
  identityToken: string | null;
}

export interface ZoomAttendanceStore {
  /** Occurrence uuid → surface. Reads `zoom_internal.zoom_meetings`; writes nothing. */
  findSurfaceByOccurrence(occurrenceUuid: string): Promise<AttendanceSurface | null>;
  /** Meeting number → surface, for events that beat `meeting.started` to the row. */
  findSurfaceByMeetingNumber(meetingNumber: number): Promise<AttendanceSurface | null>;
  /** `profiles.id` when that row exists — a decoded key that names nobody is no match. */
  profileExists(profileId: string): Promise<boolean>;
  /** `profiles.id` for an e-mail, case-insensitively; null when nobody holds it. */
  findProfileIdByEmail(email: string): Promise<string | null>;
  /** The expected attendees of this surface — the ONLY pool a name may match ([R6]). */
  listExpectedAttendees(surface: AttendanceSurface): Promise<AttendeeCandidate[]>;
  /** Insert one interval. Reports the unique-index conflict as `'duplicate'`. */
  insertInterval(row: AttendanceIntervalInsert): Promise<AttendanceInsertResult>;
  /** Open intervals (`left_at IS NULL`) that could belong to this participant. */
  listOpenIntervals(query: OpenIntervalQuery): Promise<StoredInterval[]>;
  /** Closes one interval. Guarded by `left_at IS NULL` so a replay cannot re-close it. */
  closeInterval(intervalId: string, leftAt: string): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// Supabase-backed store
// ---------------------------------------------------------------------------

interface PostgrestError {
  message: string;
  code?: string;
}

/** Postgres `unique_violation`. The partial index reporting an absorbed redelivery. */
const UNIQUE_VIOLATION = '23505';

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

interface OpenIntervalRow {
  id: string;
  joined_at: string;
  left_at: string | null;
}

/**
 * The `zoom_internal` half — read-only, one table, and deliberately no `update` or
 * `insert` member. See the module header: the participant path's inability to move a
 * meeting's status is expressed in this type.
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
        is(
          column: string,
          value: null
        ): {
          // No `or(...)` member, and that absence is deliberate: the open-interval
          // lookup must be exact equality on ONE key (Codex P1-1), so the type does not
          // offer a way to widen it.
          eq(
            column: string,
            value: string
          ): {
            order(
              column: string,
              options: { ascending: boolean }
            ): PromiseLike<{
              data: OpenIntervalRow[] | null;
              error: PostgrestError | null;
            }>;
          };
          /**
           * `identity_tokens @> ARRAY[token]`. The fallback pairing lookup — still ONE
           * search key, matched against every rank the join recorded.
           */
          contains(
            column: string,
            value: string[]
          ): {
            order(
              column: string,
              options: { ascending: boolean }
            ): PromiseLike<{
              data: OpenIntervalRow[] | null;
              error: PostgrestError | null;
            }>;
          };
        };
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
    insert(values: Record<string, unknown>): PromiseLike<{ error: PostgrestError | null }>;
    update(values: Record<string, unknown>): {
      eq(
        column: string,
        value: string
      ): {
        is(
          column: string,
          value: null
        ): {
          select(columns: string): PromiseLike<{
            data: IdRow[] | null;
            error: PostgrestError | null;
          }>;
        };
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

function toStoredInterval(row: OpenIntervalRow): StoredInterval {
  return { id: row.id, joinedAt: row.joined_at, leftAt: row.left_at };
}

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
      const { error } = await publicClient.from('zoom_attendance').insert({
        surface_type: row.surfaceType,
        surface_id: row.surfaceId,
        school_id: row.schoolId,
        zoom_meeting_uuid: row.zoomMeetingUuid,
        participant_uuid: row.participantUuid,
        user_id: row.userId,
        customer_key: row.customerKey,
        display_name: row.displayName,
        transient_email: row.transientEmail,
        matched_by: row.matchedBy,
        joined_at: row.joinedAt,
        identity_tokens: row.identityTokens.length > 0 ? row.identityTokens : null,
        source_event_key: row.sourceEventKey,
        source: 'webhook',
      });

      if (error) {
        // EITHER partial unique index doing its job — `(zoom_meeting_uuid,
        // participant_uuid)` for a uuid-bearing redelivery, or `source_event_key` for
        // any redelivery at all, including the uuid-less one that used to rely on a
        // read-then-insert (Codex P1-2). Both resolve inside Postgres, so two concurrent
        // deliveries cannot both win. Absorbed, exactly like the webhook ledger's own
        // conflict path.
        if (error.code === UNIQUE_VIOLATION) return 'duplicate';
        throw new Error(`zoom_attendance insert failed: ${error.message}`);
      }
      return 'inserted';
    },

    async listOpenIntervals(query) {
      // ONE search key, and NOTHING when the participant presented no identity — "match
      // on whatever fields happen to be present" is how a shared display name closes a
      // stranger's interval (Codex P1-1).
      //
      // The uuid path is exact equality. The fallback path is array CONTAINMENT: the
      // leave's strongest token against every rank the join recorded, which is what lets
      // a downgraded leave find its own row instead of a namesake's (Codex re-review).
      if (query.participantUuid !== null) {
        const { data, error } = await publicClient
          .from('zoom_attendance')
          .select('id, joined_at, left_at')
          .eq('zoom_meeting_uuid', query.zoomMeetingUuid)
          .is('left_at', null)
          .eq('participant_uuid', query.participantUuid)
          .order('joined_at', { ascending: false });
        if (error) {
          throw new Error(`zoom_attendance open-interval lookup failed: ${error.message}`);
        }
        return (data ?? []).map(toStoredInterval);
      }

      if (query.identityToken === null) return [];

      const { data, error } = await publicClient
        .from('zoom_attendance')
        .select('id, joined_at, left_at')
        .eq('zoom_meeting_uuid', query.zoomMeetingUuid)
        .is('left_at', null)
        .contains('identity_tokens', [query.identityToken])
        .order('joined_at', { ascending: false });

      if (error) {
        throw new Error(`zoom_attendance open-interval lookup failed: ${error.message}`);
      }
      return (data ?? []).map(toStoredInterval);
    },

    async closeInterval(intervalId, leftAt) {
      // `.is('left_at', null)` IS the guard, evaluated by Postgres inside the UPDATE:
      // a replayed `participant_left` matches zero rows rather than moving a close that
      // already happened. Same shape as the lifecycle's status guard, same reason.
      const { data, error } = await publicClient
        .from('zoom_attendance')
        .update({ left_at: leftAt, updated_at: new Date().toISOString() })
        .eq('id', intervalId)
        .is('left_at', null)
        .select('id');

      if (error) {
        throw new Error(`zoom_attendance close failed: ${error.message}`);
      }
      return (data ?? []).length > 0;
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
