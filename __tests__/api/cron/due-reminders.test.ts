// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { createMocks } from 'node-mocks-http';

/**
 * N5-04: the hourly due-reminders cron through its real handler, the real
 * `NotificationService` and the worker's real access rule. Replaced edges only:
 * the Supabase client (an in-memory fake that applies the query's filters and
 * refuses any column the real tables do not have), the clock and the synchronous
 * e-mail sender. Synthetic data only.
 */
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

type Row = Record<string, any>;
type Filter = [string, string, unknown];

/** The real columns (supabase/migrations/00000000000000_baseline.sql + C2) of the tables the reminder reads. */
const COLUMNS: Record<string, string[]> = vi.hoisted(() => ({
  lesson_assignments: ['id', 'title', 'description', 'course_id', 'lesson_id', 'created_by', 'due_date', 'points', 'assignment_type', 'instructions', 'resources', 'is_published', 'allow_late_submission', 'max_attempts', 'created_at', 'updated_at', 'assignment_for', 'assigned_to_community_id', 'max_group_size', 'min_group_size', 'require_all_members_submit', 'group_assignments'],
  courses: ['id', 'title', 'description', 'status', 'instructor_id', 'created_by'],
  course_enrollments: ['id', 'user_id', 'course_id', 'status', 'access_origin', 'enrolled_at', 'enrollment_type', 'access_expires_at'],
  lesson_assignment_submissions: ['id', 'assignment_id', 'student_id', 'content', 'attachment_urls', 'status', 'submitted_at', 'graded_at', 'graded_by', 'score', 'feedback', 'attempt_number', 'is_late', 'created_at', 'updated_at', 'submitted_by', 'source_submission_id', 'is_original'],
}));

const db = vi.hoisted(() => ({
  tables: {} as Record<string, Row[]>,
  log: [] as string[],
  rpcs: [] as Array<{ fn: string; args: Record<string, any> }>,
  /** Reads for which this returns true answer with a database error. */
  failRead: null as null | ((table: string, filters: Filter[]) => boolean),
  /** Bell inserts for which this returns true fail with a non-duplicate database error. */
  failBell: null as null | ((row: Row) => boolean),
  /** What `get_active_triggers` answers: none means the code defaults. */
  triggers: [] as Row[],
}));

const mail = vi.hoisted(() => ({ sends: [] as Row[] }));

