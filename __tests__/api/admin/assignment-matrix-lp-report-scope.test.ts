// @vitest-environment node
/**
 * W-B2c-01 step 4 (Brent 2026-10-02) — the LEARNING-PATH half of the assignment
 * matrix routes follows the learning-path report rule, read-only:
 *   admin all; active consultor all schools; active equipo_directivo only people
 *   with an active role in their school. The decision is asked of the database
 *   helpers (auth_lp_report_all / auth_lp_report_sees_user) on the CALLER's
 *   client; the routes never decide it from roles themselves.
 *
 * Screen audiences are unchanged: user-assignments / group-assignments /
 * content-stats stay admin + consultor (a director is refused); audit-log keeps
 * admin + consultor + equipo_directivo, a director limited to one person of
 * their own school.
 *
 * The real lib/api-auth runs (identity from the auth server, forced-password
 * gate); only the Supabase clients are faked over one in-memory dataset. The
 * caller client's rpc answers the two helpers with the migration's rule.
 * All ids and names are synthetic (Ley 21.719).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';

const ADMIN = '10000000-0000-4000-8000-000000000001';
const CONSULTOR = '10000000-0000-4000-8000-000000000002';
const DIRECTOR_A = '10000000-0000-4000-8000-000000000003';
const DIRECTOR_B = '10000000-0000-4000-8000-000000000004';
const DOCENTE_A = '10000000-0000-4000-8000-000000000005';
const DOCENTE_B = '10000000-0000-4000-8000-000000000006';
const FLAGGED = '10000000-0000-4000-8000-000000000007';
const SCHOOL_A = 1;
const SCHOOL_B = 2;
const COURSE = 'c0000000-0000-4000-8000-000000000001';
const PATH_A = 'a0000000-0000-4000-8000-00000000000a';
const PATH_B = 'a0000000-0000-4000-8000-00000000000b';

type Row = Record<string, unknown>;
const roleRow = (user_id: string, role_type: string, school_id: number | null): Row =>
  ({ user_id, role_type, school_id, community_id: null, is_active: true });

const DB: Record<string, Row[]> = {
  user_roles: [
    roleRow(ADMIN, 'admin', null),
    roleRow(CONSULTOR, 'consultor', SCHOOL_A),
    roleRow(DIRECTOR_A, 'equipo_directivo', SCHOOL_A),
    roleRow(DIRECTOR_B, 'equipo_directivo', SCHOOL_B),
    roleRow(DOCENTE_A, 'docente', SCHOOL_A),
    roleRow(DOCENTE_B, 'docente', SCHOOL_B),
    roleRow(FLAGGED, 'consultor', SCHOOL_A),
  ],
  profiles: [ADMIN, CONSULTOR, DIRECTOR_A, DIRECTOR_B, DOCENTE_A, DOCENTE_B, FLAGGED].map((id, i) => ({
    id, first_name: `Persona${i}`, last_name: 'Sintética', email: `p${i}@example.invalid`, must_change_password: id === FLAGGED,
  })),
  schools: [{ id: SCHOOL_A, name: 'Colegio A' }, { id: SCHOOL_B, name: 'Colegio B' }],
  courses: [{ id: COURSE, title: 'Curso Sintético', description: '', thumbnail_url: null, created_at: '2026-09-01T00:00:00Z', instructor: null }],
  course_enrollments: [DOCENTE_A, DOCENTE_B].map((user_id, i) => ({
    id: `enr-${i}`, user_id, course_id: COURSE, enrolled_by: null, enrolled_at: '2026-09-01T00:00:00Z', status: 'active',
    lessons_completed: 1, total_lessons: 2, courses: { id: COURSE, title: 'Curso Sintético', description: '', thumbnail_url: null },
  })),
  course_assignments: [],
  learning_paths: [
    { id: PATH_A, name: 'Ruta Escuela A', description: '', created_at: '2026-09-01T00:00:00Z' },
    { id: PATH_B, name: 'Ruta Escuela B', description: '', created_at: '2026-09-01T00:00:00Z' },
  ],
  learning_path_courses: [
    { learning_path_id: PATH_A, course_id: COURSE },
    { learning_path_id: PATH_B, course_id: COURSE },
  ],
  learning_path_assignments: [
    { id: 'lpa-a', user_id: DOCENTE_A, path_id: PATH_A, group_id: null, assigned_by: ADMIN, assigned_at: '2026-09-02T00:00:00Z', learning_paths: { id: PATH_A, name: 'Ruta Escuela A', description: '' } },
    { id: 'lpa-b', user_id: DOCENTE_B, path_id: PATH_B, group_id: null, assigned_by: ADMIN, assigned_at: '2026-09-02T00:00:00Z', learning_paths: { id: PATH_B, name: 'Ruta Escuela B', description: '' } },
  ],
  assignment_audit_log: [
    { id: 'log-a-lp', action: 'assigned', entity_type: 'user', entity_id: DOCENTE_A, content_type: 'learning_path', content_id: PATH_A, source: 'direct', source_learning_path_id: null, performed_by: ADMIN, performed_at: '2026-09-02T00:00:00Z', metadata: {} },
    { id: 'log-a-course', action: 'assigned', entity_type: 'user', entity_id: DOCENTE_A, content_type: 'course', content_id: COURSE, source: 'learning_path', source_learning_path_id: PATH_A, performed_by: ADMIN, performed_at: '2026-09-02T00:00:00Z', metadata: {} },
    { id: 'log-b-lp', action: 'assigned', entity_type: 'user', entity_id: DOCENTE_B, content_type: 'learning_path', content_id: PATH_B, source: 'direct', source_learning_path_id: null, performed_by: ADMIN, performed_at: '2026-09-02T00:00:00Z', metadata: {} },
  ],
};

type Op = [string, ...unknown[]];
const log: Array<{ client: 'caller' | 'service'; table: string; ops: Op[] }> = [];
const rpcLog: Array<{ fn: string; args?: Record<string, unknown> }> = [];
let verifiedUser: { id: string } | null = null;
/** When true the database answers FALSE to every helper (e.g. role revoked mid-request). */
let dbDenies = false;
const COOKIE_TOKEN = 'cookie-access-token';

