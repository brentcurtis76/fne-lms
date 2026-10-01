// @vitest-environment node
/**
 * SM-B015 batch B6 — transformation routes must take the caller's identity
 * from the auth server, never from the session cookie.
 *
 * auth-helpers accepts a legacy JSON session cookie as-is, so `getSession()`
 * returns whatever `user` the cookie claims next to a valid access token.
 * The vías de transformación routes decided creator / collaborator / school
 * access from `session.user.id`, so naming an assessment's creator in the
 * cookie read or edited that assessment and added or removed collaborators
 * through the service role, and new assessments were attributed to the named
 * user. transformation/chat counted the rate limit for the named user (whose
 * count the caller cannot see), so the limit never applied.
 *
 * Only the external clients are faked; both answer from the same rows. The
 * cookie claims CREATOR (school 1); the auth server verifies the token as
 * OUTSIDER (school 2). All ids are synthetic (Ley 21.719).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';

const CREATOR = '11111111-1111-4111-8111-111111111111';
const OUTSIDER = '22222222-2222-4222-8222-222222222222';
const COLLEAGUE = '33333333-3333-4333-8333-333333333333';
const X1 = '44444444-4444-4444-8444-444444444444';
const COOKIE_TOKEN = 'caller-own-valid-token';
const BEARER_TOKEN = 'caller-bearer-token';
const MUST_CHANGE = new Set<string>();
let cookiePresent = true;

type Row = Record<string, unknown>;
const ROWS: Record<string, Row[]> = {};
function resetRows() {
  ROWS.user_roles = [
    { user_id: CREATOR, role_type: 'docente', school_id: 1, is_active: true },
    { user_id: COLLEAGUE, role_type: 'docente', school_id: 1, is_active: true },
    { user_id: OUTSIDER, role_type: 'docente', school_id: 2, is_active: true },
  ];
  ROWS.transformation_assessments = [
    { id: X1, school_id: 1, created_by: CREATOR, area: 'evaluacion', status: 'in_progress', grades: [], context_metadata: {} },
  ];
  ROWS.transformation_assessment_collaborators = [
    { assessment_id: X1, user_id: CREATOR, role: 'creator', can_edit: true },
  ];
  ROWS.profiles = [CREATOR, OUTSIDER, COLLEAGUE].map((id) => ({ id, first_name: 'N', last_name: 'S', must_change_password: MUST_CHANGE.has(id) }));
  ROWS.schools = [{ id: 1, name: 'Colegio 1' }, { id: 2, name: 'Colegio 2' }];
  ROWS.transformation_llm_usage = [];
}

type Op = [string, ...unknown[]];
const log: Array<{ table: string; ops: Op[] }> = [];
let verifiedUser: { id: string } | null = null;

function matchRows(rows: Row[], ops: Op[]): Row[] {
  return rows.filter((r) =>
    ops.every(([op, col, a]) => {
      if (op === 'eq') return r[col as string] === a;
      if (op === 'in') return (a as unknown[]).includes(r[col as string]);
      if (op === 'neq') return r[col as string] !== a;
      if (op === 'gte') return String(r[col as string]) >= String(a);
      return true;
    })
  );
}

function answer(table: string, ops: Op[], mode: 'many' | 'one') {
  const write = ops.find(([op]) => ['insert', 'upsert'].includes(op as string))?.[1];
  if (write) {
    const rows = (Array.isArray(write) ? write : [write]).map((r: Row) => (table === 'transformation_assessments' ? { id: 'x-new', ...r } : r));
    return { data: mode === 'one' ? rows[0] : rows, error: null };
  }
  if (ops.some(([op]) => op === 'delete' || op === 'update')) {
    const rows = matchRows(ROWS[table] ?? [], ops);
    return { data: mode === 'one' ? rows[0] ?? null : rows, error: null };
  }
  const rows = matchRows(ROWS[table] ?? [], ops);
  if (mode === 'one') return { data: rows[0] ?? null, error: rows[0] ? null : { code: 'PGRST116' } };
  return { data: rows, error: null, count: rows.length };
}

function from(table: string, anon = false) {
  const entry = { table, ops: [] as Op[] };
  log.push(entry);
  // No cookie and no forwarded JWT: PostgREST runs as anon and sees nothing.
  const resolve = (mode: 'many' | 'one') =>
    anon ? { data: mode === 'one' ? null : [], error: null, count: 0 } : answer(table, entry.ops, mode);
  const chain: any = new Proxy(
    {},
    {
      get(_t, prop: string) {
        if (prop === 'then') return (r: (v: unknown) => void) => r(resolve('many'));
        if (prop === 'single' || prop === 'maybeSingle') return async () => resolve('one');
        return (...args: unknown[]) => {
          entry.ops.push([prop, ...args]);
          return chain;
        };
      },
    }
  );
  return chain;
}

function cookieClient() {
  return {
    auth: {
      getSession: vi.fn(async () => ({
        data: { session: cookiePresent ? { user: { id: CREATOR }, access_token: COOKIE_TOKEN } : null },
        error: null,
      })),
      getUser: vi.fn(async (token?: string) =>
        token === COOKIE_TOKEN && verifiedUser
          ? { data: { user: verifiedUser }, error: null }
          : { data: { user: null }, error: { message: 'invalid token' } }
      ),
    },
    from: vi.fn((table: string) => from(table, !cookiePresent)),
  };
}

vi.mock('@supabase/auth-helpers-nextjs', () => ({
  createServerSupabaseClient: vi.fn(() => cookieClient()),
  createPagesServerClient: vi.fn(() => cookieClient()),
}));

vi.mock('@supabase/supabase-js', () => ({
  // createApiSupabaseClient builds a caller-JWT client for Bearer callers
  // (Authorization header); every other createClient here is the service role.
  createClient: vi.fn((_url: string, _key: string, opts?: { global?: { headers?: Record<string, string> } }) => {
    if (opts?.global?.headers?.Authorization) return { from: vi.fn((table: string) => from(table)) };
    return {
      auth: {
        getUser: vi.fn(async (token?: string) =>
          token === BEARER_TOKEN && verifiedUser
            ? { data: { user: verifiedUser }, error: null }
            : { data: { user: null }, error: { message: 'invalid token' } }
        ),
      },
      rpc: vi.fn(async () => ({ data: null, error: null })),
      from: vi.fn((table: string) => from(table)),
    };
  }),
}));

const llm = vi.hoisted(() => ({ calls: 0 }));
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = {
      create: vi.fn(async () => {
        llm.calls += 1;
        return { content: [{ type: 'text', text: '{"assistant_message":"ok","suggested_level":2,"rationale":"r"}' }], usage: { input_tokens: 1, output_tokens: 1 } };
      }),
    };
  },
}));

vi.mock('@/lib/transformation/contextBuilder', () => ({
  buildTransformationContext: vi.fn(async () => ({
    assessment: { id: X1, context_metadata: {} },
    rubric: { id: 'r-1' },
    conversationHistory: [],
    prompt: [{ role: 'system', content: 'Sistema sintético' }],
  })),
}));

vi.mock('@/lib/transformation/interactionService', () => ({
  persistTransformationInteraction: vi.fn(async () => ({ resultId: 'res-1', assessmentStatus: 'in_progress', summary: null, updatedHistory: [] })),
}));

import assessmentById from '../../../pages/api/vias-transformacion/[id]/index';
import collaborators from '../../../pages/api/vias-transformacion/[id]/collaborators';
import assessments from '../../../pages/api/vias-transformacion/index';
import eligibleCollaborators from '../../../pages/api/vias-transformacion/eligible-collaborators';
import chat from '../../../pages/api/transformation/chat';

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
  res.end = () => res;
  res.setHeader = () => res;
  await handler({ method, query, headers, cookies: {}, body } as unknown as NextApiRequest, res);
  return res;
}

/** Routes gated on being X1's creator / collaborator / school member. */
const GATED: Array<[string, Handler, string, Record<string, string>, unknown]> = [
  ['vias/[id] GET', assessmentById, 'GET', { id: X1 }, {}],
  ['vias/[id] PATCH', assessmentById, 'PATCH', { id: X1 }, { status: 'archived' }],
  ['vias/[id]/collaborators POST', collaborators, 'POST', { id: X1 }, { userIds: [COLLEAGUE] }],
  ['vias/[id]/collaborators DELETE', collaborators, 'DELETE', { id: X1 }, { userId: COLLEAGUE }],
  ['vias/eligible-collaborators', eligibleCollaborators, 'GET', { schoolId: '1' }, {}],
  ['vias POST (school 1)', assessments, 'POST', {}, { schoolId: 1, area: 'evaluacion', grades: ['1B'] }],
];

