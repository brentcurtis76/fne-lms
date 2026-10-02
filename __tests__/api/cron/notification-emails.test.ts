// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMocks } from 'node-mocks-http';

const { mockCreateServiceRoleClient } = vi.hoisted(() => ({ mockCreateServiceRoleClient: vi.fn() }));

vi.mock('../../../lib/api-auth', async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  createServiceRoleClient: mockCreateServiceRoleClient,
}));

// The worker is the real one: only the database client is a stand-in.
import handler from '../../../pages/api/cron/notification-emails';

const BEARER = { authorization: 'Bearer synthetic-cron-secret' };
const PENDING_ROW = {
  id: '00000000-0000-4000-8000-000000000101',
  idempotency_key: 'notif-synthetic-key',
  event_type: 'n14_unmapped_event',
  user_id: '00000000-0000-4000-8000-000000000001',
  related_url: '/dashboard',
  payload: {},
  has_snapshot: false,
  source_kind: null,
  source_id: null,
};

/** A client that answers the worker's RPCs and records them. */
function fakeClient(claim: { data: unknown; error: unknown }) {
  const rpc = vi.fn(async (name: string, _args: Record<string, unknown>) =>
    name === 'claim_notification_emails' ? claim : { data: true, error: null }
  );
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
  vi.stubEnv('NOTIFICATION_SNAPSHOT_SECRET', 'synthetic-snapshot-secret-0123456789abcdef');
  vi.stubEnv('EMAIL_FROM_ADDRESS', '');
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => vi.unstubAllEnvs());

describe('/api/cron/notification-emails', () => {
  it.each([
    ['no credentials', {}],
    ['a wrong bearer secret', { authorization: 'Bearer wrong' }],
    ['a wrong cron key', { 'x-cron-key': 'wrong' }],
  ])('answers 401 to %s and runs nothing', async (_name, headers) => {
    const res = await invoke('GET', headers as Record<string, string>);
    expect(res._getStatusCode()).toBe(401);
    expect(res._getJSONData()).toEqual({ error: 'No autorizado' });
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
  });

  it('answers 405 to a method cron callers do not use', async () => {
    const res = await invoke('PUT', BEARER);
    expect(res._getStatusCode()).toBe(405);
    expect(res.getHeader('Allow')).toBe('GET, POST');
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
  });

  it.each([['unset', undefined], ['off', 'off'], ['false', 'false']])(
    'flag %s: answers 200 without a database client, a claim or a send',
    async (_name, value) => {
      if (value === undefined) delete process.env.NOTIFICATION_OUTBOX_DELIVERY;
      else vi.stubEnv('NOTIFICATION_OUTBOX_DELIVERY', value);

      const res = await invoke('GET', BEARER);

      expect(res._getStatusCode()).toBe(200);
      expect(res._getJSONData()).toEqual({ ok: true, enabled: false });
      expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
    }
  );

  it.each([
    ['Vercel bearer', 'GET', BEARER],
    ['the repository cron key', 'POST', { 'x-cron-key': 'synthetic-cron-api-key' }],
  ])('flag on, %s: the worker claims the pending row and records its outcome', async (_name, method, headers) => {
    const client = fakeClient({ data: [PENDING_ROW], error: null });
    mockCreateServiceRoleClient.mockReturnValue(client);

    const res = await invoke(method, headers as Record<string, string>);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toMatchObject({ ok: true, enabled: true, status: 'ok', claimed: 1, failed: 1, sent: 0 });
    expect(client.rpc.mock.calls.map(([name]) => name)).toEqual(['claim_notification_emails', 'finish_notification_email']);
    const [, claimArgs] = client.rpc.mock.calls[0];
    expect(claimArgs).toMatchObject({ p_limit: 20, p_lease_seconds: 120 });
    const [, finishArgs] = client.rpc.mock.calls[1];
    expect(finishArgs).toMatchObject({
      p_id: PENDING_ROW.id,
      p_owner: claimArgs.p_owner,
      p_outcome: 'failed',
      p_error_code: 'event_unsupported',
    });
  });

  it('flag on: a worker failure answers 500 and leaks nothing', async () => {
    mockCreateServiceRoleClient.mockReturnValue(
      fakeClient({ data: null, error: { message: 'connection string with synthetic-secret-value' } })
    );

    const res = await invoke('GET', BEARER);

    expect(res._getStatusCode()).toBe(500);
    expect(res._getJSONData()).toEqual({ error: 'Error interno del servidor' });
    expect(JSON.stringify((console.error as any).mock.calls)).not.toContain('synthetic-secret-value');
  });
});
