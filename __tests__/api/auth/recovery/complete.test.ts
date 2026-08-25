// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMocks } from 'node-mocks-http';

const { mockCreateServiceRoleClient, mockComplete } = vi.hoisted(() => ({
  mockCreateServiceRoleClient: vi.fn(),
  mockComplete: vi.fn(),
}));

vi.mock('../../../../lib/api-auth', async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  createServiceRoleClient: mockCreateServiceRoleClient,
}));

vi.mock('../../../../lib/auth/password-completion', async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  completeRecoveryPasswordChange: mockComplete,
}));

vi.mock('../../../../lib/rateLimit', async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  rateLimit: () => async () => true,
}));

import handler from '../../../../pages/api/auth/recovery/complete';

const GRANT = 'rg1.synthetic-encrypted-grant';
const STRONG = 'Sintetica2026';

async function post(
  body: unknown,
  options: { cookies?: Record<string, string>; headers?: Record<string, string> } = {}
) {
  const { req, res } = createMocks({
    method: 'POST',
    body,
    headers: options.headers ?? {},
    cookies: options.cookies ?? {},
  });
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
  mockComplete.mockResolvedValue({
    ok: true,
    message: 'Contraseña actualizada exitosamente',
    audited: true,
    userId: '11111111-1111-4111-8111-111111111111',
  });
});

describe('/api/auth/recovery/complete', () => {
  it('reads the grant from the HttpOnly cookie and clears it on success', async () => {
    const { res, json } = await post(
      { newPassword: STRONG },
      { cookies: { recovery_grant: GRANT } }
    );
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
    expect(setCookie(res)).toContain('recovery_grant=;');
    expect(setCookie(res)).toContain('Max-Age=0');
  });

  it('ignores bearer tokens, session cookies, body grants, user ids, and token hashes', async () => {
    await post(
      {
        grant: 'body-supplied-grant-must-be-ignored',
        newPassword: STRONG,
        userId: '99999999-9999-4999-8999-999999999999',
        tokenHash: 'old-proof',
        type: 'recovery',
      },
      {
        cookies: { recovery_grant: GRANT, 'sb-access-token': 'ordinary-session' },
        headers: { authorization: 'Bearer ordinary-session' },
      }
    );
    expect(mockComplete).toHaveBeenCalledWith(
      { synthetic: true },
      { grant: GRANT, newPassword: STRONG }
    );
  });

  it('hands a missing recovery context to the ceremony as an absent grant', async () => {
    mockComplete.mockResolvedValueOnce({
      ok: false,
      stage: 'proof',
      status: 401,
      code: 'RECOVERY_GRANT_INVALID',
      message: 'Mensaje seguro en español',
      passwordChanged: false,
    });
    const { res } = await post({ newPassword: STRONG });
    expect(mockComplete).toHaveBeenCalledWith(
      { synthetic: true },
      { grant: null, newPassword: STRONG }
    );
    expect(res._getStatusCode()).toBe(401);
  });

  it.each([
    [401, 'RECOVERY_GRANT_INVALID', true],
    [429, 'RECOVERY_ATTEMPTS_EXHAUSTED', true],
    [410, 'RECOVERY_ATTEMPT_INTERRUPTED', true],
    [409, 'RECOVERY_ATTEMPT_IN_PROGRESS', false],
    [503, 'RECOVERY_GRANT_UNAVAILABLE', false],
    [400, 'PASSWORD_POLICY', false],
    [500, 'FLAG_NOT_CLEARED', false],
  ] as const)(
    'on %s/%s clears the recovery cookie only when the context is terminal (%s)',
    async (status, code, cleared) => {
      mockComplete.mockResolvedValueOnce({
        ok: false,
        stage: 'proof',
        status,
        code,
        message: 'Mensaje seguro en español',
        passwordChanged: code === 'FLAG_NOT_CLEARED',
      });
      const { res, json } = await post(
        { newPassword: STRONG },
        { cookies: { recovery_grant: GRANT } }
      );
      expect(res._getStatusCode()).toBe(status);
      expect(json).toEqual({
        error: 'Mensaje seguro en español',
        code,
        passwordChanged: code === 'FLAG_NOT_CLEARED',
      });
      if (cleared) {
        expect(setCookie(res)).toContain('Max-Age=0');
      } else {
        expect(setCookie(res)).toBe('');
      }
    }
  );

  it('never returns the grant or password', async () => {
    const { json } = await post({ newPassword: STRONG }, { cookies: { recovery_grant: GRANT } });
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
