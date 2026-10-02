// @vitest-environment node
import { format } from 'node:util';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMocks } from 'node-mocks-http';

/**
 * N2-04: the group and quiz notification writers, driven through the real
 * handlers and the real NotificationService. Replaced edges: every Supabase
 * client (one in-memory fake database), the caller's identity and the e-mail
 * transport. Synthetic ids and text only.
 */

const SCHOOL = 101;
const OTHER_SCHOOL = 202;
const COMMUNITY = 'c0000000-0000-4000-8000-000000000001';
const OTHER_COMMUNITY = 'c0000000-0000-4000-8000-000000000002';
const ASSIGNMENT = 'a0000000-0000-4000-8000-000000000001';
const LESSON = 'e0000000-0000-4000-8000-000000000001';
const COURSE = 'f0000000-0000-4000-8000-000000000001';
const GROUP = 'b0000000-0000-4000-8000-000000000001';
const OTHER_GROUP = 'b0000000-0000-4000-8000-000000000002';
const SUB_PENDING = 'd0000000-0000-4000-8000-000000000001';
const SUB_AUTO = 'd0000000-0000-4000-8000-000000000002';
const SUB_FOREIGN = 'd0000000-0000-4000-8000-000000000003';
const SUB_OWN_REVIEW = 'd0000000-0000-4000-8000-000000000004';
const MISSING = 'd0000000-0000-4000-8000-00000000000f';
const u = (n: number) => `00000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;
const [LEADER, MATE1, MATE2, FOREIGN, CONSULTANT, ADMIN_CONSULTANT, OTHER_CONSULTANT, NO_ROLE_CONSULTANT, TEACHER, REVIEWER_INDIV, REVIEWER_SCHOOL, INACTIVE_REVIEWER, STUDENT, MEMBER3] =
  Array.from({ length: 14 }, (_, i) => u(i + 1));
const SENSITIVE = ['SINTETICO-NOMBRE', 'SINTETICO-TITULO', 'SINTETICO-RESPUESTA', 'SINTETICO-FEEDBACK', 'SINTETICO-RAW-DB', 'qa.local.test'];
const ANY_ID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const { db, fakeClient, mockGetApiUser, mockSendEmail } = vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'http://127.0.0.1:9';
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'synthetic-service-key';
  const db = {
    tables: {} as Record<string, Array<Record<string, any>>>,
    actor: null as string | null,
    faults: {} as Record<string, unknown>,
    failBellFor: new Set<string>(),
    writes: [] as string[],
    beforeSave: null as null | (() => void | Promise<void>),
  };
  const UNIQUE: Record<string, string[]> = { group_assignment_submissions: ['assignment_id', 'user_id'] };
  const splitOr = (expr: string) => expr.match(/[^,(]+(\([^)]*\))?/g) ?? [];
  const orFilter = (expr: string) => {
    const parts = splitOr(expr).map((p) => {
      const [col, op, ...rest] = p.split('.');
      const value = rest.join('.');
      if (op === 'is') return (r: any) => r[col] == null;
      return (r: any) => (op === 'eq' ? String(r[col]) === value : value.slice(1, -1).split(',').includes(String(r[col])));
    });
    return (r: any) => parts.some((f) => f(r));
  };
  // A fault is an error result, a thrown Error, or a function choosing one per call.
  const run = (table: string, q: any, mode: 'many' | 'single' | 'maybe') => {
    // The forced-password gate's own flag read (requireVerifiedCaller, SM-B015) is not
    // the profile lookup a fault targets: it always answers.
    const gateRead = table === 'profiles' && q.op === 'select' && q.columns === 'must_change_password';
    const planned = gateRead ? undefined : db.faults[`${table}.${q.op}`];
    const fault = typeof planned === 'function' ? planned() : planned;
    if (fault instanceof Error) return Promise.reject(fault);
    if (fault) return Promise.resolve({ data: null, error: fault, count: null });
    const rows = (db.tables[table] ??= []);
    const match = (r: any) => q.filters.every((f: any) => f(r));
    let out: any[] = [];
    if (q.op !== 'select') db.writes.push(`${table}.${q.op}`);
    if (q.op === 'insert' || q.op === 'upsert') {
      const unique = UNIQUE[table];
      if (q.op === 'insert' && unique && [q.payload].flat().some((p: any) => rows.some((r) => unique.every((k) => r[k] === p[k])))) {
        return Promise.resolve({ data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } });
      }
      for (const input of [q.payload].flat()) {
        const row = { id: input.id ?? crypto.randomUUID(), ...input };
        if (table === 'user_notifications') {
          if (db.failBellFor.has(row.user_id)) return Promise.resolve({ data: null, error: { code: 'XX000', message: `SINTETICO-RAW-DB ${row.user_id}@qa.local.test` } });
          if (rows.some((r) => r.idempotency_key === row.idempotency_key)) {
            return Promise.resolve({ data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "unique_notification_idempotency_key"' } });
          }
        }
        const keys: string[] = q.onConflict?.split(',') ?? [];
        const existing = keys.length ? rows.find((r) => keys.every((k) => r[k] === row[k])) : undefined;
        if (existing) Object.assign(existing, input), out.push(existing);
        else rows.push(row), out.push(row);
      }
    } else if (q.op === 'update') {
      out = rows.filter(match);
      out.forEach((r) => Object.assign(r, q.payload));
    } else if (q.op === 'delete') {
      out = rows.filter(match);
      db.tables[table] = rows.filter((r) => !match(r));
    } else {
      out = rows.filter(match);
      if (q.head) return Promise.resolve({ data: null, error: null, count: out.length });
    }
    if (mode === 'many') return Promise.resolve({ data: out, error: null });
    if (mode === 'single' && out.length !== 1) return Promise.resolve({ data: null, error: { code: 'PGRST116' } });
    return Promise.resolve({ data: out[0] ?? null, error: null });
  };
  // save_group_submission as its migration defines it: in one step every member's row is
  // written, or on a forbidden actor, a conflict with the caller's read or a failed insert
  // nothing is. `beforeSave` lets a test act (or wait) between the route's read and this step.
  const saveGroupSubmission = (a: any) => {
    const rows = (db.tables.group_assignment_submissions ??= []);
    const members = (db.tables.group_assignment_members ?? [])
      .filter((m) => m.group_id === a.p_group_id && m.assignment_id === a.p_assignment_id)
      .map((m) => m.user_id);
    const group = (db.tables.group_assignment_groups ?? []).some((g) => g.id === a.p_group_id && g.assignment_id === a.p_assignment_id);
    if (!group || !members.includes(a.p_actor_id)) return { data: { outcome: 'forbidden' }, error: null };
    const at = (v: unknown) => (v == null ? null : Date.parse(String(v)));
    const own = rows.filter((r) => r.assignment_id === a.p_assignment_id && members.includes(r.user_id));
    const locked = rows.filter((r) => r.assignment_id === a.p_assignment_id && (r.group_id === a.p_group_id || members.includes(r.user_id)));
    const asRead =
      own.map((r) => r.user_id).sort().join() === Object.keys(a.p_expected).sort().join() &&
      own.every((r) => at(r.submitted_at) === at(a.p_expected[r.user_id]));
    const advances = locked.every((r) => r.submitted_at == null || at(r.submitted_at)! < at(a.p_submitted_at)!);
    if (!asRead || !advances) return { data: { outcome: 'conflict' }, error: null };
    const missing = members.filter((id) => !own.some((r) => r.user_id === id));
    if (missing.length > 0 && db.faults['group_assignment_submissions.insert']) {
      return { data: null, error: db.faults['group_assignment_submissions.insert'] };
    }
    const values = { group_id: a.p_group_id, content: a.p_content, file_url: a.p_file_url, status: 'submitted', submitted_at: a.p_submitted_at };
    own.forEach((r) => Object.assign(r, values));
    missing.forEach((user_id) => rows.push({ id: crypto.randomUUID(), assignment_id: a.p_assignment_id, user_id, ...values }));
    return { data: { outcome: 'saved', submitted_at: String(a.p_submitted_at).replace('Z', '+00:00') }, error: null };
  };
  // The caller's identity carries a sentinel e-mail and user-written metadata, which no log may print.
  const identity = () => ({ id: db.actor, email: 'alumno@qa.local.test', user_metadata: { role: 'SINTETICO-NOMBRE' } });
  const fakeClient: any = {
    auth: {
      getSession: async () => ({ data: { session: db.actor ? { user: identity(), access_token: 'synthetic-token' } : null }, error: null }),
      getUser: async (token: string) =>
        db.actor && token === 'synthetic-token' ? { data: { user: identity() }, error: null } : { data: { user: null }, error: { message: 'bad token' } },
    },
    from(table: string) {
      const q: any = { op: 'select', filters: [], head: false };
      const b: any = {
        select: (c?: string, opts?: { head?: boolean }) => ((q.head = q.op === 'select' && !!opts?.head), (q.columns ??= c), b),
        insert: (p: unknown) => ((q.op = 'insert'), (q.payload = p), b),
        upsert: (p: unknown, o?: { onConflict?: string }) => ((q.op = 'upsert'), (q.payload = p), (q.onConflict = o?.onConflict), b),
        update: (p: unknown) => ((q.op = 'update'), (q.payload = p), b),
        delete: () => ((q.op = 'delete'), b),
        eq: (c: string, v: unknown) => (q.filters.push((r: any) => r[c] === v), b),
        neq: (c: string, v: unknown) => (q.filters.push((r: any) => r[c] !== v), b),
        in: (c: string, v: unknown[]) => (q.filters.push((r: any) => v.includes(r[c])), b),
        is: (c: string, v: null) => (q.filters.push((r: any) => r[c] == v), b),
        or: (expr: string) => (q.filters.push(orFilter(expr)), b),
        order: () => b,
        limit: () => b,
        single: () => run(table, q, 'single'),
        maybeSingle: () => run(table, q, 'maybe'),
        then: (res: any, rej: any) => run(table, q, 'many').then(res, rej),
      };
      return b;
    },
    async rpc(name: string, args: unknown) {
      if (name !== 'save_group_submission') throw new Error(`unexpected rpc ${name}`);
      db.writes.push('group_assignment_submissions.save');
      await db.beforeSave?.();
      return saveGroupSubmission(args);
    },
  };
  return { db, fakeClient, mockGetApiUser: vi.fn(), mockSendEmail: vi.fn() };
});

vi.mock('@supabase/supabase-js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@supabase/supabase-js')>()),
  createClient: () => fakeClient,
}));
vi.mock('@supabase/auth-helpers-nextjs', () => ({ createPagesServerClient: () => fakeClient, createServerSupabaseClient: () => fakeClient }));
vi.mock('../../lib/api-auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/api-auth')>()),
  getApiUser: mockGetApiUser,
  createServiceRoleClient: () => fakeClient,
}));
vi.mock('../../lib/email/notifications', () => ({ sendNotificationEmail: mockSendEmail }));

import createGroup from '../../pages/api/assignments/create-group';
import addClassmates from '../../pages/api/assignments/add-classmates';
import submitGroup from '../../pages/api/assignments/submit-group';
import submitReview from '../../pages/api/quiz-reviews/submit-review';
import notifyPending from '../../pages/api/quiz-reviews/notify-pending';
import eligibleClassmates from '../../pages/api/assignments/eligible-classmates';
import groupMembers from '../../pages/api/assignments/group-members';
import userGroup from '../../pages/api/assignments/user-group';
import quizReview from '../../pages/api/quiz-reviews/[id]';
import ensureWorkspace from '../../pages/api/community/ensure-workspace';
import myRoles from '../../pages/api/auth/my-roles';
import adminOverview from '../../pages/api/assignments/admin-overview';
import pendingReviews from '../../pages/api/quiz-reviews/pending';
import {
  submitQuiz,
  getQuizSubmission,
  getStudentQuizSubmissions,
  getPendingQuizReviews,
  submitQuizReview,
  getQuizStatistics,
} from '../../lib/services/quizSubmissions';
import NotificationService from '../../lib/notificationService';

type Handler = (req: any, res: any) => Promise<unknown>;
type Request = { method?: 'GET' | 'POST' | 'DELETE'; body?: unknown; query?: Record<string, string>; headers?: Record<string, string> };
async function send(handler: Handler, actor: string | null, { method = 'POST', body, query, headers = {} }: Request) {
  db.actor = actor;
  const { req, res } = createMocks({ method, body: body as any, query, headers });
  await handler(req, res);
  const out = { status: res._getStatusCode(), body: res._getJSONData() };
  responses.push(out);
  return out;
}
const call = (handler: Handler, actor: string | null, body: unknown, headers: Record<string, string> = {}) => send(handler, actor, { body, headers });
const pending = (actor: string | null, body: unknown) => call(notifyPending, actor, body);
const review = (actor: string | null, body: unknown) => call(submitReview, actor, body, { authorization: 'Bearer synthetic-token' });
const bells = (event?: string) => (db.tables.user_notifications ?? []).filter((n) => !event || n.title === TITLES[event]);
const TITLES: Record<string, string> = {
  group_invitation: 'Te agregaron a un grupo',
  group_assignment_submitted: 'Nueva tarea grupal entregada',
  quiz_review_pending: 'Quiz pendiente de revisión',
  quiz_reviewed: 'Quiz revisado',
};
const recipients = (event: string) => bells(event).map((n) => n.user_id).sort();
const legacyWrites = () => db.writes.filter((w) => w.startsWith('notifications.'));
let logs: string[] = [];
let responses: Array<{ status: number; body: any }> = [];

function seed() {
  const role = (user_id: string, role_type: string, extra: Record<string, unknown> = {}) => ({ user_id, role_type, is_active: true, school_id: SCHOOL, community_id: COMMUNITY, generation_id: null, ...extra });
  const ca = (consultant_id: string, extra: Record<string, unknown>) => ({ consultant_id, student_id: null, school_id: null, generation_id: null, community_id: null, is_active: true, assignment_data: {}, ...extra });
  db.tables = {
    user_roles: [
      ...[LEADER, MATE1, MATE2, MEMBER3, STUDENT].map((id) => role(id, 'docente')),
      role(FOREIGN, 'docente', { school_id: OTHER_SCHOOL, community_id: OTHER_COMMUNITY }),
      ...[CONSULTANT, OTHER_CONSULTANT, REVIEWER_INDIV, REVIEWER_SCHOOL, INACTIVE_REVIEWER, TEACHER].map((id) => role(id, 'consultor', { school_id: null, community_id: null })),
      role(ADMIN_CONSULTANT, 'admin', { school_id: null, community_id: null }),
      role(NO_ROLE_CONSULTANT, 'docente', { school_id: OTHER_SCHOOL, community_id: null }),
    ],
    profiles: [LEADER, MATE1, MATE2, STUDENT].map((id) => ({ id, first_name: 'SINTETICO-NOMBRE', last_name: 'Uno', must_change_password: false })),
    blocks: [{ id: ASSIGNMENT, lesson_id: LESSON, payload: { title: 'SINTETICO-TITULO' } }],
    lessons: [{ id: LESSON, course_id: COURSE }],
    course_enrollments: [MATE1, MATE2, MEMBER3, LEADER].map((user_id) => ({ user_id, course_id: COURSE, status: 'active' })),
    course_assignments: [{ course_id: COURSE, teacher_id: TEACHER }],
    group_assignment_groups: [
      { id: GROUP, assignment_id: ASSIGNMENT, community_id: COMMUNITY, school_id: SCHOOL, is_consultant_managed: false, name: 'Grupo de SINTETICO-NOMBRE' },
      { id: OTHER_GROUP, assignment_id: ASSIGNMENT, community_id: COMMUNITY, school_id: SCHOOL, is_consultant_managed: false, name: 'Otro' },
    ],
    group_assignment_members: [
      { group_id: GROUP, assignment_id: ASSIGNMENT, user_id: MATE1, role: 'leader' },
      { group_id: OTHER_GROUP, assignment_id: ASSIGNMENT, user_id: MEMBER3, role: 'leader' },
    ],
    consultant_assignments: [
      ca(CONSULTANT, { community_id: COMMUNITY }),
      ca(ADMIN_CONSULTANT, { community_id: COMMUNITY }),
      ca(OTHER_CONSULTANT, { community_id: OTHER_COMMUNITY }),
      ca(NO_ROLE_CONSULTANT, { community_id: COMMUNITY, student_id: STUDENT }),
      ca(INACTIVE_REVIEWER, { community_id: COMMUNITY, student_id: STUDENT, is_active: false }),
      ca(REVIEWER_INDIV, { student_id: STUDENT }),
      ca(REVIEWER_SCHOOL, { school_id: SCHOOL, assignment_data: { assignment_scope: 'school' } }),
    ],
    quiz_submissions: [
      { id: SUB_PENDING, student_id: STUDENT, lesson_id: LESSON, course_id: COURSE, manual_gradable_points: 5, review_status: 'pending', answers: { q1: 'SINTETICO-RESPUESTA' } },
      { id: SUB_AUTO, student_id: STUDENT, lesson_id: LESSON, course_id: COURSE, manual_gradable_points: 0, review_status: 'pending', answers: {} },
      { id: SUB_FOREIGN, student_id: MATE1, lesson_id: LESSON, course_id: COURSE, manual_gradable_points: 5, review_status: 'pending', answers: {} },
      { id: SUB_OWN_REVIEW, student_id: REVIEWER_INDIV, lesson_id: LESSON, course_id: COURSE, manual_gradable_points: 5, review_status: 'pending', answers: {} },
    ],
  };
}

beforeEach(() => {
  seed();
  db.faults = {};
  db.beforeSave = null;
  db.failBellFor = new Set();
  db.writes = [];
  logs = [];
  responses = [];
  mockGetApiUser.mockReset().mockImplementation(async () => (db.actor ? { user: { id: db.actor }, error: null } : { user: null, error: new Error('no session') }));
  mockSendEmail.mockReset().mockResolvedValue({ sent: true, status: 'provider_accepted' });
  for (const level of ['log', 'warn', 'error'] as const) {
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => void logs.push(format(...args)));
  }
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  // Every bell, e-mail and log line of every test: fixed copy, safe links, no PII, and no id in a log line.
  for (const n of bells()) {
    expect(Object.values(TITLES)).toContain(n.title);
    expect(n.category).toBe('assignments');
    expect(n.idempotency_key).toMatch(/^notif-[0-9a-f]{64}$/);
    expect(n.related_url).toMatch(/^\/(mi-aprendizaje(\/tareas)?|admin\/assignment-(overview|review\/[0-9a-f-]{36})|quiz-reviews\/[0-9a-f-]{36}|student\/lesson\/[0-9a-f-]{36})$/);
    expect(`${n.title} ${n.description} ${n.related_url}`).not.toMatch(new RegExp([...SENSITIVE, STUDENT, 'aprobado'].join('|')));
  }
  const mail = JSON.stringify(mockSendEmail.mock.calls.map(([, data]) => data));
  for (const text of [mail, logs.join('\n')]) for (const s of SENSITIVE) expect(text).not.toContain(s);
  expect(logs.filter((line) => ANY_ID.test(line))).toEqual([]);
  expect(legacyWrites()).toEqual([]);
  // Every refusal and failure body: no sentinel, and a server failure is one fixed message.
  for (const { status, body } of responses.filter((r) => r.status >= 400)) {
    for (const s of SENSITIVE) expect(JSON.stringify(body)).not.toContain(s);
    if (status >= 500) expect(Object.keys(body)).toEqual(['error']);
  }
});

describe('D1 · group invitation and submission bells', () => {
  it('create-group: each persisted classmate gets one invitation bell linking to their tasks; the creator none', async () => {
    const res = await call(createGroup, LEADER, { assignmentId: ASSIGNMENT, classmateIds: [MATE2] });
    expect(res.status).toBe(200);
    expect(res.body.notificationsDelivered).toBe(true);
    expect(recipients('group_invitation')).toEqual([MATE2]);
    expect(bells()[0].related_url).toBe('/mi-aprendizaje/tareas');
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
  });

  it('add-classmates: the added classmate is invited to the existing group', async () => {
    const res = await call(addClassmates, MATE1, { assignmentId: ASSIGNMENT, groupId: GROUP, classmateIds: [MATE2] });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ count: 1, notificationsDelivered: true });
    expect(recipients('group_invitation')).toEqual([MATE2]);
  });

  it('submit-group: only active consultor/admin consultants of the group community are notified, with a page their role opens', async () => {
    const res = await call(submitGroup, MATE1, { assignmentId: ASSIGNMENT, groupId: GROUP, submission: { content: 'SINTETICO-RESPUESTA' } });
    expect(res.status).toBe(200);
    expect(res.body.notificationsDelivered).toBe(true);
    expect(recipients('group_assignment_submitted')).toEqual([CONSULTANT, ADMIN_CONSULTANT].sort());
    const url = Object.fromEntries(bells().map((n) => [n.user_id, n.related_url]));
    expect(url[CONSULTANT]).toBe('/admin/assignment-overview');
    expect(url[ADMIN_CONSULTANT]).toBe(`/admin/assignment-review/${ASSIGNMENT}`);
  });
});

describe('D2 · quiz pending review and reviewed bells', () => {
  it('notify-pending: the reviewers whose assignment scope covers the student are notified, not the course teacher', async () => {
    const res = await pending(STUDENT, { submission_id: SUB_PENDING });
    expect(res).toEqual({ status: 200, body: { success: true, notified: 2 } });
    expect(recipients('quiz_review_pending')).toEqual([REVIEWER_INDIV, REVIEWER_SCHOOL].sort());
    expect(bells().every((n) => n.related_url === `/quiz-reviews/${SUB_PENDING}`)).toBe(true);
  });

  it('an auto-graded submission creates no pending notice', async () => {
    expect(await pending(STUDENT, { submission_id: SUB_AUTO })).toEqual({ status: 200, body: { success: true, notified: 0 } });
    expect(bells()).toEqual([]);
  });

  it('submit-review: the review is saved and the student gets a quiz_reviewed bell to the lesson, without outcome or feedback', async () => {
    const res = await review(REVIEWER_INDIV, { submissionId: SUB_PENDING, reviewStatus: 'pass', generalFeedback: 'SINTETICO-FEEDBACK' });
    expect(res).toEqual({ status: 200, body: { success: true, notificationsDelivered: true } });
    expect(db.tables.quiz_submissions[0]).toMatchObject({ review_status: 'pass', graded_by: REVIEWER_INDIV });
    expect(recipients('quiz_reviewed')).toEqual([STUDENT]);
    expect(bells()[0].related_url).toBe(`/student/lesson/${LESSON}`);
  });

  it('submitQuiz asks the server with only the submission id, and only when manual grading is pending', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const browser = (manual: number) => ({
      auth: { getSession: async () => ({ data: { session: { access_token: 'synthetic-token' } } }) },
      rpc: async () => ({ data: SUB_PENDING, error: null }),
      from: (table: string) => {
        db.writes.push(`${table}.browser`);
        const b: any = { select: () => b, eq: () => b, single: async () => ({ data: { id: SUB_PENDING, manual_gradable_points: manual }, error: null }) };
        return b;
      },
    });
    expect((await submitQuiz(browser(0), LESSON, 'b1', STUDENT, COURSE, {}, {})).error).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect((await submitQuiz(browser(3), LESSON, 'b1', STUDENT, COURSE, {}, {})).error).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith('/api/quiz-reviews/notify-pending', expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer synthetic-token' }),
      body: JSON.stringify({ submission_id: SUB_PENDING }),
    }));
    expect(db.writes.filter((w) => w !== 'quiz_submissions.browser')).toEqual([]);
  });
});

describe('D3 · anonymous, foreign, forged and invalid requests', () => {
  it('notify-pending: 401 anonymous, 400 malformed id, 404 missing, 403 another student’s submission', async () => {
    expect((await pending(null, { submission_id: SUB_PENDING })).status).toBe(401);
    expect((await pending(STUDENT, { submission_id: 'SUB-1 OR 1=1' })).status).toBe(400);
    expect((await pending(STUDENT, {})).status).toBe(400);
    expect((await pending(STUDENT, { submission_id: MISSING })).status).toBe(404);
    expect((await pending(STUDENT, { submission_id: SUB_FOREIGN })).status).toBe(403);
    expect(bells()).toEqual([]);
  });

  it('notify-pending ignores client-chosen recipients and copy', async () => {
    await pending(STUDENT, { submission_id: SUB_PENDING, recipient_ids: [FOREIGN], title: 'forjado', related_url: 'https://evil.example' });
    expect(recipients('quiz_review_pending')).toEqual([REVIEWER_INDIV, REVIEWER_SCHOOL].sort());
  });

  it('group routes: anonymous, foreign-school classmate, non-member and classmate of another group get no bell', async () => {
    expect((await call(createGroup, null, { assignmentId: ASSIGNMENT, classmateIds: [MATE2] })).status).toBe(401);
    expect((await call(createGroup, LEADER, { assignmentId: ASSIGNMENT, classmateIds: [FOREIGN] })).status).toBe(400);
    expect((await call(addClassmates, LEADER, { assignmentId: ASSIGNMENT, groupId: GROUP, classmateIds: [MATE2] })).status).toBe(403);
    expect((await call(addClassmates, MATE1, { assignmentId: ASSIGNMENT, groupId: GROUP, classmateIds: [MEMBER3] })).status).toBe(400);
    expect((await call(submitGroup, MATE2, { assignmentId: ASSIGNMENT, groupId: GROUP, submission: {} })).status).toBe(403);
    expect((await call(submitGroup, null, { assignmentId: ASSIGNMENT, groupId: GROUP, submission: {} })).status).toBe(401);
    expect(bells()).toEqual([]);
  });

  it('submit-review: a non-reviewer gets 403 and a missing submission 404, with no bell', async () => {
    expect((await review(STUDENT, { submissionId: SUB_PENDING, reviewStatus: 'pass' })).status).toBe(403);
    expect((await review(REVIEWER_INDIV, { submissionId: MISSING, reviewStatus: 'pass' })).status).toBe(404);
    expect(bells()).toEqual([]);
  });
});

describe('D4 · retries, duplicates, self and partial failure', () => {
  it('create-group with a duplicate and the creator in the list invites each other member once', async () => {
    await call(createGroup, LEADER, { assignmentId: ASSIGNMENT, classmateIds: [MATE2, MATE2, LEADER] });
    expect(recipients('group_invitation')).toEqual([MATE2]);
  });

  it('a failed bell leaves the group saved; the same add-classmates retry fills it without duplicates or new members', async () => {
    db.tables.group_assignment_members = [];
    db.failBellFor.add(MATE2);
    const first = await call(createGroup, LEADER, { assignmentId: ASSIGNMENT, classmateIds: [MATE1, MATE2] });
    expect(first.status).toBe(200);
    expect(first.body.notificationsDelivered).toBe(false);
    expect(recipients('group_invitation')).toEqual([MATE1]);
    const members = db.tables.group_assignment_members.length;
    expect(members).toBe(3);

    db.failBellFor.clear();
    const retry = await call(addClassmates, LEADER, { assignmentId: ASSIGNMENT, groupId: first.body.group.id, classmateIds: [MATE1, MATE2] });
    expect(retry.status).toBe(200);
    expect(retry.body).toMatchObject({ count: 0, notificationsDelivered: true });
    expect(db.tables.group_assignment_members).toHaveLength(members);
    expect(recipients('group_invitation')).toEqual([MATE1, MATE2].sort());
  });

  it('submit-group, notify-pending and submit-review repeated create one bell per record and recipient', async () => {
    for (let i = 0; i < 2; i++) {
      await call(submitGroup, MATE1, { assignmentId: ASSIGNMENT, groupId: GROUP, submission: {} });
      await pending(STUDENT, { submission_id: SUB_PENDING });
    }
    await review(REVIEWER_INDIV, { submissionId: SUB_PENDING, reviewStatus: 'needs_review' });
    await review(REVIEWER_INDIV, { submissionId: SUB_PENDING, reviewStatus: 'needs_review' });
    expect(recipients('group_assignment_submitted')).toEqual([CONSULTANT, ADMIN_CONSULTANT].sort());
    expect(recipients('quiz_review_pending')).toEqual([REVIEWER_INDIV, REVIEWER_SCHOOL].sort());
    expect(recipients('quiz_reviewed')).toEqual([STUDENT]);
  });

  it('a partial pending-review failure is reported and a retry fills only the missing bell', async () => {
    db.failBellFor.add(REVIEWER_SCHOOL);
    expect((await pending(STUDENT, { submission_id: SUB_PENDING })).status).toBe(500);
    expect(recipients('quiz_review_pending')).toEqual([REVIEWER_INDIV]);
    db.failBellFor.clear();
    expect((await pending(STUDENT, { submission_id: SUB_PENDING })).status).toBe(200);
    expect(recipients('quiz_review_pending')).toEqual([REVIEWER_INDIV, REVIEWER_SCHOOL].sort());
  });

  it('a reviewer reviewing their own submission gets no bell', async () => {
    const res = await review(REVIEWER_INDIV, { submissionId: SUB_OWN_REVIEW, reviewStatus: 'pass' });
    expect(res.body).toEqual({ success: true, notificationsDelivered: true });
    expect(bells()).toEqual([]);
  });
});

describe('D5 · lookup and service failures', () => {
  const dbError = { code: 'XX000', message: 'SINTETICO-RAW-DB permission denied' };

  it.each(['quiz_submissions.select', 'consultant_assignments.select', 'user_roles.select'])(
    'notify-pending fails closed with 500 and no bell when %s fails',
    async (fault) => {
      db.faults[fault] = dbError;
      expect((await pending(STUDENT, { submission_id: SUB_PENDING })).status).toBe(500);
      expect(bells()).toEqual([]);
    }
  );

  it('submit-group: a consultant lookup failure keeps the saved submission and reports the missing bells', async () => {
    db.faults['consultant_assignments.select'] = dbError;
    const res = await call(submitGroup, MATE1, { assignmentId: ASSIGNMENT, groupId: GROUP, submission: { content: 'x' } });
    expect(res).toEqual({ status: 200, body: { success: true, notificationsDelivered: false } });
    expect(db.tables.group_assignment_submissions).toHaveLength(1);
    expect(bells()).toEqual([]);
  });

  it('submit-review: a notification service failure keeps the saved review, reports it, and logs no raw error', async () => {
    db.failBellFor.add(STUDENT);
    const res = await review(REVIEWER_INDIV, { submissionId: SUB_PENDING, reviewStatus: 'pass', generalFeedback: 'SINTETICO-FEEDBACK' });
    expect(res).toEqual({ status: 200, body: { success: true, notificationsDelivered: false } });
    expect(db.tables.quiz_submissions[0].review_status).toBe('pass');
    expect(logs).toContain('[API submit-review] review notification not created');
  });

  it('create-group: a notification failure for every classmate still returns the saved group', async () => {
    db.tables.group_assignment_members = [];
    db.failBellFor = new Set([MATE1, MATE2]);
    const res = await call(createGroup, LEADER, { assignmentId: ASSIGNMENT, classmateIds: [MATE1, MATE2] });
    expect(res.status).toBe(200);
    expect(res.body.group.id).toBeTruthy();
    expect(res.body.notificationsDelivered).toBe(false);
    expect(logs.some((l) => l.startsWith('[create-group] invitation notifications not created'))).toBe(true);
  });
});

describe('R0-F1 · a genuine group resubmission is a new occurrence, an identical retry is not', () => {
  const T1 = '2026-09-28T10:00:00.000Z';
  const submitAt = (at: string, content: string, file_url: string | null = null) => {
    vi.setSystemTime(new Date(at));
    return call(submitGroup, MATE1, { assignmentId: ASSIGNMENT, groupId: GROUP, submission: { content, file_url } });
  };
  const saved = () => db.tables.group_assignment_submissions[0];
  const saves = () => db.writes.filter((w) => w.startsWith('group_assignment_submissions.')).length;
  beforeEach(() => void vi.useFakeTimers({ toFake: ['Date'] }));

  it('D1/R0-F1: each edited version notifies the consultants once; repeating a version does not', async () => {
    await submitAt(T1, 'v1');
    expect(bells('group_assignment_submitted')).toHaveLength(2);
    await submitAt('2026-09-28T11:00:00.000Z', 'v2');
    expect(saved()).toMatchObject({ content: 'v2', submitted_at: '2026-09-28T11:00:00.000Z' });
    expect(bells('group_assignment_submitted')).toHaveLength(4);
    await submitAt('2026-09-28T12:00:00.000Z', 'v2', 'https://files.example/entrega-2.pdf');
    expect(bells('group_assignment_submitted')).toHaveLength(6);
    await submitAt('2026-09-28T13:00:00.000Z', 'v2', 'https://files.example/entrega-2.pdf');
    expect(bells('group_assignment_submitted')).toHaveLength(6);
    expect(recipients('group_assignment_submitted')).toEqual([...Array(3).fill(CONSULTANT), ...Array(3).fill(ADMIN_CONSULTANT)].sort());
  });

  it('D4/R0-F1: an identical retry keeps the saved submission and its bell, whatever timestamp format the database returns', async () => {
    await submitAt(T1, 'v1');
    saved().submitted_at = '2026-09-28T10:00:00+00:00';
    const retry = await submitAt('2026-09-28T10:05:00.000Z', 'v1');
    expect(retry).toEqual({ status: 200, body: { success: true, notificationsDelivered: true } });
    expect(saves()).toBe(1);
    expect(saved().submitted_at).toBe('2026-09-28T10:00:00+00:00');
    expect(bells('group_assignment_submitted')).toHaveLength(2);
  });

  it('D4/R0-F1: after a failed bell the identical retry fills only the missing one', async () => {
    db.failBellFor.add(CONSULTANT);
    expect((await submitAt(T1, 'v1')).body.notificationsDelivered).toBe(false);
    expect(recipients('group_assignment_submitted')).toEqual([ADMIN_CONSULTANT]);
    db.failBellFor.clear();
    expect((await submitAt('2026-09-28T10:05:00.000Z', 'v1')).body.notificationsDelivered).toBe(true);
    expect(recipients('group_assignment_submitted')).toEqual([CONSULTANT, ADMIN_CONSULTANT].sort());
    expect(saved().submitted_at).toBe(T1);
  });

  it('R0-F1: the same content after grading, or with a member who has no saved row, is a new submission', async () => {
    await submitAt(T1, 'v1');
    saved().status = 'graded';
    await submitAt('2026-09-28T11:00:00.000Z', 'v1');
    expect(saved()).toMatchObject({ status: 'submitted', submitted_at: '2026-09-28T11:00:00.000Z' });
    expect(bells('group_assignment_submitted')).toHaveLength(4);
    db.tables.group_assignment_members.push({ group_id: GROUP, assignment_id: ASSIGNMENT, user_id: MATE2, role: 'member' });
    await submitAt('2026-09-28T12:00:00.000Z', 'v1');
    expect(db.tables.group_assignment_submissions).toHaveLength(2);
    expect(bells('group_assignment_submitted')).toHaveLength(6);
  });

  it('D5/R0-F1: a failed lookup of the saved submission saves nothing and notifies nobody', async () => {
    db.faults['group_assignment_submissions.select'] = { code: 'XX000', message: 'SINTETICO-RAW-DB timeout' };
    expect((await submitAt(T1, 'v1')).status).toBe(500);
    expect(saves()).toBe(0);
    expect(bells()).toEqual([]);
  });
});

describe('R0-F2 · a changed quiz review is a new occurrence, repeating the saved review is not', () => {
  const reviewAt = (at: string, reviewStatus: string, generalFeedback?: string, actor = REVIEWER_INDIV) => {
    vi.setSystemTime(new Date(at));
    return review(actor, { submissionId: SUB_PENDING, reviewStatus, generalFeedback });
  };
  const saved = () => db.tables.quiz_submissions[0];
  const updates = () => db.writes.filter((w) => w === 'quiz_submissions.update').length;
  beforeEach(() => void vi.useFakeTimers({ toFake: ['Date'] }));

  it('D2/R0-F2: pass → needs_review → pass gives the student three distinct bells', async () => {
    await reviewAt('2026-09-28T10:00:00.000Z', 'pass');
    await reviewAt('2026-09-28T11:00:00.000Z', 'needs_review');
    await reviewAt('2026-09-28T12:00:00.000Z', 'pass');
    expect(saved()).toMatchObject({ review_status: 'pass', graded_at: '2026-09-28T12:00:00.000Z' });
    expect(recipients('quiz_reviewed')).toEqual([STUDENT, STUDENT, STUDENT]);
    expect(new Set(bells('quiz_reviewed').map((n) => n.idempotency_key)).size).toBe(3);
  });

  it('D4/R0-F2: saving the same review again changes nothing and adds no bell, whatever timestamp format the database returns', async () => {
    await reviewAt('2026-09-28T10:00:00.000Z', 'pass', 'SINTETICO-FEEDBACK');
    saved().graded_at = '2026-09-28T10:00:00+00:00';
    const retry = await reviewAt('2026-09-28T10:05:00.000Z', 'pass', 'SINTETICO-FEEDBACK');
    expect(retry).toEqual({ status: 200, body: { success: true, notificationsDelivered: true } });
    expect(updates()).toBe(1);
    expect(saved().graded_at).toBe('2026-09-28T10:00:00+00:00');
    expect(recipients('quiz_reviewed')).toEqual([STUDENT]);
  });

  it('D4/R0-F2: after a failed bell the identical retry fills it once', async () => {
    db.failBellFor.add(STUDENT);
    expect((await reviewAt('2026-09-28T10:00:00.000Z', 'pass')).body.notificationsDelivered).toBe(false);
    db.failBellFor.clear();
    expect((await reviewAt('2026-09-28T10:05:00.000Z', 'pass')).body.notificationsDelivered).toBe(true);
    expect((await reviewAt('2026-09-28T10:06:00.000Z', 'pass')).body.notificationsDelivered).toBe(true);
    expect(recipients('quiz_reviewed')).toEqual([STUDENT]);
    expect(saved().graded_at).toBe('2026-09-28T10:00:00.000Z');
  });

  it('R0-F2: changed feedback or another reviewer saving the same outcome is a new review', async () => {
    await reviewAt('2026-09-28T10:00:00.000Z', 'pass', 'SINTETICO-FEEDBACK');
    await reviewAt('2026-09-28T11:00:00.000Z', 'pass', 'SINTETICO-FEEDBACK 2');
    await reviewAt('2026-09-28T12:00:00.000Z', 'pass', 'SINTETICO-FEEDBACK 2', REVIEWER_SCHOOL);
    expect(saved()).toMatchObject({ graded_by: REVIEWER_SCHOOL, graded_at: '2026-09-28T12:00:00.000Z' });
    expect(recipients('quiz_reviewed')).toEqual([STUDENT, STUDENT, STUDENT]);
  });
});

const keyFor = (event: string, record: Record<string, string>, user: string) =>
  NotificationService.generateIdempotencyKey(event, NotificationService.resolveOccurrence(event, record), user);

/** Holds every group save until two requests have read the saved rows and reached it. */
function overlapSaves() {
  let release!: () => void;
  const bothRead = new Promise<void>((resolve) => (release = resolve));
  let arrived = 0;
  db.beforeSave = () => {
    if (++arrived === 2) release();
    return bothRead;
  };
}

describe('R1-F1 · every changed group submission is its own occurrence, whatever the clock', () => {
  const T1 = '2026-09-28T10:00:00.000Z';
  const submitAt = (content: string, at = T1) => {
    vi.setSystemTime(new Date(at));
    return call(submitGroup, MATE1, { assignmentId: ASSIGNMENT, groupId: GROUP, submission: { content } });
  };
  const saved = () => db.tables.group_assignment_submissions[0];
  const keys = () => bells('group_assignment_submitted').map((n) => n.idempotency_key).sort();
  const keysAt = (...stamps: string[]) =>
    stamps.flatMap((submitted_at) => [CONSULTANT, ADMIN_CONSULTANT].map((id) => keyFor('group_assignment_submitted', { group_id: GROUP, submitted_at }, id))).sort();
  beforeEach(() => void vi.useFakeTimers({ toFake: ['Date'] }));

  it('D1/R1-F1: v1 and an edited v2 in the same millisecond each notify the consultants once, keyed to the saved submitted_at', async () => {
    await submitAt('v1');
    const v1At = saved().submitted_at;
    expect((await submitAt('v2')).status).toBe(200);
    const v2At = saved().submitted_at;
    expect(saved().content).toBe('v2');
    expect(Date.parse(v2At)).toBeGreaterThan(Date.parse(v1At));
    expect(keys()).toEqual(keysAt(v1At, v2At));
  });

  it('D4/R1-F1: in that same millisecond, the identical retry after a failed bell fills only the missing one', async () => {
    await submitAt('v1');
    db.failBellFor.add(CONSULTANT);
    expect((await submitAt('v2')).body.notificationsDelivered).toBe(false);
    const v2At = saved().submitted_at;
    db.failBellFor.clear();
    expect(await submitAt('v2')).toEqual({ status: 200, body: { success: true, notificationsDelivered: true } });
    expect(saved().submitted_at).toBe(v2At);
    expect(keys()).toEqual(keysAt(T1, v2At));
  });

  it('D4/R1-F1: after the clock moves backwards an edit still gets a later submitted_at and its own bells', async () => {
    await submitAt('v1');
    await submitAt('v2', '2026-09-28T09:00:00.000Z');
    expect(Date.parse(saved().submitted_at)).toBeGreaterThan(Date.parse(T1));
    expect(keys()).toEqual(keysAt(T1, saved().submitted_at));
  });

  it('D4/R1-F1: of two overlapping edits in one millisecond, one is saved and notified and the other gets 409 and changes nothing', async () => {
    await submitAt('v1');
    overlapSaves();
    const [a, b] = await Promise.all([submitAt('v2a'), submitAt('v2b')]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(saved().content).toBe(a.status === 200 ? 'v2a' : 'v2b');
    expect(keys()).toEqual(keysAt(T1, saved().submitted_at));
  });

  it('D4/R1-F1: of two overlapping first submissions, one is saved and notified and the other gets 409', async () => {
    overlapSaves();
    const [a, b] = await Promise.all([submitAt('v1a'), submitAt('v1b')]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(db.tables.group_assignment_submissions).toHaveLength(1);
    expect(saved().content).toBe(a.status === 200 ? 'v1a' : 'v1b');
    expect(keys()).toEqual(keysAt(T1));
  });
});

describe('R2-F1 · a group save writes every member or nothing', () => {
  const T1 = '2026-09-28T10:00:00.000Z';
  const CLAIM_AT = '2026-09-28T10:00:00.001Z';
  const submitAt = (content: string, at = T1) => {
    vi.setSystemTime(new Date(at));
    return call(submitGroup, MATE1, { assignmentId: ASSIGNMENT, groupId: GROUP, submission: { content } });
  };
  const rowOf = (user: string) => db.tables.group_assignment_submissions.find((r) => r.user_id === user);
  const both = () => [MATE1, MATE2].map((id) => [rowOf(id)?.content, rowOf(id)?.submitted_at]);
  const keys = () => bells('group_assignment_submitted').map((n) => n.idempotency_key).sort();
  const keysAt = (...stamps: string[]) =>
    stamps.flatMap((submitted_at) => [CONSULTANT, ADMIN_CONSULTANT].map((id) => keyFor('group_assignment_submitted', { group_id: GROUP, submitted_at }, id))).sort();
  // v1 is saved for MATE1 alone; MATE2 then joins the group and has no saved row.
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    await submitAt('v1');
    db.tables.group_assignment_members.push({ group_id: GROUP, assignment_id: ASSIGNMENT, user_id: MATE2, role: 'member' });
  });

  it('D1/D4/R2-F1: in the same millisecond the edit saves both members at one new submitted_at, and its retry fills only the failed bell', async () => {
    db.failBellFor.add(CONSULTANT);
    expect(await submitAt('v2')).toEqual({ status: 200, body: { success: true, notificationsDelivered: false } });
    const v2At = rowOf(MATE1)!.submitted_at;
    expect(Date.parse(v2At)).toBeGreaterThan(Date.parse(T1));
    expect(both()).toEqual([['v2', v2At], ['v2', v2At]]);
    db.failBellFor.clear();
    expect(await submitAt('v2')).toEqual({ status: 200, body: { success: true, notificationsDelivered: true } });
    expect(both()).toEqual([['v2', v2At], ['v2', v2At]]);
    expect(keys()).toEqual(keysAt(T1, v2At));
    expect(db.writes.filter((w) => w.startsWith('group_assignment_submissions.'))).toHaveLength(2);
  });

  it.each([
    ['a failed insert', { code: 'XX000', message: 'SINTETICO-RAW-DB insert failed' }, 500],
    ['a competing claim at insert', { code: '23505', message: 'SINTETICO-RAW-DB duplicate key' }, 409],
  ])('D4/D5/R2-F1: %s of the added member leaves every row as it was and sends no bell; the same request then saves once', async (_case, fault, status) => {
    db.faults['group_assignment_submissions.insert'] = fault;
    expect((await submitAt('v2')).status).toBe(status);
    expect(both()).toEqual([['v1', T1], [undefined, undefined]]);
    expect(keys()).toEqual(keysAt(T1));
    delete db.faults['group_assignment_submissions.insert'];
    expect((await submitAt('v2')).status).toBe(200);
    const v2At = rowOf(MATE1)!.submitted_at;
    expect(both()).toEqual([['v2', v2At], ['v2', v2At]]);
    expect(keys()).toEqual(keysAt(T1, v2At));
  });

  it('D4/R2-F1: a claim of the added member’s row after the read gets 409 and changes nothing; a later save, with the clock behind, supersedes it once', async () => {
    db.beforeSave = () => {
      db.beforeSave = null;
      db.tables.group_assignment_submissions.push({ assignment_id: ASSIGNMENT, group_id: GROUP, user_id: MATE2, content: 'otra', status: 'submitted', submitted_at: CLAIM_AT });
    };
    expect((await submitAt('v2')).status).toBe(409);
    expect(both()).toEqual([['v1', T1], ['otra', CLAIM_AT]]);
    expect(keys()).toEqual(keysAt(T1));
    expect((await submitAt('v2', '2026-09-28T09:00:00.000Z')).status).toBe(200);
    const v2At = rowOf(MATE1)!.submitted_at;
    expect(Date.parse(v2At)).toBeGreaterThan(Date.parse(CLAIM_AT));
    expect(both()).toEqual([['v2', v2At], ['v2', v2At]]);
    expect(keys()).toEqual(keysAt(T1, v2At));
  });

  it('D4/R2-F1: of two overlapping edits, one saves both members and is notified, the other gets 409', async () => {
    overlapSaves();
    const [a, b] = await Promise.all([submitAt('v2a'), submitAt('v2b')]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const at = rowOf(MATE1)!.submitted_at;
    const won = a.status === 200 ? 'v2a' : 'v2b';
    expect(both()).toEqual([[won, at], [won, at]]);
    expect(keys()).toEqual(keysAt(T1, at));
  });

  it('D3/R2-F1: a member removed from the group between the check and the save gets 403 and nothing is written', async () => {
    db.beforeSave = () => {
      db.tables.group_assignment_members = db.tables.group_assignment_members.filter((m) => m.user_id !== MATE1);
    };
    expect((await submitAt('v2')).status).toBe(403);
    expect(both()).toEqual([['v1', T1], [undefined, undefined]]);
    expect(keys()).toEqual(keysAt(T1));
  });
});

describe('R1-F2 · every changed quiz review is its own occurrence, whatever the clock', () => {
  const T1 = '2026-09-28T10:00:00.000Z';
  const reviewAt = (reviewStatus: string, at = T1) => {
    vi.setSystemTime(new Date(at));
    return review(REVIEWER_INDIV, { submissionId: SUB_PENDING, reviewStatus });
  };
  const saved = () => db.tables.quiz_submissions[0];
  const keys = () => bells('quiz_reviewed').map((n) => n.idempotency_key).sort();
  const keysAt = (...stamps: string[]) =>
    stamps.map((graded_at) => keyFor('quiz_reviewed', { submission_id: SUB_PENDING, graded_at }, STUDENT)).sort();
  beforeEach(() => void vi.useFakeTimers({ toFake: ['Date'] }));

  it('D2/R1-F2: pass → needs_review → pass in one millisecond gives the student three bells, keyed to each saved graded_at', async () => {
    const stamps: string[] = [];
    for (const status of ['pass', 'needs_review', 'pass']) {
      expect((await reviewAt(status)).status).toBe(200);
      stamps.push(saved().graded_at);
    }
    expect(new Set(stamps).size).toBe(3);
    expect(stamps.map(Date.parse)).toEqual([...stamps.map(Date.parse)].sort((x, y) => x - y));
    expect(keys()).toEqual(keysAt(...stamps));
  });

  it('D4/R1-F2: in that same millisecond, the identical retry after a failed bell fills it once', async () => {
    await reviewAt('pass');
    db.failBellFor.add(STUDENT);
    expect((await reviewAt('needs_review')).body.notificationsDelivered).toBe(false);
    const secondAt = saved().graded_at;
    db.failBellFor.clear();
    expect(await reviewAt('needs_review')).toEqual({ status: 200, body: { success: true, notificationsDelivered: true } });
    expect(saved().graded_at).toBe(secondAt);
    expect(keys()).toEqual(keysAt(T1, secondAt));
  });

  it('D4/R1-F2: after the clock moves backwards a changed review still gets a later graded_at and its own bell', async () => {
    await reviewAt('pass');
    await reviewAt('needs_review', '2026-09-28T09:00:00.000Z');
    expect(Date.parse(saved().graded_at)).toBeGreaterThan(Date.parse(T1));
    expect(keys()).toEqual(keysAt(T1, saved().graded_at));
  });

  it('D4/R1-F2: of two overlapping different reviews in one millisecond, one is saved and notified and the other gets 409', async () => {
    await reviewAt('pass');
    const [a, b] = await Promise.all([reviewAt('needs_review'), review(REVIEWER_SCHOOL, { submissionId: SUB_PENDING, reviewStatus: 'pass' })]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(saved().graded_by).toBe(a.status === 200 ? REVIEWER_INDIV : REVIEWER_SCHOOL);
    expect(keys()).toEqual(keysAt(T1, saved().graded_at));
  });
});

describe('R3-F1 · logs keep fixed labels, counts and database codes, never ids, records or raw errors', () => {
  // Every kind of sentinel, in each part of an error a raw log line would print.
  const leaky = {
    code: 'XX000',
    message: `SINTETICO-RAW-DB ${STUDENT} alumno@qa.local.test`,
    details: `Failing row contains (${MATE2}, SINTETICO-RESPUESTA, SINTETICO-FEEDBACK)`,
    hint: `SINTETICO-NOMBRE ${LEADER}`,
  };
  const thrown = () => Object.assign(new Error(`SINTETICO-RAW-DB ${STUDENT} alumno@qa.local.test`), { details: leaky.details });
  const CODE = "{ code: 'XX000' }";
  const EMPTY_GROUP = 'b0000000-0000-4000-8000-000000000003';
  const NO_ROLE = u(15);
  const fail = (key: string, fault: unknown = leaky) => () => void (db.faults[key] = fault);
  const failCall = (key: string, n: number) => () => {
    let calls = 0;
    db.faults[key] = () => (++calls === n ? leaky : undefined);
  };
  const emptyGroup = () => void db.tables.group_assignment_groups.push({ id: EMPTY_GROUP, assignment_id: ASSIGNMENT, community_id: COMMUNITY, school_id: SCHOOL, is_consultant_managed: false, name: 'Vacío' });
  const create = (classmateIds = [MATE2]) => ({ assignmentId: ASSIGNMENT, classmateIds });
  const add = (classmateIds = [MATE2], groupId = GROUP) => ({ assignmentId: ASSIGNMENT, groupId, classmateIds });
  const submission = { assignmentId: ASSIGNMENT, groupId: GROUP, submission: { content: 'SINTETICO-RESPUESTA' } };
  const reviewed = { submissionId: SUB_PENDING, reviewStatus: 'pass', generalFeedback: 'SINTETICO-FEEDBACK' };
  const none = () => {};

  it.each<[string, Handler, string, unknown, () => void, number, string]>([
    ['create-group, role lookup error', createGroup, LEADER, create(), fail('user_roles.select'), 403, `[create-group] Role check failed: ${CODE}`],
    ['create-group, requester without a school', createGroup, CONSULTANT, create(), none, 403, '[create-group] No school_id found in roles: { roles: 1 }'],
    ['create-group, community lookup error', createGroup, LEADER, create(), fail('growth_communities.select'), 500, `[create-group] Community lookup failed: ${CODE}`],
    ['create-group, classmate role lookup error', createGroup, LEADER, create(), failCall('user_roles.select', 2), 500, `[create-group] Classmate role lookup failed: ${CODE}`],
    ['create-group, assignment lookup error', createGroup, LEADER, create(), fail('blocks.select'), 404, `[create-group] Assignment block not found: ${CODE}`],
    ['create-group, lesson lookup error', createGroup, LEADER, create(), fail('lessons.select'), 404, `[create-group] Lesson/Course not found: ${CODE}`],
    ['create-group, requester already in a group', createGroup, MATE1, create(), none, 400, '[create-group] User already in group'],
    ['create-group, classmate of another school', createGroup, LEADER, create([FOREIGN]), none, 400, '[create-group] Invalid school for classmates: { count: 1 }'],
    ['create-group, classmate in another group', createGroup, LEADER, create([MEMBER3]), none, 400, '[create-group] Classmates already in groups: { count: 1 }'],
    ['create-group, group insert error', createGroup, LEADER, create(), fail('group_assignment_groups.insert'), 500, `[create-group] Error creating group: ${CODE}`],
    ['create-group, member insert error', createGroup, LEADER, create(), fail('group_assignment_members.insert'), 500, `[create-group] Error adding members: ${CODE}`],
    ['create-group, thrown exception', createGroup, LEADER, create(), fail('profiles.select', thrown()), 500, '[create-group] Unhandled error: {}'],
    ['add-classmates, requester role lookup error', addClassmates, MATE1, add(), fail('user_roles.select'), 403, `[add-classmates] No active roles found for requester: ${CODE}`],
    ['add-classmates, requester without a school', addClassmates, CONSULTANT, add(), none, 403, '[add-classmates] Requester has no role in the group school'],
    ['add-classmates, assignment lookup error', addClassmates, MATE1, add(), fail('blocks.select'), 404, `[add-classmates] Assignment block not found: ${CODE}`],
    ['add-classmates, lesson lookup error', addClassmates, MATE1, add(), fail('lessons.select'), 404, `[add-classmates] Lesson not found: ${CODE}`],
    ['add-classmates, requester without course access', addClassmates, STUDENT, add([MATE2], EMPTY_GROUP), emptyGroup, 403, '[add-classmates] Requester has no access to course - checked: enrollments, course_assignments, consultant_assignments'],
    ['add-classmates, classmate role lookup error', addClassmates, MATE1, add(), failCall('user_roles.select', 2), 500, `[add-classmates] Error validating classmate roles: ${CODE}`],
    ['add-classmates, classmate without an active role', addClassmates, MATE1, add([MATE2, NO_ROLE]), none, 400, '[add-classmates] VALIDATION FAILED - Roles Check: { requested: 2, found: 1, missing: 1 }'],
    ['add-classmates, enrollment lookup error', addClassmates, MATE1, add(), fail('course_enrollments.select'), 500, `[add-classmates] Error validating course enrollments: ${CODE}`],
    ['add-classmates, classmate not enrolled', addClassmates, MATE1, add([STUDENT]), none, 400, '[add-classmates] VALIDATION FAILED - Enrollment Check: { requested: 1, enrolled: 0, notEnrolled: 1 }'],
    ['add-classmates, existing member lookup error', addClassmates, MATE1, add(), failCall('group_assignment_members.select', 2), 500, `Error checking existing members: ${CODE}`],
    ['add-classmates, member insert error', addClassmates, MATE1, add(), fail('group_assignment_members.insert'), 500, `Error inserting members: ${CODE}`],
    ['add-classmates, thrown exception', addClassmates, MATE1, add(), fail('blocks.select', thrown()), 500, 'Error in add-classmates endpoint: {}'],
    ['submit-group, membership lookup error', submitGroup, MATE1, submission, fail('group_assignment_members.select'), 500, `[submit-group] Error checking membership: ${CODE}`],
    ['submit-group, member list error', submitGroup, MATE1, submission, failCall('group_assignment_members.select', 2), 500, `[submit-group] Error fetching members: ${CODE}`],
    ['submit-group, thrown exception', submitGroup, MATE1, submission, fail('group_assignment_submissions.select', thrown()), 500, '[submit-group] Unexpected error: {}'],
    ['submit-review, update error', submitReview, REVIEWER_INDIV, reviewed, fail('quiz_submissions.update'), 500, `Error updating submission: ${CODE}`],
    ['submit-review, thrown exception', submitReview, REVIEWER_INDIV, reviewed, fail('quiz_submissions.select', thrown()), 500, 'Submit review API error: {}'],
    ['notify-pending, thrown exception', notifyPending, STUDENT, { submission_id: SUB_PENDING }, fail('quiz_submissions.select', thrown()), 500, '[quiz-reviews/notify-pending] unexpected error'],
  ])('D3/D5/R3-F1: %s is denied or fails closed and logs only its label', async (_case, handler, actor, body, arrange, status, line) => {
    arrange();
    const res = await call(handler, actor, body, handler === submitReview ? { authorization: 'Bearer synthetic-token' } : {});
    expect(res.status).toBe(status);
    expect(logs).toContain(line);
    expect(bells()).toEqual([]);
  });

  it('D1/D2/D5/R3-F1: successful group add, create and submit and quiz notice and review log labels and counts only', async () => {
    expect((await call(addClassmates, MATE1, add())).status).toBe(200);
    expect((await call(createGroup, LEADER, create([]))).status).toBe(200);
    expect((await call(submitGroup, MATE1, submission)).status).toBe(200);
    expect((await pending(STUDENT, { submission_id: SUB_PENDING })).status).toBe(200);
    expect((await review(REVIEWER_INDIV, reviewed)).status).toBe(200);
    expect(logs).toEqual(expect.arrayContaining([
      '[add-classmates] Classmates requested: 1',
      '[add-classmates] requester has 1 active roles in scope',
      '[create-group] Payload: { classmates: 0 }',
      '[create-group] Requester scope resolved: { community: false }',
      '[create-group] Adding members: { count: 1 }',
      '[create-group] Group created',
      '[API submit-review] Saving review',
    ]));
    expect(logs.filter((line) => ANY_ID.test(line))).toEqual([]);
  });

  it.each<[string, () => Promise<{ error: unknown }>, string]>([
    ['submitQuiz', () => submitQuiz({ rpc: async () => ({ data: null, error: leaky }) }, LESSON, 'b1', STUDENT, COURSE, { q1: 'SINTETICO-RESPUESTA' }, {}), `Error submitting quiz: ${CODE}`],
    ['getQuizSubmission', () => (fail('quiz_submissions.select')(), getQuizSubmission(fakeClient, SUB_PENDING)), `Error fetching quiz submission: ${CODE}`],
    ['getStudentQuizSubmissions', () => (fail('quiz_submissions.select')(), getStudentQuizSubmissions(fakeClient, STUDENT, LESSON)), `Error fetching student quiz submissions: ${CODE}`],
    ['getPendingQuizReviews', () => (fail('pending_quiz_reviews.select')(), getPendingQuizReviews(fakeClient, REVIEWER_SCHOOL, 'consultor')), `Error fetching pending quiz reviews: ${CODE}`],
    ['submitQuizReview', () => submitQuizReview({ rpc: async () => ({ data: null, error: leaky }) }, SUB_PENDING, REVIEWER_INDIV, 'pass', 'SINTETICO-FEEDBACK', {}), `Error submitting quiz review: ${CODE}`],
    ['getQuizStatistics', () => (fail('quiz_submissions.select')(), getQuizStatistics(fakeClient, LESSON, 'b1')), `Error fetching quiz statistics: ${CODE}`],
  ])('D5/R3-F1: quiz service %s returns the failure and logs only its database code', async (_case, run, line) => {
    expect((await run()).error).toBeTruthy();
    expect(logs).toContain(line);
  });

  it('D2/D5/R3-F1: a consultant’s pending quiz list logs role, scope and counts, and falls back without logging the raw error', async () => {
    db.tables.pending_quiz_reviews = [{ submission_id: SUB_PENDING, student_id: STUDENT, student_name: 'SINTETICO-NOMBRE', answers: { q1: 'SINTETICO-RESPUESTA' } }];
    const listed = await getPendingQuizReviews(fakeClient, REVIEWER_SCHOOL, 'consultor');
    expect(listed.data).toHaveLength(1);
    expect(logs).toEqual(expect.arrayContaining([
      '[getPendingQuizReviews] Called with userRole: consultor',
      '[getPendingQuizReviews] Processing assignment scope: school',
      '[getPendingQuizReviews] Filtered reviews: 1',
    ]));
    fail('consultant_assignments.select')();
    expect((await getPendingQuizReviews(fakeClient, REVIEWER_SCHOOL, 'consultor')).data).toHaveLength(1);
    expect(logs).toContain(`Error fetching consultant assignments: ${CODE}`);
  });
});

describe('R4-F1/F2/F3 · the group and quiz journey’s auth and sibling routes log and answer without identities, rows or raw errors', () => {
  const leaky = {
    code: 'XX000',
    message: `SINTETICO-RAW-DB ${STUDENT} alumno@qa.local.test`,
    details: `Failing row contains (${MATE2}, SINTETICO-RESPUESTA, SINTETICO-FEEDBACK)`,
    hint: `SINTETICO-NOMBRE ${LEADER}`,
  };
  const leakyAuth = { code: 'bad_jwt', status: 403, message: `SINTETICO-RAW-DB ${STUDENT} alumno@qa.local.test` };
  const thrown = () => Object.assign(new Error(`SINTETICO-RAW-DB ${STUDENT} alumno@qa.local.test`), { details: leaky.details });
  const CODE = "{ code: 'XX000' }";
  const ORPHAN_GROUP = 'b0000000-0000-4000-8000-000000000009';
  const fail = (key: string, fault: unknown = leaky) => () => void (db.faults[key] = fault);
  const failCall = (key: string, n: number) => () => {
    let calls = 0;
    db.faults[key] = () => (++calls === n ? leaky : undefined);
  };
  const badToken = () => void vi.spyOn(fakeClient.auth, 'getUser').mockResolvedValue({ data: { user: null }, error: leakyAuth });
  const mate2InGroup = () => void db.tables.group_assignment_members.push({ group_id: GROUP, assignment_id: ASSIGNMENT, user_id: MATE2, role: 'member' });
  const community = () => void (db.tables.growth_communities = [{ id: COMMUNITY, name: 'Comunidad SINTETICO-NOMBRE' }]);
  const bearer = { authorization: 'Bearer synthetic-token' };
  const get = (query: Record<string, string>, headers: Record<string, string> = {}): Request => ({ method: 'GET', query, headers });
  const create = { assignmentId: ASSIGNMENT, classmateIds: [MATE2] };
  const reviewed = { submissionId: SUB_PENDING, reviewStatus: 'pass', generalFeedback: 'SINTETICO-FEEDBACK' };
  const none = () => {};

  beforeEach(() => {
    // Rows the routes read and return carry sentinel e-mails; no log may print them.
    db.tables.profiles.forEach((p) => (p.email = 'companero@qa.local.test'));
  });

  it('D2/D5/R4-F1: notify-pending through the real getApiUser, Bearer and cookie, logs no id, e-mail or metadata', async () => {
    const actual = await vi.importActual<typeof import('../../lib/api-auth')>('../../lib/api-auth');
    mockGetApiUser.mockImplementation(actual.getApiUser);
    expect(await call(notifyPending, STUDENT, { submission_id: SUB_PENDING }, bearer)).toEqual({ status: 200, body: { success: true, notified: 2 } });
    expect(await pending(STUDENT, { submission_id: SUB_PENDING })).toEqual({ status: 200, body: { success: true, notified: 2 } });
    expect(recipients('quiz_review_pending')).toEqual([REVIEWER_INDIV, REVIEWER_SCHOOL].sort());
    expect((await pending(null, { submission_id: SUB_PENDING })).status).toBe(401);
    badToken();
    expect((await call(notifyPending, STUDENT, { submission_id: SUB_PENDING }, bearer)).status).toBe(401);
    expect(logs).toEqual(expect.arrayContaining([
      '[API Auth] User authenticated via Bearer token',
      '[API Auth] User authenticated via session: { metadataRoles: 1 }',
      "[API Auth] Bearer token validation failed: { code: 'bad_jwt', status: 403 }",
    ]));
  });

  it('D1/D2/D5/R4-F2: the group modal, quiz review, workspace and role routes log labels and counts only on success', async () => {
    community();
    expect(await send(userGroup, LEADER, get({ assignmentId: ASSIGNMENT }))).toEqual({ status: 200, body: { group: null } });
    const first = await send(eligibleClassmates, LEADER, get({ assignmentId: ASSIGNMENT }));
    expect(first.body.classmates.map((c: { id: string }) => c.id)).toEqual([MATE2]);
    expect((await send(userGroup, MATE1, get({ assignmentId: ASSIGNMENT }))).body.group.id).toBe(GROUP);
    expect((await send(groupMembers, MATE1, get({ groupId: GROUP, assignmentId: ASSIGNMENT }))).body.members).toHaveLength(1);
    const invite = await send(eligibleClassmates, MATE1, get({ assignmentId: ASSIGNMENT, groupId: GROUP }));
    expect(invite.body.classmates.map((c: { id: string }) => c.id).sort()).toEqual([LEADER, MATE2].sort());
    mate2InGroup();
    expect(await send(groupMembers, MATE1, { method: 'DELETE', body: { groupId: GROUP, assignmentId: ASSIGNMENT, memberId: MATE2 } })).toEqual({ status: 200, body: { success: true } });
    expect((await send(quizReview, REVIEWER_SCHOOL, get({ id: SUB_PENDING }, bearer))).body.data.id).toBe(SUB_PENDING);
    expect((await send(ensureWorkspace, MATE1, { body: { communityId: COMMUNITY } })).status).toBe(201);
    expect((await send(ensureWorkspace, MATE1, { body: { communityId: COMMUNITY } })).body.created).toBe(false);
    expect((await send(myRoles, STUDENT, get({}))).body.highestRole).toBe('docente');
    expect((await send(myRoles, REVIEWER_SCHOOL, get({}, bearer))).body.highestRole).toBe('consultor');
    expect(logs).toEqual(expect.arrayContaining([
      '[user-group] REQUEST',
      '[user-group] membership query result: { found: false }',
      '[user-group] Found group',
      '[eligible-classmates] REQUEST: { group: false }',
      '[eligible-classmates] STEP 1 - Membership check: { found: true }',
      '[eligible-classmates] requester has 1 active roles, selected role: docente',
      '[eligible-classmates] requester effective community resolved: { community: true }',
      '[eligible-classmates] STEP 8 - Eligible classmates after filtering: 2',
      '[eligible-classmates] eligible 2 (filtered from 3 same-school enrolled classmates)',
      '[group-members] Request received',
      '[group-members] Successfully fetched 1 members',
      '[group-members] DELETE request',
      '[group-members] Member removed successfully',
      '[API quiz-review] Role: consultor',
      '[API Auth] User authenticated via session: { metadataRoles: 1 }',
      '[API Auth] User authenticated via Bearer token',
      "[my-roles API] Returning roles: { roleCount: 1, roles: [ 'consultor' ], highestRole: 'consultor' }",
    ]));
  });

  it.each<[string, Handler, string | null, Request, () => void, number, string | null]>([
    ['eligible-classmates, anonymous', eligibleClassmates, null, get({ assignmentId: ASSIGNMENT }), none, 401, null],
    ['eligible-classmates, not a member of the group', eligibleClassmates, LEADER, get({ assignmentId: ASSIGNMENT, groupId: GROUP }), none, 403, "[eligible-classmates] ABORT - User not member: { code: 'PGRST116' }"],
    ['eligible-classmates, membership lookup error', eligibleClassmates, MATE1, get({ assignmentId: ASSIGNMENT, groupId: GROUP }), fail('group_assignment_members.select'), 403, `[eligible-classmates] ABORT - User not member: ${CODE}`],
    ['eligible-classmates, role lookup error', eligibleClassmates, LEADER, get({ assignmentId: ASSIGNMENT }), fail('user_roles.select'), 403, `[eligible-classmates] No active roles found for requester: ${CODE}`],
    ['eligible-classmates, assignment lookup error', eligibleClassmates, LEADER, get({ assignmentId: ASSIGNMENT }), fail('blocks.select'), 404, `[eligible-classmates] Assignment block not found or has no lesson: ${CODE}`],
    ['eligible-classmates, enrollment lookup error', eligibleClassmates, LEADER, get({ assignmentId: ASSIGNMENT }), fail('course_enrollments.select'), 500, `[eligible-classmates] Error fetching course enrollments: ${CODE}`],
    ['eligible-classmates, classmate role lookup error', eligibleClassmates, LEADER, get({ assignmentId: ASSIGNMENT }), failCall('user_roles.select', 2), 500, `[eligible-classmates] Error fetching classmate roles: ${CODE}`],
    ['eligible-classmates, profile lookup error', eligibleClassmates, LEADER, get({ assignmentId: ASSIGNMENT }), fail('profiles.select'), 500, `[eligible-classmates] STEP 8 - Error fetching profiles: ${CODE}`],
    ['eligible-classmates, thrown exception', eligibleClassmates, LEADER, get({ assignmentId: ASSIGNMENT }), fail('blocks.select', thrown()), 500, 'Error in eligible-classmates endpoint: {}'],
    ['group-members, anonymous', groupMembers, null, get({ groupId: GROUP, assignmentId: ASSIGNMENT }), none, 401, null],
    ['group-members, not a member', groupMembers, LEADER, get({ groupId: GROUP, assignmentId: ASSIGNMENT }), none, 403, '[group-members] Requester is not a member of the group'],
    ['group-members, membership lookup error', groupMembers, MATE1, get({ groupId: GROUP, assignmentId: ASSIGNMENT }), fail('group_assignment_members.select'), 500, `[group-members] Error checking membership: ${CODE}`],
    ['group-members, profile lookup error', groupMembers, MATE1, get({ groupId: GROUP, assignmentId: ASSIGNMENT }), fail('profiles.select'), 500, `[group-members] Error fetching profiles: ${CODE}`],
    ['group-members, thrown exception', groupMembers, MATE1, get({ groupId: GROUP, assignmentId: ASSIGNMENT }), fail('group_assignment_members.select', thrown()), 500, '[group-members] Unexpected error: {}'],
    ['group-members removal, not a member', groupMembers, LEADER, { method: 'DELETE', body: { groupId: GROUP, assignmentId: ASSIGNMENT, memberId: MATE1 } }, none, 403, '[group-members] DELETE request'],
    ['group-members removal, member not in the group', groupMembers, MATE1, { method: 'DELETE', body: { groupId: GROUP, assignmentId: ASSIGNMENT, memberId: MATE2 } }, none, 404, '[group-members] DELETE request'],
    ['group-members removal, delete error', groupMembers, MATE1, { method: 'DELETE', body: { groupId: GROUP, assignmentId: ASSIGNMENT, memberId: MATE2 } }, () => (mate2InGroup(), fail('group_assignment_members.delete')()), 500, `[group-members] Error deleting member: ${CODE}`],
    ['user-group, anonymous', userGroup, null, get({ assignmentId: ASSIGNMENT }), none, 401, null],
    ['user-group, membership lookup error', userGroup, MATE1, get({ assignmentId: ASSIGNMENT }), fail('group_assignment_members.select'), 500, `[user-group] Error checking membership: ${CODE}`],
    ['user-group, thrown exception', userGroup, MATE1, get({ assignmentId: ASSIGNMENT }), fail('group_assignment_members.select', thrown()), 500, '[user-group] Uncaught error: {}'],
    ['quiz review, anonymous', quizReview, null, get({ id: SUB_PENDING }), none, 401, null],
    ['quiz review, invalid token', quizReview, REVIEWER_SCHOOL, get({ id: SUB_PENDING }, bearer), badToken, 401, null],
    ['quiz review, a student', quizReview, MATE1, get({ id: SUB_PENDING }, bearer), none, 403, null],
    ['quiz review, a consultant without access to the student', quizReview, OTHER_CONSULTANT, get({ id: SUB_PENDING }, bearer), none, 403, '[API quiz-review] Role: consultor'],
    ['quiz review, role lookup error', quizReview, REVIEWER_SCHOOL, get({ id: SUB_PENDING }, bearer), fail('user_roles.select'), 500, `Error fetching user roles: ${CODE}`],
    ['quiz review, submission lookup error', quizReview, REVIEWER_SCHOOL, get({ id: SUB_PENDING }, bearer), fail('quiz_submissions.select'), 500, `Error fetching quiz submission: ${CODE}`],
    ['quiz review, assignment lookup error', quizReview, REVIEWER_SCHOOL, get({ id: SUB_PENDING }, bearer), fail('consultant_assignments.select'), 500, `Error fetching consultant assignments: ${CODE}`],
    ['quiz review, thrown exception', quizReview, REVIEWER_SCHOOL, get({ id: SUB_PENDING }, bearer), fail('quiz_submissions.select', thrown()), 500, 'Quiz review API error: {}'],
    ['ensure-workspace, anonymous', ensureWorkspace, null, { body: { communityId: COMMUNITY } }, community, 401, null],
    ['ensure-workspace, another community', ensureWorkspace, FOREIGN, { body: { communityId: COMMUNITY } }, community, 403, null],
    ['ensure-workspace, insert error', ensureWorkspace, MATE1, { body: { communityId: COMMUNITY } }, () => (community(), fail('community_workspaces.insert')()), 500, `[ensure-workspace] Error creating workspace: ${CODE}`],
    ['my-roles, anonymous', myRoles, null, get({}), none, 401, null],
    ['my-roles, invalid token', myRoles, STUDENT, get({}, bearer), badToken, 401, "[API Auth] Bearer token validation failed: { code: 'bad_jwt', status: 403 }"],
    ['my-roles, role lookup error', myRoles, STUDENT, get({}), fail('user_roles.select'), 500, `[my-roles API] Error fetching roles: ${CODE}`],
    ['my-roles, thrown exception', myRoles, STUDENT, get({}), fail('user_roles.select', thrown()), 500, '[my-roles API] Unexpected error: {}'],
  ])('D3/D5/R4-F2: %s is denied or fails closed, logs only its label and answers without data', async (_case, handler, actor, request, arrange, status, line) => {
    arrange();
    const res = await send(handler, actor, request);
    expect(res.status).toBe(status);
    if (line) expect(logs).toContain(line);
    expect(JSON.stringify(res.body)).not.toMatch(ANY_ID);
    expect(bells()).toEqual([]);
  });

  it('D4/D5/R4-F2: an orphaned membership is cleaned up and logged without its group id', async () => {
    db.tables.group_assignment_members.push({ group_id: ORPHAN_GROUP, assignment_id: ASSIGNMENT, user_id: LEADER, role: 'leader' });
    expect(await send(userGroup, LEADER, get({ assignmentId: ASSIGNMENT }))).toEqual({ status: 200, body: { group: null } });
    expect(db.tables.group_assignment_members.some((m) => m.group_id === ORPHAN_GROUP)).toBe(false);
    expect(logs).toEqual(expect.arrayContaining([
      "[user-group] group query result: { found: false, code: 'PGRST116' }",
      '[user-group] Orphaned membership - group does not exist. Cleaning up...',
    ]));
  });

  it.each<[string, Handler, string, Request, () => void, string]>([
    ['create-group, group insert error', createGroup, LEADER, { body: create }, fail('group_assignment_groups.insert'), 'Error al crear el grupo'],
    ['create-group, member insert error', createGroup, LEADER, { body: create }, fail('group_assignment_members.insert'), 'Error al agregar miembros'],
    ['create-group, thrown exception', createGroup, LEADER, { body: create }, fail('profiles.select', thrown()), 'Error interno del servidor'],
    ['submit-review, update error', submitReview, REVIEWER_INDIV, { body: reviewed, headers: bearer }, fail('quiz_submissions.update'), 'No se pudo guardar la revisión'],
    ['user-group, thrown exception', userGroup, MATE1, get({ assignmentId: ASSIGNMENT }), fail('group_assignment_members.select', thrown()), 'Error interno del servidor'],
  ])('D3/R4-F3: %s answers 500 with fixed copy, never the database error, message or stack', async (_case, handler, actor, request, arrange, error) => {
    arrange();
    expect(await send(handler, actor, request)).toEqual({ status: 500, body: { error } });
    expect(bells()).toEqual([]);
  });

  describe('R5-F1/F2 · both bell destinations log role flags and counts only, and no unvetted error code', () => {
    const NAMED = { ...leaky, code: 'alumno_juan_perez' };
    const destinations = () => {
      db.tables.courses = [{ id: COURSE, title: 'SINTETICO-TITULO' }];
      db.tables.lessons[0].content = [{ id: ASSIGNMENT, type: 'group_assignment', data: { title: 'SINTETICO-TITULO' } }];
      db.tables.assignment_groups = [{
        id: GROUP, lesson_id: LESSON, block_id: ASSIGNMENT, community_id: COMMUNITY, school_id: SCHOOL, name: 'Grupo de SINTETICO-NOMBRE',
        assignment_group_members: [{ user_id: MATE1, profiles: { id: MATE1, first_name: 'SINTETICO-NOMBRE', email: 'companero@qa.local.test' } }],
        growth_communities: { id: COMMUNITY, name: 'Comunidad SINTETICO-NOMBRE', school_id: SCHOOL, generation_id: null },
      }];
      db.tables.assignment_group_submissions = [{ group_id: GROUP, status: 'submitted' }];
      db.tables.pending_quiz_reviews = [{ id: SUB_PENDING, student_id: STUDENT, student_name: 'SINTETICO-NOMBRE', student_email: 'alumno@qa.local.test' }];
    };
    beforeEach(destinations);
    afterEach(() => expect(logs.join('\n')).not.toMatch(/juan|perez|maria/i));

    it('D1/D2/D5/R5-F1: the submitted-group and pending-review bell targets answer admin, consultant and empty scopes with log flags and counts only', async () => {
      const overview = await send(adminOverview, REVIEWER_SCHOOL, get({}, bearer));
      expect(overview.status).toBe(200);
      expect(overview.body.total).toBe(1);
      expect(overview.body.assignments[0]).toMatchObject({ id: `${LESSON}_${ASSIGNMENT}`, groups_count: 1, submitted_count: 1 });
      expect((await send(adminOverview, ADMIN_CONSULTANT, get({}, bearer))).body.total).toBe(1);
      expect(await send(adminOverview, OTHER_CONSULTANT, get({}, bearer))).toEqual({ status: 200, body: { assignments: [], total: 0 } });
      expect(await send(pendingReviews, REVIEWER_SCHOOL, get({}, bearer))).toMatchObject({ status: 200, body: { data: [{ id: SUB_PENDING }] } });
      expect((await send(pendingReviews, ADMIN_CONSULTANT, get({}, bearer))).body.data).toHaveLength(1);
      expect(await send(pendingReviews, OTHER_CONSULTANT, get({}, bearer))).toEqual({ status: 200, body: { data: [] } });
      expect(logs).toEqual([
        '[API assignments] isAdmin: false isConsultant: true',
        '[API assignments] Consultant assignments: 1',
        '[API assignments] Allowed students: 5',
        '[API assignments] Enrollments found: 4',
        '[API assignments] Course IDs: 1',
        '[API assignments] Lessons found: 1',
        "[API assignments] Block types found: [ 'group_assignment' ]",
        '[API assignments] Group assignment blocks found: 1',
        '[API assignments] Final assignments count: 1',
        '[API assignments] isAdmin: true isConsultant: false',
        '[API assignments] Lessons found: 1',
        "[API assignments] Block types found: [ 'group_assignment' ]",
        '[API assignments] Group assignment blocks found: 1',
        '[API assignments] Final assignments count: 1',
        '[API assignments] isAdmin: false isConsultant: true',
        '[API assignments] Consultant assignments: 1',
        '[API assignments] Allowed students: 0',
        '[API pending] Role: consultor',
        '[API pending] All reviews count: 1',
        '[API pending] Assignments found: 1',
        '[API pending] Processing scope: school',
        '[API pending] Users in school: 5',
        '[API pending] Allowed student IDs: 5',
        '[API pending] Filtered reviews: 1',
        '[API pending] Role: admin',
        '[API pending] All reviews count: 1',
        '[API pending] Role: consultor',
        '[API pending] All reviews count: 1',
        '[API pending] Assignments found: 1',
        '[API pending] Processing scope: individual',
        '[API pending] Allowed student IDs: 0',
        '[API pending] Filtered reviews: 0',
      ]);
    });

    it.each<[string, Handler, string | null, Request, () => void, number, string | null]>([
      ['admin-overview, anonymous', adminOverview, null, get({}), none, 401, null],
      ['admin-overview, invalid token', adminOverview, REVIEWER_SCHOOL, get({}, bearer), badToken, 401, null],
      ['admin-overview, a student', adminOverview, MATE1, get({}, bearer), none, 403, null],
      ['admin-overview, role lookup error', adminOverview, REVIEWER_SCHOOL, get({}, bearer), fail('user_roles.select'), 500, null],
      ['admin-overview, assignment lookup error', adminOverview, REVIEWER_SCHOOL, get({}, bearer), fail('consultant_assignments.select'), 500, `Error fetching consultant assignments: ${CODE}`],
      ['admin-overview, course lookup error', adminOverview, ADMIN_CONSULTANT, get({}, bearer), fail('courses.select'), 500, `Admin assignments API error: ${CODE}`],
      ['admin-overview, lesson lookup error with a name-shaped code', adminOverview, ADMIN_CONSULTANT, get({}, bearer), fail('lessons.select', NAMED), 500, 'Admin assignments API error: {}'],
      ['admin-overview, thrown exception', adminOverview, REVIEWER_SCHOOL, get({}, bearer), fail('user_roles.select', thrown()), 500, 'Admin assignments API error: {}'],
      ['pending reviews, anonymous', pendingReviews, null, get({}), none, 401, null],
      ['pending reviews, invalid token', pendingReviews, REVIEWER_SCHOOL, get({}, bearer), badToken, 401, null],
      ['pending reviews, a student', pendingReviews, MATE1, get({}, bearer), none, 403, null],
      ['pending reviews, role lookup error', pendingReviews, REVIEWER_SCHOOL, get({}, bearer), fail('user_roles.select'), 500, `Error fetching user roles: ${CODE}`],
      ['pending reviews, role lookup error with a name-shaped code', pendingReviews, REVIEWER_SCHOOL, get({}, bearer), fail('user_roles.select', NAMED), 500, 'Error fetching user roles: {}'],
      ['pending reviews, review lookup error', pendingReviews, REVIEWER_SCHOOL, get({}, bearer), fail('pending_quiz_reviews.select'), 500, `Error fetching pending reviews: ${CODE}`],
      ['pending reviews, assignment lookup error', pendingReviews, REVIEWER_SCHOOL, get({}, bearer), fail('consultant_assignments.select'), 500, `Error fetching consultant assignments: ${CODE}`],
      ['pending reviews, thrown exception', pendingReviews, REVIEWER_SCHOOL, get({}, bearer), fail('pending_quiz_reviews.select', thrown()), 500, 'Quiz reviews API error: {}'],
    ])('D3/D5/R5-F1/F2: %s is denied or fails closed, logs only its label and a vetted code, and answers without data', async (_case, handler, actor, request, arrange, status, line) => {
      arrange();
      const res = await send(handler, actor, request);
      expect(res.status).toBe(status);
      expect(Object.keys(res.body)).toEqual(['error']);
      if (line) expect(logs).toContain(line);
      expect(logs.filter((l) => !l.startsWith('[API '))).toEqual(line ? [line] : []);
      expect(bells()).toEqual([]);
    });

    describe('R6-F1/F2 · a name-shaped error code or stored scope never reaches a log line', () => {
      const withCode = (code: string) => ({ ...leaky, code });
      afterEach(() => expect(logs.join('\n')).not.toMatch(/m4ria|alumna/i));

      it.each<[string, Handler, string, Request, string, string]>([
        ['pending reviews, role lookup error', pendingReviews, REVIEWER_SCHOOL, get({}, bearer), 'user_roles.select', 'Error fetching user roles:'],
        ['pending reviews, assignment lookup error', pendingReviews, REVIEWER_SCHOOL, get({}, bearer), 'consultant_assignments.select', 'Error fetching consultant assignments:'],
        ['admin-overview, assignment lookup error', adminOverview, REVIEWER_SCHOOL, get({}, bearer), 'consultant_assignments.select', 'Error fetching consultant assignments:'],
        ['submit-review, update error', submitReview, REVIEWER_INDIV, { body: reviewed, headers: bearer }, 'quiz_submissions.update', 'Error updating submission:'],
        ['create-group, group insert error', createGroup, LEADER, { body: create }, 'group_assignment_groups.insert', '[create-group] Error creating group:'],
      ])('D3/D5/R6-F1: %s with code M4RIA answers exactly as with a listed code and logs no code', async (_case, handler, actor, request, key, label) => {
        db.faults[key] = withCode('XX000');
        const listed = await send(handler, actor, request);
        expect(listed.status).toBe(500);
        expect(logs).toContain(`${label} { code: 'XX000' }`);
        seed();
        destinations();
        logs = [];
        db.faults = { [key]: withCode('M4RIA') };

        expect(await send(handler, actor, request)).toEqual(listed);
        expect(logs).toContain(`${label} {}`);
        expect(bells()).toEqual([]);
      });

      it('D4/D5/R6-F1: a review bell failing with code M4RIA keeps the saved review, reports it, and the retry fills it', async () => {
        db.faults['user_notifications.insert'] = withCode('M4RIA');
        expect(await send(submitReview, REVIEWER_INDIV, { body: reviewed, headers: bearer })).toEqual({ status: 200, body: { success: true, notificationsDelivered: false } });
        expect(bells()).toEqual([]);
        db.faults = {};
        expect(await send(submitReview, REVIEWER_INDIV, { body: reviewed, headers: bearer })).toEqual({ status: 200, body: { success: true, notificationsDelivered: true } });
        expect(recipients('quiz_reviewed')).toEqual([STUDENT]);
      });

      // The school-scoped reviewer's only assignment also names the student's community, so reading
      // an unknown scope as school or community would list the student's review.
      const storeScope = (scope: unknown) =>
        Object.assign(db.tables.consultant_assignments.find((a) => a.consultant_id === REVIEWER_SCHOOL)!, { community_id: COMMUNITY, assignment_data: { assignment_scope: scope } });

      it.each<[string, unknown]>([
        ['a name-shaped scope', 'alumna_maria'],
        ['a scope in another case', 'School'],
        ['an object scope', { nombre: 'alumna_maria' }],
        ['a list scope', ['school']],
        ['a numeric scope', 7],
      ])('D2/D5/R6-F2: %s stored on a consultant assignment is logged as unknown and lists no review', async (_case, scope) => {
        storeScope(scope);
        expect(await send(pendingReviews, REVIEWER_SCHOOL, get({}, bearer))).toEqual({ status: 200, body: { data: [] } });
        expect(logs).toEqual([
          '[API pending] Role: consultor',
          '[API pending] All reviews count: 1',
          '[API pending] Assignments found: 1',
          '[API pending] Processing scope: unknown',
          '[API pending] Allowed student IDs: 0',
          '[API pending] Filtered reviews: 0',
        ]);
        expect(logs.join('\n')).not.toMatch(/School|nombre/);
      });

      it('D2/R6-F2: beside a valid individual assignment the unknown scope changes nothing: only the covered student is listed', async () => {
        storeScope('alumna_maria');
        db.tables.consultant_assignments.push({ consultant_id: REVIEWER_SCHOOL, student_id: STUDENT, school_id: null, generation_id: null, community_id: null, is_active: true, assignment_data: {} });
        expect(await send(pendingReviews, REVIEWER_SCHOOL, get({}, bearer))).toMatchObject({ status: 200, body: { data: [{ id: SUB_PENDING }] } });
        expect(logs).toEqual([
          '[API pending] Role: consultor',
          '[API pending] All reviews count: 1',
          '[API pending] Assignments found: 2',
          '[API pending] Processing scope: unknown',
          '[API pending] Processing scope: individual',
          '[API pending] Allowed student IDs: 1',
          '[API pending] Filtered reviews: 1',
        ]);
      });
    });
  });
});
