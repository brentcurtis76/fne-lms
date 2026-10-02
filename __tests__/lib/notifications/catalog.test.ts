// @vitest-environment node
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

/** State the fake service-role client serves; reset before each test. */
const db = vi.hoisted(() => ({
  triggers: [] as unknown[],
  /** The recipient's active `user_roles` row; '' = none. */
  role: 'docente' as string,
  /** That row's scope: the consultor's school, or the growth community the recipient belongs to. */
  roleScope: {} as { school_id?: number; community_id?: string },
  /** The `consultor_sessions` row the payload's session id resolves to; null = none, 'error' = the read fails. */
  session: null as null | 'error' | Record<string, unknown>,
  activeUsers: [] as Array<{ id: string }>,
}));

vi.mock('@supabase/supabase-js', () => {
  const query = (table: string) => {
    const builder: any = {
      select: () => builder,
      eq: () => builder,
      insert: () => builder,
      range: () => Promise.resolve({ data: table === 'profiles' ? db.activeUsers : [], error: null }),
      order: () =>
        Promise.resolve({ data: table === 'user_roles' && db.role ? [{ role_type: db.role, is_active: true, ...db.roleScope }] : [], error: null }),
      single: () => Promise.resolve({ data: null, error: null }),
      maybeSingle: () =>
        Promise.resolve(
          table !== 'consultor_sessions' || db.session === null
            ? { data: null, error: null }
            : db.session === 'error'
              ? { data: null, error: { message: 'read failed' } }
              : { data: db.session, error: null }
        ),
    };
    return builder;
  };
  const client = {
    from: query,
    rpc: (fn: string) =>
      Promise.resolve({ data: fn === 'get_active_triggers' ? db.triggers : null, error: null }),
  };
  return { createClient: () => client };
});

import {
  buildEmailPayload,
  buildNotificationUrl,
  buildRecordUrl,
  CATEGORY_LABELS,
  DEFAULT_NOTIFICATION_URL,
  findUnmappedEvents,
  getCatalogEntry,
  getCatalogTemplates,
  isOpenToRole,
  isSafeNotificationPath,
  isSessionRecordOpenTo,
  NOTIFICATION_CATALOG,
} from '../../../lib/notifications/catalog';
import { NOTIFICATION_EVENTS } from '../../../lib/notificationEvents';
import NotificationService from '../../../lib/notificationService';

const ROOT = join(__dirname, '../../..');
const SESSION_ID = '0b7c2c1e-5d1a-4c6e-9f00-000000000001';
const ASSIGNMENT_ID = '0b7c2c1e-5d1a-4c6e-9f00-000000000002';
const LICITACION_ID = '0b7c2c1e-5d1a-4c6e-9f00-000000000003';
const RUN_ID = '0b7c2c1e-5d1a-4c6e-9f00-000000000004';
const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
const COMMUNITY_ID = '0b7c2c1e-5d1a-4c6e-9f00-00000000000c';
const OTHER_COMMUNITY_ID = '0b7c2c1e-5d1a-4c6e-9f00-00000000000d';
const OTHER_SESSION_ID = '0b7c2c1e-5d1a-4c6e-9f00-00000000000e';
const SCHOOL_ID = 9_400_001;
/** The session every session id above resolves to, as the record pages read it. */
const SESSION_ROW = { id: SESSION_ID, school_id: SCHOOL_ID, growth_community_id: COMMUNITY_ID, status: 'programada', is_active: true };
const MEMBER = { community_id: COMMUNITY_ID };

/** Resolves a same-origin path to a page file under pages/, honouring [param] segments. */
function pageExists(url: string): boolean {
  const segments = url.split('?')[0].split('/').filter(Boolean);
  let dir = join(ROOT, 'pages');
  for (let i = 0; i < segments.length; i++) {
    const last = i === segments.length - 1;
    const entries = existsSync(dir) ? readdirSync(dir) : [];
    const dynamic = entries.filter((e) => /^\[[^.\]]+\](\.tsx)?$/.test(e));
    if (last) {
      const files = [`${segments[i]}.tsx`, ...dynamic.filter((e) => e.endsWith('.tsx'))];
      if (files.some((f) => entries.includes(f))) return true;
      const folder = [segments[i], ...dynamic.filter((e) => !e.endsWith('.tsx'))].find((e) => entries.includes(e));
      return !!folder && existsSync(join(dir, folder, 'index.tsx'));
    }
    const next = [segments[i], ...dynamic.filter((e) => !e.endsWith('.tsx'))].find(
      (e) => entries.includes(e) && statSync(join(dir, e)).isDirectory()
    );
    if (!next) return false;
    dir = join(dir, next);
  }
  return existsSync(join(dir, 'index.tsx'));
}

/** Every event type literal a producer in pages/ or lib/ hands to the notification service. */
function emittedEventTypes(): string[] {
  const found = new Set<string>();
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) {
        if (!['__tests__', 'node_modules'].includes(entry)) walk(path);
        continue;
      }
      if (!/\.(ts|tsx|js)$/.test(entry)) continue;
      const src = readFileSync(path, 'utf8');
      for (const m of src.matchAll(/triggerNotification\(\s*'([a-z0-9_]+)'/g)) found.add(m[1]);
      if (/createNotification\(/.test(src)) {
        for (const m of src.matchAll(/event_type:\s*'([a-z0-9_]+)'/g)) found.add(m[1]);
      }
      // Producers that pick the event from a table (licitación advance/deadlines, session lifecycle).
      if (/triggerNotification\(\s*[a-zA-Z.]+\s*,/.test(src)) {
        for (const m of src.matchAll(/'((?:licitacion|session)_[a-z0-9_]+)'/g)) {
          if (m[1] in NOTIFICATION_EVENTS) found.add(m[1]);
        }
      }
    }
  };
  walk(join(ROOT, 'pages'));
  walk(join(ROOT, 'lib'));
  return [...found].sort();
}