vi.mock('@supabase/supabase-js', async () => {
  const { createHash: hash } = await import('crypto');
  const unknownColumn = (table: string, columns: string) => {
    const known = COLUMNS[table];
    if (!known) return null;
    for (const [, embed, inner] of columns.matchAll(/(\w+)\(([^)]*)\)/g)) {
      const bad = inner.split(',').map((c) => c.trim()).find((c) => !COLUMNS[embed]?.includes(c));
      if (bad) return `${embed}.${bad}`;
    }
    return columns.replace(/\w+\([^)]*\)/g, '').split(',').map((c) => c.trim()).filter(Boolean)
      .find((c) => c !== '*' && !known.includes(c)) ?? null;
  };
  const from = (table: string) => {
    let op = 'select';
    let payload: any;
    let columns = '*';
    const filters: Filter[] = [];
    const matches = (row: Row) =>
      filters.every(([kind, key, value]) => {
        if (kind === 'eq') return row[key] === value;
        if (kind === 'in') return (value as unknown[]).includes(row[key]);
        if (row[key] === null || row[key] === undefined) return false;
        if (kind === 'gt') return Date.parse(row[key]) > Date.parse(value as string);
        return Date.parse(row[key]) <= Date.parse(value as string);
      });
    const run = () => {
      db.log.push(`${table}:${op}`);
      const rows = (db.tables[table] ??= []);
      if (op === 'insert') {
        const list: Row[] = Array.isArray(payload) ? payload : [payload];
        if (table === 'user_notifications') {
          for (const row of list) {
            if (db.failBell?.(row)) return { data: null, error: { code: 'XX000', message: 'synthetic failure' } };
            if (rows.some((r) => r.idempotency_key && r.idempotency_key === row.idempotency_key)) {
              return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "unique_notification_idempotency_key"' } };
            }
          }
        }
        const inserted = list.map((row, i) => ({ id: `${table}-${rows.length + i + 1}`, ...row }));
        rows.push(...inserted);
        return { data: Array.isArray(payload) ? inserted : inserted[0], error: null };
      }
      const bad = unknownColumn(table, [columns, ...filters.map(([, key]) => key)].join(','));
      if (bad) return { data: null, error: { code: '42703', message: `column ${bad} does not exist` } };
      if (db.failRead?.(table, filters)) return { data: null, error: { code: 'XX000', message: 'synthetic database detail' } };
      let result = rows.filter(matches);
      if (table === 'lesson_assignments' && columns.includes('courses(')) {
        result = result.map((a) => ({ ...a, courses: (db.tables.courses ?? []).find((c) => c.id === a.course_id) ?? null }));
      }
      return { data: result, error: null };
    };
    const one = async () => {
      const { data, error } = run();
      return { data: Array.isArray(data) ? data[0] ?? null : data, error };
    };
    const builder: any = {
      select: (c = '*') => ((columns = c), builder),
      insert: (p: unknown) => ((op = 'insert'), (payload = p), builder),
      eq: (key: string, value: unknown) => (filters.push(['eq', key, value]), builder),
      in: (key: string, value: unknown[]) => (filters.push(['in', key, value]), builder),
      gt: (key: string, value: unknown) => (filters.push(['gt', key, value]), builder),
      lte: (key: string, value: unknown) => (filters.push(['lte', key, value]), builder),
      order: () => builder,
      limit: () => builder,
      single: one,
      maybeSingle: one,
      then: (resolve: any, reject: any) => Promise.resolve().then(run).then(resolve, reject),
    };
    return builder;
  };
  const rpc = async (fn: string, args: Record<string, any>) => {
    db.log.push(`rpc:${fn}`);
    db.rpcs.push({ fn, args });
    if (fn === 'get_active_triggers') return { data: db.triggers, error: null };
    if (fn !== 'enqueue_notification_with_source') return { data: null, error: null };
    // The live key (enqueue_notification): one bell and one outbox row per key.
    const key = `notif-${hash('sha256').update(JSON.stringify([args.p_event_type, args.p_occurrence_id, args.p_user_id]), 'utf8').digest('hex')}`;
    const outbox = (db.tables.notification_email_outbox ??= []);
    const bellRows = (db.tables.user_notifications ??= []);
    if (!outbox.some((row) => row.idempotency_key === key)) outbox.push({ idempotency_key: key, user_id: args.p_user_id });
    if (!bellRows.some((row) => row.idempotency_key === key)) {
      bellRows.push({ id: `bell-${key}`, idempotency_key: key, user_id: args.p_user_id, title: args.p_title, description: args.p_description, related_url: args.p_related_url });
    }
    return {
      data: [{ notification_id: `bell-${key}`, outbox_id: `outbox-${key}`, idempotency_key: key, in_app: true, email_mode: 'immediate', email_reason: 'catalog_default' }],
      error: null,
    };
  };
  return { createClient: () => ({ from, rpc }) };
});

vi.mock('../../../lib/email/notifications', async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  sendNotificationEmail: vi.fn(async (_client: unknown, input: Row) => {
    mail.sends.push(input);
    return { sent: true, status: 'provider_accepted' };
  }),
}));

import handler from '../../../pages/api/cron/due-reminders';

const SECRET = 'synthetic-cron-secret-n25';
const API_KEY = 'synthetic-cron-key-n25';
const uid = (n: number) => `25250000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const aid = (n: number) => `25a50000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const COURSE = '25c50000-0000-4000-8000-000000000001';
const OTHER_COURSE = '25c50000-0000-4000-8000-000000000002';
const COMMUNITY = '25d50000-0000-4000-8000-000000000001';
const OTHER_COMMUNITY = '25d50000-0000-4000-8000-000000000002';
const NOW = Date.parse('2026-10-09T12:00:00.000Z');
const HOUR = 3_600_000;
const ENV_KEYS = ['CRON_SECRET', 'CRON_API_KEY', 'NOTIFICATION_OUTBOX_DELIVERY', 'NOTIFICATION_EMAIL_ENABLED', 'TZ'] as const;
const ORIGINAL_ENV = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

