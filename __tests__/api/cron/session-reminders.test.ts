// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { createMocks } from 'node-mocks-http';

/**
 * N5-03: the hourly session-reminders cron through its real handler and the real
 * `NotificationService.triggerNotification`. Replaced edges only: the Supabase
 * client (an in-memory fake that applies the query's filters and embeds the
 * session's own facilitators and attendees), the clock, and the synchronous
 * e-mail sender. Synthetic data only.
 */
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

type Row = Record<string, any>;

const db = vi.hoisted(() => ({
  tables: {} as Record<string, Row[]>,
  log: [] as string[],
  rpcs: [] as Array<{ fn: string; args: Record<string, any> }>,
  /** Bell inserts for which this returns true fail with a non-duplicate database error. */
  failBell: null as null | ((row: Row) => boolean),
  /** The next N enqueue calls fail. */
  failEnqueue: 0,
  /** Enqueue calls for which this returns true fail. */
  failEnqueueFor: null as null | ((args: Record<string, any>) => boolean),
  /** What `get_active_triggers` answers: none means the code defaults. */
  triggers: [] as Row[],
  /** The cron's session query answers with a database error. */
  failSessions: false,
  lastSessionQuery: [] as Array<[string, string, unknown]>,
}));

const mail = vi.hoisted(() => ({ sends: [] as Row[] }));

