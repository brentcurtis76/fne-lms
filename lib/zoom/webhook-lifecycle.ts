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
import { PROJECTION_STATUS_FOR, type ZoomWebhookStore } from './webhook-store';

/** The only two event types that move a row. Everything else is ledger-only. */
export const LIFECYCLE_EVENT_TYPES = ['meeting.started', 'meeting.ended'] as const;

/** Shape of the slice of `payload.object` the lifecycle reads. */
export interface ZoomWebhookObject {
  id?: unknown;
  uuid?: unknown;
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
 */
export async function applyWebhookLifecycle(
  store: ZoomWebhookStore,
  eventType: string,
  object: ZoomWebhookObject | undefined
): Promise<void> {
  if (eventType !== 'meeting.started' && eventType !== 'meeting.ended') return;

  const meetingNumber = readMeetingNumber(object?.id);
  if (meetingNumber === null) return;

  const meetingId = await store.findMeetingIdByNumber(meetingNumber);
  if (meetingId === null) return;

  const status = eventType === 'meeting.started' ? 'started' : 'ended';
  // `meeting.ended` carries the same occurrence uuid, but `started` already captured
  // it; passing null there means a malformed/absent uuid can never blank the column.
  const occurrenceUuid = status === 'started' ? readOccurrenceUuid(object?.uuid) : null;

  const transition = await store.setMeetingStatus(meetingId, status, occurrenceUuid);
  // Refused: the row is already past this status. Nothing moved, and nothing downstream
  // may move either — the projection stays wherever the winning event left it.
  if (!transition.applied || transition.surface === null) return;

  await store.setProjectionStatus(transition.surface, PROJECTION_STATUS_FOR[status]);
}