let consoleLines: string[] = [];

const iso = (ms: number) => new Date(ms).toISOString();
const key = (assignment: string, user: string, dueAt: string) =>
  `notif-${createHash('sha256').update(JSON.stringify(['assignment_due_soon', `record:${assignment}:${user}:${encodeURIComponent(dueAt)}`, user]), 'utf8').digest('hex')}`;

function assignment(n: number, overrides: Row = {}) {
  const row = {
    id: aid(n), title: `Tarea sintética ${n}`, course_id: COURSE, due_date: iso(NOW + 3 * HOUR), is_published: true,
    assignment_for: 'individual', assigned_to_community_id: null, group_assignments: [], created_by: uid(99), ...overrides,
  };
  (db.tables.lesson_assignments ??= []).push(row);
  return row;
}

/** An active docente enrolled in a course (independent enrolment unless overridden). */
function student(n: number, enrollment: Row = {}, role: Row | null = {}) {
  (db.tables.course_enrollments ??= []).push({ user_id: uid(n), course_id: COURSE, status: 'active', access_origin: 'independent', ...enrollment });
  if (role) (db.tables.user_roles ??= []).push({ user_id: uid(n), role_type: 'docente', is_active: true, school_id: 1, community_id: COMMUNITY, generation_id: null, ...role });
  return uid(n);
}

async function call(init: { method?: string; headers?: Record<string, string>; body?: Row; query?: Row } = {}) {
  const { req, res } = createMocks({
    method: (init.method ?? 'GET') as any,
    headers: { host: 'localhost:3108', ...(init.headers ?? { authorization: `Bearer ${SECRET}` }) },
    body: init.body,
    query: init.query,
  });
  await handler(req as any, res as any);
  return { status: res._getStatusCode(), body: res._getJSONData(), headers: res._getHeaders() };
}

const bells = (user?: string) => (db.tables.user_notifications ?? []).filter((row) => !user || row.user_id === user);
const reminded = () => bells().map((row) => row.user_id).sort();
const enqueues = () => db.rpcs.filter((r) => r.fn === 'enqueue_notification_with_source').map((r) => r.args);

beforeEach(() => {
  db.tables = { courses: [{ id: COURSE, title: 'Curso sintético' }, { id: OTHER_COURSE, title: 'Otro curso' }] };
  db.log = [];
  db.rpcs = [];
  db.failRead = null;
  db.failBell = null;
  db.triggers = [];
  mail.sends = [];
  process.env.CRON_SECRET = SECRET;
  process.env.CRON_API_KEY = API_KEY;
  delete process.env.NOTIFICATION_OUTBOX_DELIVERY;
  delete process.env.NOTIFICATION_EMAIL_ENABLED;
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  consoleLines = [];
  for (const method of ['log', 'warn', 'error'] as const) {
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      consoleLines.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
    });
  }
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  for (const name of ENV_KEYS) {
    if (ORIGINAL_ENV[name] === undefined) delete process.env[name];
    else process.env[name] = ORIGINAL_ENV[name];
  }
});

