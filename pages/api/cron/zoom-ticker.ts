/**
 * Zoom job-queue ticker (plan §4). Scheduled every minute in `vercel.json`.
 *
 * The route is deliberately thin: authenticate, run one tick, serialize the counters.
 * The loop itself is `lib/zoom/jobs/runner.ts`, which is where the lease semantics,
 * the failure taxonomy and the time budget are documented.
 *
 * Auth accepts Vercel's native `Authorization: Bearer ${CRON_SECRET}` and the repo's
 * existing `x-cron-key: ${CRON_API_KEY}`; both fail closed when their own variable is
 * unset. See `lib/zoom/cron-auth.ts` for why there are two and no third.
 *
 * **Not gated on `FEATURE_ZOOM_MEETINGS`** — §14 kill-switch rule: the flag hides the
 * product surface, it does not stop the machinery. An empty queue makes this a
 * no-op that costs one `claim_zoom_jobs` round trip, which is what makes it safe to
 * schedule before anything enqueues.
 *
 * Errors are terse English, not es-CL: the only callers are Vercel's scheduler and an
 * operator with `curl`.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import {
  authorizeCronRequest,
  CRON_ALLOWED_METHODS,
  isAllowedCronMethod,
} from '../../../lib/zoom/cron-auth';
import { defaultZoomJobQueue, type ZoomJobQueue } from '../../../lib/zoom/jobs/queue';
import { createZoomJobRegistry, type ZoomJobRegistry } from '../../../lib/zoom/jobs/registry';
import { createTickerWorkerId, runZoomTick } from '../../../lib/zoom/jobs/runner';

export interface ZoomTickerHandlerDeps {
  queue?: ZoomJobQueue;
  registry?: ZoomJobRegistry;
  env?: NodeJS.ProcessEnv;
  workerId?: string;
  now?: () => number;
  budgetMs?: number;
}

export async function handleZoomTicker(
  req: NextApiRequest,
  res: NextApiResponse,
  deps: ZoomTickerHandlerDeps = {}
): Promise<void> {
  const env = deps.env ?? process.env;

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
    const result = await runZoomTick({
      queue: deps.queue ?? defaultZoomJobQueue(env),
      registry: deps.registry ?? createZoomJobRegistry(),
      workerId: deps.workerId ?? createTickerWorkerId(),
      now: deps.now,
      budgetMs: deps.budgetMs,
    });
    res.status(200).json(result);
  } catch (error) {
    // A throw here means the queue itself is unreachable (claim failed, or the
    // service client has no env). Individual job failures never reach this path —
    // they are recorded on their own rows by `fail_zoom_job`.
    console.error('[zoom-ticker] tick failed:', error);
    res.status(500).json({ error: 'Internal error' });
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  return handleZoomTicker(req, res);
}