const FORBIDDEN_PAYLOAD = {
  student_id: USER_A,
  tester_email: 'probador@qa.local.test',
  feedback_text: 'texto libre del instructor',
  grade: 7,
  content: 'cuerpo del mensaje',
  description: 'descripción libre',
  update_message: 'mensaje libre',
  step_instruction: 'instrucción',
  tester_note: 'nota',
  attendee_ids: [USER_B],
  recipient_ids: [USER_B],
  assigned_users: [USER_A],
};

describe('D1 · catalog completeness and typed definitions', () => {
  it('maps every registry event and every event a producer emits', () => {
    expect(findUnmappedEvents(Object.keys(NOTIFICATION_EVENTS))).toEqual([]);
    const emitted = emittedEventTypes();
    expect(emitted).toEqual(expect.arrayContaining(['message_sent', 'licitacion_evaluacion_start', 'session_cancelled', 'data_quality_alert']));
    expect(findUnmappedEvents(emitted)).toEqual([]);
  });

  it('fails the completeness check for an unmapped event', () => {
    expect(findUnmappedEvents(['session_created', 'nuevo_evento_sin_catalogo'])).toEqual(['nuevo_evento_sin_catalogo']);
  });

  it.each(Object.entries(NOTIFICATION_CATALOG))('%s has a complete, valid definition', (eventType, entry) => {
    expect(Object.keys(CATEGORY_LABELS)).toContain(entry.category);
    expect(['immediate', 'digest', 'off']).toContain(entry.emailDefault);
    expect(typeof entry.audience).toBe('string');
    expect(typeof entry.occurrenceId).toBe('function');
    expect(typeof entry.urlBuilder).toBe('function');
    expect(Array.isArray(entry.emailFields)).toBe(true);
    if (entry.mandatory) expect(entry.mandatoryJustification?.length).toBeGreaterThan(10);
    if (entry.templates === 'registry') {
      const templates = getCatalogTemplates(eventType);
      expect(templates?.title({})).toBe(NOTIFICATION_EVENTS[eventType].defaultTitle({}));
      expect(templates?.description({})).toBe(NOTIFICATION_EVENTS[eventType].defaultDescription({}));
    } else {
      expect(getCatalogTemplates(eventType)).toBeNull();
    }
  });

  it('follows the rev-3 defaults: only session_cancelled is mandatory, system_update is off', () => {
    const mandatory = Object.entries(NOTIFICATION_CATALOG).filter(([, e]) => e.mandatory).map(([k]) => k);
    expect(mandatory).toEqual(['session_cancelled']);
    expect(NOTIFICATION_CATALOG.system_update.emailDefault).toBe('off');
    expect(NOTIFICATION_CATALOG.course_completed.emailDefault).toBe('digest');
    expect(NOTIFICATION_CATALOG.new_feedback.emailDefault).toBe('digest');
    expect(NOTIFICATION_CATALOG.user_mentioned.emailDefault).toBe('immediate');
  });

  it('derives occurrence ids from the persisted record and returns null without one', () => {
    expect(NOTIFICATION_CATALOG.message_sent.occurrenceId({ message_id: 'm-1' })).toBe('m-1');
    expect(
      NOTIFICATION_CATALOG.session_reminder_1h.occurrenceId({ session: { id: SESSION_ID, date: '2026-10-01', time: '09:00' } })
    ).toBe(`${SESSION_ID}:2026-10-01:09%3A00`);
    expect(NOTIFICATION_CATALOG.message_sent.occurrenceId({})).toBeNull();
    expect(NOTIFICATION_CATALOG.licitacion_created.occurrenceId({ licitacion_id: '' })).toBeNull();
    expect(NOTIFICATION_CATALOG.qa_scenario_assigned.occurrenceId({ tester_id: USER_A })).toBeNull();
  });

  it('N2-01: an entity id alone is no occurrence, and a UUID part is case-normalized', () => {
    const entityOnly = {
      course_assigned: { course: { id: 'c-1' } },
      assignment_feedback: { assignment_id: ASSIGNMENT_ID, student_id: USER_A },
      session_edit_request_submitted: { session: { id: SESSION_ID }, requester_id: USER_A },
      session_edit_request_approved: { session: { id: SESSION_ID }, requester_id: USER_A },
      session_edit_request_rejected: { session: { id: SESSION_ID }, requester_id: USER_A },
    };
    for (const [event, data] of Object.entries(entityOnly)) expect(NOTIFICATION_CATALOG[event].occurrenceId(data)).toBeNull();
    expect(NOTIFICATION_CATALOG.licitacion_created.occurrenceId({ licitacion_id: LICITACION_ID.toUpperCase() })).toBe(LICITACION_ID);
    expect(NOTIFICATION_CATALOG.qa_test_failed.occurrenceId({ test_run_id: RUN_ID, step_index: 0 })).toBe(`${RUN_ID}:0`);
    expect(NOTIFICATION_CATALOG.qa_test_failed.occurrenceId({ test_run_id: RUN_ID, step_index: Infinity })).toBeNull();
  });

  it('N2-01: a deadline reminder is keyed by licitación, deadline date and phase; without either it is unidentified', () => {
    const deadlineEvents = Object.keys(NOTIFICATION_CATALOG).filter((e) => /^licitacion_.*_deadline(_1d)?$/.test(e));
    expect(deadlineEvents).toHaveLength(7);
    const at = (deadline_date: unknown, reminder: unknown) => ({ licitacion_id: LICITACION_ID, deadline_date, reminder });
    for (const event of deadlineEvents) {
      const id = NOTIFICATION_CATALOG[event].occurrenceId;
      expect(id(at('2026-10-02', '1d'))).toBe(`${LICITACION_ID}:2026-10-02:1d`);
      expect(id(at('2026-10-02', 'today'))).not.toBe(id(at('2026-10-02', '1d')));
      expect(id(at('2026-10-09', '1d'))).not.toBe(id(at('2026-10-02', '1d')));
      for (const data of [{ licitacion_id: LICITACION_ID }, at(undefined, '1d'), at('2026-10-02', ''), at(null, 'today')]) {
        expect(id(data)).toBeNull();
      }
    }
  });

  it('N2-01: a reschedule has no transition id, so every reschedule (duration-only or a move back) is unidentified', () => {
    const moved = (time: string, end_time: string) => ({ session: { id: SESSION_ID, date: '2026-10-02', time, end_time } });
    expect(NOTIFICATION_CATALOG.session_rescheduled.occurrenceId(moved('09:00', '10:00'))).toBeNull();
    expect(NOTIFICATION_CATALOG.session_rescheduled.occurrenceId(moved('09:00', '11:00'))).toBeNull();
  });

  it.each(Object.keys(NOTIFICATION_CATALOG))('%s email payload keeps only allowlisted scalar fields', (eventType) => {
    const payload = buildEmailPayload(eventType, {
      ...FORBIDDEN_PAYLOAD,
      session: { id: SESSION_ID, title: 'Sesión de prueba', date: '2026-10-01', notes: 'notas' },
      title: 'Reunión',
      numero_licitacion: 'LIC-1',
    });
    for (const key of Object.keys(payload)) expect(NOTIFICATION_CATALOG[eventType].emailFields).toContain(key);
    for (const key of Object.keys(FORBIDDEN_PAYLOAD)) expect(payload).not.toHaveProperty(key);
    expect(JSON.stringify(payload)).not.toMatch(/texto libre|cuerpo del mensaje|probador@|notas|instrucción/);
  });
});