describe('D1 — the shared cron verifier, before any data access', () => {
  beforeEach(() => {
    assignment(1);
    student(1);
  });

  it.each([
    ['no credential', { headers: {} }],
    ['a wrong bearer', { headers: { authorization: 'Bearer not-the-secret' } }],
    ['the bare secret', { headers: { authorization: SECRET } }],
    ['a malformed scheme', { headers: { authorization: `Basic ${SECRET}` } }],
    ['a wrong x-cron-key', { method: 'POST', headers: { 'x-cron-key': 'not-the-key' } }],
    ['the key only in the body', { method: 'POST', headers: {}, body: { cronKey: API_KEY } }],
    ['the secret only in the query', { headers: {}, query: { cronKey: API_KEY, secret: SECRET } }],
  ])('401 for %s, with nothing read or triggered', async (_name, init) => {
    const response = await call(init);
    expect(response).toMatchObject({ status: 401, body: { error: 'No autorizado' } });
    expect(db.log).toEqual([]);
    expect(bells()).toEqual([]);
  });

  it('401 for every credential when neither secret is configured', async () => {
    delete process.env.CRON_SECRET;
    delete process.env.CRON_API_KEY;
    for (const headers of [{}, { authorization: 'Bearer ' }, { authorization: `Bearer ${SECRET}` }, { 'x-cron-key': API_KEY }, { 'x-cron-key': '' }]) {
      expect((await call({ headers })).status).toBe(401);
    }
    expect(db.log).toEqual([]);
  });

  it.each(['PUT', 'DELETE', 'PATCH'])('405 for %s before authentication', async (method) => {
    const response = await call({ method });
    expect(response).toMatchObject({ status: 405, body: { error: 'Método no permitido' } });
    expect(response.headers.allow).toBe('GET, POST');
    expect(db.log).toEqual([]);
  });

  it('accepts GET with the Vercel bearer and POST with x-cron-key', async () => {
    expect(await call()).toMatchObject({ status: 200, body: { success: true, sent: 1 } });
    expect(await call({ method: 'POST', headers: { 'x-cron-key': API_KEY } })).toMatchObject({ status: 200, body: { success: true, sent: 0, alreadySent: 1 } });
  });
});

