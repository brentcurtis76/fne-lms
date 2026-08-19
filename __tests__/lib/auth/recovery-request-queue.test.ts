// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  enqueueRecoveryRequest,
  runRecoveryOutbox,
} from '../../../lib/auth/recovery-request-queue';
import {
  openRecoveryEnvelope,
  sealRecoveryEnvelope,
} from '../../../lib/auth/recovery-crypto';
import type { EmailTransport } from '../../../lib/email/invitations';

const { mockGenerateRecoveryLink } = vi.hoisted(() => ({
  mockGenerateRecoveryLink: vi.fn(),
}));

vi.mock('../../../lib/auth/recovery-link', async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  generateRecoveryLink: mockGenerateRecoveryLink,
}));

const SECRET = 'synthetic-service-role-secret-that-is-long-enough-2026';
const EMAIL = 'persona@synthetic.test';
const USER_ID = '11111111-1111-4111-8111-111111111111';
const JOB_ID = '22222222-2222-4222-8222-222222222222';
const IDEMPOTENCY_KEY = `password-recovery/${JOB_ID}`;
const URL = 'https://genera.synthetic.test/reset-password?token_hash=secret&type=recovery';

interface HarnessOptions {
  messageEnvelope?: string | null;
  claim?: boolean;
  providerAttempts?: number;
}