describe('D2 · record URLs for session, assignment, workspace and licitación', () => {
  it('builds existing same-origin record paths from valid identifiers', () => {
    const cases: Array<[string, Record<string, unknown>, string]> = [
      ['session_rescheduled', { session: { id: SESSION_ID } }, `/meet/session/${SESSION_ID}`],
      ['session_edit_request_approved', { session: { id: SESSION_ID } }, `/meet/session/${SESSION_ID}`],
      ['assignment_feedback', { assignment_id: ASSIGNMENT_ID }, `/assignments/${ASSIGNMENT_ID}`],
      ['assignment_created', { assignment: { id: ASSIGNMENT_ID } }, `/assignments/${ASSIGNMENT_ID}`],
      ['licitacion_adjudicada', { licitacion_id: LICITACION_ID }, `/licitaciones/${LICITACION_ID}`],
      ['licitacion_created', { licitacion_id: 42 }, '/licitaciones/42'],
      ['qa_test_failed', { test_run_id: RUN_ID }, `/admin/qa/runs/${RUN_ID}`],
      ['message_sent', { message_id: 'm-1' }, '/community/workspace?section=messaging'],
      ['user_mentioned', { discussion_id: 'p-1' }, '/community/workspace?section=overview'],
      ['meeting_finalized', { meeting_id: 'x' }, '/community/workspace?section=meetings'],
    ];
    for (const [eventType, data, expected] of cases) {
      expect(buildNotificationUrl(eventType, data)).toBe(expected);
      expect(pageExists(expected)).toBe(true);
    }
  });

  it('session records open the consultor detail page only for the roles it admits', () => {
    for (const role of ['admin', 'consultor', 'lider_comunidad']) {
      expect(buildNotificationUrl('session_rescheduled', { session: { id: SESSION_ID } }, role)).toBe(`/consultor/sessions/${SESSION_ID}`);
    }
    for (const role of ['docente', 'equipo_directivo', 'lider_generacion', 'community_manager', 'supervisor_de_red', 'encargado_licitacion', 'desconocido']) {
      expect(buildNotificationUrl('session_cancelled', { session: { id: SESSION_ID } }, role)).toBe(`/meet/session/${SESSION_ID}`);
    }
    expect(pageExists(`/consultor/sessions/${SESSION_ID}`)).toBe(true);
  });

  it('every fallback URL is a safe path to an existing page', () => {
    for (const [eventType, entry] of Object.entries(NOTIFICATION_CATALOG)) {
      expect(isSafeNotificationPath(entry.fallbackUrl), eventType).toBe(true);
      expect(pageExists(entry.fallbackUrl), `${eventType} → ${entry.fallbackUrl}`).toBe(true);
    }
  });
});

describe('D3 · malformed, foreign or malicious input', () => {
  const hostile = [
    'https://evil.example/x',
    '//evil.example',
    '/\\evil.example',
    'javascript:alert(1)',
    '../admin',
    '%2F%2Fevil.example',
    `${SESSION_ID}/../../admin`,
    `${SESSION_ID}?next=https://evil.example`,
    '1 OR 1=1',
    '<script>alert(1)</script>',
    '0',
    '-5',
    '',
    null,
    { id: SESSION_ID },
    [SESSION_ID],
    Number.NaN,
  ];

  it.each(hostile.map((v) => [JSON.stringify(v) ?? String(v), v]))('rejects record id %s', (_label, value) => {
    expect(buildRecordUrl('session_created', { session: { id: value } })).toBeNull();
    expect(buildNotificationUrl('session_created', { session: { id: value } })).toBe('/consultor/sessions');
    expect(buildNotificationUrl('session_created', { session: { id: value } }, 'docente')).toBe(DEFAULT_NOTIFICATION_URL);
    expect(buildNotificationUrl('assignment_due_soon', { assignment_id: value })).toBe('/assignments');
    expect(buildNotificationUrl('licitacion_published', { licitacion_id: value })).toBe('/licitaciones');
  });

  it('never puts minor or personal data in a URL', () => {
    const data = { ...FORBIDDEN_PAYLOAD, sender_name: 'Nombre Sintético', session: { id: SESSION_ID }, assignment_id: ASSIGNMENT_ID };
    for (const eventType of Object.keys(NOTIFICATION_CATALOG)) {
      const url = buildNotificationUrl(eventType, data);
      expect(url).not.toContain(USER_A);
      expect(url).not.toContain(USER_B);
      expect(url).not.toMatch(/Nombre|qa\.local|texto/);
    }
  });

  it('accepts only same-origin relative paths', () => {
    for (const bad of ['https://evil.example', '//evil.example', '/\\evil', 'javascript:x', 'evil', '/a b', '/x/{id}', '/x\u0000', '', null, 42]) {
      expect(isSafeNotificationPath(bad)).toBe(false);
    }
    expect(isSafeNotificationPath('/licitaciones/42')).toBe(true);
  });

  it('ignores a prototype-chain lookup in the payload', () => {
    expect(buildRecordUrl('session_created', { session: Object.create({ id: SESSION_ID }) })).toBeNull();
  });

  it('a session id must be a UUID: an integer id gives the fallback, not a broken record page', () => {
    expect(buildRecordUrl('session_created', { session: { id: '42' } }, 'consultor')).toBeNull();
    expect(buildNotificationUrl('session_created', { session: { id: 42 } }, 'consultor')).toBe('/consultor/sessions');
  });
});

