/**
 * Zoom hourly reconciler (plan §8 lifecycle drift, §9 host inventory). Scheduled
 * `0 * * * *` in `vercel.json`.
 *
 * This endpoint ENQUEUES; it does not do work. Anything slow or fallible belongs on
 * the queue, where it gets a lease, bounded retries and a dead-letter — a reconcile
 * that did its own work inside the request would lose all three, and Vercel crons
 * never retry.
 *
 * Same auth as the ticker (see `lib/zoom/cron-auth.ts`), and for the same §14
 * kill-switch reason it is NOT gated on `FEATURE_ZOOM_MEETINGS`.
 *
 * ## What is here now
 *
 * Two jobs, each deduped on the UTC hour — `host_sync:<hour>` and
 * `webhook_sweep:<hour>`. Against the UNIQUE index that means an hour enqueues each
 * exactly once, no matter how many times the endpoint fires — Vercel crons can
 * double-fire, and an operator can always `curl` it. A second call in the same hour is
 * a `'duplicate'` and a clean 200.
 *
 * The hour is taken in UTC, deliberately: the key must be stable regardless of the
 * invoking region's local time, and America/Santiago's DST transitions would
 * otherwise make one hour of the year enqueue twice and another not at all.
 *
 * ## What is deliberately NOT here yet
 *
 * The §8/§9 drift checks land in later chunks and each becomes another enqueue in
 * `planReconcileJobs()` below:
 *
 *  - **Stalled lifecycle** (§8): `zoom_meetings` rows still `provisioned` well past
 *    `ends_at`, i.e. a `meeting.ended` webhook that never arrived.
 *  - **Settings drift** (§12/§18): re-read `auto_recording` for active meetings.
 *    Keys on `auto_recording`, never on `recording_disclaimer` (ledger §9.4).
 *  - **Recording transfer sweep** (§12): `zoom_recording_files` stuck in
 *    `transferring`. Arrives with Z4.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import {
  authorizeCronRequest,
  CRON_ALLOWED_METHODS,
  isAllowedCronMethod,
} from '../../../lib/zoom/cron-auth';
import { defaultZoomJobQueue, type ZoomJobQueue } from '../../../lib/zoom/jobs/queue';
import type { ZoomJobInsert } from '../../../lib/zoom/db-types';

/** `2026-07-30T12` — UTC hour, the dedupe granularity of an hourly reconcile. */
export function utcHourKey(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 13);
}

/**
 * The jobs one reconcile pass wants enqueued. A pure function of the clock today;
 * future drift checks will make it a function of the database too, at which point it
 * takes the service client as an argument and the route stays exactly as it is.
 */
export function planReconcileJobs(nowMs: number): ZoomJobInsert[] {
  const hour = utcHourKey(nowMs);
  return [
    {
      job_type: 'host_sync',
      payload: { source: 'reconcile' },
      dedupe_key: `host_sync:${hour}`,
    },
    {
      job_type: 'webhook_sweep',
      payload: { source: 'reconcile' },
      dedupe_key: `webhook_sweep:${hour}`,
    },
    // Future: stalled-lifecycle, settings-drift and recording-sweep jobs. See the
    // module header for what each one is waiting on.
  ];
}

export interface ZoomReconcileHandlerDeps {
  queue?: ZoomJobQueue;
  env?: NodeJS.ProcessEnv;
  now?: () => number;
}

export async function handleZoomReconcile(
  req: NextApiRequest,
  res: NextApiResponse,
  deps: ZoomReconcileHandlerDeps = {}
): Promise<void> {
  const env = deps.env ?? process.env;
  const now = deps.now ?? (() => Date.now());

  if (!isAllowedCronMethod(req.method)) {
    res.setHeader('Allow', CRON_ALLOWED_METHODS.join(', '));
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const auth = authorizeCronRequest(req, env);
  if (auth.ok === false) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const queue = deps.queue ?? defaultZoomJobQueue(env);
    let enqueued = 0;
    for (const job of planReconcileJobs(now())) {
      const outcome = await queue.enqueue(job);
      if (outcome === 'enqueued') enqueued += 1;
    }
    res.status(200).json({ enqueued });
  } catch (error) {
    console.error('[zoom-reconcile] enqueue failed:', error);
    res.status(500).json({ error: 'Internal error' });
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  return handleZoomReconcile(req, res);
}
