// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMocks } from 'node-mocks-http';

/**
 * N5-02b: the record (source) and occurrence a producer hands the future outbox
 * enqueue. The catalog resolver is checked against the worker's own
 * `checkNotificationAccess`; the producers run through the real
 * `triggerNotification`, `deliverRecordBells`, /api/messaging/send and
 * /api/cron/monitor-enrollments. Replaced edges: the Supabase client (an
 * in-memory fake), the caller's identity and the e-mail transport. Synthetic only.
 */
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.CRON_SECRET = 'synthetic-cron-secret';

const db = vi.hoisted(() => ({
  rows: [] as Array<Record<string, any>>,
  writes: [] as Array<{ table: string; op: string; payload: any }>,
  enqueues: [] as Array<Record<string, any>>,
  thread: null as Record<string, unknown> | null,
  workspaceMembers: new Set<string>(),
  admins: [] as Array<{ user_id: string }>,
  counts: [] as number[],
  onAdminLookup: () => {},
}));

vi.mock('@supabase/supabase-js', () => {
  const answer = (table: string, op: string, filters: Array<[string, unknown]>, payload: any) => {
    if (table === 'user_notifications' && op === 'insert') {
      if (db.rows.some((row) => row.idempotency_key && row.idempotency_key === payload.idempotency_key)) {
        return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "unique_notification_idempotency_key"' } };
      }
      db.rows.push(payload);
      return { data: { id: `row-${db.rows.length}`, ...payload }, error: null };
    }
    if (table === 'user_notifications') return { data: [], error: null };
    if (table === 'profiles') {
      return { data: { email: 'destinataria@qa.local.test', first_name: 'Remitente', last_name: 'Sintético', must_change_password: false, school_id: null }, error: null };
    }
    if (table === 'user_roles') {
      if (filters.some(([c, v]) => c === 'role_type' && v === 'admin')) return (db.onAdminLookup(), { data: db.admins, error: null });
      return { data: filters.some(([c]) => c === 'in:user_id') ? [{ user_id: SENDER, school_id: 10, community_id: null }, { user_id: RECIPIENT, school_id: 10, community_id: null }] : [], error: null };
    }
    if (table === 'message_threads') return { data: db.thread, error: null };
    if (table === 'workspace_messages') {
      db.writes.push({ table, op, payload });
      return { data: op === 'insert' ? { id: MESSAGE_ID, recipient_id: payload.recipient_id } : null, error: null };
    }
    if (table === 'course_enrollments') return { data: null, count: db.counts.shift() ?? 0, error: null };
    return { data: null, error: null };
  };
  const from = (table: string) => {
    let op = 'select';
    let payload: any;
    const filters: Array<[string, unknown]> = [];
    const done = () => Promise.resolve(answer(table, op, filters, payload));
    const builder: any = {
      select: () => builder,
      insert: (p: unknown) => ((op = 'insert'), (payload = p), builder),
      update: (p: unknown) => ((op = 'update'), (payload = p), builder),
      eq: (c: string, v: unknown) => (filters.push([c, v]), builder),
      in: (c: string, v: unknown) => (filters.push([`in:${c}`, v]), builder),
      not: () => builder,
      or: () => builder,
      gte: () => builder,
      limit: () => builder,
      order: () => builder,
      single: done,
      maybeSingle: done,
      then: (resolve: any, reject: any) => done().then(resolve, reject),
    };
    return builder;
  };
  const rpc = (fn: string, args: Record<string, any>) => {
    if (fn === 'can_access_message_thread') {
      return Promise.resolve({ data: args.p_thread_id === THREAD && db.workspaceMembers.has(args.p_user_id), error: null });
    }
    if (fn === 'enqueue_notification_with_source') {
      db.enqueues.push(args);
      const row = { notification_id: `bell-${db.enqueues.length}`, outbox_id: `outbox-${db.enqueues.length}`, idempotency_key: `key-${db.enqueues.length}`, in_app: true, email_mode: 'immediate', email_reason: 'catalog_default' };
      return Promise.resolve({ data: [row], error: null });
    }
    return Promise.resolve({ data: fn === 'get_active_triggers' ? [] : null, error: null });
  };
  return { createClient: () => ({ from, rpc }) };
});