describe('D4 · live producer path through NotificationService.triggerNotification', () => {
  let created: Array<Record<string, any>>;

  beforeEach(() => {
    db.triggers = [];
    db.role = 'consultor';
    db.roleScope = {};
    db.session = SESSION_ROW;
    db.activeUsers = [];
    created = [];
    vi.spyOn(NotificationService, 'createNotification').mockImplementation(async (data: any) => {
      created.push(data);
      return { success: true } as any;
    });
  });

  it('code defaults: links a consultor to the session record, keeps the registry title and description', async () => {
    const data = { session: { id: SESSION_ID, title: 'Taller', date: '01-10-2026', time: '09:00' }, facilitator_ids: [USER_A], attendee_ids: [] };
    const result = await NotificationService.triggerNotification('session_created', data);
    expect(result).toEqual({ success: true, notificationsCreated: 1 });
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      user_id: USER_A,
      related_url: `/consultor/sessions/${SESSION_ID}`,
      title: NOTIFICATION_EVENTS.session_created.defaultTitle(data),
      description: NOTIFICATION_EVENTS.session_created.defaultDescription(data),
      event_type: 'session_created',
      category: 'sessions',
    });
  });

  it('DB template override: keeps the template title/description, links to the record', async () => {
    db.triggers = [{ trigger_id: 't1', category: 'sessions', template: { title_template: 'Aviso {session.title}', description_template: 'Detalle', url_template: '/consultor/sessions' } }];
    await NotificationService.triggerNotification('session_rescheduled', { session: { id: SESSION_ID, title: 'Taller' }, facilitator_ids: [USER_A] });
    expect(created[0]).toMatchObject({ title: 'Aviso Taller', description: 'Detalle', related_url: `/consultor/sessions/${SESSION_ID}` });
  });

  it('DB template URL is kept when there is no record route and it is safe', async () => {
    db.triggers = [{ trigger_id: 't2', category: 'courses', template: { title_template: 'Curso asignado', url_template: '/mi-aprendizaje?tab=cursos' } }];
    await NotificationService.triggerNotification('course_assigned', { course: { id: 'c1' }, assigned_users: [USER_A] });
    expect(created[0].related_url).toBe('/mi-aprendizaje?tab=cursos');
  });

  it('an external DB template URL falls back to the event page (admin) or dashboard (non-admin)', async () => {
    db.triggers = [{ trigger_id: 't3', category: 'admin', template: { title_template: 'Nuevo reporte', url_template: 'https://evil.example/{feedback_id}' } }];
    db.role = 'admin';
    await NotificationService.triggerNotification('new_feedback', { feedback_id: 'f1', assigned_users: [USER_A] });
    db.role = 'docente';
    await NotificationService.triggerNotification('new_feedback', { feedback_id: 'f1', assigned_users: [USER_B] });
    expect(created.map((c) => c.related_url)).toEqual(['/admin/feedback', DEFAULT_NOTIFICATION_URL]);
  });

  it('replaces the dead registry defaults with existing pages', async () => {
    await NotificationService.triggerNotification('message_sent', { message_id: 'm1', recipient_id: USER_A, sender_name: 'X' });
    await NotificationService.triggerNotification('consultant_assigned', { assignment_id: 'a1', student_id: USER_A });
    expect(created.map((c) => c.related_url)).toEqual(['/community/workspace?section=messaging', '/profile']);
  });

  it('an admin-only record URL for a non-admin recipient falls back safely', async () => {
    db.role = 'docente';
    await NotificationService.triggerNotification('qa_test_failed', { test_run_id: RUN_ID, admin_user_ids: [USER_A] });
    expect(created[0].related_url).toBe(DEFAULT_NOTIFICATION_URL);
  });

  it('reads the recipient role from user_roles: an admin keeps admin links', async () => {
    db.role = 'admin';
    await NotificationService.triggerNotification('qa_test_failed', { test_run_id: RUN_ID, admin_user_ids: [USER_A] });
    await NotificationService.triggerNotification('new_feedback', { feedback_id: 'f1', assigned_users: [USER_A] });
    expect(created.map((c) => c.related_url)).toEqual([`/admin/qa/runs/${RUN_ID}`, '/admin/feedback']);
  });
});

