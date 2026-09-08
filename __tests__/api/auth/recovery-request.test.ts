// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMocks } from 'node-mocks-http';

const { mockCreateServiceRoleClient, mockEnqueue } = vi.hoisted(() => ({
  mockCreateServiceRoleClient: vi.fn(),
  mockEnqueue: vi.fn(),
}));

vi.mock('../../../lib/api-auth', async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  createServiceRoleClient: mockCreateServiceRoleClient,
}));

vi.mock('../../../lib/auth/recovery-request-queue', async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  enqueueRecoveryRequest: mockEnqueue,
}));

import handler, {
  RECOVERY_REQUEST_ACKNOWLEDGEMENT,
  RECOVERY_RESPONSE_FLOOR_MS,
  waitForRecoveryResponseFloor,
} from '../../../pages/api/auth/recovery-request';

const EXPECTED = { message: RECOVERY_REQUEST_ACKNOWLEDGEMENT };

async function post(body: unknown, headers: Record<string, string> = {}) {
  const { req, res } = createMocks({ method: 'POST', body, headers });
  await handler(req as never, res as never);
  return { res, json: res._getJSONData() };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  mockCreateServiceRoleClient.mockReturnValue({ synthetic: true });
  mockEnqueue.mockResolvedValue('queued');
});

describe('/api/auth/recovery-request', () => {
  it('normalizes the address and sends IP/origin only to the durable enqueue', async () => {
    const { res } = await post(
      { email: '  Sintetica@Example.COM  ' },
      { host: 'genera.example.cl', 'x-forwarded-proto': 'https', 'x-forwarded-for': '192.0.2.10' }
    );
    expect(res._getStatusCode()).toBe(200);
    expect(mockEnqueue).toHaveBeenCalledWith(
      { synthetic: true },
      {
        email: 'sintetica@example.com',
        origin: 'https://genera.example.cl',
        ip: '192.0.2.10',
      }
    );
    expect(res.getHeader('Cache-Control')).toBe('no-store, max-age=0');
  });

  it.each([
    ['queued', 'queued'],
    ['account cooldown', 'suppressed'],
    ['IP limit', 'suppressed'],
    ['durable failure', 'failed'],
  ])('returns the identical acknowledgement for %s', async (_label, result) => {
    mockEnqueue.mockResolvedValueOnce(result);
    const { res, json } = await post({ email: 'persona@synthetic.test' });
    expect(res._getStatusCode()).toBe(200);
    expect(json).toEqual(EXPECTED);
  });

  it.each([
    {},
    { email: '' },
    { email: 'not-an-address' },
    { email: { unexpected: true } },
  ])('keeps malformed input on the same public path', async (body) => {
    const { res, json } = await post(body);
    expect(res._getStatusCode()).toBe(200);
    expect(json).toEqual(EXPECTED);
    expect(mockEnqueue).toHaveBeenCalledTimes(1);
  });

  it('keeps thrown infrastructure failures on the same public path and logs no account data', async () => {
    mockEnqueue.mockRejectedValueOnce(new Error('synthetic address detail'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { res, json } = await post({ email: 'private@synthetic.test' });
    expect(res._getStatusCode()).toBe(200);
    expect(json).toEqual(EXPECTED);
    expect(JSON.stringify(error.mock.calls)).not.toContain('private@synthetic.test');
  });

  it('applies the response floor independently of queue/provider latency', async () => {
    const sleep = vi.fn(async () => undefined);
    await waitForRecoveryResponseFloor(1000, () => 1040, sleep);
    expect(sleep).toHaveBeenCalledWith(RECOVERY_RESPONSE_FLOOR_MS - 40);
    sleep.mockClear();
    await waitForRecoveryResponseFloor(1000, () => 1400, sleep);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('does not expose a link, account state, or queue state', async () => {
    const { json } = await post({ email: 'persona@synthetic.test' });
    expect(json).toEqual(EXPECTED);
    expect(JSON.stringify(json)).not.toMatch(/token|queued|suppressed|provider/i);
  });

  it('refuses non-POST methods in es-CL', async () => {
    const { req, res } = createMocks({ method: 'GET' });
    await handler(req as never, res as never);
    expect(res._getStatusCode()).toBe(405);
    expect(res._getJSONData().error).toBe('Método no permitido');
    expect(mockEnqueue).not.toHaveBeenCalled();
  });
});
