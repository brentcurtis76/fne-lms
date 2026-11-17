// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMocks } from 'node-mocks-http';

/**
 * CUR-S6b: a quiz review is opened (GET /api/quiz-reviews/[id]) and saved
 * (POST /api/quiz-reviews/submit-review) only by an admin, a consultor whose
 * active assignments cover the learner, or a directivo of a school the learner
 * belongs to. The same rule in both routes. Driven through the real handlers;
 * replaced edges: the Supabase client (one in-memory fake) and the bell writer
 * (no real messages). Synthetic ids only.
 */

const SCHOOL = 301;
const OTHER_SCHOOL = 302;
const GENERATION = 'a0000000-0000-4000-8000-0000000007a1';
const COMMUNITY = 'a0000000-0000-4000-8000-0000000007c1';
const SUB = 'a0000000-0000-4000-8000-0000000007d1';
const LESSON = 'a0000000-0000-4000-8000-0000000007e1';
const COURSE = 'a0000000-0000-4000-8000-0000000007f1';
const u = (n: number) => `00000000-0000-4000-8000-0000000007${String(n).padStart(2, '0')}`;
const [ADMIN, CONS_INDIV, CONS_SCHOOL, CONS_GEN, CONS_COMM, CONS_NONE, DIR_OWN, DIR_OTHER, LEARNER, OTHER_LEARNER, CONS_INACTIVE] =
  Array.from({ length: 11 }, (_, i) => u(i + 1));

const { db, fakeClient, mockDeliverRecordBells } = vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'http://127.0.0.1:9';
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'synthetic-service-key';
  const db = {
    tables: {} as Record<string, Array<Record<string, any>>>,
    actor: null as string | null,
    faults: {} as Record<string, unknown>,
    writes: [] as string[],
    rowCap: null as number | null,
  };
  const run = (table: string, q: any, mode: 'many' | 'single' | 'maybe') => {
    const fault = db.faults[`${table}.${q.op}`];
    if (fault) return Promise.resolve({ data: null, error: fault });
    const rows = (db.tables[table] ??= []);
    const match = (r: any) => q.filters.every((f: any) => f(r));
    let out: any[] = [];
    if (q.op !== 'select') db.writes.push(`${table}.${q.op}`);
    if (q.op === 'update') {
      out = rows.filter(match);
      out.forEach((r) => Object.assign(r, q.payload));
    } else {
      out = rows.filter(match);
    }
    if (mode === 'many') return Promise.resolve({ data: db.rowCap === null ? out : out.slice(0, db.rowCap), error: null });
    if (mode === 'single' && out.length !== 1) return Promise.resolve({ data: null, error: { code: 'PGRST116' } });
    return Promise.resolve({ data: out[0] ?? null, error: null });
  };
  const fakeClient: any = {
    auth: {
      getUser: async (token: string) =>
        db.actor && token === 'synthetic-token' ? { data: { user: { id: db.actor } }, error: null } : { data: { user: null }, error: { message: 'bad token' } },
    },
    from(table: string) {
      const q: any = { op: 'select', filters: [] };
      const b: any = {
        select: () => b,
        update: (p: unknown) => ((q.op = 'update'), (q.payload = p), b),
        eq: (c: string, v: unknown) => (q.filters.push((r: any) => r[c] === v), b),
        in: (c: string, v: unknown[]) => (q.filters.push((r: any) => v.includes(r[c])), b),
        is: (c: string, v: null) => (q.filters.push((r: any) => r[c] == v), b),
        order: () => b,
        single: () => run(table, q, 'single'),
        maybeSingle: () => run(table, q, 'maybe'),
        then: (res: any, rej: any) => run(table, q, 'many').then(res, rej),
      };
      return b;
    },
  };
  return { db, fakeClient, mockDeliverRecordBells: vi.fn() };
});

vi.mock('@supabase/supabase-js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@supabase/supabase-js')>()),
  createClient: () => fakeClient,
}));
vi.mock('../../pages/api/quiz-reviews/notify-pending', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../pages/api/quiz-reviews/notify-pending')>()),
  deliverRecordBells: mockDeliverRecordBells,
}));

import submitReview from '../../pages/api/quiz-reviews/submit-review';
import quizReview from '../../pages/api/quiz-reviews/[id]';
import pendingReviews from '../../pages/api/quiz-reviews/pending';

