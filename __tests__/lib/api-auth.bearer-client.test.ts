// @vitest-environment node
/**
 * createApiSupabaseClient — cookie/Bearer parity (W-B2c-01 acceptance criterion).
 * A request that carries `Authorization: Bearer <jwt>` must query the database AS
 * that user (the JWT forwarded to PostgREST), not as `anon` through the cookie-only
 * auth-helpers client. Synthetic values only.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockCreateClient, mockCreateServerSupabaseClient } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(() => ({ kind: 'bearer-client' })),
  mockCreateServerSupabaseClient: vi.fn(() => ({ kind: 'cookie-client' })),
}));
vi.mock('@supabase/supabase-js', () => ({ createClient: mockCreateClient }));
vi.mock('@supabase/auth-helpers-nextjs', () => ({ createServerSupabaseClient: mockCreateServerSupabaseClient }));

import { createApiSupabaseClient } from '../../lib/api-auth';

const ORIGINAL = { url: process.env.NEXT_PUBLIC_SUPABASE_URL, anon: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY };

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'synthetic-anon-key';
});
afterEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = ORIGINAL.url;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = ORIGINAL.anon;
});

describe('createApiSupabaseClient', () => {
  it('forwards a Bearer token to PostgREST instead of falling back to the cookie (anon) client', async () => {
    const req = { headers: { authorization: 'Bearer synthetic.jwt.token' } } as never;
    const client = await createApiSupabaseClient(req, {} as never);
    expect(client).toEqual({ kind: 'bearer-client' });
    expect(mockCreateClient).toHaveBeenCalledWith('http://127.0.0.1:54321', 'synthetic-anon-key', expect.objectContaining({
      global: { headers: { Authorization: 'Bearer synthetic.jwt.token' } },
      auth: expect.objectContaining({ persistSession: false }),
    }));
    expect(mockCreateServerSupabaseClient).not.toHaveBeenCalled();
  });

  it('keeps the cookie-session client when no Bearer header is present', async () => {
    const req = { headers: {} } as never;
    const client = await createApiSupabaseClient(req, {} as never);
    expect(client).toEqual({ kind: 'cookie-client' });
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  it('does not treat a non-Bearer Authorization header as a token', async () => {
    const req = { headers: { authorization: 'Basic abc' } } as never;
    await createApiSupabaseClient(req, {} as never);
    expect(mockCreateClient).not.toHaveBeenCalled();
    expect(mockCreateServerSupabaseClient).toHaveBeenCalledTimes(1);
  });
});
