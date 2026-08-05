/**
 * "Does this session get a Zoom meeting, does the platform have to tell Zoom about a
 * change to it, and under what dedupe key?"
 *
 * The single answer to those questions. Six routes call in — the two approve routes, the
 * two reschedule routes and the two cancel routes; none of them restates a condition. The
 * eligibility half is not reimplemented here either — it is `checkSessionEligibility` from
 * the provisioner, imported and delegated to, so the enqueue side and the handler side can
 * never drift into disagreeing about what a provisionable session is (handlers re-check on
 * claim; this gate only decides whether a job is worth minting at all).
 *
 * What IS here and nowhere else: the two §14 flags, which are enqueue-time policy rather
 * than source-state, and the three dedupe keys.
 */
import {
  checkSessionEligibility,
  deriveDurationMinutes,
  sessionStartsAtIso,
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

/**
 * Why the CLEANUP gate refused. A separate vocabulary from `ProvisionGateRefusal` because
 * the two gates ask different questions — and cleanup asks only one, so there is only one
 * way to refuse it. See `checkCleanupGate`.
 */
export type CleanupGateRefusal = { reason: 'not_managed' };

export type ZoomEnqueueRefusal = ProvisionGateRefusal | CleanupGateRefusal;

export type ProvisionEnqueueOutcome =
  | { status: 'enqueued'; dedupeKey: string }
  | { status: 'duplicate'; dedupeKey: string }
  | { status: 'skipped'; refusal: ZoomEnqueueRefusal }
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
 * `meeting_sync`'s dedupe key, bound to the TARGET schedule (PM ruling 1).
 *
 * Keyed on where the session is moving TO, not on when the move was requested. A
 * double-submit of one reschedule derives the same target and collapses to `'duplicate'`
 * — right, because two jobs would PATCH Zoom to the identical time. A genuine LATER
 * reschedule derives a different target and mints a fresh job — also right, and safe,
 * because the handler is idempotent and reads the session's current schedule when it
 * runs rather than trusting anything embedded in the key.
 *
 * The duration is in the key as well as the instant: `09:00–10:30 → 09:00–11:30` moves no
 * start time at all, and a start-only key would swallow it as a duplicate and leave Zoom
 * holding the old 90 minutes.
 */
export function meetingSyncDedupeKey(
  sessionId: string,
  startsAtIso: string,
  durationMinutes: number
): string {
  return `meeting_sync:consultor_session:${sessionId}:${startsAtIso}:${durationMinutes}`;
}

/**
 * `meeting_delete`'s dedupe key — STATIC on the surface (PM ruling 1).
 *
 * A surface is deleted once and never un-deleted, so there is no second, legitimately
 * different delete for the same session to make room for. The handler is idempotent, so
 * a duplicate collapsing is exactly the desired behaviour: cancelling a session twice,
 * or cancelling one that a series cancel already covered, enqueues nothing extra.
 */
export function meetingDeleteDedupeKey(sessionId: string): string {
  return `meeting_delete:consultor_session:${sessionId}`;
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

/**
 * `null` when the platform should tell Zoom to drop this session's meeting; otherwise the
 * first refusal.
 *
 * A DIFFERENT gate from `checkProvisionGate`, and the difference is the whole point:
 * `checkSessionEligibility` refuses a cancelled session and a `presencial` one, which are
 * precisely the two states a cleanup exists for. Running the provisioning gate here would
 * refuse every job it is supposed to mint.
 *
 * What it keeps is the durable managed intent — `is_zoom_managed`, the §8 flag that says
 * the platform ever owned a meeting for this session. A session that was never managed has
 * nothing at Zoom to remove, so a job for it would be pure noise. Note that this is
 * checked rather than `meeting_provider`: the provider is vocabulary (baseline:7740) and
 * can legitimately be hand-managed, whereas the intent is the fact.
 *
 * NEITHER §14 flag is consulted here, deliberately — this is not an oversight, so do not
 * "restore" a flag check. §14 says the master kill switch stops *new meetings and joins*,
 * **never cleanup**, and names `meeting_delete` for cancellations among the jobs that
 * CONTINUE while it is off: a session cancelled during an incident window would otherwise
 * leave a live meeting on a booked host, which is the failure that sentence exists to
 * prevent. `ZOOM_SCHOOL_ALLOWLIST` follows from §14's own wording that it is "checked at
 * provision time" — a cancellation is not a provision, and a school leaving the wave must
 * never strand a live meeting. Hence no `env` parameter: there is no environment to read.
 */
export function checkCleanupGate(session: ProvisionSessionRow): CleanupGateRefusal | null {
  if (session.is_zoom_managed !== true) return { reason: 'not_managed' };

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

export interface EnqueueSessionMeetingArgs {
  /** The session as it stands AFTER the route's own update committed. */
  session: ProvisionSessionRow;
  /** Injected by tests; built lazily (and only after the gate passes) in production. */
  queue?: ZoomJobQueue;
  env?: NodeJS.ProcessEnv;
}

/**
 * Runs the provisioning gate and, on pass, enqueues `meeting_sync` for a rescheduled
 * session.
 *
 * The PROVISIONING gate, not the cleanup one: a reschedule leaves the session in exactly
 * the state a meeting is provisionable for (`programada`, remote, managed), and anything
 * that fails that gate is a session whose meeting should not be moved — it should be
 * deleted, or it never existed.
 *
 * NEVER throws, on the same §8 rule as approve: no user action fails because of Zoom. The
 * schedule derivation is inside the try because `getSessionDateTime` throws on a malformed
 * date or time, and a route must not 500 over a key it was building for a background job.
 */
export async function enqueueSessionMeetingSync(
  args: EnqueueSessionMeetingArgs
): Promise<ProvisionEnqueueOutcome> {
  const { session } = args;
  const env = args.env ?? process.env;

  const refusal = checkProvisionGate(session, env);
  if (refusal !== null) {
    return { status: 'skipped', refusal };
  }

  let dedupeKey: string;
  try {
    // §10: the instant comes from the one helper that knows the zone, and from the SAME
    // derivation the provisioner and the handler use — a key built any other way would
    // still be a valid string and would silently stop deduplicating. The HANDLER derives
    // the wall-clock it sends to Zoom; this is only the identity of the target.
    const startsAtIso = sessionStartsAtIso(session);
    const durationMinutes =
      session.scheduled_duration_minutes ??
      deriveDurationMinutes(session.session_date, session.start_time, session.end_time);
    dedupeKey = meetingSyncDedupeKey(session.id, startsAtIso, durationMinutes);
  } catch (error: any) {
    console.error(
      `[zoom] meeting_sync key derivation failed for session ${session.id}: ${error?.message ?? error}`
    );
    return { status: 'failed', error };
  }

  try {
    const queue = args.queue ?? defaultZoomJobQueue(env);
    const result = await queue.enqueue({
      job_type: 'meeting_sync',
      payload: { surface_type: 'consultor_session', surface_id: session.id },
      dedupe_key: dedupeKey,
    });
    return { status: result, dedupeKey };
  } catch (error: any) {
    console.error(
      `[zoom] meeting_sync enqueue failed for session ${session.id}: ${error?.message ?? error}`
    );
    return { status: 'failed', error };
  }
}

/**
 * Runs the cleanup gate and, on pass, enqueues `meeting_delete` — for a cancelled session
 * (single or series) or one flipped off a remote modality.
 *
 * NEVER throws, for the same reason as every other enqueue here: a cancellation returns
 * what it returns today whether this succeeded, deduped, was gated off or errored.
 *
 * `env` still reaches the queue factory, but no longer any gate — see `checkCleanupGate`.
 */
export async function enqueueSessionMeetingDelete(
  args: EnqueueSessionMeetingArgs
): Promise<ProvisionEnqueueOutcome> {
  const { session } = args;
  const env = args.env ?? process.env;

  const refusal = checkCleanupGate(session);
  if (refusal !== null) {
    return { status: 'skipped', refusal };
  }

  const dedupeKey = meetingDeleteDedupeKey(session.id);

  try {
    const queue = args.queue ?? defaultZoomJobQueue(env);
    const result = await queue.enqueue({
      job_type: 'meeting_delete',
      payload: { surface_type: 'consultor_session', surface_id: session.id },
      dedupe_key: dedupeKey,
    });
    return { status: result, dedupeKey };
  } catch (error: any) {
    console.error(
      `[zoom] meeting_delete enqueue failed for session ${session.id}: ${error?.message ?? error}`
    );
    return { status: 'failed', error };
  }
}
