// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';
import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js';

/**
 * W-B10c-01b: during an auth-server outage this endpoint must say
 * "unavailable" (503), not "signed out" (401). /change-password sends a 401 to
 * /login, whose retained session sends the browser back through the
 * middleware's retry panel — a loop; a 503 renders the page's own retry panel.
 */
const getUser = vi.fn();
vi.mock('@supabase/auth-helpers-nextjs', () => ({
  createPagesServerClient: () => ({ auth: { getUser } }),
}));
const serviceFrom = vi.fn();
vi.mock('../../../lib/api-auth', () => ({
  createServiceRoleClient: () => ({ from: serviceFrom, auth: { admin: { getUserById: vi.fn() } } }),
}));

import handler from '../../../pages/api/auth/password-change-state';

function call() {
  const res: any = { statusCode: 0, body: undefined };
  res.status = (code: number) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body: unknown) => {
    res.body = body;
    return res;
  };
  return handler({ method: 'GET', headers: {} } as NextApiRequest, res as NextApiResponse).then(() => res);
}

beforeEach(() => {
  getUser.mockReset();
  serviceFrom.mockReset();
});

describe('/api/auth/password-change-state availability', () => {
  it('an unreachable auth server answers 503 PASSWORD_STATE_UNAVAILABLE, never 401', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: new AuthRetryableFetchError('fetch failed', 0) });
    const res = await call();
    expect(res.statusCode).toBe(503);
    expect(res.body.code).toBe('PASSWORD_STATE_UNAVAILABLE');
    expect(serviceFrom).not.toHaveBeenCalled();
  });

  it('a rejected token is still 401', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: new AuthApiError('invalid JWT', 401, 'bad_jwt') });
    const res = await call();
    expect(res.statusCode).toBe(401);
    expect(serviceFrom).not.toHaveBeenCalled();
  });
});
