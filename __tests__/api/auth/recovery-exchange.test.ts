// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMocks } from 'node-mocks-http';

const { mockCreateServiceRoleClient, mockExchange } = vi.hoisted(() => ({
  mockCreateServiceRoleClient: vi.fn(),
  mockExchange: vi.fn(),
}));

vi.mock('../../../lib/api-auth', async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  createServiceRoleClient: mockCreateServiceRoleClient,
}));
vi.mock('../../../lib/auth/recovery-grant', async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  exchangeRecoveryProofForGrant: mockExchange,
}));
vi.mock('../../../lib/rateLimit', async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  rateLimit: () => async () => true,
}));

import handler from '../../../pages/api/auth/recovery-exchange';

const PROOF = 'synthetic-one-time-proof';
const GRANT = 'rg1.synthetic-encrypted-grant';

async function post(body: unknown) {
  const { req, res } = createMocks({ method: 'POST', body });
  await handler(req as never, res as never);
  return { res, json: res._getJSONData() };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  mockCreateServiceRoleClient.mockReturnValue({ synthetic: true });
  mockExchange.mockResolvedValue({
    ok: true,
    grant: GRANT,
    expiresAt: '2026-08-19T22:00:00.000Z',
  });
});

describe('/api/auth/recovery-exchange', () => {
  it('exchanges only recovery material and returns a no-store grant', async () => {
    const { res, json } = await post({ tokenHash: PROOF, type: 'recovery' });
    expect(res._getStatusCode()).toBe(200);
    expect(res.getHeader('Cache-Control')).toBe('no-store, max-age=0');
    expect(json).toEqual({ grant: GRANT, expiresAt: '2026-08-19T22:00:00.000Z' });
    expect(mockExchange).toHaveBeenCalledWith(
      { synthetic: true },
      { tokenHash: PROOF, type: 'recovery' }
    );
  });

  it('uses identical safe copy for missing, malformed, expired, and replayed proof', async () => {
    mockExchange.mockResolvedValue({ ok: false, reason: 'invalid_proof' });
    const { res, json } = await post({ tokenHash: 'invalid', type: 'recovery' });
    expect(res._getStatusCode()).toBe(401);
    expect(json.code).toBe('RECOVERY_MATERIAL_INVALID');
    expect(JSON.stringify(json)).not.toContain(PROOF);
  });

  it.each(['not_configured', 'store_failed'])(
    'fails closed when durable grant state is %s',
    async (reason) => {
      mockExchange.mockResolvedValue({ ok: false, reason });
      const { res, json } = await post({ tokenHash: PROOF, type: 'recovery' });
      expect(res._getStatusCode()).toBe(503);
      expect(json.code).toBe('RECOVERY_GRANT_UNAVAILABLE');
      expect(JSON.stringify(json)).not.toContain(PROOF);
    }
  );

  it('refuses non-POST methods', async () => {
    const { req, res } = createMocks({ method: 'GET' });
    await handler(req as never, res as never);
    expect(res._getStatusCode()).toBe(405);
    expect(mockExchange).not.toHaveBeenCalled();
  });
});
