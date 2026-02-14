import { NextApiRequest, NextApiResponse } from 'next';
import NotificationService from '../../../lib/notificationService';
import { createServiceRoleClient } from '../../../lib/api-auth';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

/**
 * Cron job API endpoint for processing session reminders
 * This should be called hourly by a cron service to send 24h and 1h reminders
 *
 * Usage:
 * - Add to vercel.json: { "cron": [{ "path": "/api/cron/session-reminders", "schedule": "0 * * * *" }] }
 * - Or call manually: curl -X POST https://your-domain.com/api/cron/session-reminders -H "x-cron-key: YOUR_KEY"
 * - Or use external cron service like cron-job.org
 *
 * Expected cron frequency: Every hour (at minimum every 2 hours to catch the windows)
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    // Auth: CRON_API_KEY check
    const cronApiKey = req.headers['x-cron-key'] || req.body.cronKey;
    const expectedKey = process.env.CRON_API_KEY;
    if (expectedKey && cronApiKey !== expectedKey) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const serviceClient = createServiceRoleClient();
    const now = new Date();
    const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    // Get upcoming sessions (programada or en_progreso)
    const { data: sessions, error: sessionsError } = await serviceClient
      .from('consultor_sessions')
      .select(`
        id, title, session_date, start_time, end_time, modality, meeting_link,
        session_facilitators(user_id),
        session_attendees(user_id)
      `)
      .in('status', ['programada', 'en_progreso'])
      .gte('session_date', now.toISOString().split('T')[0])
      .lte('session_date', in24Hours.toISOString().split('T')[0]);

    if (sessionsError) {
      console.error('Error fetching sessions:', sessionsError);
      return res.status(500).json({ error: 'Error al consultar sesiones' });
    }

    let reminders24h = 0;
    let reminders1h = 0;

    for (const session of sessions || []) {
      // Build session datetime from date + start_time
      const sessionDateTime = new Date(`${session.session_date}T${session.start_time}`);
      const hoursUntil = (sessionDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);

      // Collect participant IDs (deduplicated via Set)
      const userIdSet = new Set<string>();

      if (session.session_facilitators && Array.isArray(session.session_facilitators)) {
        for (const f of session.session_facilitators as { user_id: string }[]) {
          if (f.user_id) userIdSet.add(f.user_id);
        }
      }

      if (session.session_attendees && Array.isArray(session.session_attendees)) {
        for (const a of session.session_attendees as { user_id: string }[]) {
          if (a.user_id) userIdSet.add(a.user_id);
        }
      }

      const userIds = Array.from(userIdSet);

      if (userIds.length === 0) {
        console.log(`⚠️ Session ${session.id} has no facilitators or attendees, skipping`);
        continue;
      }

      const formattedDate = format(sessionDateTime, "EEEE d 'de' MMMM", { locale: es });
      const formattedTime = format(sessionDateTime, 'HH:mm', { locale: es });

      // 24h reminder: 23-25 hours out (allows ±1 hour window for cron timing)
      if (hoursUntil > 23 && hoursUntil <= 25) {
        const alreadySent = await checkReminderSent(serviceClient, session.id, 'session_reminder_24h');
        if (!alreadySent) {
          await NotificationService.triggerNotification('session_reminder_24h', {
            session: {
              id: session.id,
              title: session.title,
              date: formattedDate,
              time: formattedTime,
              meeting_link: session.meeting_link,
            },
            facilitator_ids: userIds,
            attendee_ids: [],
          });
          await recordReminderSent(serviceClient, session.id, 'session_reminder_24h', userIds);
          reminders24h++;
        }
      }

      // 1h reminder: 0.5-1.5 hours out
      if (hoursUntil > 0.5 && hoursUntil <= 1.5) {
        const alreadySent = await checkReminderSent(serviceClient, session.id, 'session_reminder_1h');
        if (!alreadySent) {
          await NotificationService.triggerNotification('session_reminder_1h', {
            session: {
              id: session.id,
              title: session.title,
              date: formattedDate,
              time: formattedTime,
              meeting_link: session.meeting_link,
            },
            facilitator_ids: userIds,
            attendee_ids: [],
          });
          await recordReminderSent(serviceClient, session.id, 'session_reminder_1h', userIds);
          reminders1h++;
        }
      }
    }

    return res.status(200).json({
      success: true,
      message: `Procesado: ${reminders24h} recordatorios de 24h, ${reminders1h} recordatorios de 1h`,
      reminders24h,
      reminders1h,
      sessionsChecked: sessions?.length || 0,
    });

  } catch (error: any) {
    console.error('Session reminders cron failed:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}

/** Check if a reminder of this type was already sent for this session */
async function checkReminderSent(
  serviceClient: ReturnType<typeof createServiceRoleClient>,
  sessionId: string,
  notificationType: string
): Promise<boolean> {
  const { data } = await serviceClient
    .from('session_notifications')
    .select('id')
    .eq('session_id', sessionId)
    .eq('notification_type', notificationType)
    .in('status', ['sent', 'scheduled'])
    .limit(1);

  return (data && data.length > 0) || false;
}

/** Record that a reminder was sent */
async function recordReminderSent(
  serviceClient: ReturnType<typeof createServiceRoleClient>,
  sessionId: string,
  notificationType: string,
  userIds: string[]
): Promise<void> {
  const records = userIds.map(userId => ({
    session_id: sessionId,
    user_id: userId,
    notification_type: notificationType,
    channel: 'in_app' as const,
    scheduled_for: new Date().toISOString(),
    sent_at: new Date().toISOString(),
    status: 'sent' as const,
  }));

  const { error } = await serviceClient
    .from('session_notifications')
    .insert(records);

  if (error) {
    console.error('Error recording reminder sent:', error);
  }
}