vi.mock('@supabase/supabase-js', () => {
  const from = (table: string) => {
    let op = 'select';
    let payload: any;
    let columns = '';
    const filters: Array<[string, string, unknown]> = [];
    const matches = (row: Row) =>
      filters.every(([kind, key, value]) => {
        if (kind === 'eq') return row[key] === value;
        if (kind === 'in') return (value as unknown[]).includes(row[key]);
        if (kind === 'gte') return row[key] >= (value as string);
        return row[key] <= (value as string);
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
      if (table === 'consultor_sessions' && columns.includes('session_facilitators')) {
        db.lastSessionQuery = [...filters];
        if (db.failSessions) return { data: null, error: { code: 'XX000', message: 'synthetic database detail' } };
      }
      let result = rows.filter(matches);
      if (table === 'consultor_sessions' && columns.includes('session_facilitators')) {
        const own = (child: string, id: string) =>
          (db.tables[child] ?? []).filter((r) => r.session_id === id).map((r) => ({ user_id: r.user_id }));
        result = result.map((s) => ({ ...s, session_facilitators: own('session_facilitators', s.id), session_attendees: own('session_attendees', s.id) }));
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
      gte: (key: string, value: unknown) => (filters.push(['gte', key, value]), builder),
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
    if (db.failEnqueue > 0 || db.failEnqueueFor?.(args)) {
      db.failEnqueue = Math.max(0, db.failEnqueue - 1);
      return { data: null, error: { code: '57014', message: 'synthetic failure' } };
    }
    const key = `notif-${args.p_event_type}-${args.p_occurrence_id}-${args.p_user_id}`;
    // Like the real enqueue, a repeated key keeps its one outbox row.
    const outbox = (db.tables.notification_email_outbox ??= []);
    if (!outbox.some((row) => row.idempotency_key === key)) outbox.push({ idempotency_key: key, user_id: args.p_user_id });
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

import handler from '../../../pages/api/cron/session-reminders';
import NotificationService from '../../../lib/notificationService';
import { getSessionDateTime } from '../../../lib/utils/session-timezone';

const SECRET = 'synthetic-cron-secret-n24';
const API_KEY = 'synthetic-cron-key-n24';
const FACILITATOR = '11111111-1111-4111-8111-111111111111';
const ATTENDEE = '22222222-2222-4222-8222-222222222222';
const OTHER = '33333333-3333-4333-8333-333333333333';
const SCHOOL = 9_424_001;
const COMMUNITY = '44444444-4444-4444-8444-444444444444';
const RAW_LINK = 'https://us06web.zoom.us/j/9999999999?pwd=SyNtHeTiCrAwLiNk';
const sid = (n: number) => `0b7c2c1e-5d1a-4c6e-9f24-${String(n).padStart(12, '0')}`;
const ENV_KEYS = ['CRON_SECRET', 'CRON_API_KEY', 'NOTIFICATION_OUTBOX_DELIVERY'] as const;
const ORIGINAL_ENV = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

/** A wall-clock instant in America/Santiago, through the tz database (DST included). */
const chile = (date: string, time: string) => getSessionDateTime(date, time).getTime();

/** The America/Santiago UTC offset in force at an instant, e.g. "GMT-03:00". */
const offsetAt = (ms: number) =>
  new Intl.DateTimeFormat('en-US', { timeZone: 'America/Santiago', timeZoneName: 'longOffset' })
    .formatToParts(new Date(ms)).find((part) => part.type === 'timeZoneName')!.value;

let consoleLines: string[] = [];

function session(n: number, date: string, start: string, overrides: Row = {}) {
  const row = {
    id: sid(n), title: `Taller sintético ${n}`, session_date: date, start_time: start, end_time: '23:59:00',
    status: 'programada', is_active: true, modality: 'online', meeting_link: RAW_LINK, is_zoom_managed: false,
    school_id: SCHOOL, growth_community_id: COMMUNITY, updated_at: '2026-01-01T00:00:00.000Z', ...overrides,
  };
  (db.tables.consultor_sessions ??= []).push(row);
  return row;
}

function participants(sessionRow: Row, facilitators: string[], attendees: string[]) {
  (db.tables.session_facilitators ??= []).push(...facilitators.map((user_id) => ({ session_id: sessionRow.id, user_id })));
  (db.tables.session_attendees ??= []).push(...attendees.map((user_id) => ({ session_id: sessionRow.id, user_id })));
}

async function call(init: { method?: string; headers?: Record<string, string>; body?: Row; query?: Row } = {}) {
  const { req, res } = createMocks({
    method: (init.method ?? 'GET') as any,
    headers: { host: 'localhost:3107', ...(init.headers ?? { authorization: `Bearer ${SECRET}` }) },
    body: init.body,
    query: init.query,
  });
  await handler(req as any, res as any);
  return { status: res._getStatusCode(), body: res._getJSONData(), headers: res._getHeaders() };
}

const bells = (user?: string) => (db.tables.user_notifications ?? []).filter((row) => !user || row.user_id === user);
const markers = () => db.tables.session_notifications ?? [];
const outbox = (user: string) => (db.tables.notification_email_outbox ?? []).filter((row) => row.user_id === user);
const enqueues = () => db.rpcs.filter((r) => r.fn === 'enqueue_notification_with_source').map((r) => r.args);

beforeEach(() => {
  db.tables = { user_roles: [FACILITATOR, ATTENDEE, OTHER].map((user_id) => ({ user_id, role_type: 'docente', is_active: true, community_id: COMMUNITY })) };
  db.log = [];
  db.rpcs = [];
  db.failBell = null;
  db.failEnqueue = 0;
  db.failEnqueueFor = null;
  db.triggers = [];
  db.failSessions = false;
  db.lastSessionQuery = [];
  mail.sends = [];
  process.env.CRON_SECRET = SECRET;
  process.env.CRON_API_KEY = API_KEY;
  delete process.env.NOTIFICATION_OUTBOX_DELIVERY;
  vi.useFakeTimers({ toFake: ['Date'] });
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
  for (const key of ENV_KEYS) {
    if (ORIGINAL_ENV[key] === undefined) delete process.env[key];
    else process.env[key] = ORIGINAL_ENV[key];
  }
});

describe('D1 — shared cron verifier, before any data access', () => {
  beforeEach(() => {
    vi.setSystemTime(chile('2026-10-09', '10:00'));
    participants(session(1, '2026-10-10', '10:00:00'), [FACILITATOR], [ATTENDEE]);
  });

  it('accepts Vercel GET with the bearer secret', async () => {
    const res = await call({ method: 'GET', headers: { authorization: `Bearer ${SECRET}` } });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, reminders24h: 1 });
  });

  it('accepts POST with x-cron-key', async () => {
    const res = await call({ method: 'POST', headers: { 'x-cron-key': API_KEY } });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, reminders24h: 1 });
  });

  const denied: Array<[string, () => void, { method: string; headers?: Record<string, string>; body?: Row; query?: Row }]> = [
    ['both secrets unset', () => { delete process.env.CRON_SECRET; delete process.env.CRON_API_KEY; }, { method: 'GET', headers: { authorization: 'Bearer undefined', 'x-cron-key': 'undefined' } }],
    ['no credential', () => {}, { method: 'GET', headers: {} }],
    ['wrong bearer', () => {}, { method: 'GET', headers: { authorization: 'Bearer not-the-secret' } }],
    ['bare secret without Bearer', () => {}, { method: 'GET', headers: { authorization: SECRET } }],
    ['malformed authorization', () => {}, { method: 'GET', headers: { authorization: `Basic ${SECRET}` } }],
    ['wrong x-cron-key', () => {}, { method: 'POST', headers: { 'x-cron-key': 'not-the-key' } }],
    ['bearer secret as x-cron-key', () => { delete process.env.CRON_API_KEY; }, { method: 'POST', headers: { 'x-cron-key': SECRET } }],
    ['x-cron-key unset on the server', () => { delete process.env.CRON_API_KEY; }, { method: 'POST', headers: { 'x-cron-key': API_KEY } }],
    ['key in the body only', () => {}, { method: 'POST', headers: {}, body: { cronKey: API_KEY } }],
    ['key in the query only', () => {}, { method: 'GET', headers: {}, query: { cronKey: API_KEY } }],
  ];
  it.each(denied)('401 for %s, with no database or notification access', async (_label, setup, init) => {
    setup();
    const res = await call(init);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'No autorizado' });
    expect(db.log).toEqual([]);
    expect(bells()).toEqual([]);
  });

  it.each(['PUT', 'DELETE', 'PATCH'])('405 for %s before auth, data or trigger, even with a valid secret', async (method) => {
    const res = await call({ method, headers: { authorization: `Bearer ${SECRET}`, 'x-cron-key': API_KEY } });
    expect(res.status).toBe(405);
    expect(res.headers.allow).toBe('GET, POST');
    expect(db.log).toEqual([]);
  });

  it('never echoes a secret in the response or the logs', async () => {
    await call({ method: 'GET', headers: { authorization: 'Bearer not-the-secret' } });
    await call({ method: 'POST', headers: { 'x-cron-key': API_KEY } });
    const text = JSON.stringify(consoleLines);
    expect(text).not.toContain(SECRET);
    expect(text).not.toContain(API_KEY);
  });
});

