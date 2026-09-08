/** Durable self-service recovery request queue. Server-only. */
import { randomUUID } from 'node:crypto';
import type { NextApiRequest } from 'next';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  fingerprintRecoveryCandidate,
  fingerprintRecoveryIp,
  openRecoveryEnvelope,
  sealRecoveryEnvelope,
} from './recovery-crypto';
import { generateRecoveryLink, isRecoveryLinkRefusal } from './recovery-link';
import { sendPasswordRecoveryEmail, type EmailTransport } from '../email/invitations';
import { recordSecurityAudit } from '../security/audit';
import { authorizeUserEmail } from '../email/outbound-policy';

export const RECOVERY_REQUEST_COOLDOWN_SECONDS = 10 * 60;
export const RECOVERY_IP_LIMIT = 10;
export const RECOVERY_IP_WINDOW_SECONDS = 60;
export const RECOVERY_OUTBOX_RETRY_SECONDS = 60;
export const RECOVERY_OUTBOX_MAX_ATTEMPTS = 8;

interface ClaimedRecoveryJob {
  jobId: string;
  requestEnvelope: string;
  messageEnvelope: string | null;
  idempotencyKey: string;
  providerAttempts: number;
}

function singleHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function recoveryClientIp(req: Pick<NextApiRequest, 'headers' | 'socket'>): string {
  const forwarded = singleHeader(req.headers['x-forwarded-for']);
  if (forwarded) return forwarded.split(',')[0].trim().slice(0, 128);
  const real = singleHeader(req.headers['x-real-ip']);
  if (real) return real.trim().slice(0, 128);
  return req.socket?.remoteAddress?.slice(0, 128) || 'unknown';
}

export function normalizeRecoveryEmail(value: unknown): string {
  if (typeof value !== 'string') return '';
  const normalized = value.trim().toLowerCase();
  return normalized.length <= 320 ? normalized : '';
}

/**
 * One database round trip owns both distributed abuse layers and the enqueue.
 *
 * ANTI-ENUMERATION: the transaction receives only one-way fingerprints and an
 * encrypted envelope — never the address, and never anything derived from a
 * profile lookup. Known and unknown candidates therefore perform structurally
 * identical work: IP budget, candidate advisory lock, candidate cooldown,
 * encrypted enqueue. Account existence is resolved later, asynchronously, by
 * the outbox worker. The returned status reflects only throttling and is
 * intentionally not exposed by the public endpoint.
 */
export async function enqueueRecoveryRequest(
  admin: SupabaseClient,
  input: { email: string; origin: string; ip: string },
  options: { secret?: string } = {}
): Promise<'queued' | 'suppressed' | 'failed'> {
  let envelope: string;
  let ipHash: string;
  let candidateFingerprint: string;
  try {
    envelope = sealRecoveryEnvelope(
      { email: input.email, origin: input.origin },
      'request',
      options.secret
    );
    ipHash = fingerprintRecoveryIp(input.ip, options.secret);
    candidateFingerprint = fingerprintRecoveryCandidate(input.email, options.secret);
  } catch {
    console.error('[recovery-request] recovery cryptography is not configured');
    return 'failed';
  }

  try {
    const { data, error } = await admin.rpc('enqueue_password_recovery', {
      p_candidate_fingerprint: candidateFingerprint,
      p_ip_hash: ipHash,
      p_request_envelope: envelope,
      p_cooldown_seconds: RECOVERY_REQUEST_COOLDOWN_SECONDS,
      p_ip_limit: RECOVERY_IP_LIMIT,
      p_ip_window_seconds: RECOVERY_IP_WINDOW_SECONDS,
    });
    if (error) {
      console.error('[recovery-request] durable enqueue failed', {
        code: (error as { code?: string }).code ?? null,
      });
      return 'failed';
    }
    return data === 'queued' ? 'queued' : 'suppressed';
  } catch {
    console.error('[recovery-request] durable enqueue threw');
    return 'failed';
  }
}

function parseClaimedJobs(data: unknown): ClaimedRecoveryJob[] {
  if (!Array.isArray(data)) return [];
  return data.flatMap((row) => {
    if (!row || typeof row !== 'object') return [];
    const value = row as Record<string, unknown>;
    if (
      typeof value.job_id !== 'string' ||
      typeof value.request_envelope !== 'string' ||
      typeof value.idempotency_key !== 'string'
    ) {
      return [];
    }
    return [
      {
        jobId: value.job_id,
        requestEnvelope: value.request_envelope,
        messageEnvelope:
          typeof value.message_envelope === 'string' ? value.message_envelope : null,
        idempotencyKey: value.idempotency_key,
        providerAttempts:
          typeof value.provider_attempts === 'number' ? value.provider_attempts : 0,
      },
    ];
  });
}