type Handler = (req: any, res: any) => Promise<unknown>;
async function send(handler: Handler, actor: string | null, method: 'GET' | 'POST', opts: { body?: unknown; query?: Record<string, string> }) {
  db.actor = actor;
  const { req, res } = createMocks({ method, headers: { authorization: 'Bearer synthetic-token' }, body: opts.body as any, query: opts.query });
  await handler(req, res);
  return { status: res._getStatusCode(), body: res._getJSONData() };
}
const open = (actor: string) => send(quizReview, actor, 'GET', { query: { id: SUB } });
const save = (actor: string, reviewStatus = 'pass', generalFeedback = 'Bien hecho') =>
  send(submitReview, actor, 'POST', { body: { submissionId: SUB, reviewStatus, generalFeedback } });
const submission = () => db.tables.quiz_submissions[0];

function seed() {
  const role = (user_id: string, role_type: string, extra: Record<string, unknown> = {}) =>
    ({ user_id, role_type, is_active: true, school_id: null, generation_id: null, community_id: null, ...extra });
  const ca = (consultant_id: string, extra: Record<string, unknown>) =>
    ({ consultant_id, student_id: null, school_id: null, generation_id: null, community_id: null, is_active: true, assignment_data: {}, ...extra });
  db.tables = {
    user_roles: [
      role(ADMIN, 'admin'),
      ...[CONS_INDIV, CONS_SCHOOL, CONS_GEN, CONS_COMM, CONS_NONE, CONS_INACTIVE].map((id) => role(id, 'consultor')),
      role(DIR_OWN, 'equipo_directivo', { school_id: SCHOOL }),
      role(DIR_OTHER, 'equipo_directivo', { school_id: OTHER_SCHOOL }),
      role(LEARNER, 'docente', { school_id: SCHOOL, generation_id: GENERATION, community_id: COMMUNITY }),
      role(OTHER_LEARNER, 'docente', { school_id: OTHER_SCHOOL }),
    ],
    consultant_assignments: [
      ca(CONS_INDIV, { student_id: LEARNER }),
      ca(CONS_SCHOOL, { school_id: SCHOOL, assignment_data: { assignment_scope: 'school' } }),
      ca(CONS_GEN, { generation_id: GENERATION, assignment_data: { assignment_scope: 'generation' } }),
      ca(CONS_COMM, { community_id: COMMUNITY, assignment_data: { assignment_scope: 'community' } }),
      ca(CONS_NONE, { student_id: OTHER_LEARNER }),
      ca(CONS_INACTIVE, { student_id: LEARNER, is_active: false }),
    ],
    quiz_submissions: [
      { id: SUB, student_id: LEARNER, lesson_id: LESSON, course_id: COURSE, review_status: 'pending', general_feedback: null, graded_by: null, graded_at: null },
    ],
  };
}

