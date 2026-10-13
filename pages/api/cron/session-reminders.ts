import type { NextApiRequest, NextApiResponse } from 'next';
import NotificationService from '../../../lib/notificationService';
import { createServiceRoleClient } from '../../../lib/api-auth';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { TZDate } from '@date-fns/tz';
import {
  SESSION_TIMEZONE,
  getSessionDateTime,
  getHoursUntilSession,
} from '../../../lib/utils/session-timezone';
import {
  buildSessionJoinPath,
  sessionOffersPlatformJoin,
} from '../../../lib/utils/session-disclosure';
import { buildAbsoluteUrl } from '../../../lib/utils/app-url';
import { authorizeCronRequest, isAllowedCronMethod } from '../../../lib/zoom/cron-auth';

/**
 * Hourly cron (`vercel.json`, `0 * * * *`) sending the 24h and 1h session reminders.
 *
 * Auth is the shared cron verifier (`lib/zoom/cron-auth.ts`): Vercel calls with GET
 * and `Authorization: Bearer ${CRON_SECRET}`; a manual or external caller may use
 * `x-cron-key: ${CRON_API_KEY}`. No credential is read from the body or query.
 *
 * A reminder is one occurrence per session, type and scheduled start: the payload's
 * `session.starts_at` (the start instant, UTC ISO) is what the catalog keys it by,
 * never the Spanish display date. A repeated run for the same start is absorbed by
 * the notification idempotency key; a moved start is a new reminder.
 *
 * `session_notifications` keeps an audit row per recipient, written only after every
 * recipient was processed and scoped to the start (`scheduled_for`), so a failed run
 * is retried by the next one and a moved start is never suppressed. Only a row for
 * this exact start suppresses: a legacy row (`scheduled_for` = its send time) names
 * no start, so the first run after deploy may repeat a reminder the old code sent.
 */

const HOUR_MS = 60 * 60 * 1000;

/** Hours before the start, as (min, max]: each window spans the hourly runs that can fall in it. */
const REMINDERS = [
  { type: 'session_reminder_24h', min: 23, max: 25 },
  { type: 'session_reminder_1h', min: 0.5, max: 1.5 },
] as const;

type ReminderType = (typeof REMINDERS)[number]['type'];
type ServiceClient = ReturnType<typeof createServiceRoleClient>;

interface SessionRow {
  id: string;
  title: string;
  session_date: string;
  start_time: string;
  modality: string | null;
  meeting_link: string | null;
  is_zoom_managed: boolean | null;
  session_facilitators: { user_id: string | null }[] | null;
  session_attendees: { user_id: string | null }[] | null;
}

