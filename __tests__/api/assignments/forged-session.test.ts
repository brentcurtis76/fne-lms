// @vitest-environment node
/**
 * SM-B015 batch B5 — group-assignment routes must take the caller's identity
 * from the auth server, never from the session cookie.
 *
 * auth-helpers accepts a legacy JSON session cookie as-is, so `getSession()`
 * returns whatever `user` the cookie claims next to a valid access token.
 * These routes checked group membership for `session.user.id`. Row security
 * lets a user read the memberships of every group in their community, so a
 * community peer naming a member's id passed those checks and then read the
 * group's member profiles, removed members, overwrote the group's submission,
 * added people to the group, or created groups as someone else — all through
 * the service role.
 *
 * Only the external clients are faked. Both clients answer from the same
 * rows (row security is modelled as "peers see the whole community"), which
 * is exactly what made the forged id pass. The cookie claims VICTIM, a member
 * of group G1; the auth server verifies the token as PEER, who is not.
 * All ids are synthetic (Ley 21.719).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';

const VICTIM = '11111111-1111-4111-8111-111111111111';
const PEER = '22222222-2222-4222-8222-222222222222';
const MEMBER = '33333333-3333-4333-8333-333333333333';
const CLASSMATE = '44444444-4444-4444-8444-444444444444';
const G1 = '55555555-5555-4555-8555-555555555555';
const A1 = '66666666-6666-4666-8666-666666666666';
const C1 = '77777777-7777-4777-8777-777777777777';
const C2 = '88888888-8888-4888-8888-888888888888';
const G2 = '99999999-9999-4999-8999-999999999999'; // school-only group (no community)
const G3 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'; // school 2 / community C2
const ROLELESS = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const MUST_CHANGE = new Set<string>();
const BEARER_TOKEN = 'caller-bearer-token';
let cookiePresent = true;
const COOKIE_TOKEN = 'caller-own-valid-token';

type Row = Record<string, unknown>;
const ROWS: Record<string, Row[]> = {};
function resetRows() {
  ROWS.group_assignment_members = [
    { group_id: G1, assignment_id: A1, user_id: VICTIM, role: 'leader' },
    { group_id: G1, assignment_id: A1, user_id: MEMBER, role: 'member' },
    { group_id: G2, assignment_id: A1, user_id: VICTIM, role: 'leader' },
  ];
  ROWS.user_roles = [VICTIM, PEER, MEMBER, CLASSMATE].map((user_id) => ({
    user_id,
    role_type: 'docente',
    school_id: 1,
    community_id: C1,
    is_active: true,
  }));
  ROWS.group_assignment_groups = [
    { id: G1, assignment_id: A1, community_id: C1, school_id: 1, name: 'Grupo', is_consultant_managed: false },
    { id: G2, assignment_id: A1, community_id: null, school_id: 1, name: 'Grupo escolar', is_consultant_managed: false },
    { id: G3, assignment_id: A1, community_id: C2, school_id: 2, name: 'Grupo B', is_consultant_managed: false },
  ];
  ROWS.growth_communities = [
    { id: C1, school_id: 1 },
    { id: C2, school_id: 2 },
  ];
  ROWS.profiles = [VICTIM, PEER, MEMBER, CLASSMATE, ROLELESS].map((id) => ({
    id,
    first_name: 'Nombre',
    last_name: 'Sintético',
    avatar_url: null,
    community_id: C1,
    must_change_password: MUST_CHANGE.has(id),
  }));
  ROWS.blocks = [{ id: A1, lesson_id: 'l-1', payload: { title: 'Tarea' } }];
  ROWS.lessons = [{ id: 'l-1', course_id: 'c-1', module_id: null }];
  ROWS.course_enrollments = [VICTIM, PEER, MEMBER, CLASSMATE, ROLELESS].map((user_id) => ({
    user_id,
    course_id: 'c-1',
    status: 'active',
  }));
}

type Op = [string, ...unknown[]];
const log: Array<{ client: 'cookie' | 'service' | 'anon'; table: string; ops: Op[] }> = [];
let verifiedUser: { id: string } | null = null;

const eqValue = (ops: Op[], col: string) => ops.find(([op, c]) => op === 'eq' && c === col)?.[2];

function matchRows(rows: Row[], ops: Op[]): Row[] {
  return rows.filter((r) =>
    ops.every(([op, col, a]) => {
      if (op === 'eq') return r[col as string] === a;
      if (op === 'in') return (a as unknown[]).includes(r[col as string]);
      if (op === 'neq') return r[col as string] !== a;
      return true;
    })
  );
}

function answer(table: string, ops: Op[], mode: 'many' | 'one') {
  const insert = ops.find(([op]) => op === 'insert')?.[1];
  if (insert) {
    const rows = (Array.isArray(insert) ? insert : [insert]).map((r: Row) =>
      table === 'group_assignment_groups' ? { id: 'g-new', ...r } : r
    );
    return { data: mode === 'one' ? rows[0] : rows, error: null };
  }
  if (ops.some(([op]) => op === 'upsert' || op === 'delete' || op === 'update')) return { data: null, error: null };
  const rows = matchRows(ROWS[table] ?? [], ops);
  if (mode === 'one') return { data: rows[0] ?? null, error: null };
  return { data: rows, error: null, count: rows.length };
}

/**
 * Row security on group_assignment_members (baseline policies): a user sees
 * their own rows and every membership of a group in one of their communities.
 * School-only groups (no community) are therefore hidden from non-members.
 */
