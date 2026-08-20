// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMocks } from 'node-mocks-http';

const { mockCreateServiceRoleClient } = vi.hoisted(() => ({
  mockCreateServiceRoleClient: vi.fn(),
}));

vi.mock('../../../lib/api-auth', async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  createServiceRoleClient: mockCreateServiceRoleClient,
}));

import handler, {
  AUDIT_RETENTION_DAYS,
  RETENTION_BATCH_LIMIT,
} from '../../../pages/api/cron/auth-retention';

const rpc = vi.fn();

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
  rpc.mockResolvedValue({
    data: { ip_buckets_deleted: 2, outbox_rows_deleted: 1, audit_events_deleted: 0 },
    error: null,
  });
  mockCreateServiceRoleClient.mockReturnValue({ rpc });
});

afterEach(() => vi.unstubAllEnvs());

describe('/api/cron/auth-retention', () => {
  it('runs the bounded retention sweep with the documented compliance period', async () => {
    const res = await invoke('GET', { authorization: 'Bearer synthetic-cron-secret' });
    expect(res._getStatusCode()).toBe(200);
    expect(rpc).toHaveBeenCalledWith('run_auth_security_retention', {
      p_limit: RETENTION_BATCH_LIMIT,
      p_audit_retention_days: AUDIT_RETENTION_DAYS,
    });
    // Observable: the response reports exactly what the sweep removed.
    expect(res._getJSONData()).toMatchObject({ ok: true, ip_buckets_deleted: 2 });
  });

  it('documents two years as the audit compliance retention period', () => {
    expect(AUDIT_RETENTION_DAYS).toBe(730);
  });

  it('refuses unauthenticated invocations', async () => {
    const res = await invoke('GET');
    expect(res._getStatusCode()).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('reports a database failure instead of pretending the sweep ran', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: '08006' } });
    const res = await invoke('GET', { authorization: 'Bearer synthetic-cron-secret' });
    expect(res._getStatusCode()).toBe(500);
  });

  it('refuses non-cron methods', async () => {
    const res = await invoke('DELETE', { authorization: 'Bearer synthetic-cron-secret' });
    expect(res._getStatusCode()).toBe(405);
  });
});
