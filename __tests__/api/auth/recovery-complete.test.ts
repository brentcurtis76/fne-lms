// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMocks } from 'node-mocks-http';

const { mockCreateServiceRoleClient, mockComplete } = vi.hoisted(() => ({
  mockCreateServiceRoleClient: vi.fn(),
  mockComplete: vi.fn(),
}));

vi.mock('../../../lib/api-auth', async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  createServiceRoleClient: mockCreateServiceRoleClient,
}));

vi.mock('../../../lib/auth/password-completion', async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  completeRecoveryPasswordChange: mockComplete,
}));

vi.mock('../../../lib/rateLimit', async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  rateLimit: () => async () => true,
}));

import handler from '../../../pages/api/auth/recovery-complete';

const GRANT = 'rg1.synthetic-encrypted-grant';
const STRONG = 'Sintetica2026';

async function post(body: unknown, headers: Record<string, string> = {}) {
  const { req, res } = createMocks({ method: 'POST', body, headers });
  await handler(req as never, res as never);
  return { res, json: res._getJSONData() };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  mockCreateServiceRoleClient.mockReturnValue({ synthetic: true });
  mockComplete.mockResolvedValue({
    ok: true,
    message: 'Contraseña actualizada exitosamente',
    audited: true,
    userId: '11111111-1111-4111-8111-111111111111',
  });
});

describe('/api/auth/recovery-complete', () => {
  it('accepts only the retry grant and password as ceremony input', async () => {
    const { res, json } = await post({ grant: GRANT, newPassword: STRONG });
    expect(res._getStatusCode()).toBe(200);
    expect(json).toEqual({
      success: true,
      message: 'Contraseña actualizada exitosamente',
      audited: true,
    });
    expect(mockComplete).toHaveBeenCalledWith(
      { synthetic: true },
      { grant: GRANT, newPassword: STRONG }
    );
  });

  it('ignores bearer tokens, cookies, body user ids, and old token hashes', async () => {
    await post(
      {
        grant: GRANT,
        newPassword: STRONG,
        userId: '99999999-9999-4999-8999-999999999999',
        tokenHash: 'old-proof',
        type: 'recovery',
      },
      { authorization: 'Bearer ordinary-session', cookie: 'sb-access-token=ordinary-session' }
    );
    expect(mockComplete).toHaveBeenCalledWith(
      { synthetic: true },
      { grant: GRANT, newPassword: STRONG }
    );
  });

  it.each([
    [401, 'RECOVERY_GRANT_INVALID', false],
    [409, 'RECOVERY_ATTEMPT_IN_PROGRESS', false],
    [429, 'RECOVERY_ATTEMPTS_EXHAUSTED', false],
    [503, 'RECOVERY_GRANT_UNAVAILABLE', false],
    [500, 'FLAG_NOT_CLEARED', true],
  ] as const)('preserves ceremony failure %s/%s', async (status, code, passwordChanged) => {
    mockComplete.mockResolvedValueOnce({
      ok: false,
      stage: 'proof',
      status,
      code,
      message: 'Mensaje seguro en español',
      passwordChanged,
    });
    const { res, json } = await post({ grant: GRANT, newPassword: STRONG });
    expect(res._getStatusCode()).toBe(status);
    expect(json).toEqual({
      error: 'Mensaje seguro en español',
      code,
      passwordChanged,
    });
  });

  it('never returns the grant or password', async () => {
    const { json } = await post({ grant: GRANT, newPassword: STRONG });
    expect(JSON.stringify(json)).not.toContain(GRANT);
    expect(JSON.stringify(json)).not.toContain(STRONG);
  });

  it('refuses non-POST methods in es-CL', async () => {
    const { req, res } = createMocks({ method: 'GET' });
    await handler(req as never, res as never);
    expect(res._getStatusCode()).toBe(405);
    expect(res._getJSONData().error).toBe('Método no permitido');
  });
});
