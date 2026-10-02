// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * N2-01: occurrence identity through the real `triggerNotification`. The
 * service-role client is an in-memory fake that enforces the real
 * `unique_notification_idempotency_key`, and `createNotification` receives the
 * same fake plus a capturing transport through its `deps` seam. Synthetic only.
 */
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

const db = vi.hoisted(() => ({
  triggers: [] as unknown[],
  rows: [] as Array<Record<string, any>>,
  rpcs: [] as Array<{ fn: string; args: Record<string, any> }>,
  rpcError: null as null | { code: string; message: string },
  tables: [] as string[],
  titleChecks: 0,
  preference: null as null | { email_enabled: boolean; in_app_enabled: boolean },
}));

vi.mock('@supabase/supabase-js', () => {
  const answer = (table: string, op: string, columns: string | undefined, payload: any) => {
    if (table === 'user_notifications' && op === 'insert') {
      if (db.rows.some((row) => row.idempotency_key && row.idempotency_key === payload.idempotency_key)) {
        return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "unique_notification_idempotency_key"' } };
      }
      db.rows.push(payload);
      return { data: { id: `row-${db.rows.length}`, ...payload }, error: null };
    }
    if (table === 'user_notifications') {
      db.titleChecks++;
      return { data: [], error: null };
    }
    if (table === 'user_notification_preferences') return { data: db.preference, error: null };
    if (table === 'profiles') return { data: columns === 'email' ? { email: 'destinataria@qa.local.test' } : { school_id: null }, error: null };
    if (table === 'user_roles') return { data: [], error: null };
    return { data: null, error: null };
  };
  const from = (table: string) => {
    db.tables.push(table);
    let op = 'select';
    let columns: string | undefined;
    let payload: any;
    const done = () => Promise.resolve(answer(table, op, columns, payload));
    const builder: any = {
      select: (c?: string) => ((columns = op === 'insert' ? columns : c), builder),
      insert: (p: unknown) => ((op = 'insert'), (payload = p), builder),
      eq: () => builder,
      in: () => builder,
      not: () => builder,
      gte: () => builder,
      limit: () => builder,
      order: () => builder,
      range: () => builder,
      single: done,
      maybeSingle: done,
      then: (resolve: any, reject: any) => done().then(resolve, reject),
    };
    return builder;
  };
  const client = {
    from,
    rpc: (fn: string, args: Record<string, any>) => {
      db.rpcs.push({ fn, args });
      if (fn === 'get_active_triggers') return Promise.resolve({ data: db.triggers, error: null });
      return Promise.resolve({ data: null, error: fn === 'log_notification_event' ? db.rpcError : null });
    },
  };
  return { createClient: () => client };
});

import { createClient } from '@supabase/supabase-js';
import NotificationService from '../../lib/notificationService';

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
const MESSAGE_ID = '0b7c2c1e-5d1a-4c6e-9f00-0000000000a1';
const SESSION_ID = '0b7c2c1e-5d1a-4c6e-9f00-0000000000b1';
const KEY = /^notif-[0-9a-f]{64}$/;

let sends: Array<{ to: string; key: string }>;
let transportReply: () => Promise<{ data: unknown; error: unknown }>;
let logs: ReturnType<typeof vi.spyOn>[];

beforeEach(() => {
  Object.assign(db, { triggers: [], rows: [], rpcs: [], rpcError: null, tables: [], titleChecks: 0, preference: null });
  sends = [];
  transportReply = async () => ({ data: { id: `provider-${sends.length}` }, error: null });
  delete process.env.NOTIFICATION_EMAIL_ENABLED;
  vi.stubEnv('NEXT_PUBLIC_BASE_URL', 'https://genera.test');
  const transport = vi.fn(async (message: any, options: any) => {
    sends.push({ to: message.to, key: options.idempotencyKey });
    return transportReply();
  });
  const create = NotificationService.createNotification.bind(NotificationService);
  vi.spyOn(NotificationService, 'createNotification').mockImplementation((data: any) =>
    create(data, { client: createClient('http://fake', 'fake'), transport })
  );
  logs = (['log', 'warn', 'error'] as const).map((level) => vi.spyOn(console, level).mockImplementation(() => {}));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.useRealTimers();
  delete process.env.NOTIFICATION_EMAIL_ENABLED;
});

const message = (id: unknown = MESSAGE_ID) => ({ message_id: id, recipient_id: USER_A, sender_name: 'Remitente' });
const keys = () => db.rows.map((row) => row.idempotency_key);
const audits = () => db.rpcs.filter((r) => r.fn === 'log_notification_event').map((r) => r.args);
const loggedText = () => logs.flatMap((spy) => spy.mock.calls).map((args) => JSON.stringify(args)).join('\n');

