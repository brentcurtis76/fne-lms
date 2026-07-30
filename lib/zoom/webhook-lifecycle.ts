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
import type { ZoomWebhookStore } from './webhook-store';

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
 * Idempotent by construction — every write is an absolute status assignment, never a
 * transition guarded on the current value. That is what lets the sweep re-apply an
 * event the route may or may not have already applied.
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

  if (eventType === 'meeting.started') {
    await store.setMeetingStatus(meetingId, 'started', readOccurrenceUuid(object?.uuid));
    return;
  }
  // `meeting.ended` carries the same occurrence uuid, but `started` already captured
  // it; passing null here means a malformed/absent uuid can never blank the column.
  await store.setMeetingStatus(meetingId, 'ended', null);
}
