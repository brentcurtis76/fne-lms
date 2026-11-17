// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMocks } from 'node-mocks-http';

/**
 * CUR-S6a: three service-role routes without a caller in the app answer admins only.
 *   GET  /api/debug/check-course-images      (had no sign-in check at all)
 *   POST /api/courses/complete               (any signed-in person)
 *   POST /api/badges/award-and-announce      (any signed-in person)
 * Driven through the real handlers and the real requireVerifiedRole; replaced edges:
 * every Supabase client (one recording in-memory fake), the badge/post service and the
 * notification service (no real messages). Synthetic ids only.
 */

const ADMIN = '00000000-0000-4000-8000-0000000006a1';
const DOCENTE = '00000000-0000-4000-8000-0000000006a2';
const COURSE = '00000000-0000-4000-8000-0000000006c1';

const { db, fakeClient, mockAwardBadgeAndPost, mockTriggerNotification } = vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'http://127.0.0.1:9';
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'synthetic-service-key';
  const db = {
    tables: {} as Record<string, Array<Record<string, any>>>,
    tokens: {} as Record<string, string>,
    calls: [] as Array<{ table: string; op: string; columns?: string }>,
    rpcs: [] as string[],
  };
  const run = (table: string, q: any, mode: 'many' | 'single' | 'maybe') => {
    db.calls.push({ table, op: q.op, columns: q.columns });
    const rows = (db.tables[table] ??= []);
    const match = (r: any) => q.filters.every((f: any) => f(r));
    let out: any[] = [];
    if (q.op === 'insert' || q.op === 'upsert') {
      for (const input of [q.payload].flat()) {
        const row = { id: input.id ?? crypto.randomUUID(), ...input };
        rows.push(row);
        out.push(row);
      }
    } else if (q.op === 'update') {
      out = rows.filter(match);
      out.forEach((r) => Object.assign(r, q.payload));
    } else {
      out = rows.filter(match);
      if (q.head) return Promise.resolve({ data: null, error: null, count: out.length });
    }
    if (mode === 'many') return Promise.resolve({ data: out, error: null });
    if (mode === 'single' && out.length !== 1) return Promise.resolve({ data: null, error: { code: 'PGRST116' } });
    return Promise.resolve({ data: out[0] ?? null, error: null });
  };
  const fakeClient: any = {
    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
      getUser: async (token: string) =>
        db.tokens[token] ? { data: { user: { id: db.tokens[token] } }, error: null } : { data: { user: null }, error: { message: 'bad token' } },
    },
    from(table: string) {
      const q: any = { op: 'select', filters: [], head: false };
      const b: any = {
        select: (c?: string, opts?: { head?: boolean }) => ((q.head = q.op === 'select' && !!opts?.head), (q.columns ??= c), b),
        insert: (p: unknown) => ((q.op = 'insert'), (q.payload = p), b),
        upsert: (p: unknown) => ((q.op = 'upsert'), (q.payload = p), b),
        update: (p: unknown) => ((q.op = 'update'), (q.payload = p), b),
        eq: (c: string, v: unknown) => (q.filters.push((r: any) => (r[c] ?? null) === v), b),
        in: (c: string, v: unknown[]) => (q.filters.push((r: any) => v.includes(r[c])), b),
        not: () => b,
        order: () => b,
        limit: () => b,
        single: () => run(table, q, 'single'),
        maybeSingle: () => run(table, q, 'maybe'),
        then: (res: any, rej: any) => run(table, q, 'many').then(res, rej),
      };
      return b;
    },
    async rpc(name: string) {
      db.rpcs.push(name);
      return { data: 'synthetic-badge', error: null };
    },
  };
  return { db, fakeClient, mockAwardBadgeAndPost: vi.fn(), mockTriggerNotification: vi.fn() };
});

vi.mock('@supabase/supabase-js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@supabase/supabase-js')>()),
  createClient: () => fakeClient,
}));
vi.mock('@supabase/auth-helpers-nextjs', () => ({ createPagesServerClient: () => fakeClient, createServerSupabaseClient: () => fakeClient }));
vi.mock('../../lib/services/badgeAndPost', () => ({ awardBadgeAndPost: mockAwardBadgeAndPost }));
vi.mock('../../lib/notificationService', () => ({ default: { triggerNotification: mockTriggerNotification } }));

import checkCourseImages from '../../pages/api/debug/check-course-images';
import completeCourse from '../../pages/api/courses/complete';
import awardAndAnnounce from '../../pages/api/badges/award-and-announce';

type Handler = (req: any, res: any) => Promise<unknown>;
async function send(handler: Handler, method: 'GET' | 'POST', token: string | null, body: unknown = {}) {
  const headers: Record<string, string> = token ? { authorization: `Bearer ${token}` } : {};
  const { req, res } = createMocks({ method, headers, body: body as any });
  await handler(req, res);
  return { status: res._getStatusCode(), body: res._getJSONData() };
}