function visibleToCaller(table: string, rows: Row[]): Row[] {
  if (table !== 'group_assignment_members' || !verifiedUser) return rows;
  const me = verifiedUser.id;
  const myCommunities = new Set(
    (ROWS.user_roles ?? []).filter((r) => r.user_id === me && r.is_active).map((r) => r.community_id)
  );
  return rows.filter((m) => {
    if (m.user_id === me) return true;
    const g = (ROWS.group_assignment_groups ?? []).find((x) => x.id === m.group_id);
    return !!g?.community_id && myCommunities.has(g.community_id);
  });
}

function client(kind: 'cookie' | 'service' | 'anon') {
  const resolveFor = (table: string, ops: Op[], mode: 'many' | 'one') => {
    if (kind === 'service') return answer(table, ops, mode);
    // No session cookie and no forwarded JWT: PostgREST runs as anon.
    if (kind === 'anon') return { data: mode === 'one' ? null : [], error: null, count: 0 };
    const saved = ROWS[table];
    ROWS[table] = visibleToCaller(table, saved ?? []);
    try {
      return answer(table, ops, mode);
    } finally {
      ROWS[table] = saved;
    }
  };
  return (table: string) => {
    const entry = { client: kind, table, ops: [] as Op[] };
    log.push(entry);
    const chain: any = new Proxy(
      {},
      {
        get(_t, prop: string) {
          if (prop === 'then') return (resolve: (v: unknown) => void) => resolve(resolveFor(table, entry.ops, 'many'));
          if (prop === 'single' || prop === 'maybeSingle') return async () => resolveFor(table, entry.ops, 'one');
          return (...args: unknown[]) => {
            entry.ops.push([prop, ...args]);
            return chain;
          };
        },
      }
    );
    return chain;
  };
}

function cookieClient() {
  return {
    auth: {
      getSession: vi.fn(async () => ({
        data: { session: cookiePresent ? { user: { id: VICTIM }, access_token: COOKIE_TOKEN } : null },
        error: null,
      })),
      getUser: vi.fn(async (token?: string) =>
        token === COOKIE_TOKEN && verifiedUser
          ? { data: { user: verifiedUser }, error: null }
          : { data: { user: null }, error: { message: 'invalid token' } }
      ),
    },
    from: vi.fn((table: string) => client(cookiePresent ? 'cookie' : 'anon')(table)),
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
    if (opts?.global?.headers?.Authorization) return { from: vi.fn(client('cookie')) };
    return {
      auth: {
        getUser: vi.fn(async (token?: string) =>
          token === BEARER_TOKEN && verifiedUser
            ? { data: { user: verifiedUser }, error: null }
            : { data: { user: null }, error: { message: 'invalid token' } }
        ),
      },
      rpc: vi.fn(async () => ({ data: null, error: null })),
      from: vi.fn(client('service')),
    };
  }),
}));

const shareable = vi.hoisted(() => ({ calls: [] as unknown[][] }));
vi.mock('@/lib/services/userAssignments', () => ({
  userAssignmentsService: {
    getShareableMembers: vi.fn(async (...args: unknown[]) => {
      shareable.calls.push(args);
      return [{ id: 'someone' }];
    }),
    getShareableMembersBySchool: vi.fn(async (...args: unknown[]) => {
      shareable.calls.push(args);
      return [{ id: 'someone' }];
    }),
  },
}));

import createGroup from '../../../pages/api/assignments/create-group';
import eligibleClassmates from '../../../pages/api/assignments/eligible-classmates';
import userGroup from '../../../pages/api/assignments/user-group';
import groupMembers from '../../../pages/api/assignments/group-members';
import submitGroup from '../../../pages/api/assignments/submit-group';
import addClassmates from '../../../pages/api/assignments/add-classmates';
import shareableMembers from '../../../pages/api/assignments/shareable-members';

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