describe('D2 — actual assignments, actual eligible recipients', () => {
  it('reminds exactly the enrolled, entitled recipients who have not submitted an assignment due within 24 hours', async () => {
    const [u1, u2, u3, u4, u5, u6, u7, u8, u9] = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(uid);
    assignment(1);
    assignment(2, { is_published: false });
    assignment(3, { due_date: null });
    assignment(4, { due_date: iso(NOW + 24 * HOUR + 60_000) });
    assignment(5, { due_date: iso(NOW - 60_000) });
    assignment(6, { course_id: null });
    assignment(7, { assignment_for: 'group', group_assignments: [{ group_id: 'g1', members: [{ user_id: u2 }], submission: { submitted_at: iso(NOW) } }, { group_id: 'g2', members: [{ user_id: u1 }] }] });
    assignment(8, { course_id: OTHER_COURSE, assigned_to_community_id: COMMUNITY, due_date: iso(NOW + 24 * HOUR) });
    student(1);
    student(2);
    student(3, { status: 'dropped' });
    student(4);
    student(5);
    student(6, { access_origin: 'learning_path' });
    student(7, {}, null);
    student(8, { course_id: OTHER_COURSE });
    student(9, { course_id: OTHER_COURSE }, { community_id: OTHER_COMMUNITY });
    student(10, {}, { is_active: false });
    student(11, { status: 'cancelled' });
    (db.tables.lesson_assignment_submissions ??= []).push(
      { assignment_id: aid(1), student_id: u4, status: 'submitted' },
      { assignment_id: aid(1), student_id: u2, status: 'graded' },
      { assignment_id: aid(1), student_id: u5, status: 'draft' },
      { assignment_id: aid(7), student_id: u5, status: 'returned' },
    );

    const response = await call();
    expect(response).toMatchObject({ status: 200, body: { success: true, sent: 6, alreadySent: 0, failed: 0, assignmentsChecked: 3 } });
    const pairs = bells().map((row) => [row.related_url, row.user_id]).sort();
    expect(pairs).toEqual([
      [`/assignments/${aid(1)}`, u1],
      [`/assignments/${aid(1)}`, u5],
      [`/assignments/${aid(7)}`, u1],
      [`/assignments/${aid(7)}`, u4],
      [`/assignments/${aid(7)}`, u5],
      [`/assignments/${aid(8)}`, u8],
    ].sort());
    for (const excluded of [u3, u6, u7, u9, uid(10), uid(11)]) expect(reminded()).not.toContain(excluded);
    expect(bells(u1).map((row) => row.title).sort()).toEqual(['Tarea próxima a vencer: Tarea sintética 1', 'Tarea próxima a vencer: Tarea sintética 7']);
    expect(mail.sends.map((m) => m.userId).sort()).toEqual([u1, u1, u4, u5, u5, u8].sort());
  });

  it.each(['stored order', 'reversed order'])(
    'the latest attempt decides, whatever the %s of the attempts, per recipient and assignment',
    async (order) => {
      const [u1, u2, u3, u4, u5, u6] = [1, 2, 3, 4, 5, 6].map(uid);
      assignment(1);
      assignment(2);
      [1, 2, 3, 4, 5, 6].forEach((n) => student(n));
      const attempts = [
        { assignment_id: aid(1), student_id: u1, attempt_number: 1, status: 'graded' },
        { assignment_id: aid(1), student_id: u1, attempt_number: 2, status: 'returned' },
        { assignment_id: aid(1), student_id: u2, attempt_number: 1, status: 'draft' },
        { assignment_id: aid(1), student_id: u2, attempt_number: 2, status: 'submitted' },
        { assignment_id: aid(1), student_id: u3, attempt_number: 3, status: 'draft' },
        { assignment_id: aid(1), student_id: u3, attempt_number: 2, status: 'submitted' },
        { assignment_id: aid(1), student_id: u4, attempt_number: 2, status: 'graded' },
        { assignment_id: aid(1), student_id: u4, attempt_number: 1, status: 'returned' },
        { assignment_id: aid(1), student_id: u6, attempt_number: 1, status: 'graded' },
        { assignment_id: aid(1), student_id: u6, attempt_number: null, status: 'draft' },
        { assignment_id: aid(2), student_id: u5, attempt_number: 1, status: 'returned' },
        { assignment_id: aid(2), student_id: u5, attempt_number: 2, status: 'graded' },
      ];
      db.tables.lesson_assignment_submissions = order === 'stored order' ? attempts : [...attempts].reverse();

      const response = await call();
      expect(response).toMatchObject({ status: 200, body: { success: true, sent: 9, failed: 0, assignmentsChecked: 2 } });
      expect(bells().map((row) => [row.related_url, row.user_id]).sort()).toEqual([
        ...[u1, u3, u5, u6].map((u) => [`/assignments/${aid(1)}`, u]),
        ...[u1, u2, u3, u4, u6].map((u) => [`/assignments/${aid(2)}`, u]),
      ].sort());
    }
  );

  it('a recipient with several matching roles is reminded once; an enrolled user outside the targeted community is not', async () => {
    assignment(1, { assigned_to_community_id: COMMUNITY });
    const twice = student(1);
    (db.tables.user_roles ??= []).push({ user_id: twice, role_type: 'lider_comunidad', is_active: true, school_id: 1, community_id: COMMUNITY, generation_id: null });
    student(2, {}, { community_id: OTHER_COMMUNITY });
    expect((await call()).body).toMatchObject({ success: true, sent: 1, failed: 0, assignmentsChecked: 1 });
    expect(reminded()).toEqual([twice]);
    expect((await call()).body).toMatchObject({ sent: 0, alreadySent: 1 });
    expect(bells()).toHaveLength(1);
  });

  it('answers a truthful empty 200 when nothing is due', async () => {
    assignment(1, { due_date: iso(NOW + 30 * HOUR) });
    student(1);
    expect(await call()).toMatchObject({ status: 200, body: { success: true, sent: 0, failed: 0, assignmentsChecked: 0 } });
    expect(bells()).toEqual([]);
  });

  it.each(['lesson_assignments', 'course_enrollments', 'lesson_assignment_submissions', 'user_roles'])(
    'a failed %s read is a 500 with a fixed Spanish error, never an empty success',
    async (table) => {
      assignment(1, { assigned_to_community_id: COMMUNITY });
      student(1);
      db.failRead = (t, filters) => t === table && !filters.some(([, k]) => k === 'user_id');
      const response = await call();
      expect(response).toEqual({ status: 500, body: { success: false, error: 'Error interno del servidor' }, headers: expect.anything() });
      expect(bells()).toEqual([]);
      expect(consoleLines.join('\n')).not.toMatch(/synthetic database detail|Tarea sintética|25250000/);
    }
  );
});