// The sign-in and role gate's own reads (forced-password flag, role lookup) are not the handler's work.
const isGateRead = (c: { table: string; op: string; columns?: string }) =>
  c.op === 'select' &&
  ((c.table === 'profiles' && c.columns === 'must_change_password') || (c.table === 'user_roles' && c.columns === 'role_type'));
const handlerCalls = () => db.calls.filter((c) => !isGateRead(c));

const ROUTES: Array<[string, Handler, 'GET' | 'POST', unknown, { table: string; columns?: string }]> = [
  ['GET /api/debug/check-course-images', checkCourseImages, 'GET', {}, { table: 'courses', columns: 'id, title, thumbnail_url, created_at' }],
  ['POST /api/courses/complete', completeCourse, 'POST', { course_id: COURSE, completion_type: 'course' }, { table: 'course_completions', columns: 'id' }],
  ['POST /api/badges/award-and-announce', awardAndAnnounce, 'POST', { course_id: COURSE, course_name: 'Curso sintético' }, { table: 'profiles', columns: 'id, first_name, last_name, email' }],
];

beforeEach(() => {
  db.tokens = { 'tok-admin': ADMIN, 'tok-docente': DOCENTE };
  db.calls = [];
  db.rpcs = [];
  db.tables = {
    profiles: [
      { id: ADMIN, first_name: 'Admin', last_name: 'Sintético', email: 'admin@test.local', must_change_password: false },
      { id: DOCENTE, first_name: 'Docente', last_name: 'Sintético', email: 'docente@test.local', must_change_password: false },
    ],
    user_roles: [
      { user_id: ADMIN, role_type: 'admin', is_active: true, community_id: null },
      { user_id: DOCENTE, role_type: 'docente', is_active: true, community_id: null },
    ],
    courses: [{ id: COURSE, title: 'Curso sintético', thumbnail_url: null, created_at: '2026-01-01T00:00:00Z' }],
    course_completions: [],
    lesson_assignments: [],
  };
  mockAwardBadgeAndPost.mockReset().mockResolvedValue(undefined);
  mockTriggerNotification.mockReset().mockResolvedValue(undefined);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('CUR-S6a · admin-only service routes', () => {
  it.each(ROUTES)('%s: no sign-in → 401, and the service client is never asked for data', async (_name, handler, method, body) => {
    const res = await send(handler, method, null, body);
    expect(res.status).toBe(401);
    expect(handlerCalls()).toEqual([]);
    expect(db.rpcs).toEqual([]);
    expect(mockAwardBadgeAndPost).not.toHaveBeenCalled();
    expect(mockTriggerNotification).not.toHaveBeenCalled();
  });

  it.each(ROUTES)('%s: a signed-in non-admin → 403, and the service client is never asked for data', async (_name, handler, method, body) => {
    const res = await send(handler, method, 'tok-docente', body);
    expect(res.status).toBe(403);
    expect(handlerCalls()).toEqual([]);
    expect(db.rpcs).toEqual([]);
    expect(mockAwardBadgeAndPost).not.toHaveBeenCalled();
    expect(mockTriggerNotification).not.toHaveBeenCalled();
    expect(db.tables.course_completions).toEqual([]);
  });

  it.each(ROUTES)('%s: an admin reaches the handler’s own logic', async (_name, handler, method, body, first) => {
    const res = await send(handler, method, 'tok-admin', body);
    expect(res.status).toBe(200);
    expect(handlerCalls()[0]).toMatchObject({ op: 'select', ...first });
  });

  it('admin answers are the same as before: the image listing', async () => {
    const res = await send(checkCourseImages, 'GET', 'tok-admin');
    expect(res.body.stats).toEqual({ total_courses: 1, with_placeholder: 0, with_default: 0, with_null: 1, with_valid_url: 0 });
    expect(res.body.courses).toHaveLength(1);
  });

  it('admin answers are the same as before: completing a course records the admin’s own completion and awards as today', async () => {
    const res = await send(completeCourse, 'POST', 'tok-admin', { course_id: COURSE, completion_type: 'course' });
    expect(res.body).toMatchObject({ success: true, completionType: 'course' });
    expect(db.tables.course_completions.map((c) => [c.user_id, c.completion_type])).toEqual([
      [ADMIN, 'course'],
      [ADMIN, 'aprobado'],
    ]);
    expect(mockAwardBadgeAndPost).toHaveBeenCalledWith(ADMIN, COURSE, 'Curso sintético');
    expect(mockTriggerNotification).toHaveBeenCalledWith('course_completed', expect.objectContaining({ student_id: ADMIN, status: 'aprobado' }));
  });

  it('admin answers are the same as before: award-and-announce awards the admin’s own badge', async () => {
    const res = await send(awardAndAnnounce, 'POST', 'tok-admin', { course_id: COURSE, course_name: 'Curso sintético' });
    expect(res.body).toEqual({ success: true, badge_awarded: true, post_created: false, message: 'Badge awarded and announcement created' });
    expect(db.rpcs).toEqual(['award_course_completion_badge']);
  });
});