describe('D2 — the persisted schedule, its windows and its recipients', () => {
  it('reminds only in (23h, 25h] and (0.5h, 1.5h], and only active scheduled sessions with participants', async () => {
    vi.setSystemTime(chile('2026-10-09', '10:00'));
    const due24 = session(1, '2026-10-10', '10:00:00'); // 24h
    const edge25 = session(2, '2026-10-10', '11:00:00'); // exactly 25h: inside
    const past25 = session(3, '2026-10-10', '11:01:00'); // just past 25h
    const at23 = session(4, '2026-10-10', '09:00:00'); // exactly 23h: outside
    const due1 = session(5, '2026-10-09', '11:00:00'); // 1h
    const at05 = session(6, '2026-10-09', '10:30:00'); // exactly 0.5h: outside
    const cancelled = session(7, '2026-10-10', '10:00:00', { status: 'cancelada' });
    const inactive = session(8, '2026-10-10', '10:00:00', { is_active: false });
    const running = session(9, '2026-10-09', '11:30:00', { status: 'en_progreso' }); // 1.5h: inside
    session(10, '2026-10-10', '10:00:00'); // nobody
    for (const row of [due24, edge25, past25, at23, due1, at05, cancelled, inactive, running]) participants(row, [FACILITATOR], [ATTENDEE]);

    const res = await call();

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, reminders24h: 2, reminders1h: 2, failed: 0, sessionsChecked: 8 });
    const reminded = new Set(markers().map((m) => `${m.session_id}:${m.notification_type}`));
    expect([...reminded].sort()).toEqual([
      `${due24.id}:session_reminder_24h`, `${edge25.id}:session_reminder_24h`, `${due1.id}:session_reminder_1h`, `${running.id}:session_reminder_1h`,
    ].sort());
    expect(bells()).toHaveLength(8);
  });

  it('sends to the session\'s own facilitators and attendees, once each', async () => {
    vi.setSystemTime(chile('2026-10-09', '10:00'));
    const mine = session(1, '2026-10-10', '10:00:00');
    participants(mine, [FACILITATOR, ATTENDEE], [ATTENDEE, FACILITATOR]);
    participants(session(2, '2026-10-12', '10:00:00'), [OTHER], [OTHER]);

    await call();

    expect(bells().map((b) => b.user_id).sort()).toEqual([FACILITATOR, ATTENDEE].sort());
    expect(bells(OTHER)).toEqual([]);
    expect(markers().map((m) => m.user_id).sort()).toEqual([FACILITATOR, ATTENDEE].sort());
  });

  it('queries through 25 hours out, so a session just past Chile midnight is not missed', async () => {
    vi.setSystemTime(chile('2026-10-09', '23:30'));
    participants(session(1, '2026-10-11', '00:15:00'), [FACILITATOR], []); // 24.75h, two Chile dates ahead

    const res = await call();

    expect(db.lastSessionQuery).toContainEqual(['gte', 'session_date', '2026-10-09']);
    expect(db.lastSessionQuery).toContainEqual(['lte', 'session_date', '2026-10-11']);
    expect(res.body).toMatchObject({ reminders24h: 1 });
  });

  it('crosses the year: a New Year session is reminded with its own year in the start', async () => {
    vi.setSystemTime(chile('2026-12-31', '10:00'));
    participants(session(1, '2027-01-01', '10:00:00'), [FACILITATOR], []);

    const res = await call();

    expect(res.body).toMatchObject({ reminders24h: 1 });
    expect(markers()[0].scheduled_for).toBe(new Date(chile('2027-01-01', '10:00')).toISOString());
    expect(markers()[0].scheduled_for).toMatch(/^2027-01-01T/);
  });

  it.each([
    ['DST start (September)', '2026-09-05', '2026-09-06'],
    ['DST end (April)', '2026-04-04', '2026-04-05'],
    ['no transition', '2026-10-08', '2026-10-09'],
  ])('hourly runs across %s send exactly one 24h and one 1h reminder, each inside its window', async (label, before, day) => {
    const row = session(1, day, '10:00:00');
    participants(row, [FACILITATOR], []);
    const start = chile(day, '10:00');
    expect(offsetAt(chile(before, '00:00')) !== offsetAt(start)).toBe(label !== 'no transition');
    const sentAt: Record<string, number[]> = { session_reminder_24h: [], session_reminder_1h: [] };
    for (let t = chile(before, '00:00'); t <= start; t += 60 * 60 * 1000) {
      vi.setSystemTime(t);
      const count = markers().length;
      const res = await call();
      expect(res.status).toBe(200);
      for (const m of markers().slice(count)) sentAt[m.notification_type].push(t);
    }
    expect(sentAt.session_reminder_24h).toHaveLength(1);
    expect(sentAt.session_reminder_1h).toHaveLength(1);
    const hours24 = (start - sentAt.session_reminder_24h[0]) / 3_600_000;
    const hours1 = (start - sentAt.session_reminder_1h[0]) / 3_600_000;
    expect(hours24).toBeGreaterThan(23);
    expect(hours24).toBeLessThanOrEqual(25);
    expect(hours1).toBeGreaterThan(0.5);
    expect(hours1).toBeLessThanOrEqual(1.5);
    expect(bells()).toHaveLength(2);
  });

  it('answers 200 with nothing to do when no session is due', async () => {
    vi.setSystemTime(chile('2026-10-09', '10:00'));
    const res = await call();
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, reminders24h: 0, reminders1h: 0, failed: 0, sessionsChecked: 0 });
    expect(bells()).toEqual([]);
    expect(markers()).toEqual([]);
  });

  it('a failed session query is a 500 with a fixed message and no database text', async () => {
    vi.setSystemTime(chile('2026-10-09', '10:00'));
    db.failSessions = true;
    const res = await call();
    expect(res).toMatchObject({ status: 500, body: { error: 'Error al consultar sesiones' } });
    expect(JSON.stringify([res.body, consoleLines])).not.toContain('synthetic database detail');
    expect(bells()).toEqual([]);
  });

  it('an unexpected failure is a 500 that carries no exception text', async () => {
    vi.setSystemTime(chile('2026-10-09', '10:00'));
    participants(session(1, '2026-10-10', 'diez'), [FACILITATOR], []);
    const res = await call();
    expect(res).toMatchObject({ status: 500, body: { success: false, error: 'Error interno del servidor' } });
    expect(JSON.stringify([res.body, consoleLines])).not.toContain('diez');
  });
});