async function finishJob(
  admin: SupabaseClient,
  job: ClaimedRecoveryJob,
  workerToken: string,
  state: 'queued' | 'provider_accepted' | 'provider_rejected' | 'dead',
  providerMessageId?: string
): Promise<boolean> {
  const { data, error } = await admin.rpc('finish_password_recovery_outbox', {
    p_job_id: job.jobId,
    p_worker_token: workerToken,
    p_state: state,
    p_provider_message_id: providerMessageId ?? null,
    p_retry_delay_seconds: RECOVERY_OUTBOX_RETRY_SECONDS,
  });
  if (error || data !== true) {
    console.error('[recovery-outbox] durable completion failed', {
      code: (error as { code?: string } | null)?.code ?? null,
    });
    return false;
  }
  return true;
}

type ResolvedAccount =
  | { status: 'resolved'; userId: string; firstName: string }
  | { status: 'discarded' }
  | { status: 'lease_lost' }
  | { status: 'unavailable' };

/**
 * THE canonical account-resolution step (see resolve_password_recovery_outbox):
 * one case-insensitive, whitespace-normalized SQL comparison, run by the worker
 * under its lease, long after the public request already answered. This is the
 * only place in the pipeline where "does this address have an account" exists
 * as a question at all.
 */
async function resolveAccount(
  admin: SupabaseClient,
  job: ClaimedRecoveryJob,
  workerToken: string,
  email: string
): Promise<ResolvedAccount> {
  try {
    const { data, error } = await admin.rpc('resolve_password_recovery_outbox', {
      p_job_id: job.jobId,
      p_worker_token: workerToken,
      p_email: email,
    });
    if (error) {
      console.error('[recovery-outbox] account resolution failed', {
        code: (error as { code?: string }).code ?? null,
      });
      return { status: 'unavailable' };
    }
    const row = Array.isArray(data) ? (data[0] as Record<string, unknown> | undefined) : null;
    if (row?.status === 'resolved' && typeof row.user_id === 'string') {
      return {
        status: 'resolved',
        userId: row.user_id,
        firstName: typeof row.first_name === 'string' ? row.first_name : '',
      };
    }
    if (row?.status === 'discarded') return { status: 'discarded' };
    if (row?.status === 'lease_lost') return { status: 'lease_lost' };
    return { status: 'unavailable' };
  } catch {
    console.error('[recovery-outbox] account resolution threw');
    return { status: 'unavailable' };
  }
}

function retryState(job: ClaimedRecoveryJob): 'queued' | 'dead' {
  return job.providerAttempts + 1 >= RECOVERY_OUTBOX_MAX_ATTEMPTS ? 'dead' : 'queued';
}

function countRetry(
  result: RecoveryOutboxRunResult,
  state: 'queued' | 'dead'
): void {
  if (state === 'dead') result.dead += 1;
  else result.retried += 1;
}

export interface RecoveryOutboxRunResult {
  claimed: number;
  providerAccepted: number;
  providerRejected: number;
  suppressedQa: number;
  /** Unknown candidates dropped without mail — resolved asynchronously here. */
  discarded: number;
  retried: number;
  dead: number;
}