const writes = () =>
  log.flatMap((e) => e.ops.filter(([op]) => ['insert', 'update', 'upsert', 'delete'].includes(op as string)).map((o) => [e.table, ...o]));
const askedUserIds = () =>
  log.flatMap((e) => e.ops.filter(([op, col]) => op === 'eq' && col === 'user_id').map(([, , v]) => v));

const savedEnv: Record<string, string | undefined> = {};
beforeEach(() => {
  for (const k of ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'ANTHROPIC_API_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY']) savedEnv[k] = process.env[k];
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
  MUST_CHANGE.clear();
  cookiePresent = true;
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:1';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
  process.env.ANTHROPIC_API_KEY = 'synthetic-key';
  resetRows();
  log.length = 0;
  llm.calls = 0;
  verifiedUser = null;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  vi.restoreAllMocks();
});

describe("a cookie naming the creator does not lend the creator's access", () => {
  it.each(GATED)('%s: an outsider is refused and nothing is written', async (_n, handler, method, query, body) => {
    verifiedUser = { id: OUTSIDER };
    const res = await call(handler, method, query, body);
    expect(res.statusCode).toBe(403);
    expect(askedUserIds()).toContain(OUTSIDER);
    expect(askedUserIds()).not.toContain(CREATOR);
    expect(writes()).toEqual([]);
  });

  it.each([
    ...GATED,
    ['vias GET', assessments, 'GET', {}, {}],
    ['transformation/chat', chat, 'POST', {}, { assessmentId: X1, rubricItemId: 'r-1', userMessage: 'hola' }],
  ] as Array<[string, Handler, string, Record<string, string>, unknown]>)(
    '%s: a token the auth server rejects → 401 before any data access',
    async (_n, handler, method, query, body) => {
      verifiedUser = null;
      const res = await call(handler, method, query, body);
      expect(res.statusCode).toBe(401);
      expect(log).toEqual([]);
    }
  );
});