describe('D3 — one reminder per session, type and scheduled start', () => {
  beforeEach(() => vi.setSystemTime(chile('2026-10-09', '10:00')));

  it('a repeated run for the same start sends nothing more', async () => {
    participants(session(1, '2026-10-10', '10:30:00'), [FACILITATOR], [ATTENDEE]);
    expect((await call()).body).toMatchObject({ reminders24h: 1 });
    vi.setSystemTime(chile('2026-10-09', '11:00'));
    expect((await call()).body).toMatchObject({ reminders24h: 0, failed: 0 });
    expect(bells()).toHaveLength(2);
    expect(markers()).toHaveLength(2);
    expect(mail.sends).toHaveLength(2);
  });

  it('concurrent runs for the same start leave one bell per recipient', async () => {
    participants(session(1, '2026-10-10', '10:30:00'), [FACILITATOR], [ATTENDEE]);
    const results = await Promise.all([call(), call()]);
    expect(results.map((r) => r.status)).toEqual([200, 200]);
    expect(bells().map((b) => b.user_id).sort()).toEqual([FACILITATOR, ATTENDEE].sort());
  });

  it('a moved start is a new reminder, also when the date or the year moves', async () => {
    const row = session(1, '2026-10-10', '10:00:00');
    participants(row, [FACILITATOR], []);
    await call();
    expect(bells()).toHaveLength(1);

    Object.assign(row, { start_time: '10:45:00', updated_at: new Date(chile('2026-10-09', '10:05')).toISOString() });
    vi.setSystemTime(chile('2026-10-09', '10:10'));
    expect((await call()).body).toMatchObject({ reminders24h: 1 });
    expect(bells()).toHaveLength(2);
    expect(new Set(bells().map((b) => b.idempotency_key)).size).toBe(2);
  });

  it('a stale in-flight marker for the old start, written after the move, does not suppress the new start', async () => {
    // A run read the 10:00 start; the session moved to 10:30 at 09:30; that run recorded 10:00 at 09:31.
    const row = session(1, '2026-10-10', '10:30:00', { updated_at: new Date(chile('2026-10-09', '09:30')).toISOString() });
    participants(row, [FACILITATOR], []);
    db.tables.session_notifications = [{
      session_id: row.id, user_id: FACILITATOR, notification_type: 'session_reminder_24h', channel: 'in_app',
      scheduled_for: new Date(chile('2026-10-10', '10:00')).toISOString(),
      sent_at: new Date(chile('2026-10-09', '09:31')).toISOString(), status: 'sent',
    }];

    expect((await call()).body).toMatchObject({ reminders24h: 1, failed: 0 });
    expect(bells()).toHaveLength(1);
    expect(markers().filter((m) => m.scheduled_for === new Date(chile('2026-10-10', '10:30')).toISOString())).toHaveLength(1);
  });

  it('only a marker for the current start suppresses, whenever it was written', async () => {
    const row = session(1, '2026-10-10', '10:30:00', { updated_at: new Date(chile('2026-10-09', '09:45')).toISOString() });
    participants(row, [FACILITATOR], []);
    db.tables.session_notifications = [{
      session_id: row.id, user_id: FACILITATOR, notification_type: 'session_reminder_24h', channel: 'in_app',
      scheduled_for: new Date(chile('2026-10-10', '10:30')).toISOString(),
      sent_at: new Date(chile('2026-10-09', '09:00')).toISOString(), status: 'sent',
    }];

    expect((await call()).body).toMatchObject({ reminders24h: 0, failed: 0 });
    expect(bells()).toEqual([]);
  });

  it('a legacy marker (scheduled_for = its send time) names no start, so it never suppresses a reminder', async () => {
    // Even with the session unchanged since, a legacy row cannot prove which start it reminded.
    const row = session(1, '2026-10-10', '10:00:00', { updated_at: new Date(chile('2026-10-01', '08:00')).toISOString() });
    participants(row, [FACILITATOR], []);
    const legacyAt = new Date(chile('2026-10-09', '09:00')).toISOString();
    db.tables.session_notifications = [{ session_id: row.id, user_id: FACILITATOR, notification_type: 'session_reminder_24h', channel: 'in_app', scheduled_for: legacyAt, sent_at: legacyAt, status: 'sent' }];

    expect((await call()).body).toMatchObject({ reminders24h: 1 });
    expect(bells()).toHaveLength(1);
    vi.setSystemTime(chile('2026-10-09', '11:00'));
    expect((await call()).body).toMatchObject({ reminders24h: 0 });
    expect(bells()).toHaveLength(1);
  });

  it('a failed first run is not recorded, and the next run delivers once to everyone (sync path)', async () => {
    participants(session(1, '2026-10-10', '10:30:00'), [FACILITATOR], [ATTENDEE]);
    db.failBell = (bell) => bell.user_id === ATTENDEE;

    const first = await call();
    expect(first.body).toMatchObject({ reminders24h: 0, failed: 1 });
    expect(markers()).toEqual([]);
    expect(bells().map((b) => b.user_id)).toEqual([FACILITATOR]);

    db.failBell = null;
    vi.setSystemTime(chile('2026-10-09', '11:00'));
    expect((await call()).body).toMatchObject({ reminders24h: 1, failed: 0 });
    expect(bells().map((b) => b.user_id).sort()).toEqual([FACILITATOR, ATTENDEE].sort());
    expect(markers()).toHaveLength(2);
  });

  it('a failed enqueue is retried on the next run with the same occurrence (outbox path)', async () => {
    process.env.NOTIFICATION_OUTBOX_DELIVERY = 'on';
    participants(session(1, '2026-10-10', '10:30:00'), [FACILITATOR], []);
    db.failEnqueue = 1;

    expect((await call()).body).toMatchObject({ reminders24h: 0, failed: 1 });
    expect(markers()).toEqual([]);
    vi.setSystemTime(chile('2026-10-09', '11:00'));
    expect((await call()).body).toMatchObject({ reminders24h: 1, failed: 0 });
    const [failedCall, retried] = enqueues();
    expect(retried.p_occurrence_id).toBe(failedCall.p_occurrence_id);
    expect(markers()).toHaveLength(1);
  });

  it('keys the occurrence by the start instant, not the Spanish display text', async () => {
    process.env.NOTIFICATION_OUTBOX_DELIVERY = 'on';
    const row = session(1, '2026-10-10', '10:00:00');
    participants(row, [FACILITATOR], []);
    await call();
    const [args] = enqueues();
    expect(args.p_occurrence_id).toBe(`record:${row.id}:${encodeURIComponent(new Date(chile('2026-10-10', '10:00')).toISOString())}`);
    expect(args.p_occurrence_id).not.toContain('octubre');
  });
});