describe('D1 · a retry of one occurrence keeps one row and one provider key', () => {
  it('D1: the retry two days and a minute boundary later writes no second row and resends the same key', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-28T10:00:59.900Z'));
    await NotificationService.triggerNotification('message_sent', message());
    vi.setSystemTime(new Date('2026-09-30T13:01:00.100Z'));
    const retry = await NotificationService.triggerNotification('message_sent', message());

    expect(retry.success).toBe(true);
    expect(db.rows).toHaveLength(1);
    expect(db.rows[0].idempotency_key).toMatch(KEY);
    expect(sends.map((s) => s.key)).toEqual([db.rows[0].idempotency_key, db.rows[0].idempotency_key]);
    expect(db.rows[0].idempotency_key).not.toContain(USER_A);
    expect(db.rows[0].idempotency_key).not.toContain(MESSAGE_ID);
  });

  it('D1: ids whose old 32-bit hashes collide ("Aa"/"BB") still get distinct keys', async () => {
    await NotificationService.triggerNotification('message_sent', message('Aa'));
    await NotificationService.triggerNotification('message_sent', message('BB'));
    expect(new Set(keys()).size).toBe(2);
    expect(sends).toHaveLength(2);
  });
});

describe('D2 · genuine occurrences and recipients stay distinct', () => {
  it('D2: two occurrences with the same text for one recipient give two rows and two keys, with no title check', async () => {
    await NotificationService.triggerNotification('message_sent', message(MESSAGE_ID));
    await NotificationService.triggerNotification('message_sent', message('0b7c2c1e-5d1a-4c6e-9f00-0000000000a2'));
    expect(db.rows.map((r) => r.title)).toEqual([db.rows[0].title, db.rows[0].title]);
    expect(new Set(keys()).size).toBe(2);
    expect(new Set(sends.map((s) => s.key))).toEqual(new Set(keys()));
    expect(db.titleChecks).toBe(0);
  });

  it('D2: one occurrence for two recipients gives each its own key, and a retry adds nothing', async () => {
    const feedback = { feedback_id: 'f-1', feedback_type: 'bug', assigned_users: [USER_A, USER_B] };
    await NotificationService.triggerNotification('new_feedback', feedback);
    await NotificationService.triggerNotification('new_feedback', feedback);
    expect(db.rows.map((r) => r.user_id)).toEqual([USER_A, USER_B]);
    expect(new Set(keys()).size).toBe(2);
    expect(sends.map((s) => s.key)).toEqual([...keys(), ...keys()]);
  });

  it('D2: a recurring reminder is one occurrence per scheduled start; a rerun of the same start is a retry', async () => {
    const reminder = (date: string, time: string) => ({ session: { id: SESSION_ID, title: 'Taller', date, time }, facilitator_ids: [USER_A], attendee_ids: [] });
    await NotificationService.triggerNotification('session_reminder_24h', reminder('01-10-2026', '09:00'));
    await NotificationService.triggerNotification('session_reminder_24h', reminder('01-10-2026', '09:00'));
    await NotificationService.triggerNotification('session_reminder_24h', reminder('08-10-2026', '09:00'));
    await NotificationService.triggerNotification('assignment_due_soon', { assignment_id: 'as-1', student_id: USER_A, due_date: '2026-10-01' });
    await NotificationService.triggerNotification('assignment_due_soon', { assignment_id: 'as-1', student_id: USER_A, due_date: '2026-10-03' });
    expect(db.rows).toHaveLength(4);
    expect(new Set(keys()).size).toBe(4);
  });

  it('D2: a deadline reminder is one row per (deadline date, phase); a page-load retry of the same phase adds nothing', async () => {
    vi.spyOn(NotificationService, 'getRecipients').mockResolvedValue([{ id: USER_A }]);
    const reminder = (deadline_date: string, phase: string) => ({
      licitacion_id: '0b7c2c1e-5d1a-4c6e-9f00-0000000000e1', numero_licitacion: 'LIC-SINT-001', school_id: 7, school_name: 'Escuela', deadline_date, reminder: phase,
    });
    for (const [date, phase] of [['2026-10-02', '1d'], ['2026-10-02', '1d'], ['2026-10-02', 'today'], ['2026-10-02', 'today'], ['2026-10-09', '1d']]) {
      await NotificationService.triggerNotification('licitacion_evaluacion_deadline_1d', reminder(date, phase));
    }
    expect(db.rows).toHaveLength(3);
    expect(new Set(keys()).size).toBe(3);
    expect(sends.map((s) => s.key)).toEqual([keys()[0], keys()[0], keys()[1], keys()[1], keys()[2]]);
  });

  it('D2: a duration-only reschedule and a later move back to an earlier schedule are each delivered, never merged', async () => {
    const moved = (time: string, end_time: string) => ({
      session: { id: SESSION_ID, title: 'Taller', date: '02-10-2026', time, end_time, previous_date: '02-10-2026', previous_time: '09:00', previous_end_time: '10:00' },
      facilitator_ids: [USER_A],
      attendee_ids: [],
    });
    for (const [time, end] of [['09:00', '11:00'], ['09:00', '10:00'], ['09:00', '11:00']]) {
      await NotificationService.triggerNotification('session_rescheduled', moved(time, end));
    }
    expect(db.rows).toHaveLength(3);
    expect(new Set(keys()).size).toBe(3);
    expect(audits().map((a) => a.p_event_data.occurrence)).toEqual(['unidentified', 'unidentified', 'unidentified']);
  });
});

