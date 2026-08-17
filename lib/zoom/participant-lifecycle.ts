/**
 * The participant-event applier (plan §11; Z7-2, governed by §15.3.9).
 *
 * Sibling of `webhook-lifecycle.ts`, deliberately NOT an extension of it.
 * `LIFECYCLE_EVENT_TYPES` names the two events that move a row's **status**; a
 * participant event moves none. Widening that set would have put an attendance write
 * behind a guard designed for a status machine, and — worse — made it possible for a
 * participant event to reach `setMeetingStatus`, where a `started` write re-enters the
 * §9 EXCLUDE active set and re-acquires a host for a window that may be over. The two
 * appliers share the store-shaped seam idiom and nothing else.
 *
 * Extracted rather than inlined in the route for the same reason the lifecycle was:
 * **both the route and `webhook_sweep` call this function.** The sweep exists to
 * re-apply events the route recorded but never applied, so "the same ingestion" has to
 * mean the same code — two copies would drift, and the copy that drifted would be the
 * one only the recovery path exercises, i.e. the one nobody watches.
 *
 * ## The §15.3.9 pairing contract, in one paragraph
 *
 * A `participant_left` may close an open interval ONLY via a Zoom-minted
 * `participant_uuid` matching exactly one open row in the occurrence — a token the
 * client cannot assert, unique to one participant within the occurrence. Every other
 * identity field (`customer_key`, e-mail, display name) is reconciliation evidence:
 * persisted, consumed by Z7-3's authoritative report and Z7-5's facilitator
 * suggestion, never sufficient authority for a destructive close. Closing NOTHING is
 * the normal, correct outcome for a leave the rule cannot pair — the report supplies
 * the true interval. Two indistinguishable histories (a homonym's own leave vs a
 * stranger's leave whose join was lost) therefore get the same safe answer, which is
 * the property the withdrawn fallback ladder could not provide.
 *
 * ## Every leave is durably recorded, atomically with any close
 *
 * The store's `applyLeave` maps onto `zoom_internal.apply_participant_leave`: the
 * observation row (identity evidence + the decided outcome) and any eligible close
 * commit in ONE database transaction, keyed UNIQUE on the delivery. The route and the
 * sweep can apply the same delivery concurrently; exactly one application's record
 * survives, so no delivery can be both closed and logged unmatched.
 *
 * ## Everything here fails toward "no close" rather than toward a wrong close
 *
 * Unresolved surface → ledger-only, caller reports success. Unmatchable identity →
 * `matched_by = 'unmatched'` with a NULL `user_id`. A leave with no `participant_uuid`
 * → observation only (`unpairable_leave`). A leave whose uuid matches zero or several
 * open rows → observation only (`no_open_interval`). An out-of-order `leave_time` →
 * the interval stays open, because a constraint violation escaping this function
 * becomes a 500 and Zoom retries the same malformed body forever against an endpoint
 * that can never accept it.
 */
import {
  identityTokens,
  matchParticipantIdentity,
  profileIdFromCustomerKey,
  readParticipantField,
  readParticipantIdentity,
  type ParticipantIdentity,
} from './attendance-identity';
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
  | 'occurrence_mismatch'
  | 'no_occurrence_uuid'
  | 'no_instant'
  | 'unpairable_leave'
  | 'interval_opened'
  | 'interval_duplicate'
  | 'interval_closed'
  | 'no_open_interval'
  | 'observation_duplicate';

/**
 * Resolves the surface for a participant event: occurrence uuid first, then meeting
 * number.
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
  const byNumber = await store.findSurfaceByMeetingNumber(meetingNumber);
  if (
    byNumber !== null &&
    occurrenceUuid !== null &&
    byNumber.zoomMeetingUuid !== null &&
    byNumber.zoomMeetingUuid !== occurrenceUuid
  ) {
    return null;
  }
  return byNumber;
}

/** The read slice the identity resolver needs — no write member reaches it. */
export type ParticipantMatchLookups = Pick<
  ZoomAttendanceStore,
  'profileExists' | 'findProfileIdByEmail' | 'listExpectedAttendees'
>;

