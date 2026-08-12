/**
 * The participant-event applier (plan §11; Z7-2 [R1]–[R9]).
 *
 * Sibling of `webhook-lifecycle.ts`, deliberately NOT an extension of it.
 * `LIFECYCLE_EVENT_TYPES` names the two events that move a row's **status**; a
 * participant event moves none ([R1]/[R2]). Widening that set would have put an
 * attendance write behind a guard designed for a status machine, and — worse — made it
 * possible for a participant event to reach `setMeetingStatus`, where a `started` write
 * re-enters the §9 EXCLUDE active set and re-acquires a host for a window that may be
 * over. The two appliers share the store-shaped seam idiom and nothing else.
 *
 * Extracted rather than inlined in the route for the same reason the lifecycle was:
 * **both the route and `webhook_sweep` call this function.** The sweep exists to
 * re-apply events the route recorded but never applied, so "the same ingestion" has to
 * mean the same code — two copies would drift, and the copy that drifted would be the
 * one only the recovery path exercises, i.e. the one nobody watches.
 *
 * ## Everything here fails toward "no row" rather than toward a wrong row
 *
 * Unresolved surface → ledger-only, caller reports success ([R2]). Unmatchable identity
 * → `matched_by = 'unmatched'` with a NULL `user_id` ([R5]). A `participant_left` that
 * pairs with nothing → **no row at all** ([R4]), because `joined_at` is `NOT NULL` and
 * every alternative fabricates: `joined_at = leave_time` invents a zero-length interval
 * that understates presence, and `joined_at = actual_started_at` invents presence nobody
 * observed. Z7-3's participant report is authoritative (§11) and supplies the truth.
 * An out-of-order `leave_time` → the interval stays open ([R7]) and nothing raises,
 * because a constraint violation escaping this function becomes a 500 and Zoom retries
 * the same malformed body forever against an endpoint that can never accept it.
 */
import {
  identityToken,
  identityTokens,
  matchParticipantIdentity,
  profileIdFromCustomerKey,
  readParticipantField,
  readParticipantIdentity,
  type ParticipantIdentity,
} from './attendance-identity';
import { selectIntervalToClose } from './attendance-intervals';
import type { AttendanceSurface, ZoomAttendanceStore } from './attendance-store';
import { readLifecycleInstant, readMeetingNumber, readOccurrenceUuid } from './webhook-lifecycle';

/**
 * The two events this applier handles. A SEPARATE set from `LIFECYCLE_EVENT_TYPES` —
 * see the module header.
 */
export const PARTICIPANT_EVENT_TYPES = [
  'meeting.participant_joined',
  'meeting.participant_left',
] as const;

export type ParticipantEventType = (typeof PARTICIPANT_EVENT_TYPES)[number];

export function isParticipantEventType(eventType: string): eventType is ParticipantEventType {
  return (PARTICIPANT_EVENT_TYPES as readonly string[]).includes(eventType);
}

/** The slice of `payload.object` a participant event carries. */
export interface ZoomParticipantObject {
  id?: unknown;
  uuid?: unknown;
  participant?: unknown;
}

/** What the applier did — for the caller's logs and for the suites to assert on. */
export type ParticipantApplyOutcome =
  | 'ignored_event_type'
  | 'unresolved_surface'
  | 'no_occurrence_uuid'
  | 'no_instant'
  | 'unpairable_leave'
  | 'interval_opened'
  | 'interval_duplicate'
  | 'interval_closed'
  | 'no_open_interval';

/**
 * Resolves the surface for a participant event: occurrence uuid first, then meeting
 * number ([R2]).
 *
 * The uuid is Zoom's own key for the occurrence and the one `zoom_attendance` stores, so
 * it is tried first. The number is the fallback that covers a participant event arriving
 * BEFORE `meeting.started` — normal, since the first participant joining is often what
 * starts the meeting — at which point `zoom_meetings.zoom_meeting_uuid` is still NULL
 * and the uuid lookup cannot match.
 */
async function resolveSurface(
  store: ZoomAttendanceStore,
  object: ZoomParticipantObject | undefined
): Promise<AttendanceSurface | null> {
  const occurrenceUuid = readOccurrenceUuid(object?.uuid);
  if (occurrenceUuid !== null) {
    const byOccurrence = await store.findSurfaceByOccurrence(occurrenceUuid);
    if (byOccurrence !== null) return byOccurrence;
  }
  const meetingNumber = readMeetingNumber(object?.id);
  if (meetingNumber === null) return null;
  return store.findSurfaceByMeetingNumber(meetingNumber);
}

/**
 * Fills the lookups the pure matcher needs, short-circuiting as the hierarchy allows: a
 * `customer_key` hit means the e-mail and attendee queries are never issued.
 *
 * The pure matcher still applies the precedence itself, so this function cannot change
 * the ORDER of the hierarchy by changing what it resolves — only how much work it does.
 */
async function resolveMatch(
  store: ZoomAttendanceStore,
  surface: AttendanceSurface,
  identity: ParticipantIdentity
) {
  const decoded = profileIdFromCustomerKey(identity.customerKey);
  if (decoded !== null && (await store.profileExists(decoded))) {
    return matchParticipantIdentity(identity, {
      customerKeyProfileId: decoded,
      emailProfileId: null,
      expectedAttendees: [],
    });
  }

  const emailProfileId =
    identity.email === null ? null : await store.findProfileIdByEmail(identity.email);
  if (emailProfileId !== null) {
    return matchParticipantIdentity(identity, {
      customerKeyProfileId: null,
      emailProfileId,
      expectedAttendees: [],
    });
  }

  // Only now is the attendee list worth fetching — and it is the ONLY pool a display
  // name may be matched against ([R6]).
  const expectedAttendees = await store.listExpectedAttendees(surface);
  return matchParticipantIdentity(identity, {
    customerKeyProfileId: null,
    emailProfileId: null,
    expectedAttendees,
  });
}