function workerHarness(options: HarnessOptions = {}) {
  const calls = {
    prepared: [] as string[],
    finished: [] as Array<Record<string, unknown>>,
    audits: [] as Array<Record<string, unknown>>,
  };
  const requestEnvelope = sealRecoveryEnvelope(
    { email: EMAIL, origin: 'https://genera.synthetic.test' },
    'request',
    SECRET
  );

  const profileChain: any = {
    select: vi.fn(() => profileChain),
    eq: vi.fn(() => profileChain),
    maybeSingle: vi.fn(async () => ({
      data: { id: USER_ID, first_name: 'Ana' },
      error: null,
    })),
  };

  const admin: any = {
    rpc: vi.fn(async (name: string, args: Record<string, unknown>) => {
      if (name === 'claim_password_recovery_outbox') {
        return {
          data: options.claim === false
            ? []
            : [{
                job_id: JOB_ID,
                request_envelope: requestEnvelope,
                message_envelope: options.messageEnvelope ?? null,
                idempotency_key: IDEMPOTENCY_KEY,
                provider_attempts: options.providerAttempts ?? 0,
              }],
          error: null,
        };
      }
      if (name === 'prepare_password_recovery_outbox') {
        calls.prepared.push(args.p_message_envelope as string);
        return { data: true, error: null };
      }
      if (name === 'finish_password_recovery_outbox') {
        calls.finished.push(args);
        return { data: true, error: null };
      }
      throw new Error(`unexpected RPC ${name}`);
    }),
    from: vi.fn((table: string) => {
      if (table === 'profiles') return profileChain;
      if (table === 'security_audit_events') {
        return {
          insert: vi.fn(async (row: Record<string, unknown>) => {
            calls.audits.push(row);
            return { error: null };
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    }),
  };

  return { admin, calls };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  mockGenerateRecoveryLink.mockResolvedValue({ ok: true, url: URL });
});

describe('durable request enqueue', () => {
  it('hands cooldown, IP budget, encrypted request, and enqueue to one RPC', async () => {
    const rpc = vi.fn(async () => ({ data: 'queued', error: null }));
    const result = await enqueueRecoveryRequest(
      { rpc } as any,
      { email: EMAIL, origin: 'https://genera.synthetic.test', ip: '192.0.2.10' },
      { secret: SECRET }
    );
    expect(result).toBe('queued');
    expect(rpc).toHaveBeenCalledTimes(1);
    const args = rpc.mock.calls[0][1] as Record<string, unknown>;
    expect(args.p_ip_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(args.p_request_envelope).not.toContain(EMAIL);
    expect(args.p_request_envelope).not.toContain('192.0.2.10');
  });

  it('collapses every durable refusal into the same internal suppressed state', async () => {
    for (const databaseResult of ['suppressed', 'rate_limited', 'unknown_account']) {
      const admin = { rpc: vi.fn(async () => ({ data: databaseResult, error: null })) };
      expect(
        await enqueueRecoveryRequest(
          admin as any,
          { email: EMAIL, origin: 'https://genera.synthetic.test', ip: '192.0.2.10' },
          { secret: SECRET }
        )
      ).toBe('suppressed');
    }
  });
});

describe('durable recovery outbox', () => {
  it('persists an encrypted prepared message before provider acceptance', async () => {
    const { admin, calls } = workerHarness();
    const transports: unknown[] = [];
    const transport: EmailTransport = async (message, options) => {
      transports.push({ message, options });
      return { data: { id: 'provider-message-1' }, error: null };
    };
    const result = await runRecoveryOutbox(admin, { secret: SECRET, transport });
    expect(result).toEqual({
      claimed: 1,
      providerAccepted: 1,
      providerRejected: 0,
      retried: 0,
      dead: 0,
    });
    expect(calls.prepared).toHaveLength(1);
    expect(calls.prepared[0]).not.toContain(EMAIL);
    expect(calls.prepared[0]).not.toContain('token_hash');
    expect(openRecoveryEnvelope(calls.prepared[0], 'message', SECRET)).toMatchObject({
      email: EMAIL,
      recoveryUrl: URL,
    });
    expect(calls.finished[0]).toMatchObject({
      p_state: 'provider_accepted',
      p_provider_message_id: 'provider-message-1',
    });
    expect((transports[0] as any).options).toEqual({ idempotencyKey: IDEMPOTENCY_KEY });
  });

  it('reuses the exact prepared link and idempotency key after a network failure/restart', async () => {
    const first = workerHarness();
    const firstMessages: any[] = [];
    const failing: EmailTransport = async (message, options) => {
      firstMessages.push({ message, options });
      throw new Error('synthetic network reset');
    };
    const firstResult = await runRecoveryOutbox(first.admin, {
      secret: SECRET,
      transport: failing,
    });
    expect(firstResult.retried).toBe(1);
    expect(first.calls.finished[0]).toMatchObject({ p_state: 'queued' });

    const persisted = first.calls.prepared[0];
    const second = workerHarness({ messageEnvelope: persisted, providerAttempts: 1 });
    const secondMessages: any[] = [];
    const succeeding: EmailTransport = async (message, options) => {
      secondMessages.push({ message, options });
      return { data: { id: 'provider-message-2' }, error: null };
    };
    const secondResult = await runRecoveryOutbox(second.admin, {
      secret: SECRET,
      transport: succeeding,
    });
    expect(secondResult.providerAccepted).toBe(1);
    expect(mockGenerateRecoveryLink).toHaveBeenCalledTimes(1);
    expect(firstMessages[0].message.html).toBe(secondMessages[0].message.html);
    expect(firstMessages[0].options).toEqual(secondMessages[0].options);
  });

  it('records precise provider states with a null public-request actor', async () => {
    const { admin, calls } = workerHarness();
    const rejected: EmailTransport = async () => ({
      data: null,
      error: { message: 'synthetic provider rejection' },
    });
    const result = await runRecoveryOutbox(admin, { secret: SECRET, transport: rejected });
    expect(result.providerRejected).toBe(1);
    expect(calls.audits.map((row) => row.outcome)).toEqual([
      'provider_attempted',
      'provider_rejected',
    ]);
    for (const row of calls.audits) {
      expect(row.actor_user_id).toBeNull();
      expect(row.target_user_id).toBe(USER_ID);
      expect(JSON.stringify(row)).not.toContain(EMAIL);
      expect(JSON.stringify(row)).not.toContain(URL);
    }
    expect(calls.audits.some((row) => row.outcome === 'delivered')).toBe(false);
  });

  it('does not call the provider when another worker owns every claim', async () => {
    const { admin } = workerHarness({ claim: false });
    const transport = vi.fn();
    expect(await runRecoveryOutbox(admin, { secret: SECRET, transport })).toMatchObject({
      claimed: 0,
    });
    expect(transport).not.toHaveBeenCalled();
  });
});