describe('D3 — every recipient is accounted for, also with several active triggers', () => {
  // The service sums its count over every active trigger, so a recipient processed by
  // both could stand in for one that neither processed (N24-R1-F1).
  beforeEach(() => {
    vi.setSystemTime(chile('2026-10-09', '10:00'));
    db.triggers = ['synthetic-trigger-a', 'synthetic-trigger-b'].map((trigger_id) => ({ trigger_id, template: null, category: 'sessions' }));
  });

  // Per delivery path: the flag, how one recipient's processing fails, and what a recipient holds.
  const paths = [
    ['sync', undefined, (user: string) => { db.failBell = (row) => row.user_id === user; }, (user: string) => bells(user).length],
    ['outbox', 'on', (user: string) => { db.failEnqueueFor = (args) => args.p_user_id === user; }, (user: string) => outbox(user).length],
  ] as const;
  const held = (count: (user: string) => number) => [count(FACILITATOR), count(ATTENDEE)];

  it.each(paths)('%s: both triggers failing the attendee record no one, and the retry delivers once to each', async (_label, flag, failFor, count) => {
    if (flag) process.env.NOTIFICATION_OUTBOX_DELIVERY = flag;
    participants(session(1, '2026-10-10', '10:30:00'), [FACILITATOR], [ATTENDEE]);
    failFor(ATTENDEE);

    expect((await call()).body).toMatchObject({ reminders24h: 0, failed: 1 });
    expect(markers()).toEqual([]);
    expect(held(count)).toEqual([1, 0]);

    db.failBell = null;
    db.failEnqueueFor = null;
    vi.setSystemTime(chile('2026-10-09', '11:00'));
    expect((await call()).body).toMatchObject({ reminders24h: 1, failed: 0 });
    expect(markers().map((m) => m.user_id).sort()).toEqual([FACILITATOR, ATTENDEE].sort());
    expect(held(count)).toEqual([1, 1]);

    vi.setSystemTime(chile('2026-10-09', '11:15'));
    expect((await call()).body).toMatchObject({ reminders24h: 0, failed: 0 });
    expect(held(count)).toEqual([1, 1]);
  });

  it.each(paths)('%s: both triggers succeeding keep one output and one record per recipient', async (_label, flag, _failFor, count) => {
    if (flag) process.env.NOTIFICATION_OUTBOX_DELIVERY = flag;
    participants(session(1, '2026-10-10', '10:30:00'), [FACILITATOR], [ATTENDEE]);

    expect((await call()).body).toMatchObject({ reminders24h: 1, failed: 0 });
    expect(held(count)).toEqual([1, 1]);
    expect(markers().map((m) => m.user_id).sort()).toEqual([FACILITATOR, ATTENDEE].sort());
  });

  it('sync: a recipient one trigger fails and the other delivers is accounted for', async () => {
    participants(session(1, '2026-10-10', '10:30:00'), [FACILITATOR], [ATTENDEE]);
    let attendeeAttempts = 0;
    db.failBell = (row) => row.user_id === ATTENDEE && attendeeAttempts++ === 0;

    expect((await call()).body).toMatchObject({ reminders24h: 1, failed: 0 });
    expect(held((user) => bells(user).length)).toEqual([1, 1]);
    expect(markers()).toHaveLength(2);
  });
});