/**
 * Applies one participant event. Rows only, never a status, never a `zoom_meetings`
 * insert ([R2]/`[B8]`) — the store it is handed has no method that could.
 */
export async function applyParticipantEvent(
  store: ZoomAttendanceStore,
  eventType: string,
  object: ZoomParticipantObject | undefined,
  /** The body's `event_ts`, in milliseconds. The fallback, never the header value. */
  eventTsMs?: unknown,
  /**
   * The webhook ledger's `dedupe_key` — `sha256(raw body)` — for the delivery being
   * applied. It becomes the row's `source_event_key`, whose UNIQUE index is what makes
   * a redelivery idempotent inside Postgres instead of inside a read-then-insert the
   * applier could lose a race on (Codex P1-2). Both callers pass it.
   */
  sourceEventKey?: string | null
): Promise<ParticipantApplyOutcome> {
  if (!isParticipantEventType(eventType)) return 'ignored_event_type';

  const surface = await resolveSurface(store, object);
  // A meeting created outside the LMS produces participant events too. Ledger-only is
  // the whole of the work, and the caller still reports success.
  if (surface === null) return 'unresolved_surface';

  // The row's occurrence key. Prefer the event's own uuid; fall back to whatever the
  // meeting row already recorded, so an event that beat `meeting.started` can still be
  // attributed once that row has a uuid.
  const occurrenceUuid = readOccurrenceUuid(object?.uuid) ?? surface.zoomMeetingUuid;
  if (occurrenceUuid === null) return 'no_occurrence_uuid';

  const participant = (object?.participant ?? {}) as Record<string, unknown>;
  const identity = readParticipantIdentity(participant);
  // Preferred interval key ([R3]). `readParticipantField` is what keeps Zoom's `""` from
  // becoming a key that every anonymous guest of this occurrence would share.
  const participantUuid = readParticipantField(participant.participant_uuid);
  // The fallback key. Null means this participant presented no identity at all, so no
  // join and no leave can ever be paired with each other.
  const token = identityToken(identity);

  if (eventType === 'meeting.participant_joined') {
    const joinedAt = readLifecycleInstant(participant.join_time, eventTsMs);
    // No usable instant means no row: `joined_at` is NOT NULL and anchoring it on
    // anything else would fabricate the interval this table exists to observe.
    if (joinedAt === null) return 'no_instant';

    // NO read-then-insert dedupe here, deliberately. Idempotency is the database's job:
    // `(zoom_meeting_uuid, participant_uuid)` catches a uuid-bearing redelivery and
    // `source_event_key` catches every redelivery including the uuid-less one. A check
    // in this process would be a race two concurrent deliveries can both lose — a
    // barrier probe against the previous version produced two `interval_opened` outcomes
    // and two rows (Codex P1-2).
    const match = await resolveMatch(store, surface, identity);

    const result = await store.insertInterval({
      surfaceType: surface.surfaceType,
      surfaceId: surface.surfaceId,
      schoolId: surface.schoolId,
      zoomMeetingUuid: occurrenceUuid,
      participantUuid,
      userId: match.userId,
      customerKey: identity.customerKey,
      displayName: identity.displayName,
      transientEmail: identity.email,
      matchedBy: match.matchedBy,
      joinedAt,
      identityTokens: identityTokens(identity),
      sourceEventKey: sourceEventKey ?? null,
    });
    return result === 'duplicate' ? 'interval_duplicate' : 'interval_opened';
  }

  // meeting.participant_left
  const leftAt = readLifecycleInstant(participant.leave_time, eventTsMs);
  if (leftAt === null) return 'no_instant';
  // Nothing to pair with, ever. Reported distinctly from "no open interval" so the two
  // causes stay legible in a log: this one is a participant Zoom told us nothing about.
  if (participantUuid === null && token === null) return 'unpairable_leave';

  // ONE key, in [R3]'s order. The store matches it by exact equality; there is no way
  // to ask it to OR the weaker identity columns, which is what let a shared display name
  // close a stranger's interval (Codex P1-1).
  const open = await store.listOpenIntervals({
    zoomMeetingUuid: occurrenceUuid,
    participantUuid,
    identityToken: token,
  });

  // ## Ambiguity is resolved by NOT closing, never by choosing (Codex re-review)
  //
  // On the uuid path the key is unambiguous, so the ordinary "latest open interval" rule
  // applies — a rejoin means the earlier one was already over in reality.
  //
  // On the FALLBACK path it does not. Two open intervals matching one token means two
  // people we cannot tell apart, and picking the latest is exactly how a leave closed a
  // namesake's row. Closing NOTHING is the correct answer: the intervals stay open, and
  // §11 makes the Z7-3 reconcile report authoritative over webhooks precisely so that a
  // gap the webhook path cannot resolve has somewhere to be resolved.
  if (participantUuid === null && open.length > 1) return 'no_open_interval';

  const target = selectIntervalToClose(open, leftAt);
  // [R4] and [R7] converge here: nothing to close — because the join was never seen, or
  // because this leave precedes every open interval — writes NO row and raises nothing.
  if (target === null) return 'no_open_interval';

  const closed = await store.closeInterval(target.id, leftAt);
  return closed ? 'interval_closed' : 'no_open_interval';
}
