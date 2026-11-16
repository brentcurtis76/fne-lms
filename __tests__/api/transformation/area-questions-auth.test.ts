// @vitest-environment node
/**
 * F7 N2 — the «Vías de Transformación» question catalogues need a signed-in
 * caller. Before: a request with no session got 200 with the whole rubric of an
 * area (area-questions) or a 307 to it (personalizacion-questions).
 *
 * Only the external clients are faked; the real lib/api-auth helpers run.
 * All ids are synthetic (Ley 21.719).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';

const SIGNED_IN = '12200000-0000-4000-8000-0000000000a1';
const COOKIE_TOKEN = 'synthetic-cookie-token';
let session: { access_token: string; user: { id: string } } | null = null;

function cookieClient() {
  return {
    auth: {
      getSession: vi.fn(async () => ({ data: { session }, error: null })),
      getUser: vi.fn(async (token?: string) =>
        session && token === COOKIE_TOKEN
          ? { data: { user: { id: session.user.id } }, error: null }
          : { data: { user: null }, error: { message: 'invalid token' } }
      ),
    },
  };
}

vi.mock('@supabase/auth-helpers-nextjs', () => ({
  createServerSupabaseClient: vi.fn(() => cookieClient()),
  createPagesServerClient: vi.fn(() => cookieClient()),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: null }, error: { message: 'invalid token' } })) },
    from: vi.fn(() => {
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => ({ data: { must_change_password: false }, error: null }),
      };
      return chain;
    }),
  })),
}));

import areaQuestions from '../../../pages/api/transformation/area-questions';
import personalizacionQuestions from '../../../pages/api/transformation/personalizacion-questions';

type Handler = (req: NextApiRequest, res: NextApiResponse) => Promise<unknown>;

async function call(handler: Handler, query: Record<string, string> = {}) {
  const res: any = { statusCode: 0, body: undefined, redirectedTo: undefined };
  res.status = (code: number) => ((res.statusCode = code), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.end = () => res;
  res.setHeader = () => res;
  res.redirect = (code: number, url: string) => ((res.statusCode = code), (res.redirectedTo = url), res);
  await handler({ method: 'GET', query, headers: {}, cookies: {}, body: {} } as unknown as NextApiRequest, res);
  return res;
}

beforeEach(() => {
  session = null;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('area-questions requires a signed-in caller', () => {
  it('no session → 401 and no catalogue', async () => {
    const res = await call(areaQuestions, { area: 'personalizacion' });
    expect(res.statusCode).toBe(401);
    expect(res.body).not.toHaveProperty('flattened');
    expect(res.body).not.toHaveProperty('acciones');
  });

  it('signed in → 200 with the catalogue, as before', async () => {
    session = { access_token: COOKIE_TOKEN, user: { id: SIGNED_IN } };
    const res = await call(areaQuestions, { area: 'personalizacion' });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.flattened)).toBe(true);
    expect(res.body.flattened.length).toBeGreaterThan(0);
  });
});

describe('personalizacion-questions requires a signed-in caller', () => {
  it('no session → 401 and no redirect', async () => {
    const res = await call(personalizacionQuestions);
    expect(res.statusCode).toBe(401);
    expect(res.redirectedTo).toBeUndefined();
  });

  it('signed in → 307 to area-questions, as before', async () => {
    session = { access_token: COOKIE_TOKEN, user: { id: SIGNED_IN } };
    const res = await call(personalizacionQuestions);
    expect(res.statusCode).toBe(307);
    expect(res.redirectedTo).toBe('/api/transformation/area-questions?area=personalizacion');
  });
});
