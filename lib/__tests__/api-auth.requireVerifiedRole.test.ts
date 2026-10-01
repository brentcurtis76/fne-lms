import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';

// Same approach as api-auth.checkIsAdminOrEquipoDirectivo.test.ts: stub the
// dependencies of getApiUser / createServiceRoleClient, not the module itself.
vi.mock('@supabase/auth-helpers-nextjs', () => ({
  createServerSupabaseClient: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
}));

import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { requireVerifiedRole } from '../api-auth';

const mockedCreateServerSupabaseClient = vi.mocked(createServerSupabaseClient);
const mockedCreateClient = vi.mocked(createClient);

const req = { headers: {} } as unknown as NextApiRequest;
const res = {} as NextApiResponse;

function user(id: string, metadataRoles: string[] = []) {
  return {
    id,
    email: `${id}@example.com`,
    app_metadata: {},
    user_metadata: { roles: metadataRoles },
    aud: 'authenticated',
    created_at: '2026-10-01T00:00:00.000Z',
  } as any;
}

/** The cookie claims `cookieUser`; the auth server verifies the token as `verifiedUser`. */
function setSession(cookieUser: any | null, verifiedUser: any | null = cookieUser) {
  mockedCreateServerSupabaseClient.mockReturnValue({
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: cookieUser ? { user: cookieUser, access_token: 'token' } : null },
        error: null,
      }),
      getUser: vi.fn().mockResolvedValue({ data: { user: verifiedUser }, error: null }),
    },
  } as any);
}

/** user_roles rows by user id, read through the service client. */
function setRoles(byUser: Record<string, string[]>, error: unknown = null) {
  const calls: { userId?: string; roles?: string[] } = {};
  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn((col: string, val: unknown) => {
      if (col === 'user_id') calls.userId = val as string;
      return chain;
    }),
    in: vi.fn((_col: string, roles: string[]) => {
      calls.roles = roles;
      return chain;
    }),
    limit: vi.fn(async () => {
      if (error) return { data: null, error };
      const held = byUser[calls.userId ?? ''] ?? [];
      return { data: held.filter((r) => calls.roles?.includes(r)).map((role_type) => ({ role_type })), error: null };
    }),
  };
  mockedCreateClient.mockReturnValue({ from: vi.fn(() => chain) } as any);
  return calls;
}

describe('requireVerifiedRole', () => {
  const origUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const origKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
  });

  afterEach(() => {
    if (origUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = origUrl;
    if (origKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = origKey;
  });

  it('401 without a session', async () => {
    setSession(null);
    setRoles({});
    expect(await requireVerifiedRole(req, res, ['admin'])).toEqual({ user: null, status: 401 });
  });

  it('403 for a user whose own metadata claims admin but who holds no admin role', async () => {
    const self = user('docente-1', ['admin']);
    setSession(self);
    setRoles({ 'docente-1': ['docente'] });
    expect(await requireVerifiedRole(req, res, ['admin'])).toEqual({ user: null, status: 403 });
  });

  it('allows a user with an active role of the requested kinds, returning the verified user', async () => {
    const admin = user('admin-1');
    setSession(admin);
    const calls = setRoles({ 'admin-1': ['admin'] });
    const result = await requireVerifiedRole(req, res, ['admin', 'consultor']);
    expect(result).toEqual({ user: admin, status: null });
    expect(calls.roles).toEqual(['admin', 'consultor']);
  });

  it("looks up the auth server's user, not the cookie's claimed user", async () => {
    setSession(user('admin-1'), user('docente-1'));
    const calls = setRoles({ 'admin-1': ['admin'], 'docente-1': ['docente'] });
    expect(await requireVerifiedRole(req, res, ['admin'])).toEqual({ user: null, status: 403 });
    expect(calls.userId).toBe('docente-1');
  });

  it('fails closed with 500 when the role lookup errors', async () => {
    setSession(user('admin-1'));
    setRoles({ 'admin-1': ['admin'] }, { message: 'connection reset' });
    expect(await requireVerifiedRole(req, res, ['admin'])).toEqual({ user: null, status: 500 });
  });
});
