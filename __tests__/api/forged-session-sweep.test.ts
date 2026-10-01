// @vitest-environment node
/**
 * SM-B015 batch B8 — the remaining API routes take the caller from the auth
 * server, never from the session cookie.
 *
 * auth-helpers accepts a legacy JSON session cookie as-is, so `getSession()`
 * returns whatever `user` the cookie claims next to a valid access token.
 * auth/my-roles returned the named user's roles (service role), and
 * admin/transformation-assessments gated service-role reads on a role lookup
 * for the named user; the rest used the named id for row-security-bound reads,
 * attribution or logging.
 *
 * Only the external clients are faked; lib/api-auth runs for real. The cookie
 * claims VICTIM (an admin); the auth server verifies the token as PLAIN.
 * All ids are synthetic (Ley 21.719).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';

const VICTIM = '11111111-1111-4111-8111-111111111111';
const PLAIN = '22222222-2222-4222-8222-222222222222';
const COOKIE_TOKEN = 'caller-own-valid-token';
const BEARER_TOKEN = 'caller-bearer-token';
/** Mixed credentials: the cookie's token is VICTIM's real token, the Bearer is PLAIN's. */
let mixed = false;
const clientTags: string[] = [];

const ROLE_ROWS = [{ id: 'r-1', user_id: VICTIM, role_type: 'admin', school_id: null, is_active: true }];

type Op = [string, ...unknown[]];
const log: Array<{ table: string; ops: Op[] }> = [];
let verifiedUser: { id: string; email?: string; user_metadata?: Record<string, unknown> } | null = null;

function chain(table: string, tag = 'service') {
  clientTags.push(tag);
  const entry = { table, ops: [] as Op[] };
  log.push(entry);
  const answer = (mode: 'many' | 'one') => {
    if (table === 'user_roles') {
      const rows = ROLE_ROWS.filter((r) =>
        entry.ops.every(([op, col, v]) => {
          if (op === 'eq') return (r as Record<string, unknown>)[col as string] === v;
          if (op === 'in') return (v as unknown[]).includes((r as Record<string, unknown>)[col as string]);
          return true;
        })
      );
      return { data: mode === 'one' ? rows[0] ?? null : rows, error: null };
    }
    if (table === 'profiles') {
      const id = entry.ops.find(([op, col]) => op === 'eq' && col === 'id')?.[2];
      return { data: { id, must_change_password: false, school_id: null }, error: null };
    }
    return { data: mode === 'one' ? null : [], error: null, count: 0 };
  };
  const c: any = new Proxy(
    {},
    {
      get(_t, prop: string) {
        if (prop === 'then') return (r: (v: unknown) => void) => r(answer('many'));
        if (prop === 'single' || prop === 'maybeSingle') return async () => answer('one');
        return (...args: unknown[]) => {
          entry.ops.push([prop, ...args]);
          return c;
        };
      },
    }
  );
  return c;
}

function cookieClient() {
  return {
    auth: {
      getSession: vi.fn(async () => ({
        data: { session: { user: { id: VICTIM, email: 'victim@example.invalid', user_metadata: { roles: ['admin'] } }, access_token: COOKIE_TOKEN } },
        error: null,
      })),
      getUser: vi.fn(async (token?: string) => {
        if (mixed && token === COOKIE_TOKEN) return { data: { user: { id: VICTIM } }, error: null };
        return token === COOKIE_TOKEN && verifiedUser
          ? { data: { user: verifiedUser }, error: null }
          : { data: { user: null }, error: { message: 'invalid token' } };
      }),
    },
    from: vi.fn((table: string) => chain(table, 'cookie')),
    rpc: vi.fn(async () => ({ data: [], error: null })),
  };
}

