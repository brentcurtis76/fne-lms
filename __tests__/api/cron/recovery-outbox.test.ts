// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMocks } from 'node-mocks-http';

const { mockCreateServiceRoleClient, mockRunRecoveryOutbox } = vi.hoisted(() => ({
  mockCreateServiceRoleClient: vi.fn(),
  mockRunRecoveryOutbox: vi.fn(),
}));

vi.mock('../../../lib/api-auth', async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  createServiceRoleClient: mockCreateServiceRoleClient,
}));
vi.mock('../../../lib/auth/recovery-request-queue', async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  runRecoveryOutbox: mockRunRecoveryOutbox,
}));

import handler from '../../../pages/api/cron/recovery-outbox';

async function invoke(method = 'GET', headers: Record<string, string> = {}) {
  const { req, res } = createMocks({ method, headers });
  await handler(req as never, res as never);
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('CRON_SECRET', 'synthetic-cron-secret');
  vi.stubEnv('CRON_API_KEY', 'synthetic-cron-api-key');
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  mockCreateServiceRoleClient.mockReturnValue({ synthetic: true });
  mockRunRecoveryOutbox.mockResolvedValue({
    claimed: 1,
    providerAccepted: 1,
    providerRejected: 0,
    retried: 0,
    dead: 0,
  });
});

afterEach(() => vi.unstubAllEnvs());

describe('/api/cron/recovery-outbox', () => {
  it('runs with Vercel bearer authentication', async () => {
    const res = await invoke('GET', { authorization: 'Bearer synthetic-cron-secret' });
    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toMatchObject({ ok: true, claimed: 1, providerAccepted: 1 });
    expect(mockRunRecoveryOutbox).toHaveBeenCalledWith({ synthetic: true });
  });

  it('runs with the repository cron-key convention', async () => {
    const res = await invoke('POST', { 'x-cron-key': 'synthetic-cron-api-key' });
    expect(res._getStatusCode()).toBe(200);
    expect(mockRunRecoveryOutbox).toHaveBeenCalledTimes(1);
  });

  it('fails closed without a valid secret', async () => {
    const res = await invoke('GET', { authorization: 'Bearer wrong' });
    expect(res._getStatusCode()).toBe(401);
    expect(mockRunRecoveryOutbox).not.toHaveBeenCalled();
  });

  it('rejects methods Vercel/manual cron do not use', async () => {
    const res = await invoke('PUT', { authorization: 'Bearer synthetic-cron-secret' });
    expect(res._getStatusCode()).toBe(405);
    expect(res.getHeader('Allow')).toBe('GET, POST');
  });

  it('does not leak worker errors', async () => {
    mockRunRecoveryOutbox.mockRejectedValueOnce(new Error('provider request containing secret'));
    const res = await invoke('GET', { authorization: 'Bearer synthetic-cron-secret' });
    expect(res._getStatusCode()).toBe(500);
    expect(res._getJSONData()).toEqual({ error: 'Error interno del servidor' });
    expect(JSON.stringify((console.error as any).mock.calls)).not.toContain('provider request');
  });
});