describe('D3 — one reminder per assignment, recipient and due instant', () => {
  beforeEach(() => {
    assignment(1);
    student(1);
    student(2);
  });

  it('a repeated hourly run adds nothing, and a moved due date is a new reminder', async () => {
    expect((await call()).body).toMatchObject({ sent: 2, alreadySent: 0 });
    const due = db.tables.lesson_assignments[0].due_date;
    expect(bells().map((row) => row.idempotency_key).sort()).toEqual([key(aid(1), uid(1), due), key(aid(1), uid(2), due)].sort());
    vi.setSystemTime(NOW + HOUR);
    expect((await call()).body).toMatchObject({ success: true, sent: 0, alreadySent: 2, failed: 0 });
    expect(bells()).toHaveLength(2);
    expect(mail.sends).toHaveLength(2);

    db.tables.lesson_assignments[0].due_date = iso(NOW + 10 * HOUR);
    expect((await call()).body).toMatchObject({ sent: 2, alreadySent: 0 });
    expect(bells()).toHaveLength(4);
  });

  it('concurrent runs leave one bell per recipient', async () => {
    const [a, b] = await Promise.all([call(), call()]);
    expect(a.body.failed + b.body.failed).toBe(0);
    expect(reminded()).toEqual([uid(1), uid(2)]);
  });

  it('a failed recipient is reported, does not block the other and is retried by the next run', async () => {
    db.failBell = (row) => row.user_id === uid(1);
    expect(await call()).toMatchObject({ status: 200, body: { success: false, sent: 1, failed: 1 } });
    expect(reminded()).toEqual([uid(2)]);
    expect(consoleLines.join('\n')).not.toMatch(/Tarea sintética|25250000|synthetic failure/);

    db.failBell = null;
    expect((await call()).body).toMatchObject({ success: true, sent: 1, alreadySent: 1, failed: 0 });
    expect(reminded()).toEqual([uid(1), uid(2)]);
  });

  it('a failed access read counts the recipient as failed and the next run reminds them', async () => {
    db.failRead = (table, filters) => table === 'user_roles' && filters.some(([, k, v]) => k === 'user_id' && v === uid(1));
    expect((await call()).body).toMatchObject({ success: false, sent: 1, failed: 1 });
    db.failRead = null;
    expect((await call()).body).toMatchObject({ success: true, sent: 1, alreadySent: 1 });
    expect(reminded()).toEqual([uid(1), uid(2)]);
  });

  it('a failed delivered-key lookup triggers again and the key still absorbs the repeat', async () => {
    await call();
    db.failRead = (table) => table === 'user_notifications';
    expect((await call()).body).toMatchObject({ success: true, sent: 2, alreadySent: 0 });
    expect(bells()).toHaveLength(2);
  });

  it('with two active triggers, one recipient processed twice cannot stand in for one that failed', async () => {
    db.triggers = [1, 2].map((n) => ({ trigger_id: `t${n}`, template: null, category: 'assignments' }));
    db.failBell = (row) => row.user_id === uid(1);
    expect((await call()).body).toMatchObject({ success: false, sent: 1, failed: 1 });
    expect(reminded()).toEqual([uid(2)]);
  });

  it('sync and outbox derive the same key, so a run under either flag sees the other one\'s reminder', async () => {
    await call();
    process.env.NOTIFICATION_OUTBOX_DELIVERY = 'on';
    expect((await call()).body).toMatchObject({ sent: 0, alreadySent: 2 });
    expect(enqueues()).toEqual([]);
  });
});

