import { NextApiRequest, NextApiResponse } from 'next';
import { timingSafeEqual } from 'crypto';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';

/**
 * Maintenance-endpoint authentication (B2c-M1).
 *
 * Fail closed. The route is reachable over plain HTTP and runs with the
 * privileged client, so it must prove the caller holds the scheduler secret
 * before any query or RPC runs:
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

/** Operating contract (closure C4, 2026-09-07). */
export const STALE_AFTER_MINUTES = 15;
export const RETENTION_DAYS = 7;
/**
 * The database refuses a boundary later than `now() - 7 days` on ITS clock.
 * Asking for exactly seven days on the application clock races that check by
 * the skew between the two clocks (observed in an E2E run: a few hundred ms
 * was enough), so the request carries this margin — the boundary is still at
 * least seven days old, just never a hair under it.
 */
export const RETENTION_CLOCK_SKEW_MARGIN_MS = 5 * 60 * 1000;
export const ARCHIVE_BATCH_SIZE = 1000;
export const ARCHIVE_MAX_BATCHES_PER_RUN = 5;

type StageError = { stage: 'settlement' | 'retention'; message: string };

/**
 * Learning-path session maintenance. Scheduled HOURLY (vercel.json) with a
 * 15-minute stale threshold; safe to invoke more often or concurrently.
 *
 * Every run performs BOTH stages, in order, and reports each truthfully:
 *
 *  1. Settlement — ONE transactional RPC, close_stale_learning_path_sessions
 *     (SECURITY DEFINER, service_role only): closes open sessions whose last
 *     authorized heartbeat is older than the threshold, and settles them plus
 *     any closed-but-unsettled session, exactly once (settled_at, union-
 *     clipped credit, per-(user, path) advisory lock). `settled` can be
 *     nonzero when `closed` is zero (window artefacts of the previous route).
 *
 *  2. Retention — archive_settled_learning_path_sessions(before, limit):
 *     deletes closed AND settled sessions older than RETENTION_DAYS in bounded
 *     batches (ARCHIVE_BATCH_SIZE, at most ARCHIVE_MAX_BATCHES_PER_RUN per
 *     run; `retention.hasMore` says a backlog remains for the next run — a
 *     backlog drains at ≤ 5 000 sessions per hourly run). Sessions still
 *     needed as settlement evidence (an unsettled session of the same pair
 *     may overlap them) or without a durable daily-activity grain row are
 *     retained and counted, never silently dropped. Reporting history lives
 *     in learning_path_daily_user_activity, written at settlement, so the
 *     deletion loses no report data.
 *
 * Response: 200 with the full accounting when both stages succeed; 500 with
 * `ok: false`, the stage that failed and whatever the earlier stage already
 * achieved when any stage fails (the scheduler sees a failed run; both stages
 * are idempotent, so the next run simply continues). No secret is ever
 * echoed.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = authorizeMaintenanceRequest(req);
  if (auth === 'unconfigured') {
    console.error('[SessionCleanup] CRON_SECRET is not configured; refusing to run');
    return res.status(503).json({ error: 'Service unavailable' });
  }
  if (auth !== 'ok') {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const supabase = supabaseAdmin;
  const now = new Date();
  const staleCutoff = new Date(now.getTime() - STALE_AFTER_MINUTES * 60 * 1000);
  const retentionBoundary = new Date(now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000 - RETENTION_CLOCK_SKEW_MARGIN_MS);

  const errors: StageError[] = [];
  const settlement = { closed: 0, settled: 0, ok: false };
  const retention = { archived: 0, batches: 0, hasMore: false, retainedOpenOverlap: 0, retainedMissingEvidence: 0, ok: false };

  // Stage 1 — settlement
  try {
    const { data, error } = await supabase.rpc('close_stale_learning_path_sessions', {
      p_stale_cutoff: staleCutoff.toISOString(),
    });
    if (error) {
      throw new Error(error.message || 'close_stale_learning_path_sessions failed');
    }
    settlement.closed = Number((data as any)?.closed ?? 0);
    settlement.settled = Number((data as any)?.settled ?? 0);
    settlement.ok = true;
  } catch (error: any) {
    console.error('[SessionCleanup] settlement failed:', error?.message ?? error);
    errors.push({ stage: 'settlement', message: String(error?.message ?? error) });
  }

  // Stage 2 — retention (runs on idle and settlement-only runs too; skipped
  // only when settlement itself failed, so a broken database is not hammered)
  if (settlement.ok) {
    try {
      for (let batch = 0; batch < ARCHIVE_MAX_BATCHES_PER_RUN; batch += 1) {
        const { data, error } = await supabase.rpc('archive_settled_learning_path_sessions', {
          p_before: retentionBoundary.toISOString(),
          p_limit: ARCHIVE_BATCH_SIZE,
        });
        if (error) {
          throw new Error(error.message || 'archive_settled_learning_path_sessions failed');
        }
        retention.batches += 1;
        retention.archived += Number((data as any)?.deleted ?? 0);
        retention.hasMore = Boolean((data as any)?.has_more);
        retention.retainedOpenOverlap = Number((data as any)?.retained_open_overlap ?? 0);
        retention.retainedMissingEvidence = Number((data as any)?.retained_missing_evidence ?? 0);
        if (!retention.hasMore) break;
      }
      retention.ok = true;
    } catch (error: any) {
      console.error('[SessionCleanup] retention failed:', error?.message ?? error);
      errors.push({ stage: 'retention', message: String(error?.message ?? error) });
    }
  }

  const ok = errors.length === 0;
  const result = {
    ok,
    message: ok
      ? settlement.closed === 0 && settlement.settled === 0 && retention.archived === 0
        ? 'Idle run: nothing to close, settle or archive'
        : 'Session maintenance completed'
      : 'Session maintenance failed',
    staleCutoff: staleCutoff.toISOString(),
    retentionBoundary: retentionBoundary.toISOString(),
    settlement: { closed: settlement.closed, settled: settlement.settled, ok: settlement.ok },
    retention: {
      archived: retention.archived,
      batches: retention.batches,
      hasMore: retention.hasMore,
      retainedOpenOverlap: retention.retainedOpenOverlap,
      retainedMissingEvidence: retention.retainedMissingEvidence,
      ok: retention.ok,
    },
    errors,
    timestamp: now.toISOString(),
  };

  if (ok) {
    console.log('[SessionCleanup] summary:', JSON.stringify(result));
    return res.status(200).json(result);
  }
  console.error('[SessionCleanup] failed run:', JSON.stringify(result));
  return res.status(500).json(result);
}

// Export configuration for Vercel Cron
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '1mb',
    },
  },
  maxDuration: 60,
};
