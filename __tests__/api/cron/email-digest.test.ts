// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMocks } from 'node-mocks-http';

const { mockCreateServiceRoleClient } = vi.hoisted(() => ({ mockCreateServiceRoleClient: vi.fn() }));

vi.mock('../../../lib/api-auth', async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  createServiceRoleClient: mockCreateServiceRoleClient,
}));
// The consumer is the real one; the spy only records the call and lets one test answer for it.
vi.mock('../../../lib/email/notification-digest', async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import('../../../lib/email/notification-digest');
  return { ...actual, runNotificationDigest: vi.fn(actual.runNotificationDigest) };
});

import handler from '../../../pages/api/cron/email-digest';
import { runNotificationDigest } from '../../../lib/email/notification-digest';

const SECRET = 'synthetic-cron-secret';
const API_KEY = 'synthetic-cron-api-key';
const BEARER = { authorization: `Bearer ${SECRET}` };
const LEAK = 'synthetic-secret-value 00000000-0000-4000-8000-000000000001 destinataria@ejemplo.invalid';
const EMPTY = { opened: 0, claimed: 0, sent: 0, failed: 0, cancelled: 0, unknown: 0, retried: 0, deferred: 0, lost: 0, membersCancelled: 0 };

/** A client that answers the digest RPCs it is given and records every call. */
function fakeClient(answers: Record<string, { data: unknown; error: unknown }> = {}) {
  const rpc = vi.fn(async (name: string, _args?: Record<string, unknown>) => answers[name] ?? { data: [], error: null });
  return { rpc, from: vi.fn() };
}

async function invoke(method = 'GET', headers: Record<string, string> = {}, query: Record<string, string> = {}) {
  const { req, res } = createMocks({ method: method as never, headers, query });
  await handler(req as never, res as never);
  return res;
}

const logged = () => JSON.stringify((console.error as any).mock.calls);

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('CRON_SECRET', SECRET);
  vi.stubEnv('CRON_API_KEY', API_KEY);
  vi.stubEnv('NOTIFICATION_OUTBOX_DELIVERY', 'on');
  vi.stubEnv('NOTIFICATION_SNAPSHOT_SECRET', 'synthetic-snapshot-secret-0123456789abcdef');
  vi.stubEnv('EMAIL_FROM_ADDRESS', '');
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => vi.unstubAllEnvs());

describe('/api/cron/email-digest — method and authentication come first', () => {
  it.each(['PUT', 'DELETE', 'PATCH'])('answers 405 with Allow to %s, even authenticated with the flag on', async (method) => {
    const res = await invoke(method, BEARER);
    expect(res._getStatusCode()).toBe(405);
    expect(res.getHeader('Allow')).toBe('GET, POST');
    expect(res._getJSONData()).toEqual({ error: 'Método no permitido' });
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
    expect(runNotificationDigest).not.toHaveBeenCalled();
  });

  describe.each(['production', 'development', 'test'])('NODE_ENV=%s', (env) => {
    beforeEach(() => vi.stubEnv('NODE_ENV', env));

    it.each([
      ['no credentials', {}],
      ['a wrong bearer secret', { authorization: 'Bearer wrong' }],
      ['the secret without the Bearer prefix', { authorization: SECRET }],
      ['an empty bearer', { authorization: 'Bearer ' }],
      ['a wrong cron key', { 'x-cron-key': 'wrong' }],
      ['the bearer secret sent as the cron key', { 'x-cron-key': SECRET }],
    ])('flag on, %s: 401 and no database client', async (_name, headers) => {
      const res = await invoke('GET', headers as Record<string, string>);
      expect(res._getStatusCode()).toBe(401);
      expect(res._getJSONData()).toEqual({ error: 'No autorizado' });
      expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
      expect(runNotificationDigest).not.toHaveBeenCalled();
    });

    it('both schemes authenticate the same way, and the digest runs', async () => {
      mockCreateServiceRoleClient.mockImplementation(() => fakeClient());
      expect((await invoke('GET', BEARER))._getStatusCode()).toBe(200);
      expect((await invoke('POST', { 'x-cron-key': API_KEY }))._getStatusCode()).toBe(200);
      expect(runNotificationDigest).toHaveBeenCalledTimes(2);
    });
  });

  it.each([
    ['Bearer undefined', { authorization: 'Bearer undefined' }],
    ['an empty bearer', { authorization: 'Bearer ' }],
    ['an empty cron key', { 'x-cron-key': '' }],
    ['the literal undefined as cron key', { 'x-cron-key': 'undefined' }],
  ])('neither secret configured, %s: 401 (fails closed)', async (_name, headers) => {
    vi.stubEnv('CRON_SECRET', '');
    vi.stubEnv('CRON_API_KEY', '');
    const res = await invoke('POST', headers as Record<string, string>);
    expect(res._getStatusCode()).toBe(401);
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
  });

  it('only the configured scheme is usable: an unset CRON_SECRET leaves the cron key working', async () => {
    vi.stubEnv('CRON_SECRET', '');
    mockCreateServiceRoleClient.mockImplementation(() => fakeClient());
    expect((await invoke('GET', { authorization: 'Bearer ' }))._getStatusCode()).toBe(401);
    expect((await invoke('GET', { 'x-cron-key': API_KEY }))._getStatusCode()).toBe(200);
  });
});