describe('D3 · missing, malformed and ambiguous occurrence identity', () => {
  it.each([
    ['null', null],
    ['empty', ''],
    ['blank', '   '],
    ['object', { id: MESSAGE_ID }],
    ['array', [MESSAGE_ID]],
    ['NaN', Number.NaN],
    ['boolean', true],
    ['absent', 'absent'],
  ])('D3: a %s message id is unidentified: every call is delivered, none is merged', async (_label, id) => {
    const data = id === 'absent' ? { recipient_id: USER_A, sender_name: 'Remitente' } : message(id);
    await NotificationService.triggerNotification('message_sent', data);
    await NotificationService.triggerNotification('message_sent', data);
    expect(db.rows).toHaveLength(2);
    expect(new Set(keys()).size).toBe(2);
    expect(sends.map((s) => s.key)).toEqual(keys());
    expect(audits().map((a) => a.p_event_data)).toEqual([
      { occurrence: 'unidentified', occurrence_ref: null },
      { occurrence: 'unidentified', occurrence_ref: null },
    ]);
  });

  it('D3: a retry that spells the same UUID in another case is not re-keyed', async () => {
    await NotificationService.triggerNotification('message_sent', message(MESSAGE_ID));
    await NotificationService.triggerNotification('message_sent', message(MESSAGE_ID.toUpperCase()));
    expect(db.rows).toHaveLength(1);
    expect(sends[1].key).toBe(sends[0].key);
  });

  it('D3: parts that would join to the same text stay distinct occurrences', async () => {
    const at = (date: string, time: string) => ({ session: { id: SESSION_ID, title: 'Taller', date, time }, facilitator_ids: [USER_A] });
    await NotificationService.triggerNotification('session_reminder_1h', at('01-10-2026:09', '00'));
    await NotificationService.triggerNotification('session_reminder_1h', at('01-10-2026', '09:00'));
    expect(new Set(keys()).size).toBe(2);
  });

  it.each([
    ['course_assigned', { course: { id: 'c-1', name: 'Curso' }, assigned_users: [USER_A] }],
    ['assignment_feedback', { assignment_id: 'as-1', student_id: USER_A, assignment_name: 'Tarea' }],
    ['session_edit_request_submitted', { session: { id: SESSION_ID, title: 'Taller' }, requester_id: USER_B, admin_user_ids: [USER_A] }],
    ['qa_scenario_assigned', { tester_id: USER_A, scenario_count: 2 }],
  ])('D3: live producer %s names no occurrence, so a repeat is delivered, not silently merged', async (event, data) => {
    await NotificationService.triggerNotification(event, data);
    await NotificationService.triggerNotification(event, data);
    expect(db.rows).toHaveLength(2);
    expect(new Set(keys()).size).toBe(2);
  });

  it('D3: one unidentified call is one occurrence across its DB triggers', async () => {
    db.triggers = [
      { trigger_id: '0b7c2c1e-5d1a-4c6e-9f00-0000000000c1', category: 'qa', template: null },
      { trigger_id: '0b7c2c1e-5d1a-4c6e-9f00-0000000000c2', category: 'qa', template: null },
    ];
    await NotificationService.triggerNotification('qa_scenario_assigned', { tester_id: USER_A, scenario_count: 1 });
    expect(db.rows).toHaveLength(1);
    expect(sends.map((s) => s.key)).toEqual([keys()[0], keys()[0]]);
  });
});

