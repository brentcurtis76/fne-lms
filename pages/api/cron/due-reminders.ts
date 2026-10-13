import type { NextApiRequest, NextApiResponse } from 'next';
import NotificationService from '../../../lib/notificationService';
import { authorizeCronRequest, isAllowedCronMethod } from '../../../lib/zoom/cron-auth';

/**
 * Hourly cron (`vercel.json`, `0 * * * *`) sending `assignment_due_soon` for the
 * published lesson assignments due within the next 24 hours, to each recipient
 * `NotificationService.getDueAssignments` still owes a reminder.
 *
 * Auth is the shared cron verifier (`lib/zoom/cron-auth.ts`): Vercel calls with GET
 * and `Authorization: Bearer ${CRON_SECRET}`; a manual or external caller may use
 * `x-cron-key: ${CRON_API_KEY}`. No credential is read from the body or query.
 *
 * A reminder is one occurrence per assignment, recipient and due instant, so the
 * hourly repeats are absorbed by the notification idempotency key and a moved due
 * date is a new reminder. Each recipient is triggered alone and counts only when the
 * service reports a notification for it; one that does not is retried by the next run.
 */

const WINDOW_HOURS = 24;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!isAllowedCronMethod(req.method)) {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Método no permitido' });
  }

  if (!authorizeCronRequest(req).ok) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  try {
    const due = await NotificationService.getDueAssignments(WINDOW_HOURS);
    let sent = 0;
    let delivered = 0;
    let failed = 0;

    for (const assignment of due) {
      delivered += assignment.delivered;
      failed += assignment.unavailable;
      for (const eventData of assignment.reminders) {
        const result = await NotificationService.triggerNotification('assignment_due_soon', eventData);
        if (result.success && (result.notificationsCreated ?? 0) > 0) sent++;
        else failed++;
      }
    }

    if (failed > 0) {
      console.error('[due-reminders] reminders not fully processed', { failed });
    }

    return res.status(200).json({
      success: failed === 0,
      message: `Procesado: ${sent} recordatorios de tareas, ${failed} pendientes de reintento`,
      sent,
      alreadySent: delivered,
      failed,
      assignmentsChecked: due.length,
    });
  } catch {
    // The exception text is not logged: it can carry an identifier or a title.
    console.error('[due-reminders] cron failed');
    return res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
}
