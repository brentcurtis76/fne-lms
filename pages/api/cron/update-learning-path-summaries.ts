import { NextApiRequest, NextApiResponse } from 'next';
import { timingSafeEqual } from 'crypto';

/**
 * Maintenance-endpoint authentication (B2c-M1).
 *
 * Fail closed. The route is reachable over plain HTTP, so it must prove the
 * caller holds the scheduler secret before answering anything else:
 *   - `CRON_SECRET` missing, empty or whitespace-only  → 'unconfigured' (503)
 *   - Authorization is not exactly `Bearer ${CRON_SECRET}` → 'unauthorized' (401)
 * No cookie, application role, query parameter, alternate header or other
 * secret is accepted. The secret and the presented header are never logged or
 * echoed. Kept file-local on purpose: this unit is scoped to these two routes.
 */
type MaintenanceAuthResult = 'ok' | 'unconfigured' | 'unauthorized';

function authorizeMaintenanceRequest(req: NextApiRequest): MaintenanceAuthResult {
  const secret = process.env.CRON_SECRET;
  if (typeof secret !== 'string' || secret.trim().length === 0) {
    return 'unconfigured';
  }

  const presented = req.headers.authorization;
  if (typeof presented !== 'string') {
    return 'unauthorized';
  }

  const expectedBytes = Buffer.from(`Bearer ${secret}`, 'utf8');
  const presentedBytes = Buffer.from(presented, 'utf8');
  if (expectedBytes.length !== presentedBytes.length) {
    return 'unauthorized';
  }
  return timingSafeEqual(expectedBytes, presentedBytes) ? 'ok' : 'unauthorized';
}

/**
 * RETIRED maintenance contract (closure C3, decision D2, 2026-09-07).
 *
 * The learning-path summaries are now LIVE relations created by migration
 * 20260907120600 (user_learning_path_summary, learning_path_performance_summary,
 * learning_path_daily_summary, learning_path_monthly_summary over the durable
 * per-day activity grain written at settlement). There is nothing to refresh:
 * the three `update_*_summary` RPCs this route used to call never existed in
 * any migration, and the monthly rollup it computed in process double counted
 * distinct users.
 *
 * The route is kept (not deleted) so a stale scheduler entry cannot be
 * mistaken for a working refresh: after the unchanged authentication guard it
 * answers 410 Gone with an explicit `retired` payload and performs NO database
 * operation. Remove the route once no scheduler references it.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = authorizeMaintenanceRequest(req);
  if (auth === 'unconfigured') {
    console.error('[learning-path-summaries] CRON_SECRET is not configured; refusing to run');
    return res.status(503).json({ error: 'Service unavailable' });
  }
  if (auth !== 'ok') {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  console.warn('[learning-path-summaries] retired maintenance route invoked; summaries are live views (migration 20260907120600) and need no refresh');
  return res.status(410).json({
    success: false,
    retired: true,
    message: 'Learning-path summaries are live database views; this refresh job is retired and performs no work',
    replacement: {
      relations: [
        'user_learning_path_summary',
        'learning_path_performance_summary',
        'learning_path_daily_summary',
        'learning_path_monthly_summary',
      ],
      retentionJob: '/api/cron/cleanup-learning-path-sessions',
    },
  });
}