describe('R1 · session attendees get a session page their role can open', () => {
  let created: Array<Record<string, any>>;
  const session = { id: SESSION_ID, title: 'Taller', date: '01-10-2026', time: '09:00' };

  beforeEach(() => {
    db.triggers = [];
    db.roleScope = {};
    db.session = SESSION_ROW;
    created = [];
    vi.spyOn(NotificationService, 'createNotification').mockImplementation(async (data: any) => {
      created.push(data);
      return { success: true } as any;
    });
  });

  it('a docente attendee in the growth community gets the re-authorizing meeting page, never the consultor-only detail', async () => {
    db.role = 'docente';
    db.roleScope = MEMBER;
    for (const event of ['session_created', 'session_rescheduled', 'session_cancelled', 'session_reminder_24h', 'session_reminder_1h']) {
      await NotificationService.triggerNotification(event, { session, facilitator_ids: [USER_B], attendee_ids: [] });
    }
    expect(created.map((c) => c.related_url)).toEqual(Array(5).fill(`/meet/session/${SESSION_ID}`));
    expect(pageExists(`/meet/session/${SESSION_ID}`)).toBe(true);
  });

  it('a recipient with no active role gets the dashboard: the meeting page answers 404 without a role', async () => {
    db.role = '';
    await NotificationService.triggerNotification('session_created', { session, facilitator_ids: [USER_B] });
    expect(created[0].related_url).toBe(DEFAULT_NOTIFICATION_URL);
  });

  it('a lider_comunidad of the session community keeps the consultor detail page it is admitted to', async () => {
    db.role = 'lider_comunidad';
    db.roleScope = MEMBER;
    await NotificationService.triggerNotification('session_created', { session, facilitator_ids: [USER_B] });
    expect(created[0].related_url).toBe(`/consultor/sessions/${SESSION_ID}`);
  });

  it('without a usable session id a docente gets the dashboard and a consultor the session list', async () => {
    db.role = 'docente';
    await NotificationService.triggerNotification('session_reminder_1h', { session: { id: 'no-es-uuid' }, facilitator_ids: [USER_B] });
    db.role = 'consultor';
    await NotificationService.triggerNotification('session_reminder_1h', { session: { id: 'no-es-uuid' }, facilitator_ids: [USER_B] });
    expect(created.map((c) => c.related_url)).toEqual([DEFAULT_NOTIFICATION_URL, '/consultor/sessions']);
  });

  it('a DB template pointing at a consultor page is not handed to a docente', async () => {
    db.role = 'docente';
    db.triggers = [{ trigger_id: 't4', category: 'sessions', template: { title_template: 'Aviso', url_template: '/consultor/sessions/reports' } }];
    await NotificationService.triggerNotification('session_created', { session: { id: 'x' }, facilitator_ids: [USER_B] });
    expect(created[0]).toMatchObject({ title: 'Aviso', related_url: DEFAULT_NOTIFICATION_URL });
  });

  it('isOpenToRole mirrors the consultor session page gates', () => {
    const detail = `/consultor/sessions/${SESSION_ID}`;
    expect(['admin', 'consultor', 'lider_comunidad'].map((r) => isOpenToRole(detail, r))).toEqual([true, true, true]);
    expect(['docente', 'equipo_directivo'].map((r) => isOpenToRole(detail, r))).toEqual([false, false]);
    expect(['admin', 'consultor', 'lider_comunidad', 'docente'].map((r) => isOpenToRole('/consultor/sessions', r))).toEqual([true, true, false, false]);
    expect(isOpenToRole('/consultor/sessions/reports', 'lider_comunidad')).toBe(false);
    expect(isOpenToRole(`/meet/session/${SESSION_ID}`, 'docente')).toBe(true);
    expect(isOpenToRole('/consultorias', 'docente')).toBe(true);
  });
});

