// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMocks } from 'node-mocks-http';

const { mockCreateServiceRoleClient, mockInvalidate } = vi.hoisted(() => ({
  mockCreateServiceRoleClient: vi.fn(),
  mockInvalidate: vi.fn(),
}));

vi.mock('../../../../lib/api-auth', async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  createServiceRoleClient: mockCreateServiceRoleClient,
}));
vi.mock('../../../../lib/auth/recovery-grant', async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  invalidateRecoveryGrant: mockInvalidate,
}));
vi.mock('../../../../lib/rateLimit', async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  rateLimit: () => async () => true,
}));

import handler from '../../../../pages/api/auth/recovery/invalidate';

const GRANT = 'rg1.synthetic-encrypted-grant';

async function post(cookies: Record<string, string> = {}) {
  const { req, res } = createMocks({ method: 'POST', cookies });
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
  mockInvalidate.mockResolvedValue(true);
});

describe('/api/auth/recovery/invalidate', () => {
  it('closes the durable grant and clears the recovery cookie', async () => {
    const { res, json } = await post({ recovery_grant: GRANT });
    expect(res._getStatusCode()).toBe(200);
    expect(json).toEqual({ ok: true });
    expect(mockInvalidate).toHaveBeenCalledWith({ synthetic: true }, GRANT);
    expect(setCookie(res)).toContain('recovery_grant=;');
    expect(setCookie(res)).toContain('Max-Age=0');
  });

  it('is idempotent with no context: still clears the cookie, touches nothing durable', async () => {
    const { res, json } = await post();
    expect(res._getStatusCode()).toBe(200);
    expect(json).toEqual({ ok: true });
    expect(mockInvalidate).not.toHaveBeenCalled();
    expect(setCookie(res)).toContain('Max-Age=0');
  });

  it('refuses non-POST methods', async () => {
    const { req, res } = createMocks({ method: 'GET' });
    await handler(req as never, res as never);
    expect(res._getStatusCode()).toBe(405);
  });
});
