// @vitest-environment node
import { PassThrough } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMocks } from 'node-mocks-http';
import { Webhook } from 'svix';

const { mockCreateServiceRoleClient, rpc } = vi.hoisted(() => ({
  mockCreateServiceRoleClient: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('../../../lib/api-auth', async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  createServiceRoleClient: mockCreateServiceRoleClient,
}));

import handler, {
  applyVerifiedResendEvent,
  config,
  MAX_RESEND_WEBHOOK_BYTES,
} from '../../../pages/api/webhooks/resend';

const SECRET = 'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw';
const MESSAGE_ID = 'synthetic-provider-message-id';
const RECOVERY = 'record_password_recovery_delivery';
const SUPPRESSION = 'record_notification_email_bounce';
const RECIPIENT = 'rebote.sintetico@qa.local.test';
/** A bounce as the provider sends it: it names the recipient and the subject, which must go no further. */
const BOUNCE = JSON.stringify({
  type: 'email.bounced',
  data: { email_id: MESSAGE_ID, to: [RECIPIENT], subject: 'Asunto sintético privado', bounce: { message: `mailbox ${RECIPIENT} unknown` } },
});

/** Each durable store answers its own verdict; an Error is thrown, an object with `code` is returned as the error. */
function answer(verdicts: Record<string, unknown>) {
  rpc.mockImplementation(async (name: string) => {
    const verdict = verdicts[name];
    if (verdict instanceof Error) throw verdict;
    if (verdict && typeof verdict === 'object') return { data: null, error: verdict };
    return { data: verdict, error: null };
  });
}

async function signedRequest(payload: string, secret = SECRET) {
  const webhook = new Webhook(secret);
  const timestamp = new Date();
  const svixId = 'msg_synthetic_resend_event';
  const signature = webhook.sign(svixId, timestamp, payload);
  const request = new PassThrough() as any;
  request.method = 'POST';
  request.headers = {
    'svix-id': svixId,
    'svix-timestamp': String(Math.floor(timestamp.getTime() / 1000)),
    'svix-signature': signature,
  };
  const { res } = createMocks();
  const pending = handler(request, res as never);
  request.end(payload);
  await pending;
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('RESEND_WEBHOOK_SECRET', SECRET);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  rpc.mockResolvedValue({ data: true, error: null });
  mockCreateServiceRoleClient.mockReturnValue({ rpc });
});

afterEach(() => vi.unstubAllEnvs());