describe('D7 · a session link only for a recipient who can open that session (N04-R2-01)', () => {
  let created: Array<Record<string, any>>;
  const session = { id: SESSION_ID, title: 'Taller', date: '01-10-2026', time: '09:00' };
  const LIFECYCLE = ['session_created', 'session_rescheduled', 'session_cancelled', 'session_reminder_24h', 'session_reminder_1h'];
  /** The lifecycle producer's payload: every listed attendee arrives in facilitator_ids. */
  const listed = (userId: string) => ({ session, facilitator_ids: [userId], attendee_ids: [] });
  const urls = () => created.map((c) => c.related_url);

  beforeEach(() => {
    db.triggers = [];
    db.role = 'docente';
    db.roleScope = { school_id: SCHOOL_ID };
    db.session = SESSION_ROW;
    created = [];
    vi.spyOn(NotificationService, 'createNotification').mockImplementation(async (data: any) => {
      created.push(data);
      return { success: true } as any;
    });
  });

  it('a listed docente attendee without a growth-community role gets the dashboard, not the meet page 404', async () => {
    for (const event of LIFECYCLE) await NotificationService.triggerNotification(event, listed(USER_A));
    expect(urls()).toEqual(Array(LIFECYCLE.length).fill(DEFAULT_NOTIFICATION_URL));
    expect(JSON.stringify(created)).not.toContain(`/meet/session/${SESSION_ID}`);
    expect(created.map((c) => c.title)).toEqual(LIFECYCLE.map((e) => NOTIFICATION_EVENTS[e].defaultTitle(listed(USER_A))));
  });

  it('a docente in another growth community of the same school is denied the same way', async () => {
    db.roleScope = { school_id: SCHOOL_ID, community_id: OTHER_COMMUNITY_ID };
    await NotificationService.triggerNotification('session_rescheduled', listed(USER_A));
    expect(urls()).toEqual([DEFAULT_NOTIFICATION_URL]);
  });

  it('a docente attendee in the growth community keeps the meet page', async () => {
    db.roleScope = { school_id: SCHOOL_ID, community_id: COMMUNITY_ID };
    await NotificationService.triggerNotification('session_rescheduled', listed(USER_A));
    expect(urls()).toEqual([`/meet/session/${SESSION_ID}`]);
  });

  it('a consultor gets the detail page at its school or as global, and the session list at another school', async () => {
    db.role = 'consultor';
    db.roleScope = { school_id: SCHOOL_ID };
    await NotificationService.triggerNotification('session_created', listed(USER_A));
    db.roleScope = {};
    await NotificationService.triggerNotification('session_created', listed(USER_A));
    db.roleScope = { school_id: SCHOOL_ID + 1 };
    await NotificationService.triggerNotification('session_created', listed(USER_A));
    expect(urls()).toEqual([`/consultor/sessions/${SESSION_ID}`, `/consultor/sessions/${SESSION_ID}`, '/consultor/sessions']);
  });

  it('a lider_comunidad of another community gets the dashboard, not a detail page that answers not found', async () => {
    db.role = 'lider_comunidad';
    db.roleScope = { school_id: SCHOOL_ID, community_id: OTHER_COMMUNITY_ID };
    await NotificationService.triggerNotification('session_created', listed(USER_A));
    expect(urls()).toEqual([DEFAULT_NOTIFICATION_URL]);
  });

  it('a failed or empty session read denies the record link for every role', async () => {
    for (const missing of ['error', null] as const) {
      db.session = missing;
      db.role = 'docente';
      db.roleScope = MEMBER;
      await NotificationService.triggerNotification('session_created', listed(USER_A));
      db.role = 'consultor';
      db.roleScope = {};
      await NotificationService.triggerNotification('session_created', listed(USER_A));
      db.role = 'admin';
      await NotificationService.triggerNotification('session_created', listed(USER_A));
    }
    expect(urls()).toEqual(Array(2).fill([DEFAULT_NOTIFICATION_URL, '/consultor/sessions', '/consultor/sessions']).flat());
  });

  it('an archived session is linked only for an admin', async () => {
    db.session = { ...SESSION_ROW, is_active: false };
    db.role = 'admin';
    await NotificationService.triggerNotification('session_cancelled', listed(USER_A));
    db.role = 'consultor';
    db.roleScope = {};
    await NotificationService.triggerNotification('session_cancelled', listed(USER_A));
    db.role = 'docente';
    db.roleScope = MEMBER;
    await NotificationService.triggerNotification('session_cancelled', listed(USER_A));
    expect(urls()).toEqual([`/consultor/sessions/${SESSION_ID}`, '/consultor/sessions', DEFAULT_NOTIFICATION_URL]);
  });

  it('a DB template pointing at the meet page is not handed to a non-member either', async () => {
    db.triggers = [{ trigger_id: 't5', category: 'sessions', template: { title_template: 'Aviso {session.title}', url_template: '/meet/session/{session.id}' } }];
    await NotificationService.triggerNotification('session_reminder_1h', listed(USER_A));
    db.roleScope = MEMBER;
    await NotificationService.triggerNotification('session_reminder_1h', listed(USER_A));
    expect(created.map((c) => [c.title, c.related_url])).toEqual([['Aviso Taller', DEFAULT_NOTIFICATION_URL], ['Aviso Taller', `/meet/session/${SESSION_ID}`]]);
  });

  it('a DB template session link is never handed out when the payload identifies no session', async () => {
    db.triggers = [{ trigger_id: 't6', category: 'sessions', template: { title_template: 'Aviso', url_template: `/meet/session/${OTHER_SESSION_ID}` } }];
    db.roleScope = MEMBER;
    await NotificationService.triggerNotification('session_reminder_1h', { session: { id: 'x' }, facilitator_ids: [USER_A] });
    expect(created.map((c) => [c.title, c.related_url])).toEqual([['Aviso', DEFAULT_NOTIFICATION_URL]]);
  });

  it('isSessionRecordOpenTo applies the session pages\' own rule and fails closed', () => {
    const meet = `/meet/session/${SESSION_ID}`;
    const detail = `/consultor/sessions/${SESSION_ID}`;
    const role = (role_type: string, scope: Record<string, unknown> = {}, is_active: unknown = true) =>
      ({ role_type, is_active, ...scope }) as any;
    const recipient = (highestRole: string | null, ...userRoles: any[]) => ({ userId: USER_A, userRoles, highestRole });
    const member = recipient('docente', role('docente', { school_id: SCHOOL_ID, community_id: COMMUNITY_ID }));
    const nonMember = recipient('docente', role('docente', { school_id: SCHOOL_ID }));

    expect(isSessionRecordOpenTo('/dashboard', nonMember, null)).toBe(true);
    expect(isSessionRecordOpenTo('/consultor/sessions', nonMember, null)).toBe(true);
    expect(isSessionRecordOpenTo(meet, member, SESSION_ROW)).toBe(true);
    expect(isSessionRecordOpenTo(`/meet/session/${SESSION_ID.toUpperCase()}`, member, SESSION_ROW)).toBe(true);
    // Routes are case-sensitive: a mis-cased path is a page that does not exist.
    expect(isSessionRecordOpenTo(meet.toUpperCase(), member, SESSION_ROW)).toBe(false);
    expect(isSessionRecordOpenTo(meet, nonMember, SESSION_ROW)).toBe(false);
    expect(isSessionRecordOpenTo(meet, member, null)).toBe(false);
    expect(isSessionRecordOpenTo(meet, member, { ...SESSION_ROW, id: OTHER_SESSION_ID })).toBe(false);
    expect(isSessionRecordOpenTo(meet, recipient(null), SESSION_ROW)).toBe(false);
    expect(isSessionRecordOpenTo(meet, recipient('docente', role('docente', { community_id: COMMUNITY_ID }, false)), SESSION_ROW)).toBe(false);
    expect(isSessionRecordOpenTo(meet, recipient('docente', role('docente', { community_id: COMMUNITY_ID, from_cache: true }, null)), SESSION_ROW)).toBe(false);
    expect(isSessionRecordOpenTo(detail, recipient('admin', role('admin')), SESSION_ROW)).toBe(true);
    expect(isSessionRecordOpenTo(detail, recipient('admin', role('admin')), { ...SESSION_ROW, is_active: false })).toBe(true);
    expect(isSessionRecordOpenTo(detail, recipient('consultor', role('consultor')), { ...SESSION_ROW, is_active: false })).toBe(false);
    expect(isSessionRecordOpenTo(detail, recipient('consultor', role('consultor')), SESSION_ROW)).toBe(true);
    expect(isSessionRecordOpenTo(detail, recipient('consultor', role('consultor', { school_id: SCHOOL_ID })), SESSION_ROW)).toBe(true);
    expect(isSessionRecordOpenTo(detail, recipient('consultor', role('consultor', { school_id: SCHOOL_ID + 1 })), SESSION_ROW)).toBe(false);
    expect(isSessionRecordOpenTo(detail, recipient('lider_comunidad', role('lider_comunidad', { community_id: COMMUNITY_ID })), SESSION_ROW)).toBe(true);
    expect(isSessionRecordOpenTo(detail, recipient('lider_comunidad', role('lider_comunidad', { community_id: OTHER_COMMUNITY_ID })), SESSION_ROW)).toBe(false);
  });
});