function match(rows: Row[], ops: Op[]): Row[] {
  return rows.filter((r) => ops.every(([op, col, a]) => {
    if (op === 'eq') return r[col as string] === a;
    if (op === 'in') return (a as unknown[]).includes(r[col as string]);
    if (op === 'not' && a === 'is') return r[col as string] !== null && r[col as string] !== undefined;
    return true;
  }));
}

function chain(client: 'caller' | 'service', table: string) {
  const entry = { client, table, ops: [] as Op[] };
  log.push(entry);
  const answer = (mode: 'many' | 'one') => {
    const rows = match(DB[table] ?? [], entry.ops);
    return mode === 'one' ? { data: rows[0] ?? null, error: null } : { data: rows, error: null, count: rows.length };
  };
  const c: any = new Proxy({}, {
    get(_t, prop: string) {
      if (prop === 'then') return (resolve: (v: unknown) => void) => resolve(answer('many'));
      if (prop === 'single' || prop === 'maybeSingle') return async () => answer('one');
      return (...args: unknown[]) => { entry.ops.push([prop, ...args]); return c; };
    },
  });
  return c;
}

const activeRoles = (id: string) => DB.user_roles.filter((r) => r.user_id === id && r.is_active === true);
/** The migration's rule (20261002120000), for the verified caller. */
function reportAll(): boolean {
  if (!verifiedUser || dbDenies) return false;
  return activeRoles(verifiedUser.id).some((r) => r.role_type === 'admin' || r.role_type === 'consultor');
}
function seesUser(target: string): boolean {
  if (!verifiedUser || dbDenies) return false;
  if (reportAll()) return true;
  const mySchools = activeRoles(verifiedUser.id).filter((r) => r.role_type === 'equipo_directivo' && r.school_id !== null).map((r) => r.school_id);
  return activeRoles(target).some((r) => mySchools.includes(r.school_id));
}
async function callerRpc(fn: string, args?: Record<string, unknown>) {
  rpcLog.push({ fn, args });
  if (fn === 'auth_lp_report_all') return { data: reportAll(), error: null };
  if (fn === 'auth_lp_report_sees_user') return { data: seesUser(args?.p_user as string), error: null };
  return { data: null, error: { message: `unexpected rpc ${fn}` } };
}