/** Routes gated on the caller's membership of G1. */
const GROUP_GATED: Array<[string, Handler, string, Record<string, string>, unknown]> = [
  ['group-members GET', groupMembers, 'GET', { groupId: G1, assignmentId: A1 }, {}],
  ['group-members DELETE', groupMembers, 'DELETE', {}, { groupId: G1, assignmentId: A1, memberId: MEMBER }],
  ['submit-group', submitGroup, 'POST', {}, { assignmentId: A1, groupId: G1, submission: { content: 'x' } }],
  ['add-classmates', addClassmates, 'POST', {}, { assignmentId: A1, groupId: G1, classmateIds: [CLASSMATE] }],
  ['eligible-classmates (group)', eligibleClassmates, 'GET', { assignmentId: A1, groupId: G1 }, {}],
  ['shareable-members (group)', shareableMembers, 'GET', { assignmentId: A1, groupId: G1 }, {}],
];

/** Every user id any query was filtered on, per client. */
const askedUserIds = () =>
  log.flatMap((e) => e.ops.filter(([op, col]) => (op === 'eq' && (col === 'user_id' || col === 'id')) || (op === 'in' && col === 'user_id')).flatMap(([, , v]) => (Array.isArray(v) ? v : [v])));
const writes = () =>
  log.flatMap((e) => e.ops.filter(([op]) => ['insert', 'update', 'upsert', 'delete'].includes(op)).map((o) => [e.table, ...o]));

