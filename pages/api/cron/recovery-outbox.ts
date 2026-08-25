import type { NextApiRequest, NextApiResponse } from 'next';
import { createServiceRoleClient } from '../../../lib/api-auth';
import { runRecoveryOutbox } from '../../../lib/auth/recovery-request-queue';
import {
  authorizeCronRequest,
  isAllowedCronMethod,
} from '../../../lib/zoom/cron-auth';

/** Durable recovery-email dispatcher. Vercel invokes it once per minute. */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!isAllowedCronMethod(req.method)) {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Método no permitido' });
  }

  if (!authorizeCronRequest(req).ok) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  try {
    const result = await runRecoveryOutbox(createServiceRoleClient());
    return res.status(200).json({ ok: true, ...result });
  } catch {
    console.error('[recovery-outbox] worker failed');
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}