describe('R3 · session URL variants: query, fragment, trailing slash and unserved targets (N04-R3-01)', () => {
  const meet = `/meet/session/${SESSION_ID}`;
  const detail = `/consultor/sessions/${SESSION_ID}`;
  const role = (role_type: string, scope: Record<string, unknown> = {}) => ({ role_type, is_active: true, ...scope }) as any;
  const recipient = (highestRole: string | null, ...userRoles: any[]) => ({ userId: USER_A, userRoles, highestRole });
  const member = recipient('docente', role('docente', { school_id: SCHOOL_ID, community_id: COMMUNITY_ID }));
  const nonMember = recipient('docente', role('docente', { school_id: SCHOOL_ID }));
  const admin = recipient('admin', role('admin'));
  const leader = recipient('lider_comunidad', role('lider_comunidad', { school_id: SCHOOL_ID, community_id: COMMUNITY_ID }));
  /** Variants Next.js routes to the record page: query and fragment ignored, one trailing slash redirected, UUID case ignored. */
  const served = [
    `${meet}?from=bell`,
    `${meet}#detalle`,
    `${meet}/`,
    `${meet}/?from=bell#detalle`,
    `${meet}?next=https://evil.example`,
    `/meet/session/${SESSION_ID.toUpperCase()}`,
  ];
  /** Session targets no page serves: a non-UUID id, an extra segment, a mis-cased route, no id, an encoded query. */
  const unserved = [
    `${meet}/resumen`,
    '/meet/session/no-es-uuid',
    '/meet/session/',
    '/meet/session',
    `/MEET/SESSION/${SESSION_ID}`,
    `/Meet/session/${SESSION_ID}?from=bell`,
    `${detail}/x`,
    `${detail}%3Ffrom=bell`,
    '/consultor/sessions/42',
    `${meet}//`,
  ];

  it('isSessionRecordOpenTo decides a query, fragment or trailing-slash variant exactly as the plain record link', () => {
    for (const url of served) {
      expect(isSessionRecordOpenTo(url, member, SESSION_ROW), url).toBe(true);
      expect(isSessionRecordOpenTo(url, nonMember, SESSION_ROW), url).toBe(false);
      expect(isSessionRecordOpenTo(url, member, null), url).toBe(false);
      expect(isSessionRecordOpenTo(url, member, { ...SESSION_ROW, id: OTHER_SESSION_ID }), url).toBe(false);
      expect(isSessionRecordOpenTo(url, recipient(null), SESSION_ROW), url).toBe(false);
      expect(isSessionRecordOpenTo(url, admin, null), url).toBe(false);
    }
    expect(isSessionRecordOpenTo(`${detail}?tab=reportes`, leader, SESSION_ROW)).toBe(true);
    expect(isSessionRecordOpenTo(`${detail}/#top`, recipient('lider_comunidad', role('lider_comunidad', { community_id: OTHER_COMMUNITY_ID })), SESSION_ROW)).toBe(false);
    expect(isSessionRecordOpenTo(`${detail}?tab=reportes`, recipient('consultor', role('consultor', { school_id: SCHOOL_ID + 1 })), SESSION_ROW)).toBe(false);
  });

  it('isSessionRecordOpenTo denies a session target no page serves, even to an admin holding the session row', () => {
    for (const url of unserved) {
      expect(isSessionRecordOpenTo(url, admin, SESSION_ROW), url).toBe(false);
      expect(isSessionRecordOpenTo(url, member, SESSION_ROW), url).toBe(false);
    }
  });

  it('isSessionRecordOpenTo leaves the session list, its reports and every non-session link to the other checks', () => {
    const others = [
      '/consultor/sessions',
      '/consultor/sessions/',
      '/consultor/sessions?tab=proximas',
      '/consultor/sessions/reports#top',
      '/community/workspace?section=messaging',
      '/dashboard#top',
      '/mi-aprendizaje?tab=cursos',
      '/admin/sessions/approvals',
    ];
    for (const url of others) {
      expect(isSessionRecordOpenTo(url, nonMember, null), url).toBe(true);
      expect(isSessionRecordOpenTo(url, recipient(null), null), url).toBe(true);
    }
  });

  it('isOpenToRole reads the route path: a detail link with a query keeps the detail roles, the list its list roles', () => {
    expect(['lider_comunidad', 'docente'].map((r) => isOpenToRole(`${detail}?from=bell`, r))).toEqual([true, false]);
    expect(['consultor', 'lider_comunidad'].map((r) => isOpenToRole('/consultor/sessions/?tab=x', r))).toEqual([true, false]);
    expect(isOpenToRole('/consultor#top', 'docente')).toBe(false);
    expect(isOpenToRole(`${meet}?from=bell`, 'docente')).toBe(true);
  });

  describe('through NotificationService with a DB template', () => {
    let created: Array<Record<string, any>>;
    const template = (url_template: string, title_template = 'Aviso {session.title}') => [
      { trigger_id: 't7', category: 'sessions', template: { title_template, url_template } },
    ];
    const rows = () => created.map((c) => [c.title, c.related_url]);

    beforeEach(() => {
      db.role = 'docente';
      db.roleScope = { school_id: SCHOOL_ID, community_id: COMMUNITY_ID };
      db.session = SESSION_ROW;
      db.activeUsers = [];
      created = [];
      vi.spyOn(NotificationService, 'createNotification').mockImplementation(async (data: any) => {
        created.push(data);
        return { success: true } as any;
      });
    });

    it('the PM counterexample: a template session link with a query and no session id in the payload falls back for every role', async () => {
      db.triggers = template(`/meet/session/${OTHER_SESSION_ID}?from=bell`);
      const payload = { session: { id: 'x', title: 'Taller' }, facilitator_ids: [USER_A] };
      for (const [role, scope] of [['', {}], ['docente', { school_id: SCHOOL_ID, community_id: COMMUNITY_ID }], ['consultor', {}], ['admin', {}]] as const) {
        db.role = role;
        db.roleScope = scope;
        await NotificationService.triggerNotification('session_reminder_1h', payload);
      }
      expect(rows()).toEqual([
        ['Aviso Taller', DEFAULT_NOTIFICATION_URL],
        ['Aviso Taller', DEFAULT_NOTIFICATION_URL],
        ['Aviso Taller', '/consultor/sessions'],
        ['Aviso Taller', '/consultor/sessions'],
      ]);
      expect(JSON.stringify(created)).not.toContain(OTHER_SESSION_ID);
    });

    it('a template query, fragment or trailing-slash variant never outranks the catalog record link when the payload names the session', async () => {
      const listed = { session: { id: SESSION_ID, title: 'Taller' }, facilitator_ids: [USER_A], attendee_ids: [] };
      for (const suffix of ['?from=bell', '#detalle', '/']) {
        db.triggers = template(`/meet/session/{session.id}${suffix}`);
        db.roleScope = { school_id: SCHOOL_ID, community_id: COMMUNITY_ID };
        await NotificationService.triggerNotification('session_reminder_1h', listed);
        db.roleScope = { school_id: SCHOOL_ID };
        await NotificationService.triggerNotification('session_reminder_1h', listed);
      }
      expect(rows()).toEqual(Array(3).fill([['Aviso Taller', `/meet/session/${SESSION_ID}`], ['Aviso Taller', DEFAULT_NOTIFICATION_URL]]).flat());
    });

    it('a template detail link with a query is kept for an admin who can open the session and dropped without the session row', async () => {
      db.role = 'admin';
      db.roleScope = {};
      const request = { session: { id: SESSION_ID, title: 'Taller' }, requester_id: USER_B, admin_user_ids: [USER_A] };
      db.triggers = template('/consultor/sessions/{session.id}?tab=solicitudes', 'Solicitud {session.title}');
      await NotificationService.triggerNotification('session_edit_request_submitted', request);
      db.session = null;
      await NotificationService.triggerNotification('session_edit_request_submitted', request);
      db.session = SESSION_ROW;
      db.triggers = template(`/consultor/sessions/${OTHER_SESSION_ID}?tab=solicitudes`, 'Solicitud {session.title}');
      await NotificationService.triggerNotification('session_edit_request_submitted', request);
      expect(rows()).toEqual([
        ['Solicitud Taller', `/consultor/sessions/${SESSION_ID}?tab=solicitudes`],
        ['Solicitud Taller', '/admin/sessions/approvals'],
        ['Solicitud Taller', '/admin/sessions/approvals'],
      ]);
    });

    it('a template session target no page serves falls back even for an admin with the session row', async () => {
      db.role = 'admin';
      db.roleScope = {};
      const request = { session: { id: SESSION_ID, title: 'Taller' }, requester_id: USER_B, admin_user_ids: [USER_A] };
      for (const url of ['/consultor/sessions/{session.id}/resumen', '/CONSULTOR/sessions/{session.id}', '/meet/session/{session.id}/x?from=bell', '/meet/session/']) {
        db.triggers = template(url, 'Solicitud');
        await NotificationService.triggerNotification('session_edit_request_submitted', request);
      }
      expect(rows()).toEqual(Array(4).fill(['Solicitud', '/admin/sessions/approvals']));
    });

    it('a safe query link that is not a session record survives: the session list for an admin, the workspace section for a docente', async () => {
      db.role = 'admin';
      db.roleScope = {};
      db.triggers = template('/consultor/sessions?tab=proximas', 'Solicitud');
      await NotificationService.triggerNotification('session_edit_request_submitted', { session: { id: SESSION_ID }, requester_id: USER_B, admin_user_ids: [USER_A] });
      db.role = 'docente';
      db.triggers = [{ trigger_id: 't8', category: 'community', template: { title_template: 'Mensaje', url_template: '/community/workspace?section=messaging#nuevo' } }];
      await NotificationService.triggerNotification('message_sent', { message_id: 'm2', recipient_id: USER_A, sender_name: 'X' });
      db.triggers = [{ trigger_id: 't9', category: 'community', template: { title_template: 'Mensaje', url_template: '/consultor/sessions?tab=proximas' } }];
      await NotificationService.triggerNotification('message_sent', { message_id: 'm3', recipient_id: USER_A, sender_name: 'X' });
      expect(rows()).toEqual([
        ['Solicitud', '/consultor/sessions?tab=proximas'],
        ['Mensaje', '/community/workspace?section=messaging#nuevo'],
        ['Mensaje', '/community/workspace?section=messaging'],
      ]);
    });
  });
});