const savedEnv: Record<string, string | undefined> = {};
beforeEach(() => {
  for (const k of ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY']) savedEnv[k] = process.env[k];
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:1';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
  MUST_CHANGE.clear();
  cookiePresent = true;
  resetRows();
  log.length = 0;
  shareable.calls.length = 0;
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

describe("a cookie naming a group member's id does not make a peer a member", () => {
  it.each(GROUP_GATED)('%s: refused, nothing read from the group or written', async (_n, handler, method, query, body) => {
    verifiedUser = { id: PEER };
    const res = await call(handler, method, query, body);
    expect(res.statusCode).toBe(403);
    expect(askedUserIds()).toContain(PEER);
    expect(askedUserIds()).not.toContain(VICTIM);
    expect(writes()).toEqual([]);
    expect(shareable.calls).toEqual([]);
    // No service-role read of the group's member list (a head-only count is not one).
    const isHeadCount = (ops: Op[]) => ops.some(([op, , o]) => op === 'select' && (o as { head?: boolean })?.head === true);
    expect(
      log.filter((e) => e.client === 'service' && e.table === 'group_assignment_members' && eqValue(e.ops, 'user_id') === undefined && !isHeadCount(e.ops))
    ).toEqual([]);
  });

  it.each(GROUP_GATED)('%s: a real member (verified) passes', async (_n, handler, method, query, body) => {
    verifiedUser = { id: MEMBER };
    const res = await call(handler, method, query, body);
    expect(res.statusCode).toBe(200);
    expect(askedUserIds()).toContain(MEMBER);
  });

  it.each([
    ...GROUP_GATED,
    ['user-group', userGroup, 'GET', { assignmentId: A1 }, {}],
    ['create-group', createGroup, 'POST', {}, { assignmentId: A1, classmateIds: [] }],
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

describe('routes about "my group" answer for the verified caller', () => {
  it("user-group returns the caller's (absent) group, not the cookie user's", async () => {
    verifiedUser = { id: PEER };
    const res = await call(userGroup, 'GET', { assignmentId: A1 });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ group: null });
    expect(askedUserIds()).not.toContain(VICTIM);
  });

  it('user-group returns the group of a verified member', async () => {
    verifiedUser = { id: MEMBER };
    const res = await call(userGroup, 'GET', { assignmentId: A1 });
    expect(res.statusCode).toBe(200);
    expect(res.body.group).toMatchObject({ id: G1 });
  });

  it('create-group makes the verified caller the leader, never the cookie user', async () => {
    verifiedUser = { id: PEER };
    const res = await call(createGroup, 'POST', {}, { assignmentId: A1, classmateIds: [] });
    expect(res.statusCode).toBe(200);
    const memberInserts = writes().filter(([t, o]) => t === 'group_assignment_members' && o === 'insert');
    expect(memberInserts).toHaveLength(1);
    expect(JSON.stringify(memberInserts)).toContain(PEER);
    expect(JSON.stringify(writes())).not.toContain(VICTIM);
  });

  it('create-group refuses a caller who is already in a group, judged by the verified id', async () => {
    verifiedUser = { id: MEMBER };
    const res = await call(createGroup, 'POST', {}, { assignmentId: A1, classmateIds: [] });
    expect(res.statusCode).toBe(400);
    expect(writes()).toEqual([]);
  });
});

describe('add-classmates: the group, not the caller, sets the scope', () => {
  it('an occupied school-only group is not "empty" just because row security hides its members', async () => {
    verifiedUser = { id: PEER };
    const res = await call(addClassmates, 'POST', {}, { assignmentId: A1, groupId: G2, classmateIds: [CLASSMATE] });
    expect(res.statusCode).toBe(403);
    expect(writes()).toEqual([]);
  });

  it("a member cannot add people from their own school into another school's group", async () => {
    // MEMBER joins G3 (school 2) while holding roles only in school 1.
    ROWS.group_assignment_members.push({ group_id: G3, assignment_id: A1, user_id: MEMBER, role: 'member' });
    verifiedUser = { id: MEMBER };
    const res = await call(addClassmates, 'POST', {}, { assignmentId: A1, groupId: G3, classmateIds: [CLASSMATE] });
    expect(res.statusCode).toBe(403);
    expect(writes()).toEqual([]);
  });

  it('classmates must belong to the group school', async () => {
    ROWS.user_roles.push({ user_id: MEMBER, role_type: 'docente', school_id: 2, community_id: C2, is_active: true });
    ROWS.group_assignment_members.push({ group_id: G3, assignment_id: A1, user_id: MEMBER, role: 'member' });
    verifiedUser = { id: MEMBER };
    const res = await call(addClassmates, 'POST', {}, { assignmentId: A1, groupId: G3, classmateIds: [CLASSMATE] });
    expect(res.statusCode).toBe(400);
    expect(writes()).toEqual([]);
  });

  it('a classmate with no active role is refused', async () => {
    verifiedUser = { id: MEMBER };
    const res = await call(addClassmates, 'POST', {}, { assignmentId: A1, groupId: G1, classmateIds: [ROLELESS] });
    expect(res.statusCode).toBe(400);
    expect(writes()).toEqual([]);
  });
});

describe('create-group: one school, its own community, positive classmates', () => {
  it("does not attach a community from another school", async () => {
    // PEER also leads a community in school 2; the group is a school-1 group.
    ROWS.user_roles = ROWS.user_roles.map((r) => (r.user_id === PEER ? { ...r, community_id: null } : r));
    ROWS.user_roles.unshift({ user_id: PEER, role_type: 'lider_comunidad', school_id: null, community_id: C2, is_active: true });
    verifiedUser = { id: PEER };
    const res = await call(createGroup, 'POST', {}, { assignmentId: A1, classmateIds: [] });
    expect(res.statusCode).toBe(200);
    const group = writes().find(([t, o]) => t === 'group_assignment_groups' && o === 'insert')?.[2] as Row;
    expect(group).toMatchObject({ school_id: 1 });
    expect(group.community_id).not.toBe(C2);
  });

  it('keeps the community of the school role', async () => {
    verifiedUser = { id: PEER };
    await call(createGroup, 'POST', {}, { assignmentId: A1, classmateIds: [] });
    const group = writes().find(([t, o]) => t === 'group_assignment_groups' && o === 'insert')?.[2] as Row;
    expect(group).toMatchObject({ school_id: 1, community_id: C1 });
  });

  it('refuses a classmate with no active role', async () => {
    verifiedUser = { id: PEER };
    const res = await call(createGroup, 'POST', {}, { assignmentId: A1, classmateIds: [ROLELESS] });
    expect(res.statusCode).toBe(400);
    expect(writes()).toEqual([]);
  });
});

describe('password gate and Bearer callers', () => {
  it.each(GROUP_GATED)('%s: a member who must change their password is held', async (_n, handler, method, query, body) => {
    verifiedUser = { id: MEMBER };
    MUST_CHANGE.add(MEMBER);
    resetRows();
    const res = await call(handler, method, query, body);
    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({ code: 'PASSWORD_CHANGE_REQUIRED' });
    expect(writes()).toEqual([]);
  });

  it.each(GROUP_GATED)('%s: a member calling with Bearer and no cookie is served as themselves', async (_n, handler, method, query, body) => {
    cookiePresent = false;
    verifiedUser = { id: MEMBER };
    const res = await call(handler, method, query, body, { authorization: `Bearer ${BEARER_TOKEN}` });
    expect(res.statusCode).toBe(200);
    expect(askedUserIds()).toContain(MEMBER);
  });
});
