/**
 * Session lifecycle notifications — the ONE emitter for `session_created`,
 * `session_rescheduled` and `session_cancelled` (Zoom plan §15, chunk Z2-4a).
 *
 * ## Why this module exists
 *
 * The three event types were declared in `lib/types/consultor-sessions.types.ts:26,32,33`
 * with nothing behind them: no `NOTIFICATION_EVENTS` config and no emitter anywhere in
 * the tree. A reschedule therefore notified nobody — and since Z2-3b a reschedule has a
 * real Zoom-side effect (`meeting_sync` converges the meeting to the new time) that the
 * participants were never told about.
 *
 * Six routes reach those three transitions. They call this module rather than each
 * carrying its own copy, on the same rule that produced `lib/utils/session-scope.ts` and
 * `lib/services/billable-hours.ts`: one canonical derivation cannot drift, six inline
 * ones will.
 *
 * ## The three invariants this module owns
 *
 * 1. **Recipients are the session's own people.** The deduplicated union of
 *    `session_facilitators.user_id` and `session_attendees.user_id`, derived exactly as
 *    the reminder cron derives it (`pages/api/cron/session-reminders.ts:82-95`). No
 *    admins, no consultants-by-school, no growth-community members — so no disclosure
 *    boundary moves. An empty union emits nothing and is not an error.
 *
 * 2. **The payload carries the platform URL, never the raw link.**
 *    `consultor_sessions.meeting_link` is Zoom's passcode-embedded `join_url` and is
 *    secret-equivalent; notification payloads are persisted in the event log and rendered
 *    into e-mail. The payload carries `{base}/meet/session/{id}`, which re-authorizes the
 *    reader. This is the invariant Z1a's disclosure remediation exists to protect.
 *
 * 3. **A notification failure is never the caller's failure.** Everything below runs
 *    inside one `try/catch` that logs and returns — the pattern of
 *    `pages/api/sessions/edit-requests/[eid].ts:314-328`. A successful approval,
 *    reschedule or cancellation must not become an error response because the
 *    notification service was unavailable.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { getSessionDateTime } from '../utils/session-timezone';
import { buildSessionJoinPath } from '../utils/session-disclosure';
import { buildAbsoluteUrl } from '../utils/app-url';

/** The three session lifecycle events this module emits. */
export type SessionLifecycleEvent =
  | 'session_created'
  | 'session_rescheduled'
  | 'session_cancelled';

/** The subset of a `consultor_sessions` row this module reads. */
export interface LifecycleSessionRow {
  id: string;
  title?: string | null;
  session_date?: string | null;
  start_time?: string | null;
  meeting_link?: string | null;
}

/** The schedule a session held BEFORE a reschedule, for the "moved from → to" copy. */
export interface SessionSchedule {
  session_date?: string | null;
  start_time?: string | null;
}

type RequestLike = { headers?: { host?: string | string[] } } | null | undefined;

export interface NotifySessionLifecycleInput {
  /** Service-role client — the same one the calling route already holds. */
  client: SupabaseClient;
  session: LifecycleSessionRow;
  event: SessionLifecycleEvent;
  /** Used only for the origin of the platform join URL. */
  req?: RequestLike;
  /** Required for `session_rescheduled`: the schedule the session is moving AWAY from. */
  previous?: SessionSchedule | null;
}

/**
 * Whether a reschedule notification is owed.
 *
 * Compares VALUES, not which keys a request happened to carry: a PUT that resubmits the
 * session's existing date is not a reschedule, and telling participants a session moved
 * "de 09:00 a 09:00" is worse than saying nothing.
 *
 * `end_time` is deliberately NOT part of the comparison. It changes the duration, not
 * when the reader has to be somewhere, and the notification renders only the start — so
 * an end-time-only edit would render an identical before and after.
 */
export function hasScheduleChanged(
  previous: SessionSchedule | null | undefined,
  next: SessionSchedule | null | undefined
): boolean {
  if (!previous || !next) return false;
  return (
    previous.session_date !== next.session_date ||
    previous.start_time !== next.start_time
  );
}

/** `"lunes 5 de agosto"` / `"09:00"`, or nulls when the row has no usable schedule. */
function formatSchedule(schedule: SessionSchedule | null | undefined): {
  date: string | null;
  time: string | null;
} {
  if (!schedule?.session_date || !schedule.start_time) {
    return { date: null, time: null };
  }

  try {
    const dateTime = getSessionDateTime(schedule.session_date, schedule.start_time);
    return {
      date: format(dateTime, "EEEE d 'de' MMMM", { locale: es }),
      time: format(dateTime, 'HH:mm', { locale: es }),
    };
  } catch {
    // `getSessionDateTime` throws on a malformed date or time. A notification is not
    // worth failing over a row shape that is already wrong elsewhere.
    return { date: null, time: null };
  }
}

/** The deduplicated union of the session's facilitators and attendees. */
async function collectParticipantIds(
  client: SupabaseClient,
  sessionId: string
): Promise<string[]> {
  const userIdSet = new Set<string>();

  const { data: facilitators } = await client
    .from('session_facilitators')
    .select('user_id')
    .eq('session_id', sessionId);

  if (Array.isArray(facilitators)) {
    for (const f of facilitators as { user_id?: string | null }[]) {
      if (f?.user_id) userIdSet.add(f.user_id);
    }
  }

  const { data: attendees } = await client
    .from('session_attendees')
    .select('user_id')
    .eq('session_id', sessionId);

  if (Array.isArray(attendees)) {
    for (const a of attendees as { user_id?: string | null }[]) {
      if (a?.user_id) userIdSet.add(a.user_id);
    }
  }

  return Array.from(userIdSet);
}

/**
 * Emit one session lifecycle notification to the session's participants.
 *
 * Call this only AFTER the write that makes the change real has committed — never
 * optimistically. It resolves rather than rejects on every failure path, so callers do
 * not need their own `try/catch`.
 */
export async function notifySessionLifecycle({
  client,
  session,
  event,
  req,
  previous = null,
}: NotifySessionLifecycleInput): Promise<void> {
  try {
    if (!session?.id) return;

    const userIds = await collectParticipantIds(client, session.id);

    if (userIds.length === 0) {
      // A session with nobody on it is a normal state (drafts, series skeletons), not a
      // failure — the reminder cron skips it the same way.
      return;
    }

    const current = formatSchedule(session);
    const before = event === 'session_rescheduled' ? formatSchedule(previous) : null;

    const NotificationService = (await import('../notificationService')).default;

    await NotificationService.triggerNotification(event, {
      session: {
        id: session.id,
        title: session.title,
        date: current.date,
        time: current.time,
        previous_date: before?.date ?? null,
        previous_time: before?.time ?? null,
        // Invariant 2: the platform surface, never `meeting_link`.
        join_url: session.meeting_link
          ? buildAbsoluteUrl(buildSessionJoinPath(session.id), req)
          : null,
      },
      facilitator_ids: userIds,
      attendee_ids: [],
    });
  } catch (notifError) {
    // Invariant 3: log and continue. The caller's write already succeeded.
    console.error(`Error sending ${event} notification:`, notifError);
  }
}
