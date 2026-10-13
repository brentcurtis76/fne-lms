// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { createMocks } from 'node-mocks-http';

/**
 * N5-02c: `NOTIFICATION_OUTBOX_DELIVERY` selects, inside `createNotification`,
 * between the synchronous bell + immediate mail and one
 * `enqueue_notification_with_source` call per recipient. Producers run through
 * the real `triggerNotification`, `deliverRecordBells` and
 * /api/cron/monitor-enrollments. Replaced edges: the Supabase client (an
 * in-memory fake whose enqueue RPC answers like the SQL's return row) and the
 * e-mail transport. Synthetic only.
 */
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.CRON_SECRET = 'synthetic-cron-secret';

type Channels = { inApp: boolean; mode?: 'immediate' | 'digest' | 'off' };

const db = vi.hoisted(() => ({
  bells: [] as Array<Record<string, any>>,
  reads: [] as string[],
  enqueues: [] as Array<Record<string, any>>,
  /** Stored source per idempotency key, as `notification_email_outbox_source` keeps it. */
  sources: new Map<string, string>(),
  channels: { inApp: true } as Channels,
  categoryMode: null as string | null,
  admins: [] as Array<{ user_id: string }>,
  counts: [] as number[],
  /** Replaces the enqueue RPC's answer when set. */
  enqueueAnswer: null as null | (() => unknown),
}));

const keyOf = (event: string, occurrence: string, user: string) =>
  `notif-${createHash('sha256').update(JSON.stringify([event, occurrence, user]), 'utf8').digest('hex')}`;