vi.mock('@supabase/auth-helpers-nextjs', () => {
  const make = () => ({
    auth: {
      getSession: vi.fn(async () => ({ data: { session: verifiedUser ? { access_token: COOKIE_TOKEN, user: verifiedUser } : null }, error: null })),
      getUser: vi.fn(async (t?: string) => (t === COOKIE_TOKEN && verifiedUser ? { data: { user: verifiedUser }, error: null } : { data: { user: null }, error: { message: 'invalid' } })),
    },
    from: vi.fn((table: string) => chain('caller', table)),
    rpc: vi.fn(callerRpc),
  });
  return { createServerSupabaseClient: vi.fn(make), createPagesServerClient: vi.fn(make) };
});

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: null }, error: { message: 'no bearer in this suite' } })) },
    from: vi.fn((table: string) => chain('service', table)),
    rpc: vi.fn(async () => ({ data: null, error: { message: 'service role must not decide the scope' } })),
  })),
}));

import userAssignments from '../../../pages/api/admin/assignment-matrix/user-assignments';
import groupAssignments from '../../../pages/api/admin/assignment-matrix/group-assignments';
import contentStats from '../../../pages/api/admin/assignment-matrix/content-stats';
import auditLog from '../../../pages/api/admin/assignment-matrix/audit-log';

