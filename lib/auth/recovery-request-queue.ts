/** Durable self-service recovery request queue. Server-only. */
import { randomUUID } from 'node:crypto';
import type { NextApiRequest } from 'next';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  fingerprintRecoveryIp,
  openRecoveryEnvelope,
  sealRecoveryEnvelope,
} from './recovery-crypto';
import { generateRecoveryLink, isRecoveryLinkRefusal } from './recovery-link';
import { sendPasswordRecoveryEmail, type EmailTransport } from '../email/invitations';
import { recordSecurityAudit } from '../security/audit';

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
 * The returned status is intentionally not exposed by the public endpoint.
 */
export async function enqueueRecoveryRequest(
  admin: SupabaseClient,
  input: { email: string; origin: string; ip: string },
  options: { secret?: string } = {}
): Promise<'queued' | 'suppressed' | 'failed'> {
  let envelope: string;
  let ipHash: string;
  try {
    envelope = sealRecoveryEnvelope(
      { email: input.email, origin: input.origin },
      'request',
      options.secret
    );
    ipHash = fingerprintRecoveryIp(input.ip, options.secret);
  } catch {
    console.error('[recovery-request] recovery cryptography is not configured');
    return 'failed';
  }

  try {
    const { data, error } = await admin.rpc('enqueue_password_recovery', {
      p_email: input.email,
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
    retried: 0,
    dead: 0,
  };

  const { data, error } = await admin.rpc('claim_password_recovery_outbox', {
    p_worker_token: workerToken,
    p_limit: options.limit ?? 10,
    p_lease_seconds: 60,
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

      const { data: profile, error: profileError } = await admin
        .from('profiles')
        .select('id, first_name')
        .eq('email', email)
        .maybeSingle();
      if (profileError || !profile?.id) {
        const state = profileError ? retryState(job) : 'dead';
        await finishJob(admin, job, workerToken, state);
        if (state === 'dead') result.dead += 1;
        else result.retried += 1;
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
            firstName: typeof profile.first_name === 'string' ? profile.first_name : '',
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
        targetUserId: profile.id,
        metadata: { delivery_state: 'provider_attempted', attempt: job.providerAttempts + 1 },
      });

      const delivery = await sendPasswordRecoveryEmail(
        {
          to: messageEmail,
          firstName,
          recoveryUrl,
          idempotencyKey: job.idempotencyKey,
        },
        options.transport
      );

      if (delivery.status === 'provider_accepted') {
        await finishJob(
          admin,
          job,
          workerToken,
          'provider_accepted',
          delivery.providerMessageId
        );
        await recordSecurityAudit(admin, {
          action: 'password_recovery_requested',
          outcome: 'provider_accepted',
          actorUserId: null,
          targetUserId: profile.id,
          metadata: {
            delivery_state: 'provider_accepted',
            provider_message_id: delivery.providerMessageId ?? null,
          },
        });
        result.providerAccepted += 1;
      } else if (delivery.status === 'provider_rejected') {
        await finishJob(admin, job, workerToken, 'provider_rejected');
        await recordSecurityAudit(admin, {
          action: 'password_recovery_requested',
          outcome: 'provider_rejected',
          actorUserId: null,
          targetUserId: profile.id,
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
          targetUserId: profile.id,
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
