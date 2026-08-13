/**
 * The rows-only lifecycle application shared by the webhook route and the
 * `webhook_sweep` job (plan §8 lifecycle; Z1b-3 finding ⑤ routed into Z1b-4).
 *
 * Extracted rather than duplicated on purpose. The sweep exists precisely to re-apply
 * events the route recorded but never applied, so "the same lifecycle" has to mean the
 * same code — two copies would drift, and the copy that drifted would be the one only
 * the recovery path exercises, i.e. the one nobody watches.
 *
 * A leaf module: it depends on the store contract and nothing else, so both the route
 * (`pages/api/zoom/webhook.ts`) and the job (`lib/zoom/jobs/webhook-sweep.ts`) can
 * import it without either importing the other.
 */
import {
  PROJECTION_STATUS_FOR,
  type LifecycleInstants,
  type ZoomWebhookStore,
} from './webhook-store';

/** The only two event types that move a row. Everything else is ledger-only. */
export const LIFECYCLE_EVENT_TYPES = ['meeting.started', 'meeting.ended'] as const;

/** Shape of the slice of `payload.object` the lifecycle reads. */
export interface ZoomWebhookObject {
  id?: unknown;
  uuid?: unknown;
  /** `meeting.started` — the instant the occurrence actually began. */
  start_time?: unknown;
  /** `meeting.ended` — the instant it actually finished. */
  end_time?: unknown;
}

/**
 * Zoom sends `payload.object.id` as a decimal STRING (the committed fixtures show
 * `"86084701483"`), while `zoom_meetings.zoom_meeting_number` is `bigint`. Accepts a
 * number too, because Zoom's own docs are inconsistent about the type across events.
 * Anything else is "no meeting number", which lands on the row-only path.
 */
