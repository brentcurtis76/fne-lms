/**
 * "Does this session get a Zoom meeting, and under what dedupe key?"
 *
 * The single answer to that question. Both approve routes call it; neither restates a
 * condition. The eligibility half is not reimplemented here either — it is
 * `checkSessionEligibility` from the provisioner, imported and delegated to, so the
 * enqueue side and the handler side can never drift into disagreeing about what a
 * provisionable session is (the handler re-checks on claim; this gate only decides
 * whether a job is worth minting at all).
 *
 * What IS here and nowhere else: the two §14 flags, which are enqueue-time policy rather
 * than source-state, and the dedupe key.
 */
import {
  checkSessionEligibility,
  type ProvisionSessionRow,
  type SessionEligibilityCheck,
} from './jobs/meeting-provision';
import { defaultZoomJobQueue, type ZoomJobQueue } from './jobs/queue';
import { FeatureFlags } from '../featureFlags';

/** §14 master kill switch. Off ⇒ no NEW provisioning (cleanup/reconcile are unaffected). */
export const ZOOM_MEETINGS_FLAG = FeatureFlags.ZOOM_MEETINGS;

/** §14 wave rollout: csv of `school_id`s. Unset or empty = every school. */
export const ZOOM_SCHOOL_ALLOWLIST_VAR = 'ZOOM_SCHOOL_ALLOWLIST';

/** Why the gate refused. Structural, so callers log a reason instead of a sentence. */
export type ProvisionGateRefusal =
  | { reason: 'feature_disabled' }
  | { reason: 'school_not_allowlisted'; schoolId: number }
  | { reason: 'session_ineligible'; check: SessionEligibilityCheck };

export type ProvisionEnqueueOutcome =
  | { status: 'enqueued'; dedupeKey: string }
  | { status: 'duplicate'; dedupeKey: string }
  | { status: 'skipped'; refusal: ProvisionGateRefusal }
  | { status: 'failed'; error: unknown };

/**
 * Parses `ZOOM_SCHOOL_ALLOWLIST`.
 *
 * `null` means "no allowlist configured — all schools pass". That is ONLY returned for
 * unset, empty, or whitespace-only input. A list with a malformed entry still returns a
 * set: dropping it back to `null` would silently widen a wave rollout to every school in
 * the country because someone typed a comma wrong. The malformed entry is simply not in
 * the set, so it refuses instead.
 */
export function parseSchoolAllowlist(raw: string | undefined | null): Set<number> | null {
  if (raw === undefined || raw === null) return null;
  if (raw.trim() === '') return null;

  const ids = new Set<number>();
  for (const entry of raw.split(',')) {
    const trimmed = entry.trim();
    if (trimmed === '') continue;
    const parsed = Number(trimmed);
    if (!Number.isInteger(parsed)) continue;
    ids.add(parsed);
  }
  return ids;
}

/**
 * The job's dedupe key.
 *
 * `approved_at` is IN the key on purpose. A key of just the session id would be
 * once-ever: `zoom_jobs.dedupe_key` is unique across all statuses, so a job that
 * dead-lettered would keep the key forever and re-approving the session could never mint
 * a replacement. Binding the key to the approval instant makes a double-submit or a
 * route retry inside ONE approval collapse to `'duplicate'` (right — the same approval
 * must not queue twice) while a genuine later re-approval mints a fresh job (also right
 * — and safe, because the handler is idempotent by checkpoint-adopt, so a redundant job
 * converges instead of double-creating).
 */
export function provisionDedupeKey(sessionId: string, approvedAt: string): string {
  return `meeting_provision:consultor_session:${sessionId}:${approvedAt}`;
}

/**
 * `null` when the session should be provisioned for; otherwise the first refusal.
 *
 * Order: master flag (cheapest and most absolute) → source-state eligibility (delegated)
 * → school allowlist (the wave gate, last because it is the most likely to change).
 */
export function checkProvisionGate(
  session: ProvisionSessionRow,
  env: NodeJS.ProcessEnv = process.env
): ProvisionGateRefusal | null {
  if (env[ZOOM_MEETINGS_FLAG] !== 'true') return { reason: 'feature_disabled' };

  const check = checkSessionEligibility(session);
  if (check !== null) return { reason: 'session_ineligible', check };

  const allowlist = parseSchoolAllowlist(env[ZOOM_SCHOOL_ALLOWLIST_VAR]);
  if (allowlist !== null && !allowlist.has(session.school_id)) {
    return { reason: 'school_not_allowlisted', schoolId: session.school_id };
  }

  return null;
}

export interface EnqueueSessionProvisionArgs {
  session: ProvisionSessionRow;
  /** The `approved_at` the route just wrote, verbatim — see `provisionDedupeKey`. */
  approvedAt: string;
  /** Injected by tests; built lazily (and only after the gate passes) in production. */
  queue?: ZoomJobQueue;
  env?: NodeJS.ProcessEnv;
}

/**
 * Runs the gate and, on pass, enqueues the `meeting_provision` job.
 *
 * NEVER throws. Plan §8 is explicit that approval must not fail because of Zoom, so a
 * queue error — or a missing Zoom service-client env, which is what `defaultZoomJobQueue`
 * throws on — is caught, logged against the session id, and swallowed. The caller's HTTP
 * response is identical in all four outcomes.
 */
export async function enqueueSessionProvision(
  args: EnqueueSessionProvisionArgs
): Promise<ProvisionEnqueueOutcome> {
  const { session, approvedAt } = args;
  const env = args.env ?? process.env;

  const refusal = checkProvisionGate(session, env);
  if (refusal !== null) {
    return { status: 'skipped', refusal };
  }

  const dedupeKey = provisionDedupeKey(session.id, approvedAt);

  try {
    const queue = args.queue ?? defaultZoomJobQueue(env);
    const result = await queue.enqueue({
      job_type: 'meeting_provision',
      payload: { surface_type: 'consultor_session', surface_id: session.id },
      dedupe_key: dedupeKey,
    });
    return { status: result, dedupeKey };
  } catch (error: any) {
    console.error(
      `[zoom] meeting_provision enqueue failed for session ${session.id}: ${error?.message ?? error}`
    );
    return { status: 'failed', error };
  }
}