describe('D5 · unknown events, category/default edges', () => {
  it('unknown and prototype-named events get the dashboard, never a crash', () => {
    for (const eventType of ['evento_desconocido', '__proto__', 'constructor', 'toString']) {
      expect(getCatalogEntry(eventType)).toBeUndefined();
      expect(buildNotificationUrl(eventType, { session: { id: SESSION_ID } })).toBe(DEFAULT_NOTIFICATION_URL);
      expect(buildEmailPayload(eventType, { title: 'x' })).toEqual({});
    }
  });

  it('system_update "off" is metadata only: the live path still creates every notification', async () => {
    vi.spyOn(NotificationService, 'createNotification').mockResolvedValue({ success: true } as any);
    db.triggers = [];
    db.role = 'docente';
    db.roleScope = {};
    db.session = null;
    db.activeUsers = [{ id: USER_A }, { id: USER_B }];
    const result = await NotificationService.triggerNotification('system_update', { update_id: 'u1', title: 'v2' });
    expect(result.notificationsCreated).toBe(2);
    expect(NotificationService.createNotification).toHaveBeenCalledTimes(2);
    expect(vi.mocked(NotificationService.createNotification).mock.calls[0][0]).toMatchObject({ related_url: DEFAULT_NOTIFICATION_URL });
  });

  it('an unknown event creates nothing and reports success', async () => {
    const spy = vi.spyOn(NotificationService, 'createNotification');
    db.triggers = [];
    const result = await NotificationService.triggerNotification('evento_desconocido', { student_id: USER_A });
    expect(result).toEqual({ success: true, notificationsCreated: 0 });
    expect(spy).not.toHaveBeenCalled();
  });
});
