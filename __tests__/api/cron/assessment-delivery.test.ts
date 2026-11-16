// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMocks } from 'node-mocks-http';
import { readFileSync } from 'fs';

const { createClient, rpc } = vi.hoisted(() => ({ createClient: vi.fn(), rpc: vi.fn() }));
vi.mock('../../../lib/api-auth', () => ({ createServiceRoleClient: createClient }));
import handler, { DELIVERY_BATCH_LIMIT } from '../../../pages/api/cron/assessment-delivery';

const bearer = { authorization: 'Bearer synthetic-delivery-secret' };
async function invoke(method = 'GET', headers: Record<string, string> = {}, query = {}) {
  const { req, res } = createMocks({ method, headers, query });
  await handler(req as never, res as never);
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('CRON_SECRET', 'synthetic-delivery-secret');
  vi.stubEnv('CRON_API_KEY', 'synthetic-delivery-key');
  createClient.mockReturnValue({ rpc });
  rpc.mockResolvedValue({ data: { created: 2, failed: 0 }, error: null });
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe('automatic Registro delivery cron', () => {
  it.each([{}, { authorization: 'Bearer wrong' }, { 'x-cron-key': 'wrong' }])(
    'refuses unauthorized requests before creating a privileged client', async (headers) => {
      const res = await invoke('GET', headers as Record<string, string>);
      expect(res._getStatusCode()).toBe(401);
      expect(createClient).not.toHaveBeenCalled();
    }
  );
  it('fails closed with both secrets absent', async () => {
    vi.stubEnv('CRON_SECRET', ''); vi.stubEnv('CRON_API_KEY', '');
    expect((await invoke('GET', bearer))._getStatusCode()).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });
  it('does not accept secrets in the URL', async () => {
    expect((await invoke('GET', {}, { secret: 'synthetic-delivery-secret' }))._getStatusCode()).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });
  it('rejects unsupported methods', async () => {
    const res = await invoke('DELETE', bearer);
    expect(res._getStatusCode()).toBe(405);
    expect(res.getHeader('Allow')).toBe('GET, POST');
    expect(rpc).not.toHaveBeenCalled();
  });
  it.each([['GET', bearer], ['POST', { 'x-cron-key': 'synthetic-delivery-key' }]])(
    'runs the bounded database reconciliation with authorized %s', async (method, headers) => {
      const res = await invoke(method as string, headers as Record<string, string>, { limit: '1000000' });
      expect(res._getStatusCode()).toBe(200);
      expect(res._getJSONData()).toEqual({ ok: true, created: 2, failed: 0 });
      expect(rpc).toHaveBeenCalledTimes(1);
      expect(rpc).toHaveBeenCalledWith('reconcile_published_assessment_deliveries', { p_limit: DELIVERY_BATCH_LIMIT });
    }
  );
  it.each(['error', 'throw', 'empty'])('reports %s without leaking database details', async (mode) => {
    if (mode === 'throw') rpc.mockRejectedValue(new Error('private database detail'));
    else rpc.mockResolvedValue({ data: null, error: mode === 'error' ? { message: 'private database detail' } : null });
    const res = await invoke('GET', bearer);
    expect(res._getStatusCode()).toBe(500);
    expect(JSON.stringify(res._getJSONData())).not.toContain('private');
  });
  it('makes partial failures visible without logging users or database errors', async () => {
    rpc.mockResolvedValue({ data: { created: 1, scanned: 2, failed: 1 }, error: null });
    const res = await invoke('GET', bearer);
    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toMatchObject({ created: 1, failed: 1 });
    expect(console.warn).toHaveBeenCalledWith('[assessment-delivery] some deliveries will be retried', { failed: 1, scanned: 2 });
  });
  it('schedules recurring retries every minute', () => {
    const config = JSON.parse(readFileSync('vercel.json', 'utf8'));
    expect(config.crons.filter((cron: { path: string }) => cron.path === '/api/cron/assessment-delivery'))
      .toEqual([{ path: '/api/cron/assessment-delivery', schedule: '* * * * *' }]);
  });
});
