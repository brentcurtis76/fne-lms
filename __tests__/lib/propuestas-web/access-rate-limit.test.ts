/**
 * Proposal access-code limiter — reservation contract (R2-02, 2026-09-07).
 *
 * The limiter guards a PUBLIC endpoint (access-code verification for shared
 * proposals). The previous design counted only AFTER a failed guess and both
 * callers discarded the insert result: with readable counts and failing writes,
 * twelve wrong guesses and a thirteenth correct one all reached verification
 * (Codex reproduction). The attempt is now RESERVED — counted and recorded
 * atomically by `reserve_propuesta_access_attempt` — before any comparison, and
 * a caller never verifies without `allowed: true`. Synthetic client doubles only.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  reserveProposalAccessAttempt,
  releaseProposalAccessAttempt,
  PROPOSAL_ACCESS_MAX_ATTEMPTS,
  PROPOSAL_ACCESS_WINDOW,
} from '../../../lib/propuestas-web/access-rate-limit';

type RpcOutcome = { data?: unknown; error?: unknown; throws?: Error };

function rpcClient(outcome: RpcOutcome) {
  const rpc = vi.fn(async () => {
    if (outcome.throws) throw outcome.throws;
    return { data: outcome.data ?? null, error: outcome.error ?? null };
  });
  return { client: { rpc } as never, rpc };
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('reserveProposalAccessAttempt', () => {
  it('reserves through the atomic RPC with the ip, slug, limit and window', async () => {
    const { client, rpc } = rpcClient({ data: { allowed: true, remaining: 4, attempt_id: 17 } });
    const decision = await reserveProposalAccessAttempt(client, '203.0.113.9', 'slug-a');
    expect(decision).toEqual({ allowed: true, remaining: 4, degraded: false, attemptId: 17 });
    expect(rpc).toHaveBeenCalledWith('reserve_propuesta_access_attempt', {
      p_ip: '203.0.113.9',
      p_slug: 'slug-a',
      p_max_attempts: PROPOSAL_ACCESS_MAX_ATTEMPTS,
      p_window: PROPOSAL_ACCESS_WINDOW,
    });
  });

  it('accepts a bigint attempt id serialised as a string', async () => {
    const { client } = rpcClient({ data: { allowed: true, remaining: 0, attempt_id: '9007199254740993' } });
    const decision = await reserveProposalAccessAttempt(client, 'ip', 'slug');
    expect(decision.allowed).toBe(true);
    expect(decision.attemptId).not.toBeNull();
  });

  it('refuses at the limit (429 path) without degradation and without an attempt id', async () => {
    const { client } = rpcClient({ data: { allowed: false, remaining: 0, attempt_id: null } });
    expect(await reserveProposalAccessAttempt(client, 'ip', 'slug')).toEqual({ allowed: false, remaining: 0, degraded: false, attemptId: null });
  });

  it('FAILS CLOSED when the reservation RPC errors (write failure): not allowed, degraded', async () => {
    const { client } = rpcClient({ error: { message: 'synthetic insert failure' } });
    expect(await reserveProposalAccessAttempt(client, 'ip', 'slug')).toEqual({ allowed: false, remaining: 0, degraded: true, attemptId: null });
    expect(console.error).toHaveBeenCalled();
  });

  it('FAILS CLOSED when the client throws', async () => {
    const { client } = rpcClient({ throws: new Error('synthetic transport failure') });
    expect(await reserveProposalAccessAttempt(client, 'ip', 'slug')).toEqual({ allowed: false, remaining: 0, degraded: true, attemptId: null });
  });

  it('FAILS CLOSED on an unexpected shape (no boolean allowed)', async () => {
    const { client } = rpcClient({ data: { remaining: 4 } });
    expect((await reserveProposalAccessAttempt(client, 'ip', 'slug')).degraded).toBe(true);
  });

  it('FAILS CLOSED when "allowed" comes back without a recorded attempt id (not a reservation)', async () => {
    const { client } = rpcClient({ data: { allowed: true, remaining: 4, attempt_id: null } });
    expect(await reserveProposalAccessAttempt(client, 'ip', 'slug')).toEqual({ allowed: false, remaining: 0, degraded: true, attemptId: null });
  });
});

describe('releaseProposalAccessAttempt', () => {
  it('releases the recorded attempt and reports success', async () => {
    const { client, rpc } = rpcClient({ data: true });
    expect(await releaseProposalAccessAttempt(client, 17)).toBe(true);
    expect(rpc).toHaveBeenCalledWith('release_propuesta_access_attempt', { p_attempt_id: 17 });
  });

  it('does nothing for a null id', async () => {
    const { client, rpc } = rpcClient({ data: true });
    expect(await releaseProposalAccessAttempt(client, null)).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('a failed release is logged and leaves the slot consumed (returns false)', async () => {
    const { client } = rpcClient({ error: { message: 'synthetic delete failure' } });
    expect(await releaseProposalAccessAttempt(client, 17)).toBe(false);
    expect(console.error).toHaveBeenCalled();
  });

  it('a thrown release is handled the same way', async () => {
    const { client } = rpcClient({ throws: new Error('synthetic transport failure') });
    expect(await releaseProposalAccessAttempt(client, 17)).toBe(false);
  });
});
