import type { NextApiRequest, NextApiResponse } from 'next';
import { createServiceRoleClient } from '../../../lib/api-auth';
import { authorizeCronRequest, isAllowedCronMethod } from '../../../lib/zoom/cron-auth';

// Missing deliveries are derived from current assignments and published templates,
// so a failed tick is retried without republishing or reassigning a teacher.
export const DELIVERY_BATCH_LIMIT = 100;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!isAllowedCronMethod(req.method)) {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Método no permitido' });
  }
  if (!authorizeCronRequest(req).ok) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  try {
    const { data, error } = await createServiceRoleClient().rpc(
      'reconcile_published_assessment_deliveries',
      { p_limit: DELIVERY_BATCH_LIMIT }
    );
    if (error || !data) {
      console.error('[assessment-delivery] reconciliation failed');
      return res.status(500).json({ error: 'Error interno del servidor' });
    }
    if (data.failed > 0) {
      console.warn('[assessment-delivery] some deliveries will be retried', {
        failed: data.failed,
        scanned: data.scanned,
      });
    }
    return res.status(200).json({ ok: true, ...data });
  } catch {
    console.error('[assessment-delivery] worker failed');
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}
