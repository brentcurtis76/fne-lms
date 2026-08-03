/**
 * Authentication for the Zoom cron endpoints (`/api/cron/zoom-ticker`,
 * `/api/cron/zoom-reconcile`).
 *
 * ## Why two schemes
 *
 * Plan §14 specifies Vercel's native cron auth — Vercel invokes a scheduled path with
 * `Authorization: Bearer ${CRON_SECRET}`, a value the platform injects and rotates
 * itself. The repo already has a cron endpoint (`/api/cron/session-reminders`) using
 * its own `x-cron-key: ${CRON_API_KEY}` convention, which is what makes a manual
 * `curl` or an external scheduler like cron-job.org work.
 *
 * The PM ruling on that mismatch is: accept BOTH, invent no third. So a Vercel cron
 * authenticates natively, and an operator running the tick by hand — or an external
 * scheduler standing in while the project is on a plan without per-minute crons —
 * uses the header the rest of the repo already uses.
 *
 * ## Fail-closed, per path, independently
 *
 * Each scheme is usable only when ITS OWN environment variable is set. An unset
 * `CRON_SECRET` does not make the bearer path permissive, it makes it unusable; the
 * same for `CRON_API_KEY` and the header path. With neither set the endpoint answers
 * 401 to everything, which is the correct posture for a deployment that has not been
 * configured — it is the same rule `session-reminders` applies (`if (!expectedKey)`
 * → 401), stated once for two schemes.
 *
 * Comparison is constant-time via the verifier's length-checked `safeCompare`, which
 * is also the reason a caller cannot learn a prefix of either secret by timing.
 *
 * ## Not gated on FEATURE_ZOOM_MEETINGS
 *
 * Deliberate, and it is the §14 kill-switch rule: the flag hides the product surface,
 * it does NOT stop the machinery. Jobs already enqueued must still drain and webhooks
 * must still be recorded while the feature is off, or turning the flag back on would
 * resume against a stale world.
 */
import type { NextApiRequest } from 'next';
import { safeCompare } from './verifier';

export type CronAuthScheme = 'vercel_bearer' | 'x_cron_key';

export type CronAuthResult =
  | { ok: true; scheme: CronAuthScheme }
  | { ok: false };

function singleHeader(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value ?? undefined;
}

export function authorizeCronRequest(
  req: Pick<NextApiRequest, 'headers'>,
  env: NodeJS.ProcessEnv = process.env
): CronAuthResult {
  // Vercel-native. The whole header value is compared, so a bare secret without the
  // `Bearer ` prefix does not authenticate.
  const cronSecret = env.CRON_SECRET;
  const authorization = singleHeader(req.headers.authorization);
  if (cronSecret && authorization && safeCompare(authorization, `Bearer ${cronSecret}`)) {
    return { ok: true, scheme: 'vercel_bearer' };
  }

  // The repo's existing convention, for manual and external invocation.
  const cronApiKey = env.CRON_API_KEY;
  const providedKey = singleHeader(req.headers['x-cron-key']);
  if (cronApiKey && providedKey && safeCompare(providedKey, cronApiKey)) {
    return { ok: true, scheme: 'x_cron_key' };
  }

  return { ok: false };
}

/** Vercel invokes crons with GET; manual and external callers tend to POST. */
export const CRON_ALLOWED_METHODS = ['GET', 'POST'] as const;

export function isAllowedCronMethod(method: string | undefined): boolean {
  return method === 'GET' || method === 'POST';
}