/** Claim and dispatch a bounded batch. Safe for overlapping workers. */
export async function runRecoveryOutbox(
  admin: SupabaseClient,
  options: {
    limit?: number;
    workerToken?: string;
    secret?: string;
    transport?: EmailTransport;
  } = {}
): Promise<RecoveryOutboxRunResult> {
  const workerToken = options.workerToken ?? randomUUID();
  const result: RecoveryOutboxRunResult = {
    claimed: 0,
    providerAccepted: 0,
    providerRejected: 0,
    suppressedQa: 0,
    discarded: 0,
    retried: 0,
    dead: 0,
  };

  const { data, error } = await admin.rpc('claim_password_recovery_outbox', {
    p_worker_token: workerToken,
    p_limit: options.limit ?? 10,
    p_lease_seconds: 60,
    p_candidate_fingerprint: null,
  });
  if (error) {
    console.error('[recovery-outbox] claim failed', {
      code: (error as { code?: string }).code ?? null,
    });
    return result;
  }

  const jobs = parseClaimedJobs(data);
  result.claimed = jobs.length;

  for (const job of jobs) {
    try {
      const request = openRecoveryEnvelope(job.requestEnvelope, 'request', options.secret);
      const email = typeof request?.email === 'string' ? request.email : '';
      const origin = typeof request?.origin === 'string' ? request.origin : '';
      if (!email || !origin) {
        await finishJob(admin, job, workerToken, 'dead');
        result.dead += 1;
        continue;
      }

      const resolution = await resolveAccount(admin, job, workerToken, email);
      if (resolution.status === 'discarded') {
        // Unknown candidate: the durable row is terminal and scrubbed, no mail
        // is sent, and no user-attributable audit row exists anywhere.
        result.discarded += 1;
        continue;
      }
      if (resolution.status === 'lease_lost') {
        // Another worker owns it, or the lease expired: not ours to finish.
        continue;
      }
      if (resolution.status === 'unavailable') {
        // Transient database trouble. Release the job for a bounded retry.
        const state = retryState(job);
        await finishJob(admin, job, workerToken, state);
        countRetry(result, state);
        continue;
      }

      const authorization = await authorizeUserEmail(admin, resolution.userId);
      if (authorization.kind === 'suppressed_qa') {
        await finishJob(admin, job, workerToken, 'dead');
        await recordSecurityAudit(admin, {
          action: 'password_recovery_requested',
          outcome: 'failure',
          actorUserId: null,
          targetUserId: resolution.userId,
          metadata: { delivery_state: 'suppressed_qa' },
        });
        result.suppressedQa += 1;
        continue;
      }
      if (authorization.kind === 'refuse') {
        const state = retryState(job);
        await finishJob(admin, job, workerToken, state);
        countRetry(result, state);
        continue;
      }

      let message = job.messageEnvelope
        ? openRecoveryEnvelope(job.messageEnvelope, 'message', options.secret)
        : null;

      if (!message) {
        const link = await generateRecoveryLink(admin, { email, baseUrl: origin });
        if (isRecoveryLinkRefusal(link)) {
          const state = retryState(job);
          await finishJob(admin, job, workerToken, state);
          countRetry(result, state);
          continue;
        }

        const prepared = sealRecoveryEnvelope(
          {
            email,
            firstName: resolution.firstName,
            recoveryUrl: link.url,
          },
          'message',
          options.secret
        );
        const preparedResult = await admin.rpc('prepare_password_recovery_outbox', {
          p_job_id: job.jobId,
          p_worker_token: workerToken,
          p_message_envelope: prepared,
        });
        if (preparedResult.error || preparedResult.data !== true) {
          console.error('[recovery-outbox] prepared message did not persist');
          // Do not call the provider. A retry may mint a new link, but the old
          // one was never sent, so no recipient-visible link is superseded.
          continue;
        }
        message = openRecoveryEnvelope(prepared, 'message', options.secret);
      }

      const firstName = typeof message?.firstName === 'string' ? message.firstName : '';
      const recoveryUrl = typeof message?.recoveryUrl === 'string' ? message.recoveryUrl : '';
      const messageEmail = typeof message?.email === 'string' ? message.email : '';
      if (!messageEmail || !recoveryUrl || messageEmail !== email) {
        await finishJob(admin, job, workerToken, 'dead');
        result.dead += 1;
        continue;
      }

      await recordSecurityAudit(admin, {
        action: 'password_recovery_requested',
        outcome: 'provider_attempted',
        actorUserId: null,
        targetUserId: resolution.userId,
        metadata: { delivery_state: 'provider_attempted', attempt: job.providerAttempts + 1 },
      });

      const delivery = await sendPasswordRecoveryEmail(
        {
          to: messageEmail,
          firstName,
          recoveryUrl,
          idempotencyKey: job.idempotencyKey,
          authorization,
        },
        options.transport
      );

      if (delivery.status === 'provider_accepted' && delivery.providerMessageId) {
        await recordSecurityAudit(admin, {
          action: 'password_recovery_requested',
          outcome: 'provider_accepted',
          actorUserId: null,
          targetUserId: resolution.userId,
          metadata: {
            delivery_state: 'provider_accepted',
            provider_message_id: delivery.providerMessageId,
          },
        });
        await finishJob(
          admin,
          job,
          workerToken,
          'provider_accepted',
          delivery.providerMessageId
        );
        result.providerAccepted += 1;
      } else if (delivery.status === 'provider_accepted') {
        // Accepted WITHOUT a usable provider message id. A terminal accepted
        // state the webhook can never correlate would be untrackable, and the
        // database refuses to store one — retry under the SAME idempotency key,
        // which makes the provider return the original message id instead of
        // sending a second mail.
        console.error('[recovery-outbox] provider accepted without a message id');
        const state = retryState(job);
        await finishJob(admin, job, workerToken, state);
        await recordSecurityAudit(admin, {
          action: 'password_recovery_requested',
          outcome: 'failure',
          actorUserId: null,
          targetUserId: resolution.userId,
          metadata: { delivery_state: 'provider_accepted_without_id' },
        });
        countRetry(result, state);
      } else if (delivery.status === 'provider_rejected') {
        await finishJob(admin, job, workerToken, 'provider_rejected');
        await recordSecurityAudit(admin, {
          action: 'password_recovery_requested',
          outcome: 'provider_rejected',
          actorUserId: null,
          targetUserId: resolution.userId,
          metadata: { delivery_state: 'provider_rejected' },
        });
        result.providerRejected += 1;
      } else {
        const state = retryState(job);
        await finishJob(admin, job, workerToken, state);
        await recordSecurityAudit(admin, {
          action: 'password_recovery_requested',
          outcome: 'failure',
          actorUserId: null,
          targetUserId: resolution.userId,
          metadata: { delivery_state: delivery.status },
        });
        countRetry(result, state);
      }
    } catch {
      // Keep the lease. Its short expiry makes the job retryable without a
      // second worker racing this one while its outcome is unknown.
      console.error('[recovery-outbox] job attempt threw');
      result.retried += 1;
    }
  }

  return result;
}