beforeEach(() => {
  seed();
  db.faults = {};
  db.writes = [];
  db.rowCap = null;
  mockDeliverRecordBells.mockReset().mockResolvedValue(0);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

const ALLOWED: Array<[string, string]> = [
  ['an admin', ADMIN],
  ['a consultor with an individual assignment over the learner', CONS_INDIV],
  ['a consultor with a school assignment covering the learner', CONS_SCHOOL],
  ['a consultor with a generation assignment covering the learner', CONS_GEN],
  ['a consultor with a community assignment covering the learner', CONS_COMM],
  ['a directivo of the learner’s school', DIR_OWN],
];
const REFUSED: Array<[string, string, string]> = [
  ['a consultor without a covering assignment', CONS_NONE, 'No tienes acceso a este quiz'],
  ['a consultor whose covering assignment is inactive', CONS_INACTIVE, 'No tienes acceso a este quiz'],
  ['a directivo of another school', DIR_OTHER, 'No tienes acceso a este quiz'],
];

describe('CUR-S6b · GET /api/quiz-reviews/[id]', () => {
  it.each(ALLOWED)('%s opens the review', async (_who, actor) => {
    const res = await open(actor);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(SUB);
  });

  it.each(REFUSED)('%s gets 403', async (_who, actor, error) => {
    expect(await open(actor)).toEqual({ status: 403, body: { error } });
  });

  it('a learner gets 403 from the role gate, as today', async () => {
    expect(await open(LEARNER)).toEqual({ status: 403, body: { error: 'No permission to access quiz reviews' } });
  });

  it('a failed scope lookup answers 500 Failed to verify access', async () => {
    db.faults['consultant_assignments.select'] = { code: 'XX000', message: 'synthetic' };
    expect(await open(CONS_INDIV)).toEqual({ status: 500, body: { error: 'Failed to verify access' } });
  });
});

describe('CUR-S6e · the scope is decided by looking the learner up, not by listing a school', () => {
  it('a consultor with a school assignment opens the review of the last of 1,001 active role rows of the school', async () => {
    // The database service returns at most 1,000 rows per query (supabase/config.toml max_rows).
    db.rowCap = 1000;
    const learnerRow = db.tables.user_roles.findIndex((r) => r.user_id === LEARNER);
    const filler = Array.from({ length: 1000 - db.tables.user_roles.filter((r) => r.school_id === SCHOOL).length + 1 }, (_, i) => ({
      user_id: `00000000-0000-4000-9000-${String(i).padStart(12, '0')}`, role_type: 'docente', is_active: true, school_id: SCHOOL, generation_id: null, community_id: null,
    }));
    db.tables.user_roles.splice(learnerRow, 0, ...filler);
    const schoolRows = db.tables.user_roles.filter((r) => r.school_id === SCHOOL && r.is_active);
    expect(schoolRows).toHaveLength(1001);
    expect(schoolRows[1000].user_id).toBe(LEARNER);
    const res = await open(CONS_SCHOOL);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(SUB);
  });
});

describe('CUR-S6c · GET /api/quiz-reviews/pending lists only the reviews the caller may open', () => {
  const THIRD_SCHOOL = 303;
  const [THIRD_LEARNER, TWO_ROLES, CONS_EMPTY] = [u(12), u(13), u(14)];
  const REVIEW_A = 'a0000000-0000-4000-8000-0000000007b1'; // learner of SCHOOL
  const REVIEW_B = 'a0000000-0000-4000-8000-0000000007b2'; // learner of OTHER_SCHOOL
  const REVIEW_C = 'a0000000-0000-4000-8000-0000000007b3'; // learner of THIRD_SCHOOL
  const list = (actor: string) => send(pendingReviews, actor, 'GET', {});
  const ids = (res: { body: any }) => res.body.data.map((r: any) => r.id);
  const logLines = () => vi.mocked(console.log).mock.calls.map((args) => args.join(' '));

  beforeEach(() => {
    db.tables.user_roles.push(
      { user_id: THIRD_LEARNER, role_type: 'docente', is_active: true, school_id: THIRD_SCHOOL, generation_id: null, community_id: null },
      { user_id: TWO_ROLES, role_type: 'consultor', is_active: true, school_id: null, generation_id: null, community_id: null },
      { user_id: TWO_ROLES, role_type: 'equipo_directivo', is_active: true, school_id: SCHOOL, generation_id: null, community_id: null },
      { user_id: CONS_EMPTY, role_type: 'consultor', is_active: true, school_id: null, generation_id: null, community_id: null },
    );
    db.tables.consultant_assignments.push(
      { consultant_id: TWO_ROLES, student_id: THIRD_LEARNER, school_id: null, generation_id: null, community_id: null, is_active: true, assignment_data: {} },
    );
    db.tables.pending_quiz_reviews = [
      { id: REVIEW_A, student_id: LEARNER, submitted_at: '2026-11-01T10:00:00Z' },
      { id: REVIEW_B, student_id: OTHER_LEARNER, submitted_at: '2026-11-02T10:00:00Z' },
      { id: REVIEW_C, student_id: THIRD_LEARNER, submitted_at: '2026-11-03T10:00:00Z' },
    ];
  });

  it('an admin sees every waiting review', async () => {
    const res = await list(ADMIN);
    expect(res.status).toBe(200);
    expect(ids(res)).toEqual([REVIEW_A, REVIEW_B, REVIEW_C]);
  });

  it.each([
    ['an individual', CONS_INDIV],
    ['a school', CONS_SCHOOL],
    ['a generation', CONS_GEN],
    ['a community', CONS_COMM],
  ])('a consultor with %s assignment sees only the learner it covers', async (_scope, actor) => {
    const res = await list(actor);
    expect(res.status).toBe(200);
    expect(ids(res)).toEqual([REVIEW_A]);
  });

  it('a consultor with no assignment gets an empty list', async () => {
    expect(await list(CONS_EMPTY)).toEqual({ status: 200, body: { data: [] } });
  });

  it('a directivo of school A sees only school A’s reviews', async () => {
    const res = await list(DIR_OWN);
    expect(res.status).toBe(200);
    expect(ids(res)).toEqual([REVIEW_A]);
  });

  it('a person who is consultor of one learner and directivo of school A sees the union', async () => {
    const res = await list(TWO_ROLES);
    expect(res.status).toBe(200);
    expect(ids(res)).toEqual([REVIEW_A, REVIEW_C]);
  });

  it('a learner gets 403 from the role gate, as today', async () => {
    expect(await list(LEARNER)).toEqual({ status: 403, body: { error: 'No permission to access quiz reviews' } });
  });

  it('a failed scope lookup answers 500 Failed to verify access', async () => {
    db.faults['consultant_assignments.select'] = { code: 'XX000', message: 'synthetic' };
    expect(await list(CONS_INDIV)).toEqual({ status: 500, body: { error: 'Failed to verify access' } });
  });

  it('a non-admin caller’s log holds the role and counts only', async () => {
    expect((await list(DIR_OWN)).status).toBe(200);
    expect(logLines()).toEqual([
      '[API pending] Role: equipo_directivo',
      '[API pending] All reviews count: 3',
      '[API pending] Filtered reviews: 1',
    ]);
  });
});

describe('CUR-S6b · POST /api/quiz-reviews/submit-review', () => {
  it.each(ALLOWED)('%s saves the review and the learner gets the bell', async (_who, actor) => {
    const res = await save(actor);
    expect(res).toEqual({ status: 200, body: { success: true, notificationsDelivered: true } });
    expect(submission()).toMatchObject({ review_status: 'pass', graded_by: actor });
    expect(db.writes).toEqual(['quiz_submissions.update']);
    expect(mockDeliverRecordBells).toHaveBeenCalledTimes(1);
  });

  it.each(REFUSED)('%s gets 403, nothing is updated and no notice is sent', async (_who, actor, error) => {
    expect(await save(actor)).toEqual({ status: 403, body: { error } });
    expect(db.writes).toEqual([]);
    expect(submission()).toMatchObject({ review_status: 'pending', graded_by: null, graded_at: null });
    expect(mockDeliverRecordBells).not.toHaveBeenCalled();
  });

  it('a learner gets 403 from the role gate, as today', async () => {
    expect(await save(LEARNER)).toEqual({ status: 403, body: { error: 'No permission to review quizzes' } });
    expect(db.writes).toEqual([]);
    expect(mockDeliverRecordBells).not.toHaveBeenCalled();
  });

  it('a failed scope lookup answers 500 Failed to verify access and writes nothing', async () => {
    db.faults['consultant_assignments.select'] = { code: 'XX000', message: 'synthetic' };
    expect(await save(CONS_INDIV)).toEqual({ status: 500, body: { error: 'Failed to verify access' } });
    expect(db.writes).toEqual([]);
    expect(mockDeliverRecordBells).not.toHaveBeenCalled();
  });

  it('saving the same review twice still behaves as today: one update, the retry keeps graded_at', async () => {
    expect((await save(CONS_INDIV)).status).toBe(200);
    const gradedAt = submission().graded_at;
    expect(await save(CONS_INDIV)).toEqual({ status: 200, body: { success: true, notificationsDelivered: true } });
    expect(db.writes).toEqual(['quiz_submissions.update']);
    expect(submission().graded_at).toBe(gradedAt);
    expect(mockDeliverRecordBells).toHaveBeenCalledTimes(2);
  });

  it('two overlapping different reviews still behave as today: one 200, one 409', async () => {
    expect((await save(ADMIN)).status).toBe(200);
    // The overlap made explicit: each request's read of the submission that feeds the
    // compare-and-set waits until both requests have reached it, then both go on.
    let arrived = 0;
    let releaseReads!: () => void;
    const bothArrived = new Promise<void>((resolve) => (releaseReads = resolve));
    const from = fakeClient.from;
    const spy = vi.spyOn(fakeClient, 'from').mockImplementation((table: string) => {
      const b = from.call(fakeClient, table);
      if (table !== 'quiz_submissions') return b;
      const { select, single } = b;
      let feedsCompareAndSet = false;
      b.select = (c?: string) => ((feedsCompareAndSet = !!c?.includes('graded_at')), select(c));
      b.single = async () => {
        if (feedsCompareAndSet) {
          if (++arrived === 2) releaseReads();
          await bothArrived;
        }
        return single();
      };
      return b;
    });
    const [a, b] = await Promise.all([save(CONS_INDIV, 'needs_review'), save(DIR_OWN, 'pass', 'Otra revisión')]);
    spy.mockRestore();
    expect(arrived).toBe(2);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(submission().graded_by).toBe(a.status === 200 ? CONS_INDIV : DIR_OWN);
    expect(db.writes).toEqual(['quiz_submissions.update', 'quiz_submissions.update', 'quiz_submissions.update']);
    expect(mockDeliverRecordBells).toHaveBeenCalledTimes(2);
  });

  it('an unknown submission answers 404 Submission not found and writes nothing', async () => {
    const res = await send(submitReview, ADMIN, 'POST', { body: { submissionId: 'a0000000-0000-4000-8000-0000000007ff', reviewStatus: 'pass' } });
    expect(res).toEqual({ status: 404, body: { error: 'Submission not found' } });
    expect(db.writes).toEqual([]);
    expect(mockDeliverRecordBells).not.toHaveBeenCalled();
  });
});