export function readMeetingNumber(raw: unknown): number | null {
  if (typeof raw === 'number') {
    return Number.isSafeInteger(raw) && raw > 0 ? raw : null;
  }
  if (typeof raw === 'string' && /^\d+$/.test(raw.trim())) {
    const parsed = Number(raw.trim());
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
}

export function readOccurrenceUuid(raw: unknown): string | null {
  return typeof raw === 'string' && raw.length > 0 ? raw : null;
}

/**
 * The observed instant for a lifecycle event, as an ISO-8601 string (§11 quantity
 * (3), stored by the C6 amendment on `zoom_meetings.actual_*`).
 *
 * `preferred` is `payload.object.start_time` / `end_time` — Zoom's own statement of
 * when the occurrence began or ended, and the only value that describes the meeting
 * rather than the delivery. The committed fixtures carry
 * `"2026-07-29T23:55:56Z"` / `"2026-07-30T00:03:26Z"`.
 *
 * `eventTsMs` is the body's `event_ts`, used only when the preferred field is absent
 * or unparseable. It is in MILLISECONDS (`1785369356750` in the same fixtures) while
 * the `x-zm-request-timestamp` HEADER is in SECONDS — an asymmetry Z0B recorded after
 * it had already produced one committed defect. The header value is never passed in
 * here, and that is structural rather than a convention: this function's callers hand
 * it the parsed body and nothing else.
 *
 * Anything else yields null, which the store reads as "write no instant". Failing
 * toward a NULL column is the correct direction — a missing comparison value shows as
 * a missing panel column, whereas a fabricated one would be presented to an admin as
 * evidence about a consultant's billable presence.
 *
 * ## The range band (Z7-2 `[B1]`; Z7-1 review item ①)
 *
 * `Number.isSafeInteger(x) && x > 0` was not a range check, and the reviewer probed both
 * ends of it directly. A header timestamp in SECONDS (`1785368934`) passed and became
 * **1970-01-21**, silently, as a fact about a 2026 meeting. `Number.MAX_SAFE_INTEGER`
 * also passed and then threw `RangeError` out of `toISOString()` — from inside a webhook
 * route, where the throw becomes a 500 and Zoom retries the same malformed body forever.
 *
 * Neither was reachable in production (callers pass only body `event_ts`), which is why
 * it was non-blocking rather than a defect. It is closed here because this chunk parses
 * `join_time` / `leave_time` through the same helper family, and an unreachable trap in
 * a helper that just gained two new callers is a trap with a shorter fuse.
 *
 * The band is deliberately wide and deliberately finite: any instant this system can
 * legitimately observe about a Zoom meeting falls inside it, and both probes fall
 * outside. It is applied to the ISO path as well — `Date.parse` accepts year 275760,
 * which is inside `Date`'s range and nowhere near a plausible session.
 */

/** 2000-01-01T00:00:00Z. Below this, an epoch-milliseconds value is a unit error. */
export const MIN_PLAUSIBLE_INSTANT_MS = Date.UTC(2000, 0, 1);
/** 2100-01-01T00:00:00Z. Above this, likewise — and far short of `Date`'s ±8.64e15. */
export const MAX_PLAUSIBLE_INSTANT_MS = Date.UTC(2100, 0, 1);

/** Inside the plausible band, and therefore also inside `Date`'s representable range. */
function isPlausibleInstantMs(ms: number): boolean {
  return (
    Number.isFinite(ms) && ms >= MIN_PLAUSIBLE_INSTANT_MS && ms <= MAX_PLAUSIBLE_INSTANT_MS
  );
}

export function readLifecycleInstant(preferred: unknown, eventTsMs: unknown): string | null {
  if (typeof preferred === 'string' && preferred.length > 0) {
    const parsed = Date.parse(preferred);
    if (isPlausibleInstantMs(parsed)) return new Date(parsed).toISOString();
  }
  if (typeof eventTsMs === 'number' && isPlausibleInstantMs(eventTsMs)) {
    return new Date(eventTsMs).toISOString();
  }
  return null;
}

/**
 * The §15 lifecycle application: rows only, and only for the two meeting events.
 *
 * `meeting.started` is where `zoom_meeting_uuid` is captured — **not** provisioning.
 * That is the routed Z0B finding: Zoom mints a NEW uuid for every occurrence, so the
 * uuid a create/read returns at provision time is not the uuid the recording,
 * participant and transcript APIs will key on. The fake models it (`startOccurrence`
 * returns both uuids so a test can assert they differ). Writing it here, from the
 * event that announces the occurrence, is the only correct moment — and it is why
 * `meeting_provision` leaves the column NULL.
 *
 * An unknown meeting number is normal for meetings created outside the LMS: the ledger
 * row is the whole of the work, and the caller still reports success.
 *
 * ## Idempotent AND order-guarded — both, and the second is the load-bearing one
 *
 * Idempotence alone was never sufficient, and the earlier claim that it was (absolute
 * status assignments ⇒ safe) is withdrawn (Sol F1). Zoom does not order its deliveries,
 * and `webhook_sweep` deliberately re-plays events minutes after the fact, so a
 * `meeting.started` arriving AFTER its `meeting.ended` is reachable in normal operation
 * — and an absolute write would have flipped a finished meeting back to `started`,
 * re-entering the §9 EXCLUDE active set and re-acquiring the host.
 *
 * So every write here is a GUARDED transition, and the guard is the UPDATE's own
 * `WHERE ... status IN (...)` inside Postgres — see `webhook-store.ts` for the two
 * applies-from sets. An in-process check would be a TOCTOU race between this route and
 * a concurrent sweep. Re-applying the SAME status is still allowed (each set contains
 * its own target), which is what keeps duplicate deliveries and the sweep harmless.
 *
 * ## The projection moves with the row, under the same rule
 *
 * §6 makes `public.session_meetings_public.meeting_status` the UI's status surface, so
 * a lifecycle that moved only the internal row would leave every badge reading
 * `scheduled` forever. It is updated here, from the surface keys the guarded UPDATE
 * returns, and only when the internal transition actually applied — so a late `started`
 * can no more resurrect an `ended` projection row than it can an `ended` meeting.
 *
 * ## The observed instants ride the SAME guarded UPDATE (Z7-1, C6 amendment)
 *
 * §11 quantity (3) had no storage until this phase. Both instants are handed to the
 * same `setMeetingStatus` call rather than written separately, because a second
 * statement would be a second chance to lose the ordering argument above: an instant
 * written outside the status guard could land for a transition the guard refused.
 * `zoom_internal.apply_meeting_lifecycle` fills each column only while it is NULL, so
 * a replayed or out-of-order delivery cannot overwrite one — while a deliberate
 * correction (the Z7-3 reconcile, whose report §11 makes authoritative) still can,
 * because that rule is scoped to this function rather than to the table.
 */
export async function applyWebhookLifecycle(
  store: ZoomWebhookStore,
  eventType: string,
  object: ZoomWebhookObject | undefined,
  /** The body's `event_ts`, in milliseconds. The fallback, never the header value. */
  eventTsMs?: unknown
): Promise<void> {
  if (eventType !== 'meeting.started' && eventType !== 'meeting.ended') return;

  const meetingNumber = readMeetingNumber(object?.id);
  if (meetingNumber === null) return;

  const meetingId = await store.findMeetingIdByNumber(meetingNumber);
  if (meetingId === null) return;

  const status = eventType === 'meeting.started' ? 'started' : 'ended';
  // Both lifecycle events carry the occurrence uuid. `ended` must offer it too:
  // when ended arrives first, the later started transition is correctly refused,
  // so this is the only chance to make the occurrence report-eligible (Z7-R2).
  // The SQL COALESCE fills only a missing value and cannot overwrite an established
  // occurrence identity; a malformed/absent uuid therefore still cannot blank it.
  const occurrenceUuid = readOccurrenceUuid(object?.uuid);

  // `meeting.ended` offers BOTH instants, because its payload states when the
  // occurrence began as well as when it finished. That is not a second writer racing
  // `started`: the RPC fills each column only while NULL, so when `started` already
  // landed the offered value is discarded, and when `started` has NOT landed — the
  // out-of-order case, where the `started` that follows is refused by the guard — this
  // is the only chance the row gets to record when the meeting actually began.
  //
  // The `event_ts` fallback is deliberately asymmetric. On the `ended` branch it may
  // stand in for `end_time` (both describe the end of the occurrence) but NEVER for
  // `start_time`: this event was delivered when the meeting finished, so using its
  // timestamp as a start would record a zero-length meeting as fact.
  const instants: LifecycleInstants =
    status === 'started'
      ? { actualStartedAt: readLifecycleInstant(object?.start_time, eventTsMs), actualEndedAt: null }
      : {
          actualStartedAt: readLifecycleInstant(object?.start_time, undefined),
          actualEndedAt: readLifecycleInstant(object?.end_time, eventTsMs),
        };

  const transition = await store.setMeetingStatus(meetingId, status, occurrenceUuid, instants);
  // Refused: the row is already past this status. Nothing moved, and nothing downstream
  // may move either — the projection stays wherever the winning event left it.
  if (!transition.applied || transition.surface === null) return;

  await store.setProjectionStatus(transition.surface, PROJECTION_STATUS_FOR[status]);
}