describe('legitimate callers act as themselves', () => {
  it('the creator (verified) reads and edits the assessment', async () => {
    verifiedUser = { id: CREATOR };
    expect((await call(assessmentById, 'GET', { id: X1 })).statusCode).toBe(200);
    expect((await call(assessmentById, 'PATCH', { id: X1 }, { status: 'archived' })).statusCode).toBe(200);
  });

  it('the creator adds a colleague, recorded as added_by the creator', async () => {
    verifiedUser = { id: CREATOR };
    const res = await call(collaborators, 'POST', { id: X1 }, { userIds: [COLLEAGUE] });
    expect(res.statusCode).toBe(200);
    const upsert = writes().find(([t, o]) => t === 'transformation_assessment_collaborators' && o === 'upsert')?.[2] as Row[];
    expect(upsert).toEqual([expect.objectContaining({ user_id: COLLEAGUE, added_by: CREATOR })]);
  });

  it("vias GET lists only the outsider's school, asked as the outsider", async () => {
    verifiedUser = { id: OUTSIDER };
    const res = await call(assessments, 'GET');
    expect(res.statusCode).toBe(200);
    expect(res.body.assessments).toEqual([]);
    expect(askedUserIds()).not.toContain(CREATOR);
  });

  it('a new assessment is attributed to the verified caller', async () => {
    verifiedUser = { id: OUTSIDER };
    const res = await call(assessments, 'POST', {}, { schoolId: 2, area: 'evaluacion', grades: ['1B'] });
    expect(res.statusCode).toBeLessThan(300);
    const insert = writes().find(([t, o]) => t === 'transformation_assessments' && o === 'insert')?.[2];
    expect(insert).toMatchObject({ created_by: OUTSIDER });
  });
});

describe('transformation/chat rate limit counts the verified caller', () => {
  it('a caller at the limit gets 429 and no model call, whoever the cookie names', async () => {
    verifiedUser = { id: OUTSIDER };
    const now = new Date().toISOString();
    ROWS.transformation_llm_usage = Array.from({ length: 10 }, (_, i) => ({ id: `u-${i}`, user_id: OUTSIDER, created_at: now }));
    const res = await call(chat, 'POST', {}, { assessmentId: X1, rubricItemId: 'r-1', userMessage: 'hola' });
    expect(res.statusCode).toBe(429);
    expect(llm.calls).toBe(0);
  });

  it('a caller under the limit is served, and the use is logged against them', async () => {
    verifiedUser = { id: OUTSIDER };
    const res = await call(chat, 'POST', {}, { assessmentId: X1, rubricItemId: 'r-1', userMessage: 'hola' });
    expect(res.statusCode).toBe(200);
    expect(llm.calls).toBe(1);
    const usage = writes().find(([t, o]) => t === 'transformation_llm_usage' && o === 'insert')?.[2];
    expect(usage).toMatchObject({ user_id: OUTSIDER });
  });
});

describe('password gate and Bearer callers', () => {
  const OWN: Array<[string, Handler, string, Record<string, string>, unknown]> = [
    ['vias/[id] GET', assessmentById, 'GET', { id: X1 }, {}],
    ['vias/[id] PATCH', assessmentById, 'PATCH', { id: X1 }, { status: 'archived' }],
    ['vias/[id]/collaborators POST', collaborators, 'POST', { id: X1 }, { userIds: [COLLEAGUE] }],
    ['vias/eligible-collaborators', eligibleCollaborators, 'GET', { schoolId: '1' }, {}],
    ['vias GET', assessments, 'GET', {}, {}],
    ['transformation/chat', chat, 'POST', {}, { assessmentId: X1, rubricItemId: 'r-1', userMessage: 'hola' }],
  ];

  it.each(OWN)('%s: the creator, if they must change their password, is held', async (_n, handler, method, query, body) => {
    MUST_CHANGE.add(CREATOR);
    resetRows();
    verifiedUser = { id: CREATOR };
    const res = await call(handler, method, query, body);
    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({ code: 'PASSWORD_CHANGE_REQUIRED' });
    expect(writes()).toEqual([]);
    expect(llm.calls).toBe(0);
  });

  it.each(OWN)('%s: the creator calling with Bearer and no cookie is served as themselves', async (_n, handler, method, query, body) => {
    cookiePresent = false;
    verifiedUser = { id: CREATOR };
    const res = await call(handler, method, query, body, { authorization: `Bearer ${BEARER_TOKEN}` });
    expect(res.statusCode).toBe(200);
    expect(askedUserIds()).toContain(CREATOR);
  });
});