describe('/api/cron/email-digest — dormant unless the flag is on', () => {
  it.each([['unset', undefined], ['off', 'off'], ['false', 'false'], ['unrecognised', 'yes']])(
    'flag %s, authenticated: 200 disabled without a client, an RPC or a send',
    async (_name, value) => {
      if (value === undefined) delete process.env.NOTIFICATION_OUTBOX_DELIVERY;
      else vi.stubEnv('NOTIFICATION_OUTBOX_DELIVERY', value);

      const res = await invoke('GET', BEARER);

      expect(res._getStatusCode()).toBe(200);
      expect(res._getJSONData()).toEqual({ ok: true, enabled: false });
      expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
      expect(runNotificationDigest).not.toHaveBeenCalled();
    }
  );

  it.each([['unset', undefined], ['off', 'off']])('flag %s, unauthenticated: 401, the flag is never the first answer', async (_name, value) => {
    if (value === undefined) delete process.env.NOTIFICATION_OUTBOX_DELIVERY;
    else vi.stubEnv('NOTIFICATION_OUTBOX_DELIVERY', value);

    const res = await invoke('GET', { authorization: 'Bearer wrong' });

    expect(res._getStatusCode()).toBe(401);
    expect(res._getJSONData()).toEqual({ error: 'No autorizado' });
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
  });
});