vi.mock('@supabase/supabase-js', () => {
  const answer = (table: string, op: string, payload: any) => {
    db.reads.push(`${table}:${op}`);
    if (table === 'user_notifications' && op === 'insert') {
      if (db.bells.some((row) => row.idempotency_key && row.idempotency_key === payload.idempotency_key)) {
        return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "unique_notification_idempotency_key"' } };
      }
      db.bells.push(payload);
      return { data: { id: `row-${db.bells.length}`, ...payload }, error: null };
    }
    if (table === 'user_notifications') return { data: [], error: null };
    if (table === 'user_notification_category_prefs') return { data: db.categoryMode ? { email_mode: db.categoryMode } : null, error: null };
    if (table === 'profiles') {
      return { data: { email: 'destinataria@qa.local.test', first_name: 'Destinataria', last_name: 'Sintética', must_change_password: false, school_id: null }, error: null };
    }
    if (table === 'user_roles') return { data: db.admins.length && op === 'select' ? db.admins : [], error: null };
    if (table === 'course_enrollments') return { data: null, count: db.counts.shift() ?? 0, error: null };
    return { data: null, error: null };
  };
  const from = (table: string) => {
    let op = 'select';
    let payload: any;
    const done = () => Promise.resolve(answer(table, op, payload));
    const builder: any = {
      select: () => builder,
      insert: (p: unknown) => ((op = 'insert'), (payload = p), builder),
      eq: () => builder,
      in: () => builder,
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
  const enqueue = (args: Record<string, any>) => {
    db.enqueues.push(args);
    if (db.enqueueAnswer) return db.enqueueAnswer();
    const key = keyOf(args.p_event_type, args.p_occurrence_id, args.p_user_id);
    const source = `${args.p_source_kind}:${args.p_source_id}`;
    if (db.sources.has(key) && db.sources.get(key) !== source) {
      return { data: null, error: { code: '22023', message: 'enqueue_notification_with_source: source conflicts with the stored outbox row' } };
    }
    db.sources.set(key, source);
    const mode = args.p_mandatory ? 'immediate' : db.channels.mode ?? args.p_email_default;
    return {
      data: [{
        notification_id: db.channels.inApp ? `bell-${key.slice(6, 18)}` : null,
        outbox_id: mode === 'off' ? null : `outbox-${key.slice(6, 18)}`,
        idempotency_key: key,
        in_app: db.channels.inApp,
        email_mode: mode,
        email_reason: args.p_mandatory ? 'mandatory' : db.channels.mode ? 'category_mode' : 'catalog_default',
      }],
      error: null,
    };
  };
  const rpc = (fn: string, args: Record<string, any>) =>
    Promise.resolve(fn === 'enqueue_notification_with_source' ? enqueue(args) : { data: fn === 'get_active_triggers' ? [] : null, error: null });
  return { createClient: () => ({ from, rpc }) };
});

import { createClient } from '@supabase/supabase-js';
import NotificationService from '../../lib/notificationService';
import { buildEmailPayload } from '../../lib/notifications/catalog';
import { isOutboxDeliveryEnabled } from '../../lib/email/notification-worker';
import { deliverRecordBells } from '../../pages/api/quiz-reviews/notify-pending';
import monitorHandler from '../../pages/api/cron/monitor-enrollments';

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
const COURSE = '0B7C2C1E-5D1A-4C6E-9F00-000000000010';
const WORKSPACE = '55555555-5555-4555-8555-555555555555';
const OTHER_WS = '66666666-6666-4666-8666-666666666666';
const GROUP = '88888888-8888-4888-8888-888888888888';
const PRIVATE = 'texto-privado-del-estudiante';
const id = (n: number) => `0b7c2c1e-5d1a-4c6e-9f00-${String(n).padStart(12, '0')}`;

const coursePayload = () => ({
  course: { id: COURSE, name: 'Curso Sintético', description: PRIVATE },
  assigned_users: [USER_A, USER_B],
  assigned_by_email: 'privada@qa.local.test',
});
const threadMessage = (messageId: string, workspace = WORKSPACE) => ({
  message_id: messageId, recipient_id: USER_B, sender_name: 'Remitente', content: PRIVATE, workspace_id: workspace, context: 'workspace_thread',
});
const notification = (event: string, eventData: Record<string, unknown>, occurrence = 'record:occ-1', user = USER_A) => ({
  user_id: user,
  title: 'Título',
  description: 'Descripción',
  category: 'courses',
  related_url: '/mi-aprendizaje',
  importance: 'normal',
  read_at: null,
  event_type: event,
  idempotency_key: keyOf(event, occurrence, user),
  notification_type_id: null,
  source_context: { occurrence, eventData },
});

let created: Array<Record<string, any>>;
let sends: unknown[];
let logs: ReturnType<typeof vi.spyOn>[];

beforeEach(() => {
  Object.assign(db, { bells: [], reads: [], enqueues: [], sources: new Map(), channels: { inApp: true }, categoryMode: null, admins: [], counts: [], enqueueAnswer: null });
  created = [];
  sends = [];
  delete process.env.NOTIFICATION_OUTBOX_DELIVERY;
  delete process.env.NOTIFICATION_EMAIL_ENABLED;
  vi.stubEnv('NEXT_PUBLIC_BASE_URL', 'https://genera.test');
  const transport = vi.fn(async (message: unknown) => (sends.push(message), { data: { id: `provider-${sends.length}` }, error: null }));
  const create = NotificationService.createNotification.bind(NotificationService);
  vi.spyOn(NotificationService, 'createNotification').mockImplementation((data: any) => {
    created.push(data);
    return create(data, { client: createClient('http://fake', 'fake'), transport });
  });
  logs = (['log', 'warn', 'error'] as const).map((level) => vi.spyOn(console, level).mockImplementation(() => {}));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

const flag = (value: string | undefined) =>
  value === undefined ? delete process.env.NOTIFICATION_OUTBOX_DELIVERY : vi.stubEnv('NOTIFICATION_OUTBOX_DELIVERY', value);
const loggedText = () => logs.flatMap((spy) => spy.mock.calls).map((args) => JSON.stringify(args)).join('\n');
/** The synchronous path wrote and sent nothing, and read no preference: SQL decides the channels. */
const expectNoSyncPath = () => {
  expect(db.bells).toEqual([]);
  expect(sends).toEqual([]);
  expect(db.reads.filter((r) => /^user_notification|^user_notifications/.test(r))).toEqual([]);
};
const expectNoLeak = (...extra: unknown[]) => {
  const text = [loggedText(), JSON.stringify(db.enqueues.map((a) => a.p_email_payload)), ...extra.map(String)].join('\n');
  for (const secret of [PRIVATE, 'privada@qa.local.test', 'secret-provider-detail']) expect(text).not.toContain(secret);
};

describe('D1 · flag unset, off or unrecognised: the synchronous path, exactly as before', () => {
  it.each([['unset', undefined], ['off', 'off'], ['false', 'false'], ['0', '0'], ['empty', ''], ['blank', '   '], ['yes', 'yes'], ['enabled', 'enabled']])(
    'flag %s: bells and immediate mails, no enqueue (reading agrees with the worker)',
    async (_name, value) => {
      flag(value);
      expect(isOutboxDeliveryEnabled()).toBe(false);
      const result = await NotificationService.triggerNotification('course_assigned', coursePayload());
      expect(result).toEqual({ success: true, notificationsCreated: 2 });
      expect(db.bells.map((b) => [b.user_id, b.category])).toEqual([[USER_A, 'courses'], [USER_B, 'courses']]);
      expect(sends).toHaveLength(2);
      expect(db.enqueues).toEqual([]);
    }
  );

  it('a digest choice is still mailed immediately, and the kill switch still stops only that mail', async () => {
    flag('off');
    db.categoryMode = 'digest';
    await NotificationService.createNotification(notification('course_assigned', coursePayload()));
    expect(sends).toHaveLength(1);
    vi.stubEnv('NOTIFICATION_EMAIL_ENABLED', 'off');
    await NotificationService.createNotification(notification('course_assigned', coursePayload(), 'record:occ-2'));
    expect(sends).toHaveLength(1);
    expect(db.bells).toHaveLength(2);
    expect(db.enqueues).toEqual([]);
  });
});

describe('D2 · flag on: one source-aware enqueue per recipient, nothing sent here', () => {
  it.each(['on', 'true', '1', ' TRUE '])('flag %s: the real trigger enqueues its original occurrence, catalog metadata, content and source', async (value) => {
    flag('off');
    await NotificationService.triggerNotification('course_assigned', coursePayload());
    const syncBells = db.bells.map((b) => ({ title: b.title, description: b.description, url: b.related_url, importance: b.importance }));
    Object.assign(db, { bells: [], reads: [] });
    sends.length = 0;

    flag(value);
    expect(isOutboxDeliveryEnabled()).toBe(true);
    vi.stubEnv('NOTIFICATION_EMAIL_ENABLED', 'off'); // the sync kill switch does not suppress the outbox
    const result = await NotificationService.triggerNotification('course_assigned', coursePayload());

    expect(result).toEqual({ success: true, notificationsCreated: 2 });
    expect(db.enqueues.map((a) => a.p_user_id)).toEqual([USER_A, USER_B]);
    const occurrence = created.at(-1)!.source_context.occurrence;
    expect(occurrence).toMatch(/^unidentified:/);
    expect(db.enqueues).toEqual(syncBells.map((bell, i) => ({
      p_event_type: 'course_assigned',
      p_occurrence_id: occurrence,
      p_user_id: [USER_A, USER_B][i],
      p_category: 'courses',
      p_email_default: 'immediate',
      p_mandatory: false,
      p_title: bell.title,
      p_description: bell.description,
      p_related_url: bell.url,
      p_importance: bell.importance,
      p_notification_type_id: null,
      p_email_payload: { 'course.name': 'Curso Sintético' },
      p_source_kind: 'course',
      p_source_id: COURSE.toLowerCase(),
    })));
    expectNoSyncPath();
    expectNoLeak();
  });

  it('a workspace thread message is enqueued against its workspace with its record occurrence', async () => {
    flag('on');
    await NotificationService.triggerNotification('message_sent', threadMessage(id(36)));
    expect(db.enqueues).toHaveLength(1);
    expect(db.enqueues[0]).toMatchObject({
      p_occurrence_id: `record:${id(36)}`, p_user_id: USER_B, p_category: 'community',
      p_email_payload: { sender_name: 'Remitente' }, p_source_kind: 'workspace', p_source_id: WORKSPACE,
    });
    expectNoSyncPath();
    expectNoLeak();
  });

  it.each([
    ['group_invitation', { group_id: id(27) }, 'group'],
    ['group_assignment_submitted', { group_id: id(28), assignment_id: id(29), submitted_at: '2026-10-09T03:00:00Z' }, 'group'],
    ['quiz_review_pending', { submission_id: id(30) }, 'quiz_submission'],
    ['quiz_reviewed', { submission_id: id(33), lesson_id: id(35), graded_at: '2026-10-09T03:00:00Z' }, 'quiz_submission'],
  ] as const)('%s record bells use only the new RPC, once per distinct recipient in order', async (event, record, kind) => {
    flag('on');
    expect(await deliverRecordBells(event, record, [{ id: USER_A }, { id: USER_B }, { id: USER_A }])).toBe(0);
    const occurrence = NotificationService.resolveOccurrence(event, record);
    expect(db.enqueues.map((a) => [a.p_user_id, a.p_occurrence_id, a.p_source_kind, a.p_title, a.p_related_url, a.p_category])).toEqual(
      created.map((c) => [c.user_id, occurrence, kind, c.title, c.related_url, 'assignments'])
    );
    expect(db.enqueues.map((a) => a.p_user_id)).toEqual([USER_A, USER_B]);
    expect(db.enqueues[0].p_source_id).toBe(Object.values(record)[0]);
    expectNoSyncPath();
  });

  it('the enrollment monitor enqueues its one timestamp, no source, under the catalog category', async () => {
    flag('on');
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-09T03:00:00.000Z'));
    db.admins = [{ user_id: USER_A }, { user_id: USER_B }];
    db.counts = [3, 1];
    const { req, res } = createMocks({ method: 'GET', headers: { authorization: 'Bearer synthetic-cron-secret' } });
    await monitorHandler(req as any, res as any);
    expect(res._getJSONData()).toMatchObject({ status: 'ALERT', alert_sent: true });
    expect(db.enqueues.map((a) => [a.p_user_id, a.p_occurrence_id, a.p_category, a.p_email_default, a.p_source_kind, a.p_source_id, a.p_email_payload])).toEqual(
      [USER_A, USER_B].map((u) => [u, '2026-10-09T03:00:00.000Z', 'qa_support', 'digest', null, null, {}])
    );
    expectNoSyncPath();
  });

  it.each([
    ['both, immediate', { inApp: true, mode: 'immediate' }],
    ['both, digest', { inApp: true, mode: 'digest' }],
    ['email only', { inApp: false, mode: 'immediate' }],
    ['in-app only', { inApp: true, mode: 'off' }],
  ] as const)('channels %s: the RPC result is returned as it answered', async (_name, channels) => {
    flag('on');
    db.channels = channels;
    const result = await NotificationService.createNotification(notification('course_assigned', coursePayload()));
    const key = keyOf('course_assigned', 'record:occ-1', USER_A);
    expect(result).toEqual({
      notification_id: channels.inApp ? `bell-${key.slice(6, 18)}` : null,
      outbox_id: channels.mode === 'off' ? null : `outbox-${key.slice(6, 18)}`,
      idempotency_key: key,
      in_app: channels.inApp,
      email_mode: channels.mode,
      email_reason: 'category_mode',
    });
    expectNoSyncPath();
  });

  it('channels neither: null, as the synchronous path answers a recipient with both off', async () => {
    flag('on');
    db.channels = { inApp: false, mode: 'off' };
    expect(await NotificationService.createNotification(notification('course_assigned', coursePayload()))).toBeNull();
    expect(db.enqueues).toHaveLength(1);
    expectNoSyncPath();
  });

  it.each([
    ['both, immediate', { inApp: true, mode: 'immediate' }],
    ['both, digest', { inApp: true, mode: 'digest' }],
    ['email only', { inApp: false, mode: 'immediate' }],
    ['in-app only', { inApp: true, mode: 'off' }],
    ['neither', { inApp: false, mode: 'off' }],
  ] as const)('a group-thread message without a workspace, channels %s: one enqueue against the thread group', async (_name, channels) => {
    flag('on');
    db.channels = channels;
    const message = { ...threadMessage(id(36)), workspace_id: null, thread_group_ids: [GROUP] };
    const result = await NotificationService.createNotification(notification('message_sent', message));
    expect(db.enqueues.map((a) => [a.p_event_type, a.p_source_kind, a.p_source_id, a.p_email_payload])).toEqual([
      ['message_sent', 'group', GROUP, { sender_name: 'Remitente' }],
    ]);
    expect(result === null).toBe(!channels.inApp && channels.mode === 'off');
    expectNoSyncPath();
    expectNoLeak();
  });

  it('a mandatory event carries its catalog mandatory flag and session source', async () => {
    flag('on');
    await NotificationService.createNotification(notification('session_cancelled', { session: { id: id(40) } }));
    expect(db.enqueues[0]).toMatchObject({ p_category: 'sessions', p_mandatory: true, p_source_kind: 'session', p_source_id: id(40) });
  });
});

describe('D3 · retries, compatibility and failures', () => {
  it('an identical retry repeats its occurrence and gets the same rows; a new message and each unidentified trigger are new', async () => {
    flag('on');
    await NotificationService.triggerNotification('message_sent', threadMessage(id(36)));
    await NotificationService.triggerNotification('message_sent', threadMessage(id(36)));
    await NotificationService.triggerNotification('message_sent', threadMessage(id(37)));
    const [first, retry, next] = db.enqueues.map((a) => a.p_occurrence_id);
    expect(retry).toBe(first);
    expect(next).toBe(`record:${id(37)}`);
    expect(new Set(db.sources.keys()).size).toBe(2);

    await NotificationService.triggerNotification('course_assigned', coursePayload());
    await NotificationService.triggerNotification('course_assigned', coursePayload());
    const unidentified = db.enqueues.slice(3).map((a) => a.p_occurrence_id);
    expect(new Set(unidentified).size).toBe(2); // one fresh occurrence per trigger, shared by its two recipients
    expectNoSyncPath();
  });

  it('a retry naming another source is rejected by the RPC and the error propagates without any write', async () => {
    flag('on');
    await NotificationService.createNotification(notification('message_sent', threadMessage(id(36))));
    const error = await NotificationService.createNotification(notification('message_sent', threadMessage(id(36), OTHER_WS))).catch((e) => e);
    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({ code: '22023', message: 'notification_enqueue_failed: 22023' });
    expect([...db.sources.values()]).toEqual([`workspace:${WORKSPACE}`]);
    expectNoSyncPath();
    expectNoLeak(error.message);
  });

  it('a group-thread occurrence keeps its group source: a workspace retry is rejected, also with email off; a new message is separate', async () => {
    flag('on');
    const message = (messageId: string, extra: Record<string, unknown>) => ({ ...threadMessage(messageId), ...extra });
    await NotificationService.createNotification(notification('message_sent', message(id(36), { thread_group_ids: [GROUP] })));
    for (const mode of ['immediate', 'off'] as const) {
      db.channels = { inApp: true, mode };
      const error = await NotificationService.createNotification(notification('message_sent', message(id(36), {}))).catch((e) => e);
      expect(error).toMatchObject({ code: '22023', message: 'notification_enqueue_failed: 22023' });
    }
    db.channels = { inApp: true };
    await NotificationService.createNotification(notification('message_sent', message(id(37), { thread_group_ids: [GROUP] }), `record:${id(37)}`));
    expect([...db.sources.values()]).toEqual([`group:${GROUP}`, `group:${GROUP}`]);
    expect(db.sources.size).toBe(2);
    expectNoSyncPath();
  });

  it('a thread naming two groups is invalid before any RPC: the error propagates, nothing is written or sent', async () => {
    flag('on');
    const error = await NotificationService.createNotification(
      notification('message_sent', { ...threadMessage(id(36)), thread_group_ids: [GROUP, OTHER_WS] })
    ).catch((e) => e);
    expect(error).toMatchObject({ code: 'source_conflict', message: 'notification_enqueue_failed: source_conflict' });
    expect(db.enqueues).toEqual([]);
    expectNoSyncPath();
    expectNoLeak(error.message);
    expect(loggedText()).not.toContain(GROUP);
  });

  it.each([
    ['an event the worker never mails', 'learning_path_assigned', { learning_path: { id: id(50) } }],
    ['an explicit direct message', 'message_sent', { message_id: id(51), recipient_id: USER_B, sender_name: 'Remitente', context: 'direct_message' }],
    ['an unknown event', 'legacy_custom_event', {}],
  ])('%s keeps the synchronous path', async (_name, event, eventData) => {
    flag('on');
    await NotificationService.createNotification(notification(event, eventData));
    expect(db.enqueues).toEqual([]);
    expect(db.bells).toHaveLength(1);
    expect(sends).toHaveLength(1);
  });

  it('a notification without an event keeps the synchronous path', async () => {
    flag('on');
    const { event_type: _e, source_context: _s, ...legacy } = notification('course_assigned', {});
    await NotificationService.createNotification({ ...legacy, idempotency_key: null });
    expect(db.enqueues).toEqual([]);
    expect(db.bells).toHaveLength(1);
  });

  it.each([
    ['no context on a record-bound event', notification('course_assigned', {}), 'source_missing', false],
    ['no context on a no-source event', { ...notification('data_quality_alert', {}), source_context: undefined }, 'context_missing', false],
    ['a thread message without its workspace', notification('message_sent', { ...threadMessage(id(36)), workspace_id: undefined }), 'source_missing', false],
    ['a direct message that names a workspace', notification('message_sent', { ...threadMessage(id(36)), context: 'direct_message' }), 'source_conflict', false],
    ['a malformed source id', notification('course_assigned', { course: { id: `${PRIVATE}` } }), 'source_malformed', false],
    ['two different assignment ids', notification('assignment_created', { assignment: { id: id(1) }, assignment_id: id(2) }), 'source_conflict', false],
    ['an empty occurrence', notification('course_assigned', coursePayload(), '  '), 'context_missing', false],
    ['a non-object payload', { ...notification('data_quality_alert', {}), source_context: { occurrence: 'x', eventData: [PRIVATE] } }, 'context_missing', false],
  ])('%s fails closed before any enqueue or synchronous write', async (_name, data, code) => {
    flag('on');
    const error = await NotificationService.createNotification(data).catch((e) => e);
    expect(error).toMatchObject({ code, message: `notification_enqueue_failed: ${code}` });
    expect(db.enqueues).toEqual([]);
    expectNoSyncPath();
    expectNoLeak(error.message);
  });

  const row = { notification_id: 'bell-1', outbox_id: 'outbox-1', idempotency_key: 'notif-x', in_app: true, email_mode: 'immediate', email_reason: 'catalog_default' };
  it.each([
    ['an RPC error with a code', () => ({ data: null, error: { code: 'P0001', message: 'secret-provider-detail', details: PRIVATE } }), 'P0001'],
    ['an RPC error without a usable code', () => ({ data: null, error: { code: 'secret-provider-detail', message: PRIVATE } }), 'enqueue_error'],
    ['a thrown client exception', () => { throw Object.assign(new Error('secret-provider-detail'), { code: '08006' }); }, '08006'],
    ['an empty result', () => ({ data: [], error: null }), 'enqueue_malformed'],
    ['no data', () => ({ data: null, error: null }), 'enqueue_malformed'],
    ['two rows', () => ({ data: [row, row], error: null }), 'enqueue_malformed'],
    ['in-app without a bell id', () => ({ data: [{ ...row, notification_id: null }], error: null }), 'enqueue_malformed'],
    ['email on without an outbox id', () => ({ data: [{ ...row, outbox_id: null }], error: null }), 'enqueue_malformed'],
    ['an unknown email mode', () => ({ data: [{ ...row, email_mode: 'weekly' }], error: null }), 'enqueue_malformed'],
    ['no idempotency key', () => ({ data: [{ ...row, idempotency_key: '' }], error: null }), 'enqueue_malformed'],
  ])('%s is reported as a failure, never rescued synchronously', async (_name, answer, code) => {
    flag('on');
    db.enqueueAnswer = answer;
    const error = await NotificationService.createNotification(notification('course_assigned', coursePayload())).catch((e) => e);
    expect(error).toMatchObject({ code, message: `notification_enqueue_failed: ${code}` });
    expect(db.enqueues).toHaveLength(1);
    expectNoSyncPath();
    expectNoLeak(error.message);
  });

  it('producers report a failed enqueue truthfully', async () => {
    flag('on');
    db.enqueueAnswer = () => ({ data: null, error: { code: '22023', message: 'secret-provider-detail' } });
    expect(await deliverRecordBells('group_invitation', { group_id: id(27) }, [{ id: USER_A }, { id: USER_B }])).toBe(2);
    expect(await NotificationService.triggerNotification('course_assigned', coursePayload())).toEqual({ success: true, notificationsCreated: 0 });
    expectNoSyncPath();
    expectNoLeak();
  });
});

describe('D4 · meeting_finalized stays in-app only under both flags', () => {
  it.each(['off', 'on'])('flag %s: one bell, no mail, no enqueue', async (value) => {
    flag(value);
    await NotificationService.createNotification(notification('meeting_finalized', { meeting_id: id(60), title: 'Reunión' }));
    expect(db.bells).toHaveLength(1);
    expect(sends).toEqual([]);
    expect(db.enqueues).toEqual([]);
  });
});

describe('D5 · schedules', () => {
  it('keeps every existing cron in order and registers the worker every minute and the digest hourly', () => {
    const { crons } = JSON.parse(readFileSync(path.join(process.cwd(), 'vercel.json'), 'utf8'));
    expect(crons).toEqual([
      { path: '/api/cron/zoom-ticker', schedule: '* * * * *' },
      { path: '/api/cron/zoom-reconcile', schedule: '0 * * * *' },
      { path: '/api/cron/recovery-outbox', schedule: '* * * * *' },
      { path: '/api/cron/auth-retention', schedule: '30 3 * * *' },
      { path: '/api/cron/cleanup-learning-path-sessions', schedule: '0 * * * *' },
      { path: '/api/cron/notification-emails', schedule: '* * * * *' },
      { path: '/api/cron/email-digest', schedule: '0 * * * *' },
      { path: '/api/cron/session-reminders', schedule: '0 * * * *' },
      { path: '/api/cron/due-reminders', schedule: '0 * * * *' },
    ]);
    for (const { path: route } of crons) expect(existsSync(path.join(process.cwd(), 'pages', `${route}.ts`))).toBe(true);
  });
});
