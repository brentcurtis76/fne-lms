// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMocks } from 'node-mocks-http';

/**
 * F4c T-ROUTE: POST /api/assignments/feedback has no caller in the application. It wrote a
 * learner's feedback and grade with full rights for any "teaching eligible" role (every docente,
 * consultor, directivo...), without checking that the caller covers the learner. It answers
 * admins only now. Driven through the real handler and the real requireVerifiedRole; replaced
 * edges: every Supabase client (one recording in-memory fake), the badge/post service and the
 * notification service (no real messages). Synthetic ids only.
 */

const ADMIN = '00000000-0000-4000-8000-0000000007a1';
const DOCENTE = '00000000-0000-4000-8000-0000000007a2';
const CONSULTOR = '00000000-0000-4000-8000-0000000007a3';
const DIRECTIVO = '00000000-0000-4000-8000-0000000007a4';
const LEARNER = '00000000-0000-4000-8000-0000000007b1';
const ASSIGNMENT = '00000000-0000-4000-8000-0000000007d1';

const { db, fakeClient, mockAwardBadgeAndPost, mockTriggerNotification } = vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'http://127.0.0.1:9';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= 'synthetic-anon-key';
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
        in: (c: string, v: readonly unknown[]) => (q.filters.push((r: any) => v.includes(r[c])), b),
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
      return { data: null, error: null };
    },
  };
  return { db, fakeClient, mockAwardBadgeAndPost: vi.fn(), mockTriggerNotification: vi.fn() };
});

vi.mock('@supabase/supabase-js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@supabase/supabase-js')>()),
  createClient: () => fakeClient,
}));
vi.mock('@supabase/auth-helpers-nextjs', () => ({ createPagesServerClient: () => fakeClient, createServerSupabaseClient: () => fakeClient }));
vi.mock('../../../lib/services/badgeAndPost', () => ({ awardBadgeAndPost: mockAwardBadgeAndPost }));
vi.mock('../../../lib/notificationService', () => ({ default: { triggerNotification: mockTriggerNotification } }));

import feedbackHandler from '../../../pages/api/assignments/feedback';

async function post(token: string | null, body: unknown) {
  const headers: Record<string, string> = token ? { authorization: `Bearer ${token}` } : {};
  const { req, res } = createMocks({ method: 'POST', headers, body: body as any });
  await feedbackHandler(req as any, res as any);
  return { status: res._getStatusCode(), body: res._getJSONData() };
}

// The sign-in and role gate's own reads (forced-password flag, role lookup) are not the handler's work.
const isGateRead = (c: { table: string; op: string; columns?: string }) =>
  c.op === 'select' &&
  ((c.table === 'profiles' && c.columns === 'must_change_password') || (c.table === 'user_roles' && c.columns === 'role_type'));
const handlerCalls = () => db.calls.filter((c) => !isGateRead(c));

const grade = (student: string) => ({ assignment_id: ASSIGNMENT, student_id: student, feedback_text: 'Retroalimentación sintética', grade: 7 });

beforeEach(() => {
  db.tokens = { 'tok-admin': ADMIN, 'tok-docente': DOCENTE, 'tok-consultor': CONSULTOR, 'tok-directivo': DIRECTIVO };
  db.calls = [];
  db.rpcs = [];
  db.tables = {
    profiles: [ADMIN, DOCENTE, CONSULTOR, DIRECTIVO, LEARNER].map((id) => ({ id, must_change_password: false })),
    user_roles: [
      { id: 'r1', user_id: ADMIN, role_type: 'admin', is_active: true },
      { id: 'r2', user_id: DOCENTE, role_type: 'docente', is_active: true },
      { id: 'r3', user_id: CONSULTOR, role_type: 'consultor', is_active: true },
      { id: 'r4', user_id: DIRECTIVO, role_type: 'equipo_directivo', is_active: true },
      { id: 'r5', user_id: LEARNER, role_type: 'docente', is_active: true },
    ],
    assignment_feedback: [],
    lesson_assignments: [],
    course_completions: [],
  };
  mockAwardBadgeAndPost.mockReset().mockResolvedValue(undefined);
  mockTriggerNotification.mockReset().mockResolvedValue(undefined);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('F4c T-ROUTE · POST /api/assignments/feedback answers admins only', () => {
  it('no sign-in → 401, and the service client is never asked for data', async () => {
    const res = await post(null, grade(LEARNER));
    expect(res.status).toBe(401);
    expect(handlerCalls()).toEqual([]);
    expect(db.tables.assignment_feedback).toEqual([]);
    expect(mockTriggerNotification).not.toHaveBeenCalled();
  });

  it.each([
    ['a docente grading themself', 'tok-docente', DOCENTE],
    ['a consultor grading a learner', 'tok-consultor', LEARNER],
    ['an equipo_directivo grading a learner', 'tok-directivo', LEARNER],
  ])('%s → 403, and the service client is never asked to read or write', async (_name, token, student) => {
    const res = await post(token, grade(student));
    expect(res.status).toBe(403);
    expect(handlerCalls()).toEqual([]);
    expect(db.tables.assignment_feedback).toEqual([]);
    expect(db.tables.course_completions).toEqual([]);
    expect(db.rpcs).toEqual([]);
    expect(mockTriggerNotification).not.toHaveBeenCalled();
    expect(mockAwardBadgeAndPost).not.toHaveBeenCalled();
  });

  it('an admin reaches the handler’s own logic and gets the same answer as today', async () => {
    const res = await post('tok-admin', grade(LEARNER));
    expect(res.status).toBe(200);
    expect(handlerCalls()[0]).toMatchObject({ table: 'assignment_feedback', op: 'upsert' });
    expect(db.tables.assignment_feedback).toHaveLength(1);
    expect(db.tables.assignment_feedback[0]).toMatchObject({
      assignment_id: ASSIGNMENT,
      student_id: LEARNER,
      instructor_id: ADMIN,
      feedback_text: 'Retroalimentación sintética',
      grade: 7,
      status: 'reviewed',
    });
    expect(res.body).toEqual({
      success: true,
      message: 'Feedback provided successfully',
      feedbackId: db.tables.assignment_feedback[0].id,
    });
    expect(mockTriggerNotification).toHaveBeenCalledWith(
      'assignment_feedback',
      expect.objectContaining({ assignment_id: ASSIGNMENT, student_id: LEARNER, instructor_id: ADMIN })
    );
  });

  it('an admin missing a required field still gets 400', async () => {
    const res = await post('tok-admin', { assignment_id: ASSIGNMENT, student_id: LEARNER });
    expect(res.status).toBe(400);
    expect(db.tables.assignment_feedback).toEqual([]);
  });
});
