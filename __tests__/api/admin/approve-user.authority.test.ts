// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';

/**
 * /api/admin/approve-user is Bearer-only, so the middleware's forced-password
 * gate never sees it. It used to accept `user_metadata.roles` (user-writable)
 * as admin. Now: an active admin user_roles row, and the gate asked here.
 */
const state = vi.hoisted(() => ({
  user: null as any,
  adminRole: null as any,
  mustChange: false,
  updates: 0,
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: state.user }, error: state.user ? null : { message: 'bad' } }) },
    from: (table: string) => {
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        limit: () => chain,
        update: () => {
          state.updates += 1;
          return chain;
        },
        maybeSingle: async () =>
          table === 'profiles'
            ? { data: { must_change_password: state.mustChange }, error: null }
            : { data: state.adminRole, error: null },
        single: async () => ({ data: { id: 'target' }, error: null }),
      };
      return chain;
    },
  }),
}));

import handler from '../../../pages/api/admin/approve-user';

async function call() {
  const res: any = { statusCode: 0, body: undefined };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  await handler(
    { method: 'POST', headers: { authorization: 'Bearer t' }, body: { userId: 'target', action: 'approve' } } as unknown as NextApiRequest,
    res as NextApiResponse
  );
  return res;
}

beforeEach(() => {
  state.user = { id: 'caller', user_metadata: {} };
  state.adminRole = null;
  state.mustChange = false;
  state.updates = 0;
});

describe('POST /api/admin/approve-user authority', () => {
  it('refuses a caller whose own metadata claims admin but who holds no admin role', async () => {
    state.user = { id: 'caller', user_metadata: { roles: ['admin'], role: 'admin' } };
    const res = await call();
    expect(res.statusCode).toBe(403);
    expect(state.updates).toBe(0);
  });

  it('holds an admin who must change their password, before any write', async () => {
    state.adminRole = { id: 'r' };
    state.mustChange = true;
    const res = await call();
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe('PASSWORD_CHANGE_REQUIRED');
    expect(state.updates).toBe(0);
  });

  it('lets an active admin approve', async () => {
    state.adminRole = { id: 'r' };
    const res = await call();
    expect(res.statusCode).toBe(200);
    expect(state.updates).toBe(1);
  });
});