describe('D4 — delivery, preferences, links and the due instant', () => {
  beforeEach(() => {
    student(1);
  });

  it('flag unset: the existing synchronous bell and e-mail, with the assignment link and the occurrence key', async () => {
    const row = assignment(1);
    await call();
    const [bell] = bells(uid(1));
    expect(bell).toMatchObject({ category: 'assignments', related_url: `/assignments/${aid(1)}`, importance: 'high', idempotency_key: key(aid(1), uid(1), row.due_date) });
    expect(mail.sends).toEqual([expect.objectContaining({ userId: uid(1), relatedUrl: `/assignments/${aid(1)}`, idempotencyKey: bell.idempotency_key })]);
    expect(enqueues()).toEqual([]);
  });

  it.each(['on', 'true', '1'])('flag %s: one typed assignment enqueue per recipient, no direct mail', async (flag) => {
    process.env.NOTIFICATION_OUTBOX_DELIVERY = flag;
    const row = assignment(1);
    expect((await call()).body).toMatchObject({ success: true, sent: 1 });
    expect(enqueues()).toEqual([expect.objectContaining({
      p_event_type: 'assignment_due_soon', p_user_id: uid(1), p_source_kind: 'assignment', p_source_id: aid(1),
      p_occurrence_id: `record:${aid(1)}:${uid(1)}:${encodeURIComponent(row.due_date)}`, p_related_url: `/assignments/${aid(1)}`,
      p_email_payload: { 'assignment.title': 'Tarea sintética 1', 'assignment.due_date': '2026-10-09T12:00:00', assignment_name: 'Tarea sintética 1', course_name: 'Curso sintético' },
    })]);
    expect(mail.sends).toEqual([]);
  });

  it('the kill switch keeps the bell and stops the mail; an e-mail preference off stops only the mail', async () => {
    assignment(1);
    process.env.NOTIFICATION_EMAIL_ENABLED = 'false';
    expect((await call()).body).toMatchObject({ success: true, sent: 1 });
    expect(bells(uid(1))).toHaveLength(1);
    expect(mail.sends).toEqual([]);

    delete process.env.NOTIFICATION_EMAIL_ENABLED;
    student(2);
    (db.tables.user_notification_category_prefs ??= []).push({ user_id: uid(2), category: 'assignments', email_mode: 'off' });
    expect((await call()).body).toMatchObject({ success: true, sent: 1, alreadySent: 1 });
    expect(bells(uid(2))).toHaveLength(1);
    expect(mail.sends).toEqual([]);
  });

  it.each(['UTC', 'America/Santiago', 'Asia/Tokyo'])('process time zone %s: the Chile due date and time, keyed by the UTC instant', async (tz) => {
    process.env.TZ = tz;
    const cases = [
      // 23:30 on New Year's Eve in Chile (-03) is already 2027 in UTC.
      { now: '2026-12-31T12:00:00.000Z', due: '2027-01-01T02:30:00.000Z', date: '31-12-2026', time: '23:30' },
      // Chile midnight: 00:00 on 10 Oct is still 9 Oct 03:00 UTC.
      { now: '2026-10-09T12:00:00.000Z', due: '2026-10-10T03:00:00.000Z', date: '10-10-2026', time: '00:00' },
      // The night DST ends (4 Apr 2027 00:00 -03 → 3 Apr 23:00 -04): 03:30 UTC is 23:30 on 3 Apr.
      { now: '2027-04-03T12:00:00.000Z', due: '2027-04-04T03:30:00.000Z', date: '03-04-2027', time: '23:30' },
    ];
    for (const [n, c] of cases.entries()) {
      db.tables.lesson_assignments = [];
      vi.setSystemTime(Date.parse(c.now));
      assignment(n + 1, { due_date: c.due.replace('.000Z', '+00:00') });
      await call();
      const bell = bells(uid(1)).find((row) => row.related_url === `/assignments/${aid(n + 1)}`)!;
      expect(bell.description).toBe(`La tarea "Tarea sintética ${n + 1}" vence el ${c.date}. No olvides completarla.`);
      expect(bell.idempotency_key).toBe(key(aid(n + 1), uid(1), c.due));
    }
    expect(bells(uid(1))).toHaveLength(3);
  });

  it('the due time and course reach the payload for a DB template', async () => {
    db.triggers = [{ trigger_id: 't1', category: 'assignments', template: { title_template: '{assignment_name} vence a las {due_time}', description_template: 'Curso {course_name}' } }];
    assignment(1, { due_date: '2026-10-09T18:45:00+00:00' });
    await call();
    expect(bells(uid(1))[0]).toMatchObject({ title: 'Tarea sintética 1 vence a las 15:45', description: 'Curso Curso sintético' });
  });
});

describe('D5 — the schedule', () => {
  it('runs hourly for the rolling 24-hour window', () => {
    const { crons } = JSON.parse(readFileSync(path.join(process.cwd(), 'vercel.json'), 'utf8'));
    expect(crons.filter((c: Row) => c.path === '/api/cron/due-reminders')).toEqual([{ path: '/api/cron/due-reminders', schedule: '0 * * * *' }]);
  });
});
