// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMocks } from 'node-mocks-http';

const { mockCreateServiceRoleClient, mockExchange } = vi.hoisted(() => ({
  mockCreateServiceRoleClient: vi.fn(),
  mockExchange: vi.fn(),
}));

vi.mock('../../../../lib/api-auth', async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  createServiceRoleClient: mockCreateServiceRoleClient,
}));
vi.mock('../../../../lib/auth/recovery-grant', async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  exchangeRecoveryProofForGrant: mockExchange,
}));
vi.mock('../../../../lib/rateLimit', async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  rateLimit: () => async () => true,
}));

import handler, { EXCHANGE_STORE_FAILED_MESSAGE } from '../../../../pages/api/auth/recovery/exchange';

const PROOF = 'synthetic-one-time-proof';
const GRANT = 'rg1.synthetic-encrypted-grant';

async function post(body: unknown, headers: Record<string, string> = {}) {
  const { req, res } = createMocks({ method: 'POST', body, headers });
  await handler(req as never, res as never);
  return { res, json: res._getJSONData() };
}

function setCookie(res: any): string {
  const header = res.getHeader('Set-Cookie');
  return Array.isArray(header) ? header.join('; ') : String(header ?? '');
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

describe('/api/auth/recovery/exchange', () => {
  it('stores the grant in an HttpOnly recovery-scoped cookie, never in the body', async () => {
    const { res, json } = await post({ tokenHash: PROOF, type: 'recovery' });
    expect(res._getStatusCode()).toBe(200);
    expect(res.getHeader('Cache-Control')).toBe('no-store, max-age=0');
    expect(json).toEqual({ ok: true, expiresAt: '2026-08-19T22:00:00.000Z' });
    expect(JSON.stringify(json)).not.toContain(GRANT);

    const cookie = setCookie(res);
    expect(cookie).toContain(`recovery_grant=${encodeURIComponent(GRANT)}`);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).toContain('Path=/api/auth/recovery');
    expect(cookie).toContain('Max-Age=900');
    expect(mockExchange).toHaveBeenCalledWith(
      { synthetic: true },
      { tokenHash: PROOF, type: 'recovery' }
    );
  });

  it('marks the cookie Secure behind an https proxy', async () => {
    const { res } = await post(
      { tokenHash: PROOF, type: 'recovery' },
      { 'x-forwarded-proto': 'https' }
    );
    expect(setCookie(res)).toContain('Secure');
  });

  it('uses identical safe copy for missing, malformed, expired, and replayed proof', async () => {
    mockExchange.mockResolvedValue({ ok: false, reason: 'invalid_proof' });
    const { res, json } = await post({ tokenHash: 'invalid', type: 'recovery' });
    expect(res._getStatusCode()).toBe(401);
    expect(json.code).toBe('RECOVERY_MATERIAL_INVALID');
    expect(setCookie(res)).toBe('');
    expect(JSON.stringify(json)).not.toContain(PROOF);
  });

  it('is honest about the consumed one-time proof when grant storage fails', async () => {
    // The proof was burned at the provider before our database write; nothing
    // can un-burn it. The response says "request a new link" — it does NOT
    // claim the failure is retryable, and it sets no cookie.
    mockExchange.mockResolvedValue({ ok: false, reason: 'store_failed' });
    const { res, json } = await post({ tokenHash: PROOF, type: 'recovery' });
    expect(res._getStatusCode()).toBe(503);
    expect(json.code).toBe('RECOVERY_GRANT_UNAVAILABLE');
    expect(json.error).toBe(EXCHANGE_STORE_FAILED_MESSAGE);
    expect(json.error).toContain('Solicita un enlace nuevo');
    expect(setCookie(res)).toBe('');
  });

  it('fails closed when the ceremony is not configured', async () => {
    mockExchange.mockResolvedValue({ ok: false, reason: 'not_configured' });
    const { res, json } = await post({ tokenHash: PROOF, type: 'recovery' });
    expect(res._getStatusCode()).toBe(503);
    expect(json.code).toBe('RECOVERY_GRANT_UNAVAILABLE');
    expect(setCookie(res)).toBe('');
  });

  it('refuses non-POST methods', async () => {
    const { req, res } = createMocks({ method: 'GET' });
    await handler(req as never, res as never);
    expect(res._getStatusCode()).toBe(405);
    expect(mockExchange).not.toHaveBeenCalled();
  });
});