const { mockGetApiUser } = vi.hoisted(() => ({ mockGetApiUser: vi.fn() }));
vi.mock('../../lib/api-auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api-auth')>();
  const { createClient } = await import('@supabase/supabase-js');
  return { ...actual, getApiUser: mockGetApiUser, createServiceRoleClient: () => createClient('http://fake', 'fake') };
});

import { createClient } from '@supabase/supabase-js';
import NotificationService from '../../lib/notificationService';
import { NOTIFICATION_CATALOG, resolveNotificationSource } from '../../lib/notifications/catalog';
import { checkNotificationAccess } from '../../lib/email/notification-access';
import { deliverRecordBells } from '../../pages/api/quiz-reviews/notify-pending';
import sendHandler from '../../pages/api/messaging/send';
import monitorHandler from '../../pages/api/cron/monitor-enrollments';

const SENDER = '11111111-1111-4111-8111-111111111111';
const RECIPIENT = '22222222-2222-4222-8222-222222222222';
const ADMIN_B = '33333333-3333-4333-8333-333333333333';
const THREAD = '44444444-4444-4444-8444-444444444444';
const WORKSPACE = '55555555-5555-4555-8555-555555555555';
const SPOOFED_WS = '66666666-6666-4666-8666-666666666666';
const MESSAGE_ID = '77777777-7777-4777-8777-777777777777';
const id = (n: number) => `0b7c2c1e-5d1a-4c6e-9f00-${String(n).padStart(12, '0')}`;
const LEGACY_ROW_FIELDS = ['category', 'created_at', 'description', 'idempotency_key', 'importance', 'notification_type_id', 'read_at', 'related_url', 'title', 'user_id'];

let created: Array<Record<string, any>>;
let sends: unknown[];
let logs: ReturnType<typeof vi.spyOn>[];

