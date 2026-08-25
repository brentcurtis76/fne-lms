import type { NextApiRequest, NextApiResponse } from 'next';
import { createServiceRoleClient } from '../../../lib/api-auth';
import {
  authorizeCronRequest,
  isAllowedCronMethod,
} from '../../../lib/zoom/cron-auth';

/**
 * Bounded retention/scrubbing sweep for the recovery pipeline and the security
 * audit trail. Vercel invokes it once per day; the work itself is one bounded,
 * indexed SQL function (`run_auth_security_retention`) that deletes at most
 * `RETENTION_BATCH_LIMIT` rows per table per run and reports exactly what it
 * removed, so a backlog is visible instead of silent.
 *
 * The audit retention period is the documented compliance period — two years
 * (see docs/runbooks/auth-security.md §7) — passed explicitly so an operator
 * decision changes one constant here rather than a migration.
 */
export const RETENTION_BATCH_LIMIT = 5000;
export const AUDIT_RETENTION_DAYS = 730;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!isAllowedCronMethod(req.method)) {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Método no permitido' });
  }

  if (!authorizeCronRequest(req).ok) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  try {
    const admin = createServiceRoleClient();
    const { data, error } = await admin.rpc('run_auth_security_retention', {
      p_limit: RETENTION_BATCH_LIMIT,
      p_audit_retention_days: AUDIT_RETENTION_DAYS,
    });
    if (error) {
      console.error('[auth-retention] retention sweep failed', {
        code: (error as { code?: string }).code ?? null,
      });
      return res.status(500).json({ error: 'Error interno del servidor' });
    }
    return res.status(200).json({ ok: true, ...(data ?? {}) });
  } catch {
    console.error('[auth-retention] worker failed');
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}
