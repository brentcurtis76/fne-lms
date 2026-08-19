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

  it('ignores non-delivery events and provider ids unrelated to recovery', async () => {
    expect(
      await applyVerifiedResendEvent({ rpc } as any, {
        type: 'email.opened',
        data: { email_id: MESSAGE_ID },
      })
    ).toBe('ignored');
    expect(rpc).not.toHaveBeenCalled();

    rpc.mockResolvedValueOnce({ data: false, error: null });
    expect(
      await applyVerifiedResendEvent({ rpc } as any, {
        type: 'email.delivered',
        data: { email_id: MESSAGE_ID },
      })
    ).toBe('ignored');
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