beforeEach(() => {
  Object.assign(db, { rows: [], writes: [], enqueues: [], thread: { id: THREAD, workspace_id: WORKSPACE }, workspaceMembers: new Set([SENDER, RECIPIENT]), admins: [], counts: [], onAdminLookup: () => {} });
  created = [];
  sends = [];
  delete process.env.NOTIFICATION_EMAIL_ENABLED;
  vi.stubEnv('NEXT_PUBLIC_BASE_URL', 'https://genera.test');
  const transport = vi.fn(async (message: unknown) => (sends.push(message), { data: { id: `provider-${sends.length}` }, error: null }));
  const create = NotificationService.createNotification.bind(NotificationService);
  vi.spyOn(NotificationService, 'createNotification').mockImplementation((data: any) => {
    created.push(data);
    return create(data, { client: createClient('http://fake', 'fake'), transport });
  });
  mockGetApiUser.mockReset().mockResolvedValue({ user: { id: SENDER }, error: null });
  logs = (['log', 'warn', 'error'] as const).map((level) => vi.spyOn(console, level).mockImplementation(() => {}));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

const loggedText = () => logs.flatMap((spy) => spy.mock.calls).map((args) => JSON.stringify(args)).join('\n');

/** Nothing of the context reaches a bell row, a mail or a log line. */
function expectNoContextLeak(...secrets: string[]) {
  for (const row of db.rows) expect(Object.keys(row).sort()).toEqual(LEGACY_ROW_FIELDS);
  const text = [JSON.stringify(sends), JSON.stringify(db.rows), loggedText()].join('\n');
  for (const secret of secrets) expect(text).not.toContain(secret);
}

/** Every event the worker mails, with a payload naming several distinct ids; the expected record. */
const SESSION = { session: { id: id(1), title: 'Sesión' }, consultant_id: id(2), school_id: 7 };
const LICITACION = { licitacion_id: id(3), school_id: id(4), deadline_date: '2026-10-10', reminder: '1d' };
const CASES: Record<string, [Record<string, unknown>, string | null, string | null]> = {
  course_assigned: [{ course: { id: id(10) }, assigned_users: [id(11)], assigned_by: id(12) }, 'course', id(10)],
  course_completed: [{ course_id: id(13), student_id: id(14) }, 'course', id(13)],
  module_completed: [{ module_id: id(15), course_id: id(16), student_id: id(17) }, 'course', id(16)],
  assignment_created: [{ assignment: { id: id(18) }, course_id: id(19) }, 'assignment', id(18)],
  assignment_feedback: [{ assignment_id: id(20), feedback_id: id(21), course_id: id(22), student_id: id(23) }, 'assignment', id(20)],
  assignment_due_soon: [{ assignment_id: id(24), course_id: id(25), student_id: id(26) }, 'assignment', id(24)],
  group_invitation: [{ group_id: id(27) }, 'group', id(27)],
  group_assignment_submitted: [{ group_id: id(28), assignment_id: id(29), submitted_at: '2026-10-09T03:00:00Z' }, 'group', id(28)],
  quiz_review_pending: [{ submission_id: id(30), quiz_id: id(31), lesson_id: id(32) }, 'quiz_submission', id(30)],
  quiz_reviewed: [{ submission_id: id(33), quiz_id: id(34), lesson_id: id(35), graded_at: 'x' }, 'quiz_submission', id(33)],
  message_sent: [{ message_id: id(36), thread_id: id(37), workspace_id: id(38), context: 'workspace_thread' }, 'workspace', id(38)],
  user_mentioned: [{ mention_id: id(39), message_id: id(40), thread_id: id(41), workspace_id: id(42) }, 'workspace', id(42)],
  consultant_assigned: [{ assignment_id: id(43), consultant_id: id(44), student_id: id(45) }, 'consultant_assignment', id(43)],
  qa_scenario_assigned: [{ scenario_id: id(46), tester_id: id(47) }, null, null],
  new_feedback: [{ feedback_id: id(48) }, null, null],
  qa_test_failed: [{ test_run_id: id(49) }, null, null],
  data_quality_alert: [{}, null, null],
  system_update: [{ update_id: id(50) }, null, null],
};
for (const event of ['session_created', 'session_rescheduled', 'session_cancelled', 'session_reminder_24h', 'session_reminder_1h', 'session_edit_request_submitted', 'session_edit_request_approved', 'session_edit_request_rejected']) {
  CASES[event] = [SESSION, 'session', id(1)];
}
for (const event of Object.keys(NOTIFICATION_CATALOG).filter((e) => e.startsWith('licitacion_'))) {
  CASES[event] = [LICITACION, 'licitacion', id(3)];
}

/** The worker's access check with every read failing: `unavailable` means the source itself passed. */
const failingReads = { from: () => { const b: any = new Proxy({}, { get: (_t, p) => (p === 'then' ? (r: any) => r({ data: null, error: { code: 'x' } }) : () => b) }); return b; } } as any;

describe('D1 · every event the worker mails resolves to its exact record', () => {
  it.each(Object.entries(CASES))('%s names the record the worker checks, not an unrelated id', async (event, [data, kind, sourceId]) => {
    const result = resolveNotificationSource(event, data);
    expect(result).toEqual({ status: 'ok', sourceKind: kind, sourceId });
    const decision = await checkNotificationAccess(failingReads, { eventType: event, userId: SENDER, sourceKind: kind, sourceId });
    expect(decision).toEqual({ access: 'unavailable', code: 'access_lookup_failed' });
  });

  it('the catalog and the worker agree on which events can be mailed', async () => {
    for (const event of [...Object.keys(NOTIFICATION_CATALOG), 'unknown_event']) {
      const unsupported = resolveNotificationSource(event, {}).status === 'unsupported';
      const worker = await checkNotificationAccess(failingReads, { eventType: event, userId: SENDER, sourceKind: null, sourceId: null });
      expect([event, unsupported]).toEqual([event, worker.access === 'invalid' && worker.code === 'event_unsupported']);
      expect(unsupported).toBe(!(event in CASES));
    }
  });

  it('an upper-case UUID is normalised, and two paths naming the same record agree', () => {
    const upper = id(18).toUpperCase();
    expect(resolveNotificationSource('assignment_created', { assignment: { id: upper }, assignment_id: id(18) })).toEqual({ status: 'ok', sourceKind: 'assignment', sourceId: id(18) });
  });
});

describe('D2 · a supported event without exactly one valid record fails safely', () => {
  it.each([
    ['missing', 'course_assigned', { course: { name: 'Curso' } }, 'source_missing'],
    ['only a URL and title', 'assignment_feedback', { related_url: `/assignments/${id(20)}`, title: 'Tarea' }, 'source_missing'],
    ['null payload', 'session_created', null, 'source_missing'],
    ['not a UUID', 'licitacion_created', { licitacion_id: 'licitacion-1' }, 'source_malformed'],
    ['a positive integer', 'course_completed', { course_id: 42 }, 'source_malformed'],
    ['blank', 'group_invitation', { group_id: '' }, 'source_malformed'],
    ['padded', 'quiz_reviewed', { submission_id: ` ${id(33)}` }, 'source_malformed'],
    ['two paths naming two records', 'assignment_created', { assignment: { id: id(18) }, assignment_id: id(19) }, 'source_conflict'],
    ['a workspace thread message without its workspace', 'message_sent', { message_id: id(36), context: 'workspace_thread' }, 'source_missing'],
    ['a message without context or workspace', 'message_sent', { message_id: id(36) }, 'source_missing'],
    ['a direct message that names a workspace', 'message_sent', { context: 'direct_message', workspace_id: id(38) }, 'source_conflict'],
    ['a mention claiming to be a direct message', 'user_mentioned', { context: 'direct_message', mention_id: id(39) }, 'source_missing'],
  ])('%s (%s) → invalid', (_label, event, data, code) => {
    const result = resolveNotificationSource(event as string, data as any);
    expect(result).toEqual({ status: 'invalid', code });
    expect(JSON.stringify(result)).not.toMatch(/0b7c2c1e|licitacion-1|42/);
  });

  it.each([
    ['unknown event', 'unknown_event', { course_id: id(1) }, 'event_unsupported'],
    ['unwired learning path', 'learning_path_assigned', { learning_path: { id: id(1) } }, 'event_unsupported'],
    ['in-app-only meeting', 'meeting_finalized', { meeting_id: id(1), workspace_id: id(2) }, 'event_unsupported'],
    ['explicit direct message', 'message_sent', { message_id: id(36), context: 'direct_message' }, 'recordless'],
  ])('%s (%s) → unsupported, not invalid', (_label, event, data, code) => {
    expect(resolveNotificationSource(event, data)).toEqual({ status: 'unsupported', code });
  });
});

describe('D3 · producers hand createNotification the original occurrence and record', () => {
  it('a trigger passes one occurrence to every recipient, keeps it on a retry and changes it for a new record', async () => {
    const payload = { course: { id: id(10), name: 'Curso' }, assigned_users: [SENDER, RECIPIENT] };
    await NotificationService.triggerNotification('course_assigned', payload);
    expect(created).toHaveLength(2);
    const [first, second] = created;
    expect(first.source_context).toEqual({ occurrence: expect.stringMatching(/^unidentified:/), eventData: payload });
    expect(second.source_context.occurrence).toBe(first.source_context.occurrence);
    expect(first.idempotency_key).toBe(NotificationService.generateIdempotencyKey('course_assigned', first.source_context.occurrence, SENDER));

    const message = { message_id: id(36), recipient_id: RECIPIENT, sender_name: 'Remitente', workspace_id: WORKSPACE, context: 'workspace_thread' };
    await NotificationService.triggerNotification('message_sent', message);
    await NotificationService.triggerNotification('message_sent', { ...message });
    await NotificationService.triggerNotification('message_sent', { ...message, message_id: id(37) });
    const [a, retry, next] = created.slice(2).map((c) => c.source_context);
    expect(a).toEqual({ occurrence: `record:${id(36)}`, eventData: message });
    expect(retry.occurrence).toBe(a.occurrence);
    expect(next.occurrence).toBe(`record:${id(37)}`);
    expect(resolveNotificationSource('message_sent', a.eventData)).toEqual({ status: 'ok', sourceKind: 'workspace', sourceId: WORKSPACE });
    expect(db.rows).toHaveLength(4); // the retry wrote no second bell
    expectNoContextLeak(WORKSPACE, 'record:', 'unidentified:');
  });

  it.each([
    ['group_invitation', { group_id: id(27) }, 'Te agregaron a un grupo', '/mi-aprendizaje/tareas'],
    ['group_assignment_submitted', { group_id: id(28), assignment_id: id(29), submitted_at: '2026-10-09T03:00:00Z' }, 'Nueva tarea grupal entregada', '/admin/assignment-overview'],
    ['quiz_review_pending', { submission_id: id(30) }, 'Quiz pendiente de revisión', `/quiz-reviews/${id(30)}`],
    ['quiz_reviewed', { submission_id: id(33), lesson_id: id(35), graded_at: '2026-10-09T03:00:00Z' }, 'Quiz revisado', `/student/lesson/${id(35)}`],
  ] as const)('%s bells carry the record and its occurrence; keys, copy and links are unchanged', async (event, record, title, url) => {
    expect(await deliverRecordBells(event, record, [{ id: SENDER }, { id: RECIPIENT }, { id: SENDER }])).toBe(0);
    expect(await deliverRecordBells(event, { ...record }, [{ id: SENDER }])).toBe(0);
    const occurrence = NotificationService.resolveOccurrence(event, record);
    expect(occurrence).toMatch(/^record:/);
    expect(created.map((c) => c.source_context)).toEqual(Array(3).fill({ occurrence, eventData: record }));
    expect(db.rows.map((r) => [r.user_id, r.title, r.related_url, r.category, r.idempotency_key])).toEqual(
      [SENDER, RECIPIENT].map((u) => [u, title, url, 'assignments', NotificationService.generateIdempotencyKey(event, occurrence, u)])
    );
    expect(resolveNotificationSource(event, created[0].source_context.eventData)).toMatchObject({ status: 'ok' });
    expectNoContextLeak('record:');
  });

  it('a new record occurrence (a later review) gets its own occurrence and bell', async () => {
    const base = { submission_id: id(33), lesson_id: id(35) };
    await deliverRecordBells('quiz_reviewed', { ...base, graded_at: '2026-10-09T03:00:00Z' }, [{ id: SENDER }]);
    await deliverRecordBells('quiz_reviewed', { ...base, graded_at: '2026-10-09T04:00:00Z' }, [{ id: SENDER }]);
    expect(new Set(created.map((c) => c.source_context.occurrence)).size).toBe(2);
    expect(db.rows).toHaveLength(2);
  });
});

async function send(body: Record<string, unknown>) {
  const { req, res } = createMocks({ method: 'POST', body, headers: { authorization: 'Bearer synthetic-token' } });
  await sendHandler(req as any, res as any);
  return { status: res._getStatusCode(), body: res._getJSONData() };
}

describe('D4 · messaging/send conveys only the checked thread workspace', () => {
  it('a thread message carries the persisted workspace, never the requested one', async () => {
    const res = await send({ recipient_id: RECIPIENT, content: 'Hola', thread_id: THREAD, workspace_id: SPOOFED_WS });
    expect(res.body).toMatchObject({ success: true, notificationSent: true });
    expect(created).toHaveLength(1);
    const { eventData } = created[0].source_context;
    expect(eventData).toMatchObject({ workspace_id: WORKSPACE, context: 'workspace_thread', message_id: MESSAGE_ID });
    expect(resolveNotificationSource('message_sent', eventData)).toEqual({ status: 'ok', sourceKind: 'workspace', sourceId: WORKSPACE });
    expectNoContextLeak(SPOOFED_WS, WORKSPACE, 'Hola');
  });

  it('a direct message is unchanged: no workspace even when the request names one', async () => {
    const res = await send({ recipient_id: RECIPIENT, content: 'Hola', workspace_id: SPOOFED_WS });
    expect(res.body).toMatchObject({ success: true, notificationSent: true });
    const { eventData } = created[0].source_context;
    expect(eventData).toEqual({ message_id: MESSAGE_ID, sender_id: SENDER, recipient_id: RECIPIENT, sender_name: 'Remitente Sintético', content: 'Tienes un nuevo mensaje', context: 'direct_message' });
    expect(resolveNotificationSource('message_sent', eventData)).toEqual({ status: 'unsupported', code: 'recordless' });
  });

  it('a recipient outside the thread workspace gets nothing and nothing is written', async () => {
    db.workspaceMembers = new Set([SENDER]);
    const res = await send({ recipient_id: RECIPIENT, content: 'Hola', thread_id: THREAD, workspace_id: SPOOFED_WS });
    expect(res.status).toBe(403);
    expect(db.writes).toHaveLength(0);
    expect(created).toHaveLength(0);
  });
});

const GROUP = '88888888-8888-4888-8888-888888888888';
const OTHER_GROUP = '99999999-9999-4999-8999-999999999999';

describe('R8 · a message in an assignment-group thread names the thread group', () => {
  it.each([
    ['message_sent without a workspace', 'message_sent', { message_id: id(36), thread_id: id(37), context: 'workspace_thread', thread_group_ids: [GROUP] }],
    ['message_sent inside a workspace (the workspace does not decide)', 'message_sent', { message_id: id(36), workspace_id: id(38), context: 'workspace_thread', thread_group_ids: [GROUP.toUpperCase()] }],
    ['user_mentioned inside a workspace', 'user_mentioned', { message_id: id(40), workspace_id: id(42), thread_group_ids: [GROUP] }],
    ['the same group twice', 'user_mentioned', { message_id: id(40), thread_group_ids: [GROUP, GROUP.toUpperCase()] }],
  ])('%s → group', (_label, event, data) => {
    expect(resolveNotificationSource(event, data)).toEqual({ status: 'ok', sourceKind: 'group', sourceId: GROUP });
  });

  it.each([
    ['two groups', 'message_sent', { workspace_id: id(38), context: 'workspace_thread', thread_group_ids: [GROUP, OTHER_GROUP] }, 'source_conflict'],
    ['a direct message naming a group', 'message_sent', { context: 'direct_message', thread_group_ids: [GROUP] }, 'source_conflict'],
    ['a group id that is not a UUID', 'user_mentioned', { workspace_id: id(42), thread_group_ids: ['grupo-1'] }, 'source_malformed'],
    ['a group list that is not a list', 'message_sent', { workspace_id: id(38), thread_group_ids: GROUP }, 'source_malformed'],
    ['no group and no workspace', 'message_sent', { context: 'workspace_thread', thread_group_ids: [] }, 'source_missing'],
  ])('%s → invalid', (_label, event, data, code) => {
    const result = resolveNotificationSource(event, data);
    expect(result).toEqual({ status: 'invalid', code });
    expect(JSON.stringify(result)).not.toMatch(/8888|9999|grupo-1/);
  });

  it('an ordinary thread keeps its workspace, and other events ignore a group list', () => {
    expect(resolveNotificationSource('message_sent', { workspace_id: id(38), context: 'workspace_thread', thread_group_ids: [] })).toEqual({ status: 'ok', sourceKind: 'workspace', sourceId: id(38) });
    expect(resolveNotificationSource('course_assigned', { course: { id: id(10) }, thread_group_ids: [GROUP] })).toEqual({ status: 'ok', sourceKind: 'course', sourceId: id(10) });
  });
});

/** A worker client: the recipient's active roles, and the group/workspace RPC answers it records. */
function accessClient({ roles = [{ role_type: 'docente', school_id: 10, generation_id: null, community_id: null, is_active: true }], group = true as boolean | 'error' } = {}) {
  const calls: Array<[string, Record<string, unknown>]> = [];
  const query = (data: unknown) => {
    const builder: any = { select: () => builder, eq: () => builder, maybeSingle: () => Promise.resolve({ data: null, error: null }), then: (resolve: any) => resolve({ data, error: null }) };
    return builder;
  };
  const client = {
    from: (table: string) => query(table === 'user_roles' ? roles : null),
    rpc: (fn: string, args: Record<string, unknown>) => {
      calls.push([fn, args]);
      if (fn === 'can_access_assignment_group') return Promise.resolve(group === 'error' ? { data: null, error: { code: 'XX000' } } : { data: group, error: null });
      return Promise.resolve({ data: fn === 'can_access_workspace', error: null });
    },
  } as any;
  return { client, calls };
}

describe('R8 · the worker re-checks a group-thread message against its group, never its workspace', () => {
  const check = (c: ReturnType<typeof accessClient>, eventType = 'message_sent', sourceKind = 'group') =>
    checkNotificationAccess(c.client, { eventType, userId: RECIPIENT, sourceKind, sourceId: GROUP });

  it.each(['message_sent', 'user_mentioned'])('%s: a recipient the group admits is allowed through can_access_assignment_group', async (event) => {
    const c = accessClient();
    expect(await check(c, event)).toEqual({ access: 'allow' });
    expect(c.calls).toEqual([['can_access_assignment_group', { p_user_id: RECIPIENT, p_group_id: GROUP }]]);
  });

  it('removed from the group (or held by a forced password change): revoked, although the workspace would still admit them', async () => {
    const c = accessClient({ group: false });
    expect(await check(c)).toEqual({ access: 'revoked', code: 'source_access_revoked' });
    expect(c.calls.map(([fn]) => fn)).toEqual(['can_access_assignment_group']);
  });

  it('a failed group read sends nothing now', async () => {
    expect(await check(accessClient({ group: 'error' }))).toEqual({ access: 'unavailable', code: 'access_lookup_failed' });
  });

  it('no active role: revoked before any group read', async () => {
    const c = accessClient({ roles: [] });
    expect(await check(c)).toEqual({ access: 'revoked', code: 'no_active_role' });
    expect(c.calls).toEqual([]);
  });

  it('a workspace message still uses can_access_workspace; another record kind is a mismatch', async () => {
    const c = accessClient({ group: false });
    expect(await check(c, 'message_sent', 'workspace')).toEqual({ access: 'allow' });
    expect(c.calls.map(([fn]) => fn)).toEqual(['can_access_workspace']);
    expect(await check(accessClient(), 'user_mentioned', 'session')).toEqual({ access: 'invalid', code: 'source_mismatch' });
  });

  it('group invitations keep their own member policy (no group RPC)', async () => {
    const c = accessClient();
    expect(await check(c, 'group_invitation')).toEqual({ access: 'revoked', code: 'source_access_revoked' });
    expect(c.calls).toEqual([]);
  });
});

describe('R8 · messaging/send names the persisted group of an assignment-group thread', () => {
  const groupThread = (extra: Record<string, unknown> = {}) => ({ id: THREAD, workspace_id: null, assignment_group_id: GROUP, group_assignment_discussions: [{ group_id: GROUP }], ...extra });
  const forged = { workspace_id: SPOOFED_WS, assignment_group_id: OTHER_GROUP, thread_group_ids: [OTHER_GROUP] };
  beforeEach(() => vi.stubEnv('NOTIFICATION_OUTBOX_DELIVERY', 'on'));

  it.each([
    ['without a workspace', groupThread()],
    ['inside a workspace', groupThread({ workspace_id: WORKSPACE })],
    ['linked only by a legacy discussion', { id: THREAD, workspace_id: null, assignment_group_id: null, group_assignment_discussions: [{ group_id: GROUP.toUpperCase() }] }],
  ])('a thread %s: one enqueue with source group/<id>; nothing written or sent synchronously', async (_label, thread) => {
    db.thread = thread;
    const res = await send({ recipient_id: RECIPIENT, content: 'Hola privado', thread_id: THREAD, ...forged });
    expect(res.body).toMatchObject({ success: true, notificationSent: true });
    expect(db.enqueues.map((a) => [a.p_event_type, a.p_user_id, a.p_occurrence_id, a.p_source_kind, a.p_source_id])).toEqual([
      ['message_sent', RECIPIENT, NotificationService.resolveOccurrence('message_sent', { message_id: MESSAGE_ID }), 'group', GROUP],
    ]);
    expect(sends).toHaveLength(0);
    expect(db.rows).toHaveLength(0);
    expect(JSON.stringify(db.enqueues)).not.toMatch(/Hola privado|9999|6666-4666/);
    expectNoContextLeak('Hola privado', GROUP, OTHER_GROUP, SPOOFED_WS);
  });

  it('an ordinary workspace thread keeps its workspace source and payload', async () => {
    const res = await send({ recipient_id: RECIPIENT, content: 'Hola', thread_id: THREAD, ...forged });
    expect(res.body).toMatchObject({ success: true, notificationSent: true });
    expect(created[0].source_context.eventData).not.toHaveProperty('thread_group_ids');
    expect(db.enqueues.map((a) => [a.p_source_kind, a.p_source_id])).toEqual([['workspace', WORKSPACE]]);
  });

  it('a thread whose metadata names two groups fails closed: the message is saved, nothing is enqueued, written or sent', async () => {
    db.thread = groupThread({ group_assignment_discussions: [{ group_id: GROUP }, { group_id: OTHER_GROUP }] });
    const res = await send({ recipient_id: RECIPIENT, content: 'Hola privado', thread_id: THREAD });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, notificationSent: false });
    expect(db.writes.map((w) => w.op)).toEqual(['insert']);
    expect([db.enqueues, db.rows, sends]).toEqual([[], [], []]);
    expectNoContextLeak('Hola privado', GROUP, OTHER_GROUP);
  });

  it('flag unset: a group-thread message keeps the synchronous bell, identical to a workspace thread', async () => {
    delete process.env.NOTIFICATION_OUTBOX_DELIVERY;
    await send({ recipient_id: RECIPIENT, content: 'Hola', thread_id: THREAD });
    const workspaceBell = db.rows[0];
    Object.assign(db, { rows: [], thread: groupThread() });
    await send({ recipient_id: RECIPIENT, content: 'Hola', thread_id: THREAD });
    expect(db.enqueues).toEqual([]);
    expect(db.rows).toHaveLength(1);
    expect({ ...db.rows[0], created_at: null }).toEqual({ ...workspaceBell, created_at: null });
    expectNoContextLeak('Hola', GROUP);
  });
});