describe('/api/cron/email-digest — flag on runs the bounded digest', () => {
  it.each([
    ['GET with the Vercel bearer', 'GET', BEARER],
    ['POST with the repository cron key', 'POST', { 'x-cron-key': API_KEY }],
  ])('%s, nothing due: the real consumer opens and claims once and reports zeros', async (_name, method, headers) => {
    const client = fakeClient();
    mockCreateServiceRoleClient.mockReturnValue(client);

    const res = await invoke(method, headers as Record<string, string>);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({ ok: true, enabled: true, status: 'ok', ...EMPTY });
    expect(runNotificationDigest).toHaveBeenCalledWith(client);
    expect(client.rpc.mock.calls.map(([name]) => name)).toEqual(['open_notification_digest_runs', 'claim_notification_digest_runs']);
    expect(client.rpc.mock.calls[0][1]).toEqual({ p_limit: 20, p_max_members: 50 });
    expect(client.rpc.mock.calls[1][1]).toEqual({ p_limit: 10, p_lease_seconds: 300 });
    expect(client.from).not.toHaveBeenCalled();
  });

  it('the legacy daily/weekly query changes nothing: the same digest pass runs', async () => {
    const client = fakeClient();
    mockCreateServiceRoleClient.mockReturnValue(client);

    const res = await invoke('GET', BEARER, { type: 'weekly' });

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({ ok: true, enabled: true, status: 'ok', ...EMPTY });
    expect(client.rpc.mock.calls.map(([name]) => name)).toEqual(['open_notification_digest_runs', 'claim_notification_digest_runs']);
  });

  it('reports the consumer counters truthfully: a claimed run whose lease is gone is lost, never sent', async () => {
    const run = { run_id: 'r1', lease_token: 't1', user_id: 'u1', local_date: '2026-10-08', provider_key: 'notif-digest-k' };
    const client = fakeClient({
      open_notification_digest_runs: { data: [{ run_id: 'r1' }], error: null },
      claim_notification_digest_runs: { data: [run], error: null },
    });
    mockCreateServiceRoleClient.mockReturnValue(client);

    const res = await invoke('POST', BEARER);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({ ok: true, enabled: true, status: 'ok', ...EMPTY, opened: 1, claimed: 1, lost: 1 });
    expect(client.rpc.mock.calls.map(([name]) => name)).toEqual([
      'open_notification_digest_runs',
      'claim_notification_digest_runs',
      'notification_digest_run_state',
    ]);
  });

  it('passes a sending pass through as the consumer answered it', async () => {
    mockCreateServiceRoleClient.mockReturnValue(fakeClient());
    vi.mocked(runNotificationDigest).mockResolvedValueOnce({ enabled: true, status: 'ok', ...EMPTY, opened: 2, claimed: 2, sent: 1, retried: 1 });

    const res = await invoke('GET', BEARER);

    expect(res._getJSONData()).toEqual({ ok: true, enabled: true, status: 'ok', ...EMPTY, opened: 2, claimed: 2, sent: 1, retried: 1 });
  });

  it('a missing configuration is reported, with nothing opened or claimed', async () => {
    vi.stubEnv('NOTIFICATION_SNAPSHOT_SECRET', '');
    const client = fakeClient();
    mockCreateServiceRoleClient.mockReturnValue(client);

    const res = await invoke('GET', BEARER);

    expect(res._getJSONData()).toEqual({ ok: true, enabled: true, status: 'not_configured', ...EMPTY });
    expect(client.rpc).not.toHaveBeenCalled();
  });
});

describe('/api/cron/email-digest — failures are generic and leak nothing', () => {
  it.each(['open_notification_digest_runs', 'claim_notification_digest_runs'])('%s fails: 500 in es-CL, fixed log', async (rpc) => {
    mockCreateServiceRoleClient.mockReturnValue(fakeClient({ [rpc]: { data: null, error: { message: LEAK } } }));

    const res = await invoke('GET', BEARER);

    expect(res._getStatusCode()).toBe(500);
    expect(res._getJSONData()).toEqual({ error: 'Error interno del servidor' });
    expect((console.error as any).mock.calls).toEqual([['[email-digest] digest failed']]);
    expect(logged() + JSON.stringify(res._getJSONData())).not.toContain('synthetic-secret-value');
  });

  it('the service client cannot be created: 500 inside the guard, no digest pass', async () => {
    mockCreateServiceRoleClient.mockImplementation(() => {
      throw new Error(`Server configuration error ${LEAK}`);
    });

    const res = await invoke('POST', { 'x-cron-key': API_KEY });

    expect(res._getStatusCode()).toBe(500);
    expect(res._getJSONData()).toEqual({ error: 'Error interno del servidor' });
    expect(runNotificationDigest).not.toHaveBeenCalled();
    expect(logged()).not.toContain('synthetic-secret-value');
    expect(logged()).not.toContain('ejemplo.invalid');
  });

  it('the consumer throws something unexpected: 500, no message, identifier or recipient logged', async () => {
    mockCreateServiceRoleClient.mockReturnValue(fakeClient());
    vi.mocked(runNotificationDigest).mockRejectedValueOnce(new TypeError(LEAK));

    const res = await invoke('GET', BEARER);

    expect(res._getStatusCode()).toBe(500);
    expect(res._getJSONData()).toEqual({ error: 'Error interno del servidor' });
    expect((console.error as any).mock.calls).toEqual([['[email-digest] digest failed']]);
  });
});