describe('D4 — the flag-selected delivery path and the join link', () => {
  beforeEach(() => vi.setSystemTime(chile('2026-10-09', '10:00')));

  it('flag unset: the existing synchronous bell and mail, no enqueue', async () => {
    const row = session(1, '2026-10-10', '10:00:00');
    participants(row, [FACILITATOR], [ATTENDEE]);

    await call();

    expect(enqueues()).toEqual([]);
    expect(bells()).toHaveLength(2);
    expect(bells()[0]).toMatchObject({ category: 'sessions', related_url: `/meet/session/${row.id}` });
    expect(mail.sends.map((m) => m.userId).sort()).toEqual([FACILITATOR, ATTENDEE].sort());
  });

  it('flag on: one typed session-source enqueue per recipient, no direct mail and no direct bell', async () => {
    process.env.NOTIFICATION_OUTBOX_DELIVERY = 'on';
    const row = session(1, '2026-10-10', '10:00:00');
    participants(row, [FACILITATOR], [ATTENDEE]);

    expect((await call()).body).toMatchObject({ reminders24h: 1 });

    expect(enqueues().map((a) => [a.p_user_id, a.p_event_type, a.p_source_kind, a.p_source_id, a.p_category, a.p_email_default])
      .sort()).toEqual([FACILITATOR, ATTENDEE].sort().map((user) => [user, 'session_reminder_24h', 'session', row.id, 'sessions', 'immediate']));
    expect(mail.sends).toEqual([]);
    expect(bells()).toEqual([]);
  });

  it('reads preferences but never writes them', async () => {
    participants(session(1, '2026-10-10', '10:00:00'), [FACILITATOR], []);
    await call();
    expect(db.log.filter((entry) => /pref/.test(entry) && !entry.endsWith(':select'))).toEqual([]);
  });

  it.each([
    ['an external link', { meeting_link: RAW_LINK, is_zoom_managed: false }, true],
    ['a managed session', { meeting_link: null, is_zoom_managed: true }, true],
    ['no meeting', { meeting_link: null, is_zoom_managed: false }, false],
  ])('%s: the payload offers the platform join link at most, and no output carries the raw link', async (_label, overrides, offers) => {
    const trigger = vi.spyOn(NotificationService, 'triggerNotification');
    const row = session(1, '2026-10-10', '10:00:00', overrides);
    participants(row, [FACILITATOR], []);
    const outputs: unknown[] = [];

    for (const flag of [undefined, 'on']) {
      if (flag) process.env.NOTIFICATION_OUTBOX_DELIVERY = flag;
      outputs.push((await call()).body, bells(), markers(), db.tables.notification_events ?? []);
      db.tables.session_notifications = [];
      db.tables.user_notifications = [];
    }

    expect(trigger).toHaveBeenCalledTimes(2);
    for (const [, payload] of trigger.mock.calls) {
      expect((payload as Row).session.join_url).toEqual(offers ? expect.stringMatching(new RegExp(`^https?://[^/]+/meet/session/${row.id}$`)) : null);
    }
    expect(mail.sends[0].relatedUrl).toBe(`/meet/session/${row.id}`);
    expect(enqueues()[0].p_related_url).toBe(`/meet/session/${row.id}`);
    const everything = JSON.stringify([outputs, consoleLines, db.rpcs, mail.sends, trigger.mock.calls, markers()]);
    expect(everything).not.toContain('SyNtHeTiCrAwLiNk');
    expect(everything).not.toContain('zoom.us');
  });
});

describe('D5 — the schedule', () => {
  it('registers the hourly GET cron and leaves the other schedules as they were', () => {
    const config = JSON.parse(readFileSync(path.join(process.cwd(), 'vercel.json'), 'utf8'));
    expect(config.crons.filter((c: Row) => c.path === '/api/cron/session-reminders')).toEqual([
      { path: '/api/cron/session-reminders', schedule: '0 * * * *' },
    ]);
    expect(config.crons.filter((c: Row) => c.path !== '/api/cron/session-reminders')).toEqual([
      { path: '/api/cron/zoom-ticker', schedule: '* * * * *' },
      { path: '/api/cron/zoom-reconcile', schedule: '0 * * * *' },
      { path: '/api/cron/recovery-outbox', schedule: '* * * * *' },
      { path: '/api/cron/auth-retention', schedule: '30 3 * * *' },
      { path: '/api/cron/cleanup-learning-path-sessions', schedule: '0 * * * *' },
      { path: '/api/cron/notification-emails', schedule: '* * * * *' },
      { path: '/api/cron/email-digest', schedule: '0 * * * *' },
      { path: '/api/cron/due-reminders', schedule: '0 * * * *' },
    ]);
  });
});