/** The America/Santiago calendar date of an instant, as `session_date` stores it. */
function chileDate(ms: number): string {
  const d = new TZDate(ms, SESSION_TIMEZONE);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!isAllowedCronMethod(req.method)) {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Método no permitido' });
  }

  if (!authorizeCronRequest(req).ok) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  try {
    const serviceClient = createServiceRoleClient();
    const now = Date.now();

    // The 24h window reaches 25 hours out, which can be a later Chile date than now + 24h.
    const { data, error: sessionsError } = await serviceClient
      .from('consultor_sessions')
      .select(`
        id, title, session_date, start_time, modality, meeting_link, is_zoom_managed,
        session_facilitators(user_id),
        session_attendees(user_id)
      `)
      .eq('is_active', true)
      .in('status', ['programada', 'en_progreso'])
      .gte('session_date', chileDate(now))
      .lte('session_date', chileDate(now + 25 * HOUR_MS));

    if (sessionsError) {
      console.error('[session-reminders] session query failed');
      return res.status(500).json({ error: 'Error al consultar sesiones' });
    }

    const sessions = (data ?? []) as SessionRow[];
    const sent: Record<ReminderType, number> = { session_reminder_24h: 0, session_reminder_1h: 0 };
    let failed = 0;

    for (const session of sessions) {
      const hoursUntil = getHoursUntilSession(session.session_date, session.start_time);
      const reminder = REMINDERS.find(({ min, max }) => hoursUntil > min && hoursUntil <= max);
      if (!reminder) continue;

      const userIds = [
        ...new Set(
          [...(session.session_facilitators ?? []), ...(session.session_attendees ?? [])]
            .map(({ user_id }) => user_id)
            .filter((id): id is string => Boolean(id))
        ),
      ];
      if (userIds.length === 0) continue;

      const sessionDateTime = getSessionDateTime(session.session_date, session.start_time);
      // A TZDate prints its own offset; the start identity is the UTC instant.
      const startsAt = new Date(sessionDateTime.getTime()).toISOString();
      if (await reminderRecorded(serviceClient, session.id, reminder.type, startsAt)) continue;

      // Notification payloads are persisted and rendered into e-mail, so they
      // carry the platform surface, never the raw meeting link.
      // A managed session has no `meeting_link` by design (§8), and a reminder
      // an hour before the call that offers no way to reach it is the defect.
      const joinUrl = sessionOffersPlatformJoin(session)
        ? buildAbsoluteUrl(buildSessionJoinPath(session.id), req)
        : null;

      const reminderSession = {
        id: session.id,
        title: session.title,
        date: format(sessionDateTime, "EEEE d 'de' MMMM", { locale: es }),
        time: format(sessionDateTime, 'HH:mm', { locale: es }),
        starts_at: startsAt,
        join_url: joinUrl,
      };

      // One trigger call per recipient: the service sums its count over every active
      // trigger, so in a shared call one recipient processed twice could stand in for
      // another that was not. The occurrence is the session and start, the same for all.
      let processed = 0;
      for (const userId of userIds) {
        const result = await NotificationService.triggerNotification(reminder.type, {
          session: reminderSession,
          facilitator_ids: [userId],
          attendee_ids: [],
        });
        if (result.success && (result.notificationsCreated ?? 0) > 0) processed++;
      }

      // Every recipient must have been processed before the run is recorded; otherwise
      // the next run retries and the idempotency key absorbs those already delivered.
      if (processed < userIds.length) {
        console.error('[session-reminders] reminder not fully processed', { type: reminder.type });
        failed++;
        continue;
      }

      await recordReminderSent(serviceClient, session.id, reminder.type, startsAt, userIds);
      sent[reminder.type]++;
    }

    return res.status(200).json({
      success: true,
      message: `Procesado: ${sent.session_reminder_24h} recordatorios de 24h, ${sent.session_reminder_1h} recordatorios de 1h`,
      reminders24h: sent.session_reminder_24h,
      reminders1h: sent.session_reminder_1h,
      failed,
      sessionsChecked: sessions.length,
    });
  } catch {
    // The exception text is not logged: it can carry a credential or an identifier.
    console.error('[session-reminders] cron failed');
    return res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
}

/**
 * Whether this reminder was already recorded for this start: a row whose
 * `scheduled_for` is the start. When a row was written says nothing about which
 * start it was for (a run that read an older start can finish after the move).
 * A failed lookup is not a record: the idempotency key still absorbs a repeat.
 */
async function reminderRecorded(
  serviceClient: ServiceClient,
  sessionId: string,
  notificationType: ReminderType,
  startsAt: string
): Promise<boolean> {
  const { data, error } = await serviceClient
    .from('session_notifications')
    .select('scheduled_for')
    .eq('session_id', sessionId)
    .eq('notification_type', notificationType)
    .eq('status', 'sent');

  if (error) return false;

  const start = Date.parse(startsAt);
  return ((data ?? []) as { scheduled_for: string | null }[]).some(
    (row) => row.scheduled_for !== null && Date.parse(row.scheduled_for) === start
  );
}

/** Record the processed reminder, one row per recipient, for this start. */
async function recordReminderSent(
  serviceClient: ServiceClient,
  sessionId: string,
  notificationType: ReminderType,
  startsAt: string,
  userIds: string[]
): Promise<void> {
  const sentAt = new Date().toISOString();
  const { error } = await serviceClient.from('session_notifications').insert(
    userIds.map((userId) => ({
      session_id: sessionId,
      user_id: userId,
      notification_type: notificationType,
      channel: 'in_app' as const,
      scheduled_for: startsAt,
      sent_at: sentAt,
      status: 'sent' as const,
    }))
  );

  if (error) {
    console.error('[session-reminders] reminder record failed', { type: notificationType });
  }
}