/**
 * Fills the lookups the pure matcher needs, short-circuiting as the hierarchy allows: a
 * `customer_key` hit means the e-mail and attendee queries are never issued.
 *
 * This hierarchy decides `user_id` — WHO the row is evidence about, a suggestion a
 * facilitator confirms — and nothing else. It has no part in interval closure, which
 * is `participant_uuid`-only (§15.3.9). The pure matcher still applies the precedence
 * itself, so this function cannot change the ORDER of the hierarchy by changing what
 * it resolves — only how much work it does.
 *
 * Exported because Z7-3's report reconciliation matches report rows to people under
 * EXACTLY this hierarchy — a second copy would drift, and the copy that drifted
 * would be the authoritative source's.
 */
export async function resolveParticipantMatch(
  store: ParticipantMatchLookups,
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
  // name may be matched against.
  const expectedAttendees = await store.listExpectedAttendees(surface);
  return matchParticipantIdentity(identity, {
    customerKeyProfileId: null,
    emailProfileId: null,
    expectedAttendees,
  });
}

/**
 * Applies one participant event. Rows only, never a status, never a `zoom_meetings`
 * insert — the store it is handed has no method that could.
 */
export async function applyParticipantEvent(
  store: ZoomAttendanceStore,
  eventType: string,
  object: ZoomParticipantObject | undefined,
  /** The body's `event_ts`, in milliseconds. The fallback, never the header value. */
  eventTsMs?: unknown,
  /**
   * The webhook ledger's `dedupe_key` — `sha256(raw body)` — for the delivery being
   * applied. On the join path it becomes the interval's `source_event_key`; on the
   * leave path it keys the observation. Both UNIQUE indexes are what make a
   * redelivery idempotent inside Postgres instead of inside a read-then-write the
   * applier could lose a race on. Both callers pass it.
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
  // The only token that may authorise closure (§15.3.9). `readParticipantField` is what
  // keeps Zoom's `""` from becoming a key every anonymous guest would share.
  const participantUuid = readParticipantField(participant.participant_uuid);

  if (eventType === 'meeting.participant_joined') {
    const joinedAt = readLifecycleInstant(participant.join_time, eventTsMs);
    // No usable instant means no row: `joined_at` is NOT NULL and anchoring it on
    // anything else would fabricate the interval this table exists to observe.
    if (joinedAt === null) return 'no_instant';

    // NO read-then-insert dedupe here, deliberately. Idempotency is the database's job:
    // `(zoom_meeting_uuid, participant_uuid, joined_at)` catches a uuid-bearing
    // redelivery and `source_event_key` catches every redelivery including the
    // uuid-less one. A check in this process would be a race two concurrent deliveries
    // can both lose — a barrier probe against the previous version produced two
    // `interval_opened` outcomes and two rows.
    const match = await resolveParticipantMatch(store, surface, identity);

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
    if (result === 'occurrence_mismatch') return 'occurrence_mismatch';
    return result === 'duplicate' ? 'interval_duplicate' : 'interval_opened';
  }

  // meeting.participant_left — one store call, one database transaction (§15.3.9).
  // The observation is mandatory and it is keyed on the delivery, so a caller that
  // cannot say which delivery this is cannot satisfy the contract. Unreachable from
  // the route and the sweep, which always pass the ledger dedupe_key — this guard
  // exists for the future caller who forgets, and it fails loudly rather than
  // recording a leave that could never be deduplicated.
  if (sourceEventKey === null || sourceEventKey === undefined) {
    throw new Error(
      'applyParticipantEvent: a participant_left delivery requires its ledger dedupe_key'
    );
  }

  const leftAt = readLifecycleInstant(participant.leave_time, eventTsMs);
  return store.applyLeave({
    surfaceType: surface.surfaceType,
    surfaceId: surface.surfaceId,
    schoolId: surface.schoolId,
    zoomMeetingUuid: occurrenceUuid,
    sourceEventKey,
    observedAt: leftAt,
    participantUuid,
    customerKey: identity.customerKey,
    displayName: identity.displayName,
    transientEmail: identity.email,
    identityTokens: identityTokens(identity),
  });
}