type Handler = (req: NextApiRequest, res: NextApiResponse) => Promise<unknown>;
async function call(handler: Handler, query: Record<string, string>) {
  const res: any = { statusCode: 0, body: undefined };
  res.status = (code: number) => ((res.statusCode = code), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.end = () => res;
  res.setHeader = () => res;
  await handler({ method: 'GET', query, headers: {}, cookies: {}, body: {} } as unknown as NextApiRequest, res);
  return res;
}
const as = (id: string | null) => { verifiedUser = id ? { id } : null; };
const lpReads = () => log.filter((e) => e.table === 'learning_path_assignments' || e.table === 'learning_path_courses' || e.table === 'learning_paths');
const text = (b: unknown) => JSON.stringify(b ?? {});

const savedEnv: Record<string, string | undefined> = {};
beforeEach(() => {
  for (const k of ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY']) savedEnv[k] = process.env[k];
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:1';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
  log.length = 0;
  rpcLog.length = 0;
  verifiedUser = null;
  dbDenies = false;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  vi.restoreAllMocks();
});

const ROUTES: Array<[string, Handler, Record<string, string>]> = [
  ['user-assignments', userAssignments, { userId: DOCENTE_A }],
  ['group-assignments', groupAssignments, { groupType: 'school', groupId: String(SCHOOL_A) }],
  ['content-stats', contentStats, { contentType: 'all' }],
  ['audit-log', auditLog, { entityType: 'user', entityId: DOCENTE_A }],
];

describe('every route: anonymous, docente and a flagged-password caller are refused with no learning-path read', () => {
  it.each(ROUTES)('%s: anonymous → 401', async (_n, handler, query) => {
    as(null);
    const res = await call(handler, query);
    expect(res.statusCode).toBe(401);
    expect(lpReads()).toEqual([]);
  });
  it.each(ROUTES)('%s: docente → 403', async (_n, handler, query) => {
    as(DOCENTE_A);
    const res = await call(handler, query);
    expect(res.statusCode).toBe(403);
    expect(lpReads()).toEqual([]);
  });
  it.each(ROUTES)('%s: a consultor who must change their password → 403 PASSWORD_CHANGE_REQUIRED', async (_n, handler, query) => {
    as(FLAGGED);
    const res = await call(handler, query);
    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({ code: 'PASSWORD_CHANGE_REQUIRED' });
    expect(lpReads()).toEqual([]);
    expect(rpcLog).toEqual([]);
  });
});

describe('user-assignments', () => {
  const q = { userId: DOCENTE_A };
  it.each([['admin', ADMIN], ['consultor', CONSULTOR]])('%s: course half AND the person\'s learning paths', async (_l, id) => {
    as(id);
    const res = await call(userAssignments, q);
    expect(res.statusCode, text(res.body)).toBe(200);
    const lp = res.body.assignments.filter((a: Row) => a.type === 'learning_path');
    expect(lp.map((a: Row) => a.contentId)).toEqual([PATH_A]);
    expect(res.body.stats.totalLPs).toBe(1);
    const course = res.body.assignments.find((a: Row) => a.type === 'course');
    expect(course).toMatchObject({ contentId: COURSE, source: 'ruta', sourceLPIds: [PATH_A] });
    expect(text(res.body)).not.toContain(PATH_B);
    expect(rpcLog.map((r) => r.fn)).toContain('auth_lp_report_all');
  });
  it('consultor the database does not admit: course half only, no learning-path query', async () => {
    as(CONSULTOR);
    dbDenies = true;
    const res = await call(userAssignments, q);
    expect(res.statusCode).toBe(200);
    expect(res.body.stats.totalLPs).toBe(0);
    expect(res.body.assignments.every((a: Row) => (a.sourceLPIds as unknown[]).length === 0)).toBe(true);
    expect(lpReads()).toEqual([]);
  });
  it.each([['own school', DIRECTOR_A], ['other school', DIRECTOR_B]])('director (%s): 403, screen not opened to directors', async (_l, id) => {
    as(id);
    const res = await call(userAssignments, q);
    expect(res.statusCode).toBe(403);
    expect(lpReads()).toEqual([]);
  });
});

describe('group-assignments (school A)', () => {
  const q = { groupType: 'school', groupId: String(SCHOOL_A) };
  it.each([['admin', ADMIN], ['consultor of school A', CONSULTOR]])('%s: learning-path half of the school members', async (_l, id) => {
    as(id);
    const res = await call(groupAssignments, q);
    expect(res.statusCode, text(res.body)).toBe(200);
    const lp = res.body.commonAssignments.filter((a: Row) => a.type === 'learning_path');
    expect(lp).toEqual([expect.objectContaining({ contentId: PATH_A, assignedCount: 1 })]);
    expect(res.body.stats.uniqueLPs).toBe(1);
    expect(text(res.body)).not.toContain(PATH_B);
  });
  it('consultor: a school outside the consultor role is still refused', async () => {
    as(CONSULTOR);
    const res = await call(groupAssignments, { groupType: 'school', groupId: String(SCHOOL_B) });
    expect(res.statusCode).toBe(403);
    expect(lpReads()).toEqual([]);
  });
  it('consultor the database does not admit: no learning-path query, no learning-path data', async () => {
    as(CONSULTOR);
    dbDenies = true;
    const res = await call(groupAssignments, q);
    expect(res.statusCode).toBe(200);
    expect(res.body.stats.uniqueLPs).toBe(0);
    expect(lpReads()).toEqual([]);
  });
  it.each([['own school', DIRECTOR_A], ['other school', DIRECTOR_B]])('director (%s): 403', async (_l, id) => {
    as(id);
    expect((await call(groupAssignments, q)).statusCode).toBe(403);
    expect(lpReads()).toEqual([]);
  });
});

describe('content-stats', () => {
  it.each([['admin', ADMIN], ['consultor', CONSULTOR]])('%s: learning-path statistics of every school', async (_l, id) => {
    as(id);
    const res = await call(contentStats, { contentType: 'all' });
    expect(res.statusCode, text(res.body)).toBe(200);
    expect(res.body.learningPaths.map((lp: Row) => lp.id).sort()).toEqual([PATH_A, PATH_B]);
    expect(res.body.courses[0]).toMatchObject({ id: COURSE, learningPathCount: 2, lpAssigneeCount: 2 });
    const only = await call(contentStats, { contentType: 'learning_paths' });
    expect(only.statusCode).toBe(200);
  });
  it('consultor the database does not admit: course figures without any learning-path share; LP listing refused', async () => {
    as(CONSULTOR);
    dbDenies = true;
    const res = await call(contentStats, { contentType: 'all' });
    expect(res.statusCode).toBe(200);
    expect(res.body.learningPaths).toBeUndefined();
    expect(res.body.courses[0]).toMatchObject({ learningPathCount: 0, lpAssigneeCount: 0 });
    expect((await call(contentStats, { contentType: 'learning_paths' })).statusCode).toBe(403);
    expect(lpReads()).toEqual([]);
  });
  it.each([['own school', DIRECTOR_A], ['other school', DIRECTOR_B]])('director (%s): 403', async (_l, id) => {
    as(id);
    expect((await call(contentStats, { contentType: 'all' })).statusCode).toBe(403);
    expect(lpReads()).toEqual([]);
  });
});

describe('audit-log', () => {
  const ofA = { entityType: 'user', entityId: DOCENTE_A, pageSize: '50' };
  it.each([['admin', ADMIN], ['consultor', CONSULTOR], ['director of the person\'s school', DIRECTOR_A]])(
    '%s: the person\'s learning-path rows and course-row provenance', async (_l, id) => {
      as(id);
      const res = await call(auditLog, ofA);
      expect(res.statusCode, text(res.body)).toBe(200);
      expect(res.body.logs.map((l: Row) => l.id).sort()).toEqual(['log-a-course', 'log-a-lp']);
      expect(res.body.logs.find((l: Row) => l.id === 'log-a-course')).toMatchObject({ source_learning_path_id: PATH_A, sourceLPName: 'Ruta Escuela A' });
      expect(res.body.logs.find((l: Row) => l.id === 'log-a-lp')).toMatchObject({ contentTitle: 'Ruta Escuela A' });
    });
  it('director of ANOTHER school: refused before any audit read', async () => {
    as(DIRECTOR_B);
    const res = await call(auditLog, ofA);
    expect(res.statusCode).toBe(403);
    expect(log.filter((e) => e.table === 'assignment_audit_log')).toEqual([]);
  });
  it('director: another school\'s person, a content-wide listing or a workspace is refused', async () => {
    as(DIRECTOR_A);
    for (const query of [
      { entityType: 'user', entityId: DOCENTE_B },
      { contentType: 'learning_path', contentId: PATH_A },
      { contentType: 'course', contentId: COURSE },
      { entityType: 'community_workspace', entityId: 'd0000000-0000-4000-8000-000000000001' },
    ]) {
      const res = await call(auditLog, query);
      expect(res.statusCode, JSON.stringify(query)).toBe(403);
    }
    expect(log.filter((e) => e.table === 'assignment_audit_log')).toEqual([]);
  });
  it('consultor: filtering by a path is allowed and covers every school', async () => {
    as(CONSULTOR);
    const res = await call(auditLog, { contentType: 'learning_path', contentId: PATH_B });
    expect(res.statusCode).toBe(200);
    expect(res.body.logs.map((l: Row) => l.id)).toEqual(['log-b-lp']);
  });
  it('consultor the database does not admit: course rows only, provenance withheld, path filter refused', async () => {
    as(CONSULTOR);
    dbDenies = true;
    const res = await call(auditLog, ofA);
    expect(res.statusCode).toBe(200);
    expect(res.body.logs.map((l: Row) => l.id)).toEqual(['log-a-course']);
    expect(res.body.logs[0]).toMatchObject({ source_learning_path_id: null, sourceLPName: null });
    expect(text(res.body)).not.toContain(PATH_A);
    expect((await call(auditLog, { contentType: 'learning_path', contentId: PATH_A })).statusCode).toBe(403);
  });
});
