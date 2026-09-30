import type { NextApiRequest, NextApiResponse } from 'next';
import { createServiceRoleClient } from '../../../lib/api-auth';
import { isOutboxDeliveryEnabled } from '../../../lib/email/notification-worker';
import { authorizeCronRequest, isAllowedCronMethod } from '../../../lib/zoom/cron-auth';

/**
 * Retention sweep for the notification email outbox (N3-04). Not scheduled yet:
 * N5-02 registers it. One bounded SQL function (`purge_notification_email_outbox`)
 * deletes at most `RETENTION_BATCH_LIMIT` rows that reached a terminal status
 * more than 90 days ago, with their source references, and reports the count.
 * While `NOTIFICATION_OUTBOX_DELIVERY` is unset or off it answers without
 * creating a database client, so it deletes nothing.
 */
export const RETENTION_BATCH_LIMIT = 1000;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!isAllowedCronMethod(req.method)) {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Método no permitido' });
  }

  if (!authorizeCronRequest(req).ok) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  if (!isOutboxDeliveryEnabled()) {
    return res.status(200).json({ ok: true, enabled: false });
  }

  try {
    const { data, error } = await createServiceRoleClient().rpc('purge_notification_email_outbox', {
      p_limit: RETENTION_BATCH_LIMIT,
    });
    if (error || typeof data !== 'number') {
      // The error text is not logged: it can carry a credential or an identifier.
      console.error('[notification-email-retention] purge failed');
      return res.status(500).json({ error: 'Error interno del servidor' });
    }
    return res.status(200).json({ ok: true, enabled: true, deleted: data });
  } catch {
    console.error('[notification-email-retention] purge failed');
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}
