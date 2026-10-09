import type { NextApiRequest, NextApiResponse } from 'next';
import { createServiceRoleClient } from '../../../lib/api-auth';
import { runNotificationDigest } from '../../../lib/email/notification-digest';
import { isOutboxDeliveryEnabled } from '../../../lib/email/notification-worker';
import { authorizeCronRequest, isAllowedCronMethod } from '../../../lib/zoom/cron-auth';

/**
 * Daily notification digest (N5-01). Not scheduled yet: N5-02 registers it.
 * While `NOTIFICATION_OUTBOX_DELIVERY` is unset or off it answers without
 * creating a database client, so it opens, claims and sends nothing.
 */
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
    const result = await runNotificationDigest(createServiceRoleClient());
    return res.status(200).json({ ok: true, ...result });
  } catch {
    // The exception text is not logged: it can carry a credential or an identifier.
    console.error('[email-digest] digest failed');
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}