async function monitor(authorization?: string) {
  const { req, res } = createMocks({ method: 'GET', headers: authorization ? { authorization } : {} });
  await monitorHandler(req as any, res as any);
  return { status: res._getStatusCode(), body: res._getJSONData() };
}

describe('D5 · the enrollment monitor carries its one timestamp as the occurrence', () => {
  const NOW = '2026-10-09T03:00:00.000Z';

  it('every admin gets the same original timestamp with the old key, copy and category', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(NOW));
    db.admins = [{ user_id: SENDER }, { user_id: ADMIN_B }];
    db.counts = [3, 1];
    db.onAdminLookup = () => vi.setSystemTime(new Date('2026-10-09T03:05:00.000Z')); // the clock moves before the bells
    const res = await monitor('Bearer synthetic-cron-secret');

    expect(res).toMatchObject({ status: 200, body: { status: 'ALERT', timestamp: NOW, alert_sent: true } });
    expect(created.map((c) => [c.user_id, c.idempotency_key, c.category, c.title, c.related_url, c.source_context])).toEqual(
      [SENDER, ADMIN_B].map((u) => [u, `enrollment_alert_${NOW}_${u}`, 'system_alert', 'Enrollment Data Quality Alert', '/admin/course-assignments', { occurrence: NOW, eventData: {} }])
    );
    expect(created[0].description).toContain('Total enrollments with zero total_lessons: 3');
    expect(resolveNotificationSource('data_quality_alert', created[0].source_context.eventData)).toEqual({ status: 'ok', sourceKind: null, sourceId: null });
    expect(db.rows.map((r) => r.idempotency_key)).toEqual([SENDER, ADMIN_B].map((u) => `enrollment_alert_${NOW}_${u}`));
    expectNoContextLeak();
  });

  it('no issue creates nothing', async () => {
    db.admins = [{ user_id: SENDER }];
    db.counts = [0, 0];
    expect(await monitor('Bearer synthetic-cron-secret')).toMatchObject({ status: 200, body: { status: 'ok', alert_sent: false } });
    expect(created).toHaveLength(0);
  });

  it('an unauthorized call creates nothing', async () => {
    db.admins = [{ user_id: SENDER }];
    db.counts = [3, 1];
    expect((await monitor('Bearer wrong')).status).toBe(401);
    expect(created).toHaveLength(0);
    expect(db.rows).toHaveLength(0);
  });
});