describe('D4 · the audit and the logs carry no payload', () => {
  const PRIVATE = {
    test_run_id: '0b7c2c1e-5d1a-4c6e-9f00-0000000000d1',
    step_index: 0,
    tester_email: 'probador.privado@qa.local.test',
    tester_note: 'nota privada del probador',
    step_instruction: 'instrucción privada',
    admin_user_ids: [USER_A],
  };
  const privateValues = ['probador.privado', 'nota privada', 'instrucción privada', USER_A, PRIVATE.test_run_id];

  it('D4: the success audit holds only the occurrence kind and an opaque ref, stable across a retry', async () => {
    const result = await NotificationService.triggerNotification('qa_test_failed', PRIVATE);
    await NotificationService.triggerNotification('qa_test_failed', PRIVATE);

    expect(result).toEqual({ success: true, notificationsCreated: 1 });
    const [first, second] = audits();
    expect(first).toEqual({
      p_event_type: 'qa_test_failed',
      p_event_data: { occurrence: 'identified', occurrence_ref: expect.stringMatching(/^occ-[0-9a-f]{64}$/) },
      p_trigger_id: null,
      p_notifications_count: 1,
      p_status: 'success',
    });
    expect(second.p_event_data).toEqual(first.p_event_data);
    const written = JSON.stringify([audits(), loggedText()]);
    for (const value of privateValues) expect(written).not.toContain(value);
  });

  it('D4: the failure audit is bounded too, and the failed result is unchanged', async () => {
    vi.spyOn(NotificationService, 'getActiveTriggers').mockRejectedValue(new Error(`lookup failed for ${PRIVATE.tester_email}`));
    const result = await NotificationService.triggerNotification('qa_test_failed', PRIVATE);

    expect(result).toEqual({ success: false, error: `lookup failed for ${PRIVATE.tester_email}` });
    expect(audits()).toEqual([
      expect.objectContaining({ p_status: 'failed', p_notifications_count: 0, p_event_data: { occurrence: 'identified', occurrence_ref: expect.any(String) } }),
    ]);
    const written = JSON.stringify([audits(), loggedText()]);
    for (const value of privateValues) expect(written).not.toContain(value);
  });

  it('D4: an audit RPC error logs only its code', async () => {
    db.rpcError = { code: '42501', message: `permission denied for ${PRIVATE.tester_email}` };
    const result = await NotificationService.triggerNotification('qa_test_failed', PRIVATE);
    expect(result.success).toBe(true);
    expect(loggedText()).toContain('42501');
    for (const value of privateValues) expect(loggedText()).not.toContain(value);
  });
});

describe('D5 · channels, kill switch and provider refusal keep their behavior under one key', () => {
  it('D5: email-only (in-app off) sends under the key the in-app row uses when it is on', async () => {
    await NotificationService.triggerNotification('message_sent', message());
    const inAppKey = keys()[0];
    db.rows = [];
    db.preference = { email_enabled: true, in_app_enabled: false };
    await NotificationService.triggerNotification('message_sent', message());
    expect(db.rows).toHaveLength(0);
    expect(sends.map((s) => s.key)).toEqual([inAppKey, inAppKey]);
  });

  it('D5: email off keeps the keyed in-app row and sends nothing', async () => {
    db.preference = { email_enabled: false, in_app_enabled: true };
    await NotificationService.triggerNotification('message_sent', message());
    expect(keys()).toEqual([expect.stringMatching(KEY)]);
    expect(sends).toHaveLength(0);
  });

  it('D5: both channels off write and send nothing', async () => {
    db.preference = { email_enabled: false, in_app_enabled: false };
    await NotificationService.triggerNotification('message_sent', message());
    expect(db.rows).toHaveLength(0);
    expect(sends).toHaveLength(0);
  });

  it('D5: the kill switch stops the provider only; the row keeps its key', async () => {
    process.env.NOTIFICATION_EMAIL_ENABLED = 'off';
    await NotificationService.triggerNotification('message_sent', message());
    expect(keys()).toEqual([expect.stringMatching(KEY)]);
    expect(sends).toHaveLength(0);
  });

  it('D5: a provider refusal stays nonfatal and the retry reuses the key; nothing touches an outbox', async () => {
    transportReply = async () => ({ data: null, error: { name: 'validation_error', message: 'rejected' } });
    const first = await NotificationService.triggerNotification('message_sent', message());
    const retry = await NotificationService.triggerNotification('message_sent', message());
    expect([first.success, retry.success]).toEqual([true, true]);
    expect(db.rows).toHaveLength(1);
    expect(sends.map((s) => s.key)).toEqual([keys()[0], keys()[0]]);
    expect(db.tables.filter((t) => t.includes('outbox'))).toEqual([]);
  });
});