vi.mock('@supabase/auth-helpers-nextjs', () => ({
  createServerSupabaseClient: vi.fn(() => cookieClient()),
  createPagesServerClient: vi.fn(() => cookieClient()),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn((_url: string, _key: string, opts?: { global?: { headers?: Record<string, string> } }) => {
    // createApiSupabaseClient's Bearer client carries the caller's JWT.
    const tag = opts?.global?.headers?.Authorization ? 'bearer' : 'service';
    return {
      auth: {
        getUser: vi.fn(async (token?: string) =>
          token === BEARER_TOKEN && verifiedUser
            ? { data: { user: verifiedUser }, error: null }
            : { data: { user: null }, error: { message: 'invalid token' } }
        ),
      },
      from: vi.fn((table: string) => chain(table, tag)),
      rpc: vi.fn(async () => ({ data: [], error: null })),
    };
  }),
}));

import myRoles from '../../pages/api/auth/my-roles';
import authSession from '../../pages/api/auth/session';
import transformationAssessmentsAdmin from '../../pages/api/admin/transformation-assessments';
import checkPermissions from '../../pages/api/admin/check-permissions';
import assignAccess from '../../pages/api/admin/transformation/assign-access';
import revokeAccess from '../../pages/api/admin/transformation/revoke-access';
import collaborativeSubmit from '../../pages/api/assignments/collaborative-submit';
import extractPdfMock from '../../pages/api/contracts/extract-pdf-mock';
import extractPdf from '../../pages/api/contracts/extract-pdf';
import diagSignature from '../../pages/api/meet/diag-signature';
import myCourses from '../../pages/api/my-courses';
import quotesList from '../../pages/api/quotes/list';
import quotesPrograms from '../../pages/api/quotes/programs';
import testGroupAssignments from '../../pages/api/test-group-assignments';
import evaluate from '../../pages/api/transformation/assessments/[id]/evaluate';
import responses from '../../pages/api/transformation/assessments/[id]/responses';
import assessmentById from '../../pages/api/transformation/assessments/[id]';
import assessments from '../../pages/api/transformation/assessments';
import history from '../../pages/api/transformation/history';
import userSchool from '../../pages/api/users/[userId]/school';

type Handler = (req: NextApiRequest, res: NextApiResponse) => Promise<unknown>;

async function call(
  handler: Handler,
  method: string,
  query: Record<string, string> = {},
  body: unknown = {},
  headers: Record<string, string> = {}
) {
  const res: any = { statusCode: 0, body: undefined };
  res.status = (code: number) => ((res.statusCode = code), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.send = (b: unknown) => ((res.body = b), res);
  res.end = () => res;
  res.setHeader = () => res;
  await handler({ method, query, headers, cookies: {}, body } as unknown as NextApiRequest, res);
  return res;
}

const askedIds = () =>
  log.flatMap((e) => e.ops.filter(([op, col]) => op === 'eq' && (col === 'user_id' || col === 'id' || col === 'created_by')).map(([, , v]) => v));

const savedEnv: Record<string, string | undefined> = {};
const ENV = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'ZOOM_SDK_CLIENT_ID', 'ZOOM_SDK_CLIENT_SECRET', 'ZOOM_DIAG_MEETING_IDS'];
beforeEach(() => {
  for (const k of ENV) savedEnv[k] = process.env[k];
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:1';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
  process.env.ZOOM_SDK_CLIENT_ID = 'sdk-id';
  process.env.ZOOM_SDK_CLIENT_SECRET = 'sdk-secret';
  process.env.ZOOM_DIAG_MEETING_IDS = '90210042001';
  log.length = 0;
  clientTags.length = 0;
  mixed = false;
  verifiedUser = null;
  for (const m of ['log', 'error', 'warn', 'info', 'debug'] as const) vi.spyOn(console, m).mockImplementation(() => {});
});
afterEach(() => {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  vi.restoreAllMocks();
});

describe('auth/my-roles', () => {
  it("returns the verified caller's roles, not the cookie user's", async () => {
    verifiedUser = { id: PLAIN };
    const res = await call(myRoles, 'GET');
    expect(res.statusCode).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain('admin');
    expect(askedIds()).toContain(PLAIN);
    expect(askedIds()).not.toContain(VICTIM);
  });

  it('refuses a token the auth server rejects', async () => {
    expect((await call(myRoles, 'GET')).statusCode).toBe(401);
    expect(log.filter((e) => e.table === 'user_roles')).toEqual([]);
  });
});

