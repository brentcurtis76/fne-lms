// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMocks } from 'node-mocks-http';

const { mockCreateServiceRoleClient } = vi.hoisted(() => ({ mockCreateServiceRoleClient: vi.fn() }));

vi.mock('../../../lib/api-auth', async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  createServiceRoleClient: mockCreateServiceRoleClient,
}));

import handler, { RETENTION_BATCH_LIMIT } from '../../../pages/api/cron/notification-email-retention';

const BEARER = { authorization: 'Bearer synthetic-cron-secret' };

/** A client whose only RPC answers `purge` and records the call. */
function fakeClient(purge: { data: unknown; error: unknown } | Error) {
  const rpc = vi.fn(async (_name: string, _args: Record<string, unknown>) => {
    if (purge instanceof Error) throw purge;
    return purge;
  });
  return { rpc, from: vi.fn() };
}

async function invoke(method = 'GET', headers: Record<string, string> = {}) {
  const { req, res } = createMocks({ method, headers });
  await handler(req as never, res as never);
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('CRON_SECRET', 'synthetic-cron-secret');
  vi.stubEnv('CRON_API_KEY', 'synthetic-cron-api-key');
  vi.stubEnv('NOTIFICATION_OUTBOX_DELIVERY', 'on');
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => vi.unstubAllEnvs());

describe('/api/cron/notification-email-retention', () => {
  it.each([
    ['no credentials', {}],
    ['a wrong bearer secret', { authorization: 'Bearer wrong' }],
    ['a wrong cron key', { 'x-cron-key': 'wrong' }],
  ])('answers 401 to %s and deletes nothing', async (_name, headers) => {
    const res = await invoke('GET', headers as Record<string, string>);
    expect(res._getStatusCode()).toBe(401);
    expect(res._getJSONData()).toEqual({ error: 'No autorizado' });
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
  });

  it.each([
    ['with valid credentials', BEARER],
    ['without credentials', {}],
  ])('answers 405 to a method cron callers do not use, %s', async (_name, headers) => {
    const res = await invoke('DELETE', headers as Record<string, string>);
    expect(res._getStatusCode()).toBe(405);
    expect(res.getHeader('Allow')).toBe('GET, POST');
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
  });

  it.each([['unset', undefined], ['off', 'off'], ['false', 'false'], ['empty', '']])(
    'flag %s: answers 200 without a database client or a delete',
    async (_name, value) => {
      if (value === undefined) delete process.env.NOTIFICATION_OUTBOX_DELIVERY;
      else vi.stubEnv('NOTIFICATION_OUTBOX_DELIVERY', value);

      const res = await invoke('GET', BEARER);

      expect(res._getStatusCode()).toBe(200);
      expect(res._getJSONData()).toEqual({ ok: true, enabled: false });
      expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
    }
  );

  it('flag off: an unauthorized caller still gets 401, not the flag state', async () => {
    vi.stubEnv('NOTIFICATION_OUTBOX_DELIVERY', 'off');
    const res = await invoke('GET', {});
    expect(res._getStatusCode()).toBe(401);
    expect(res._getJSONData()).toEqual({ error: 'No autorizado' });
  });

  it.each([
    ['Vercel bearer', 'GET', BEARER, 3],
    ['the repository cron key', 'POST', { 'x-cron-key': 'synthetic-cron-api-key' }, 0],
  ])('flag on, %s: runs one bounded purge and reports the count', async (_name, method, headers, deleted) => {
    const client = fakeClient({ data: deleted, error: null });
    mockCreateServiceRoleClient.mockReturnValue(client);

    const res = await invoke(method as string, headers as Record<string, string>);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({ ok: true, enabled: true, deleted });
    expect(client.rpc.mock.calls).toEqual([['purge_notification_email_outbox', { p_limit: RETENTION_BATCH_LIMIT }]]);
    expect(RETENTION_BATCH_LIMIT).toBe(1000);
    expect(client.from).not.toHaveBeenCalled();
  });

  it.each([
    ['the purge answers an error', { data: null, error: { message: 'connection string with synthetic-secret-value' } }],
    ['the purge answers no count', { data: null, error: null }],
    ['the purge throws', new Error('connection string with synthetic-secret-value')],
  ])('flag on, %s: answers 500 and leaks nothing', async (_name, purge) => {
    mockCreateServiceRoleClient.mockReturnValue(fakeClient(purge));

    const res = await invoke('GET', BEARER);

    expect(res._getStatusCode()).toBe(500);
    expect(res._getJSONData()).toEqual({ error: 'Error interno del servidor' });
    expect(JSON.stringify((console.error as any).mock.calls)).not.toContain('synthetic-secret-value');
  });

  it('flag on: a client that cannot be created answers 500', async () => {
    mockCreateServiceRoleClient.mockImplementation(() => {
      throw new Error('missing synthetic-secret-value');
    });

    const res = await invoke('GET', BEARER);

    expect(res._getStatusCode()).toBe(500);
    expect(res._getJSONData()).toEqual({ error: 'Error interno del servidor' });
    expect(JSON.stringify((console.error as any).mock.calls)).not.toContain('synthetic-secret-value');
  });
});
