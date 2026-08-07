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
import { buildSessionJoinPath, sessionOffersPlatformJoin } from '../utils/session-disclosure';
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
  end_time?: string | null;
  meeting_link?: string | null;
  /**
   * Durable managed intent (plan §8). A managed session carries NO
   * `meeting_link` — read together with it by `sessionOffersPlatformJoin`, or
   * the sessions this phase exists to serve get a notification with no way in.
   */
  is_zoom_managed?: boolean | null;
}

/** The schedule a session held BEFORE a reschedule, for the "moved from → to" copy. */
export interface SessionSchedule {
  session_date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
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
 * `end_time` COUNTS (r15 ruling, reversing r14). A session moved 09:00–10:30 → 09:00–11:30
 * is the worked example in `pages/api/sessions/[id]/index.ts` for why chunk Z2-3a exists:
 * that edit re-bills the school through the reschedule RPC and extends the Zoom meeting
 * via `meeting_sync`. Leaving it out meant the ledger changed, Zoom changed, and the
 * participant who now owes an extra hour was told nothing — the exact defect this module
 * was created to close, surviving in the duration-only case. The copy renders a RANGE
 * (see `session_rescheduled` in `lib/notificationEvents.ts`) precisely so this case does
 * not render an identical before and after.
 */
export function hasScheduleChanged(
  previous: SessionSchedule | null | undefined,
  next: SessionSchedule | null | undefined
): boolean {
  if (!previous || !next) return false;
  return (
    previous.session_date !== next.session_date ||
    previous.start_time !== next.start_time ||
    previous.end_time !== next.end_time
  );
}

/**
 * `"lunes 5 de agosto"` / `"09:00"` / `"10:30"`, or nulls when the row has no usable
 * schedule.
 *
 * `endTime` is formatted independently of the other two: a row may legitimately carry a
 * malformed or absent `end_time` while its start is fine, and losing the whole rendering
 * over the end of the range would be worse than rendering the start alone.
 */
function formatSchedule(schedule: SessionSchedule | null | undefined): {
  date: string | null;
  time: string | null;
  endTime: string | null;
} {
  if (!schedule?.session_date || !schedule.start_time) {
    return { date: null, time: null, endTime: null };
  }

  let endTime: string | null = null;

  if (schedule.end_time) {
    try {
      endTime = format(getSessionDateTime(schedule.session_date, schedule.end_time), 'HH:mm', {
        locale: es,
      });
    } catch {
      endTime = null;
    }
  }

  try {
    const dateTime = getSessionDateTime(schedule.session_date, schedule.start_time);
    return {
      date: format(dateTime, "EEEE d 'de' MMMM", { locale: es }),
      time: format(dateTime, 'HH:mm', { locale: es }),
      endTime,
    };
  } catch {
    // `getSessionDateTime` throws on a malformed date or time. A notification is not
    // worth failing over a row shape that is already wrong elsewhere.
    return { date: null, time: null, endTime: null };
  }
}

/** What `collectParticipantIds` found, and which of the two reads failed getting there. */
interface ParticipantLookup {
  userIds: string[];
  /** Non-null when the `session_facilitators` read errored — NOT when it returned zero rows. */
  facilitatorsError: unknown;
  /** Non-null when the `session_attendees` read errored — NOT when it returned zero rows. */
  attendeesError: unknown;
}

/**
 * The deduplicated union of the session's facilitators and attendees.
 *
 * Both errors are returned rather than discarded (r15 finding 3). Destructuring only
 * `data` made a failed read indistinguishable from an empty session: the caller saw an
 * empty union and returned silently, so a database error looked exactly like "nobody is
 * on this session". That is the defect class round r11 was dispatched to repair, and it
 * does not get to ship in new code written after that ruling.
 */
async function collectParticipantIds(
  client: SupabaseClient,
  sessionId: string
): Promise<ParticipantLookup> {
  const userIdSet = new Set<string>();

  const { data: facilitators, error: facilitatorsError } = await client
    .from('session_facilitators')
    .select('user_id')
    .eq('session_id', sessionId);

  if (Array.isArray(facilitators)) {
    for (const f of facilitators as { user_id?: string | null }[]) {
      if (f?.user_id) userIdSet.add(f.user_id);
    }
  }

  const { data: attendees, error: attendeesError } = await client
    .from('session_attendees')
    .select('user_id')
    .eq('session_id', sessionId);

  if (Array.isArray(attendees)) {
    for (const a of attendees as { user_id?: string | null }[]) {
      if (a?.user_id) userIdSet.add(a.user_id);
    }
  }

  return {
    userIds: Array.from(userIdSet),
    facilitatorsError: facilitatorsError ?? null,
    attendeesError: attendeesError ?? null,
  };
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

    const { userIds, facilitatorsError, attendeesError } = await collectParticipantIds(
      client,
      session.id
    );

    // A failed read is logged on its own line, naming the table, so an under-notification
    // is diagnosable from the logs instead of being invisible. Invariant 3 still holds:
    // nothing here is thrown back at the caller.
    if (facilitatorsError) {
      console.error(
        `[session-lifecycle] ${event} ${session.id}: session_facilitators READ FAILED — the recipient list is incomplete:`,
        facilitatorsError
      );
    }

    if (attendeesError) {
      console.error(
        `[session-lifecycle] ${event} ${session.id}: session_attendees READ FAILED — the recipient list is incomplete:`,
        attendeesError
      );
    }

    if (userIds.length === 0) {
      if (facilitatorsError || attendeesError) {
        // Distinct from the silent return below ON PURPOSE: this session may well have
        // people on it and we could not read them. Not notifying is not "normal" here.
        console.error(
          `[session-lifecycle] ${event} ${session.id}: NOT notifying — recipients could not be read. This is a failed query, not an empty session.`
        );
        return;
      }

      // A session with nobody on it is a normal state (drafts, series skeletons), not a
      // failure — the reminder cron skips it the same way.
      return;
    }

    // A PARTIAL read still notifies whoever was found. The people we did resolve are
    // genuinely on this session and genuinely need to know it moved; withholding from
    // them too, because the other table was unreachable, converts a partial failure into
    // a total one. The logged lines above are what makes the shortfall diagnosable.

    const current = formatSchedule(session);
    const before = event === 'session_rescheduled' ? formatSchedule(previous) : null;

    const NotificationService = (await import('../notificationService')).default;

    await NotificationService.triggerNotification(event, {
      session: {
        id: session.id,
        title: session.title,
        date: current.date,
        time: current.time,
        end_time: current.endTime,
        previous_date: before?.date ?? null,
        previous_time: before?.time ?? null,
        previous_end_time: before?.endTime ?? null,
        // Invariant 2: the platform surface, never `meeting_link` — and offered
        // for a managed session too, which has no `meeting_link` to test.
        join_url: sessionOffersPlatformJoin(session)
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