describe('auth/session', () => {
  it('echoes the verified user, not the cookie user or its metadata', async () => {
    verifiedUser = { id: PLAIN, email: 'plain@example.invalid', user_metadata: {} };
    const res = await call(authSession, 'GET');
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ user: { id: PLAIN, email: 'plain@example.invalid', user_metadata: {} } });
  });

  it('reports no user for a refused token', async () => {
    const res = await call(authSession, 'GET');
    expect(res.body).toEqual({ user: null });
  });
});

describe('admin/transformation-assessments', () => {
  it('a plain verified caller is refused before any service read', async () => {
    verifiedUser = { id: PLAIN };
    const res = await call(transformationAssessmentsAdmin, 'GET');
    expect(res.statusCode).toBe(403);
    expect(log.filter((e) => e.table === 'transformation_assessments')).toEqual([]);
    expect(askedIds()).not.toContain(VICTIM);
  });
});

const SWEEP: Array<[string, Handler, string, Record<string, string>, unknown]> = [
  ['admin/check-permissions', checkPermissions, 'GET', {}, {}],
  ['admin/transformation/assign-access', assignAccess, 'POST', {}, { communityId: 'c-1' }],
  ['admin/transformation/revoke-access', revokeAccess, 'POST', {}, { communityId: 'c-1' }],
  ['assignments/collaborative-submit', collaborativeSubmit, 'POST', {}, { assignmentId: 'a-1' }],
  ['contracts/extract-pdf-mock', extractPdfMock, 'POST', {}, {}],
  ['contracts/extract-pdf', extractPdf, 'POST', {}, {}],
  ['meet/diag-signature', diagSignature, 'POST', {}, { meetingNumber: '90210042001' }],
  ['my-courses', myCourses, 'GET', {}, {}],
  ['quotes/list', quotesList, 'GET', {}, {}],
  ['quotes/programs POST', quotesPrograms, 'POST', {}, { name: 'P' }],
  ['test-group-assignments', testGroupAssignments, 'GET', {}, {}],
  ['transformation/assessments/[id]/evaluate', evaluate, 'POST', { id: 'x-1' }, {}],
  ['transformation/assessments/[id]/responses', responses, 'PUT', { id: 'x-1' }, {}],
  ['transformation/assessments/[id]', assessmentById, 'PATCH', { id: 'x-1' }, {}],
  ['transformation/assessments', assessments, 'POST', {}, { communityId: 'c-1' }],
  ['transformation/history', history, 'GET', {}, {}],
  ['users/[userId]/school', userSchool, 'GET', { userId: PLAIN }, {}],
  ['auth/my-roles', myRoles, 'GET', {}, {}],
  ['admin/transformation-assessments', transformationAssessmentsAdmin, 'GET', {}, {}],
];

describe('every converted route', () => {
  it.each(SWEEP)('%s: a token the auth server refuses → 401 before any data access', async (_n, handler, method, query, body) => {
    const res = await call(handler, method, query, body);
    expect(res.statusCode).toBe(401);
    expect(log.filter((e) => e.table !== 'profiles')).toEqual([]);
  });

  it.each(SWEEP)('%s: a verified caller is never looked up as the cookie user', async (_n, handler, method, query, body) => {
    verifiedUser = { id: PLAIN, email: 'plain@example.invalid' };
    await call(handler, method, query, body);
    expect(askedIds()).not.toContain(VICTIM);
    expect(JSON.stringify(log)).not.toContain(VICTIM);
  });
});

describe('one credential per request', () => {
  it.each(SWEEP)('%s: with a Bearer for one user and a cookie for another, nothing queries as the cookie user', async (_n, handler, method, query, body) => {
    mixed = true;
    verifiedUser = { id: PLAIN, email: 'plain@example.invalid' };
    await call(handler, method, query, body, { authorization: `Bearer ${BEARER_TOKEN}` });
    expect(clientTags).not.toContain('cookie');
    expect(JSON.stringify(log)).not.toContain(VICTIM);
  });
});