describe('Resend delivery webhook', () => {
  it('disables body parsing so the Svix signature covers the received bytes', () => {
    expect(config.api.bodyParser).toBe(false);
  });

  it.each([
    ['email.delivered', 'delivered'],
    ['email.bounced', 'bounced'],
  ])('records verified %s evidence as %s', async (type, outcome) => {
    const payload = JSON.stringify({ type, data: { email_id: MESSAGE_ID, to: ['private@test'] } });
    const res = await signedRequest(payload);
    expect(res._getStatusCode()).toBe(200);
    expect(rpc).toHaveBeenCalledWith('record_password_recovery_delivery', {
      p_provider_message_id: MESSAGE_ID,
      p_outcome: outcome,
    });
  });

  it('rejects a tampered body and writes nothing', async () => {
    const signed = JSON.stringify({ type: 'email.delivered', data: { email_id: MESSAGE_ID } });
    const webhook = new Webhook(SECRET);
    const timestamp = new Date();
    const id = 'msg_synthetic_tamper';
    const request = new PassThrough() as any;
    request.method = 'POST';
    request.headers = {
      'svix-id': id,
      'svix-timestamp': String(Math.floor(timestamp.getTime() / 1000)),
      'svix-signature': webhook.sign(id, timestamp, signed),
    };
    const { res } = createMocks();
    const pending = handler(request, res as never);
    request.end(signed.replace('delivered', 'bounced'));
    await pending;
    expect(res._getStatusCode()).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('ignores non-delivery events without touching durable state', async () => {
    expect(
      await applyVerifiedResendEvent({ rpc } as any, {
        type: 'email.opened',
        data: { email_id: MESSAGE_ID },
      })
    ).toBe('ignored');
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    ['applied', 'recorded'],
    ['pending', 'pending'],
    ['noop', 'ignored'],
  ] as const)('maps the durable %s verdict to %s', async (verdict, mapped) => {
    rpc.mockResolvedValueOnce({ data: verdict, error: null });
    expect(
      await applyVerifiedResendEvent({ rpc } as any, {
        type: 'email.delivered',
        data: { email_id: MESSAGE_ID },
      })
    ).toBe(mapped);
  });

  it('acknowledges an event that outran acceptance — the evidence is durable, not lost', async () => {
    // Ordering race: the delivered webhook arrives before the worker commits
    // the provider message id. The database stores the evidence and reports
    // 'pending'; the route must answer 200 so the provider does NOT retry a
    // webhook that has already been persisted.
    rpc.mockResolvedValueOnce({ data: 'pending', error: null });
    const payload = JSON.stringify({
      type: 'email.delivered',
      data: { email_id: 'not-yet-committed-id' },
    });
    const res = await signedRequest(payload);
    expect(res._getStatusCode()).toBe(200);
  });

  it('returns 500 so Resend retries when durable state is unavailable', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: '08006' } });
    const payload = JSON.stringify({
      type: 'email.delivered',
      data: { email_id: MESSAGE_ID },
    });
    const res = await signedRequest(payload);
    expect(res._getStatusCode()).toBe(500);
  });

  it('bounds the raw request before signature verification and answers 413', async () => {
    const request = new PassThrough() as any;
    request.method = 'POST';
    request.headers = {};
    const { res } = createMocks();
    const pending = handler(request, res as never);
    request.end(Buffer.alloc(MAX_RESEND_WEBHOOK_BYTES + 1, 0x61));
    await pending;

    expect(res._getStatusCode()).toBe(413);
    expect(res.getHeader('Connection')).toBe('close');
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('Resend bounce of a notification email (N3-06)', () => {
  const logged = () => JSON.stringify([
    ...(console.error as unknown as { mock: { calls: unknown[] } }).mock.calls,
    ...(console.warn as unknown as { mock: { calls: unknown[] } }).mock.calls,
  ]);

  it('D1 — a verified bounce is offered to both outboxes, recovery first, and only the provider id leaves the route', async () => {
    answer({ [RECOVERY]: 'pending', [SUPPRESSION]: 'suppressed' });

    const res = await signedRequest(BOUNCE);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({ ok: true });
    expect(rpc.mock.calls).toEqual([
      [RECOVERY, { p_provider_message_id: MESSAGE_ID, p_outcome: 'bounced' }],
      [SUPPRESSION, { p_provider_message_id: MESSAGE_ID }],
    ]);
  });

  it.each([
    ['a recovery bounce keeps its transition, whatever the notification outbox says', 'applied', 'pending', 'recorded'],
    ['a notification bounce suppresses its address', 'pending', 'suppressed', 'recorded'],
    ['a bounce that outran the provider id commit is kept as evidence', 'pending', 'pending', 'pending'],
    ['a recovery duplicate with notification evidence pending stays pending', 'noop', 'pending', 'pending'],
    ['a duplicate bounce changes nothing more', 'noop', 'noop', 'ignored'],
  ])('D1 — %s', async (_name, recovery, suppression, verdict) => {
    answer({ [RECOVERY]: recovery, [SUPPRESSION]: suppression });

    expect(await applyVerifiedResendEvent({ rpc } as any, JSON.parse(BOUNCE))).toBe(verdict);

    // Acknowledged: what the database took is durable, so the provider must not retry it.
    expect((await signedRequest(BOUNCE))._getStatusCode()).toBe(200);
  });

  it('D1 — a later delivered event never reaches the suppression store: delivery cannot lift a bounce', async () => {
    answer({ [RECOVERY]: 'noop', [SUPPRESSION]: 'suppressed' });
    const delivered = JSON.stringify({ type: 'email.delivered', data: { email_id: MESSAGE_ID, to: [RECIPIENT] } });

    const res = await signedRequest(delivered);

    expect(res._getStatusCode()).toBe(200);
    expect(rpc.mock.calls).toEqual([[RECOVERY, { p_provider_message_id: MESSAGE_ID, p_outcome: 'delivered' }]]);
  });

  it.each([
    ['signed with another secret', async () => signedRequest(BOUNCE, 'whsec_C2FVsBQIhrscChlQIMV+b5sSYspob7oD')],
    ['sent without signature headers', async () => {
      const request = new PassThrough() as any;
      request.method = 'POST';
      request.headers = {};
      const { res } = createMocks();
      const pending = handler(request, res as never);
      request.end(BOUNCE);
      await pending;
      return res;
    }],
    ['signed but not JSON', async () => signedRequest('email.bounced synthetic-provider-message-id')],
  ])('D2 — a bounce %s is refused and nothing is written', async (_name, send) => {
    const res = await send();

    expect(res._getStatusCode()).toBe(401);
    expect(res._getJSONData()).toEqual({ error: 'No autorizado' });
    expect(rpc).not.toHaveBeenCalled();
    expect(logged()).not.toContain(RECIPIENT);
  });

  it.each([
    ['another kind of event', { type: 'email.complained', data: { email_id: MESSAGE_ID, to: [RECIPIENT] } }],
    ['a delayed delivery', { type: 'email.delivery_delayed', data: { email_id: MESSAGE_ID } }],
    ['an event of another resource', { type: 'contact.created', data: { id: MESSAGE_ID, email: RECIPIENT } }],
    ['a bounce with no data', { type: 'email.bounced' }],
    ['a bounce with no provider id', { type: 'email.bounced', data: { to: [RECIPIENT] } }],
    ['a bounce whose provider id is not text', { type: 'email.bounced', data: { email_id: 42, to: [RECIPIENT] } }],
    ['a bounce with an empty provider id', { type: 'email.bounced', data: { email_id: '', to: [RECIPIENT] } }],
    ['no type', { data: { email_id: MESSAGE_ID } }],
  ])('D2 — %s, verified, is acknowledged and writes nothing', async (_name, event) => {
    const res = await signedRequest(JSON.stringify(event));

    expect(res._getStatusCode()).toBe(200);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('D2 — an id no row carries cannot suppress the address the event names: the address is never sent to the database', async () => {
    answer({ [RECOVERY]: 'pending', [SUPPRESSION]: 'pending' });

    const res = await signedRequest(BOUNCE);

    expect(res._getStatusCode()).toBe(200);
    const written = JSON.stringify(rpc.mock.calls);
    for (const priv of [RECIPIENT, 'qa.local.test', 'Asunto', 'mailbox']) expect(written).not.toContain(priv);
  });

  it.each([
    ['the suppression write fails', { [RECOVERY]: 'pending', [SUPPRESSION]: { code: '08006', message: `connection lost for ${RECIPIENT}` } }],
    ['the suppression write throws', { [RECOVERY]: 'pending', [SUPPRESSION]: new Error(`timeout for ${RECIPIENT}`) }],
    ['the recovery write fails', { [RECOVERY]: { code: '08006' }, [SUPPRESSION]: 'suppressed' }],
    ['the recovery write throws', { [RECOVERY]: new Error('timeout'), [SUPPRESSION]: 'suppressed' }],
    ['the suppression function is missing', { [RECOVERY]: 'applied', [SUPPRESSION]: { code: 'PGRST202' } }],
  ])('D2 — %s: 500, so the provider retries; both stores were tried and nothing private is answered or logged', async (_name, verdicts) => {
    answer(verdicts);

    const res = await signedRequest(BOUNCE);

    expect(res._getStatusCode()).toBe(500);
    expect(res._getJSONData()).toEqual({ error: 'Error interno del servidor' });
    expect(rpc.mock.calls.map(([name]) => name)).toEqual([RECOVERY, SUPPRESSION]);
    for (const priv of [RECIPIENT, MESSAGE_ID, 'Asunto']) expect(logged()).not.toContain(priv);
  });

  it('D5 — an accepted bounce answers and logs nothing about the message', async () => {
    answer({ [RECOVERY]: 'pending', [SUPPRESSION]: 'suppressed' });

    const res = await signedRequest(BOUNCE);

    expect(res._getData()).toBe(JSON.stringify({ ok: true }));
    expect(logged()).toBe('[]');
  });
});
