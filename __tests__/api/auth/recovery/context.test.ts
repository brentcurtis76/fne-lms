// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMocks } from 'node-mocks-http';

const { mockCreateServiceRoleClient, mockPeek } = vi.hoisted(() => ({
  mockCreateServiceRoleClient: vi.fn(),
  mockPeek: vi.fn(),
}));

vi.mock('../../../../lib/api-auth', async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  createServiceRoleClient: mockCreateServiceRoleClient,
}));
vi.mock('../../../../lib/auth/recovery-grant', async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  peekRecoveryGrant: mockPeek,
}));
vi.mock('../../../../lib/rateLimit', async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  rateLimit: () => async () => true,
}));

import handler from '../../../../pages/api/auth/recovery/context';

const GRANT = 'rg1.synthetic-encrypted-grant';

async function get(cookies: Record<string, string> = {}) {
  const { req, res } = createMocks({ method: 'GET', cookies });
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
  mockPeek.mockResolvedValue('active');
});

describe('/api/auth/recovery/context', () => {
  it('reports an open ceremony after refresh or tab remount, consuming nothing', async () => {
    const { res, json } = await get({ recovery_grant: GRANT });
    expect(res._getStatusCode()).toBe(200);
    expect(res.getHeader('Cache-Control')).toBe('no-store, max-age=0');
    expect(json).toEqual({ active: true });
    expect(mockPeek).toHaveBeenCalledWith({ synthetic: true }, GRANT);
    expect(setCookie(res)).toBe('');
  });

  it('answers inactive without any database access when no cookie is present', async () => {
    const { res, json } = await get();
    expect(res._getStatusCode()).toBe(200);
    expect(json).toEqual({ active: false });
    expect(mockPeek).not.toHaveBeenCalled();
  });

  it.each(['succeeded', 'expired', 'exhausted', 'interrupted', 'invalidated', 'invalid'] as const)(
    'clears the dead cookie when the durable state is %s',
    async (state) => {
      mockPeek.mockResolvedValueOnce(state);
      const { res, json } = await get({ recovery_grant: GRANT });
      expect(json).toEqual({ active: false });
      expect(setCookie(res)).toContain('recovery_grant=;');
      expect(setCookie(res)).toContain('Max-Age=0');
    }
  );

  it('does not destroy a possibly-live context when the database cannot answer', async () => {
    mockPeek.mockResolvedValueOnce('unavailable');
    const { res } = await get({ recovery_grant: GRANT });
    expect(res._getStatusCode()).toBe(503);
    expect(setCookie(res)).toBe('');
  });

  it('refuses non-GET methods', async () => {
    const { req, res } = createMocks({ method: 'POST' });
    await handler(req as never, res as never);
    expect(res._getStatusCode()).toBe(405);
  });
});
