import type { NextApiRequest } from 'next';
import type { SupabaseClient } from '@supabase/supabase-js';

export const PROPOSAL_ACCESS_MAX_ATTEMPTS = 5;
export const PROPOSAL_ACCESS_WINDOW = '1 hour';

export function getProposalRequestIp(req: NextApiRequest): string {
  return (
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
    || req.socket.remoteAddress
    || 'unknown'
  );
}

/**
 * Outcome of reserving one access-code attempt (R2-02, 2026-09-07).
 *
 * The reservation is the accounting: the attempt is COUNTED before the code is
 * verified, atomically with the count of the recent attempts of the same
 * (ip, slug) (SECURITY DEFINER `reserve_propuesta_access_attempt`, advisory
 * lock per pair). Callers must not verify a code unless `allowed` is true —
 * there is no code path in which a guess reaches verification without a
 * successfully recorded attempt, so a limiter whose writes fail cannot open a
 * brute-force window (the previous design counted only AFTER a failed guess and
 * discarded the insert result; twelve wrong guesses followed by a correct one
 * all reached verification while inserts failed).
 *
 *   allowed=false, degraded=false  → the window is exhausted (429)
 *   allowed=false, degraded=true   → the limiter could not reserve (503); the
 *                                    client is not told it exhausted anything
 *   allowed=true                   → verify; `attemptId` is the recorded row,
 *                                    to be released only after a CORRECT code
 */
export type ProposalAttemptReservation = {
  allowed: boolean;
  remaining: number;
  degraded: boolean;
  attemptId: number | null;
};

const DENIED_DEGRADED: ProposalAttemptReservation = { allowed: false, remaining: 0, degraded: true, attemptId: null };

export async function reserveProposalAccessAttempt(
  client: SupabaseClient,
  ip: string,
  slug: string
): Promise<ProposalAttemptReservation> {
  let data: unknown = null;
  let error: unknown = null;
  try {
    ({ data, error } = await client.rpc('reserve_propuesta_access_attempt', {
      p_ip: ip,
      p_slug: slug,
      p_max_attempts: PROPOSAL_ACCESS_MAX_ATTEMPTS,
      p_window: PROPOSAL_ACCESS_WINDOW,
    }));
  } catch (thrown) {
    error = thrown;
  }

  if (error) {
    // Fail CLOSED: an attempt that cannot be accounted for is not verified.
    console.error('[rate-limit] reservation failed; refusing the attempt (fail-closed):', error);
    return DENIED_DEGRADED;
  }

  const row = (data ?? null) as { allowed?: unknown; remaining?: unknown; attempt_id?: unknown } | null;
  if (!row || typeof row.allowed !== 'boolean') {
    console.error('[rate-limit] reservation returned an unexpected shape; refusing the attempt (fail-closed)');
    return DENIED_DEGRADED;
  }

  if (!row.allowed) {
    return { allowed: false, remaining: 0, degraded: false, attemptId: null };
  }

  const attemptId = typeof row.attempt_id === 'number' ? row.attempt_id
    : typeof row.attempt_id === 'string' && /^\d+$/.test(row.attempt_id) ? Number(row.attempt_id)
    : null;
  if (attemptId === null) {
    // allowed without a recorded row is not a reservation: refuse.
    console.error('[rate-limit] reservation reported allowed without an attempt id; refusing (fail-closed)');
    return DENIED_DEGRADED;
  }

  const remaining = typeof row.remaining === 'number' ? Math.max(row.remaining, 0) : 0;
  return { allowed: true, remaining, degraded: false, attemptId };
}

/**
 * Gives a reservation back after a CORRECT access code, so a legitimate
 * recipient does not consume a failed-attempt slot (the previous contract
 * counted only failed guesses). Best effort: a failed release leaves the slot
 * consumed, which is the safe direction. Returns whether the row was removed.
 */
export async function releaseProposalAccessAttempt(
  client: SupabaseClient,
  attemptId: number | null
): Promise<boolean> {
  if (attemptId === null) return false;
  try {
    const { data, error } = await client.rpc('release_propuesta_access_attempt', { p_attempt_id: attemptId });
    if (error) {
      console.error('[rate-limit] failed to release a successful attempt (slot stays consumed):', error);
      return false;
    }
    return data === true;
  } catch (thrown) {
    console.error('[rate-limit] failed to release a successful attempt (slot stays consumed):', thrown);
    return false;
  }
}
