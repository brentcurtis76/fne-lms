import { test, expect, type Browser, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomBytes, randomUUID } from 'node:crypto';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import NotificationService from '../../lib/notificationService';

/**
 * N1-03 — email preference precedence on the live synchronous path, compat mode.
 *
 * One synthetic recipient (*@qa.local.test, no school) has four category choices
 * and two legacy rows. Four events go through the real producer path
 * (`NotificationService.triggerNotification`, in-process with the service role);
 * the only change is that each `createNotification` is handed a capturing
 * transport, which stands in for the provider. No provider key is set, so no
 * real mail can leave. Expected:
 *   - assignments = off            → assignment_feedback: bell item, no email
 *   - courses = default + legacy false on course_completed → bell item, no email
 *   - community = digest           → message_sent: bell item, one immediate email
 *   - sessions = off + legacy false on session_cancelled (mandatory) → bell item, one email
 * Before any event the recipient's bell shows its empty state; afterwards the
 * recipient sees all four at desktop and mobile, and still after a reload.
 *
 * The app server keeps NOTIFICATION_EMAIL_ENABLED=false; the spec turns the kill
 * switch on only around its own sends. Every fixture is deleted by id in afterAll.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const DESKTOP = { width: 1366, height: 768 };
const MOBILE = { width: 390, height: 844 };
const EVIDENCE_DIR = process.env.UI_EVIDENCE_DIR;
const RUN = randomBytes(4).toString('hex');
const MARKER = `N06-${RUN}`;
const PASSWORD = `N06-${randomBytes(12).toString('base64url')}!a1`;
const recipient = { id: '', email: `notif06-${RUN}-recipient@qa.local.test` };
const LEGACY_TYPES = ['course_completed', 'session_cancelled'];
/** `notification_types` rows this run had to add for the legacy rows' foreign key. */
const createdTypes: string[] = [];

interface Capture {
  eventType: string;
  to: string;
  subject: string;
  html: string;
  idempotencyKey?: string;
}

const captures: Capture[] = [];
const titles: Record<string, string> = {};
const evidence: Record<string, unknown> = { run: RUN, marker: MARKER, supabaseUrl: SUPABASE_URL };
let service: SupabaseClient;

function assertLocal(url: string) {
  const host = new URL(url).hostname;
  if (!['127.0.0.1', 'localhost', '::1'].includes(host)) {
    throw new Error(`notification-preference-compat refuses non-local Supabase URL host ${host}`);
  }
}

function must<T>(label: string, result: { data: T; error: { message: string } | null }): T {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
}

async function shot(page: Page, name: string) {
  const dir = EVIDENCE_DIR ?? test.info().outputDir;
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: join(dir, `${name}.png`), fullPage: false });
}

/** Run one producer event with every provider attempt captured under its event type. */
async function trigger(eventType: string, eventData: Record<string, unknown>) {
  const target = NotificationService as unknown as { createNotification: (data: unknown, deps?: unknown) => Promise<unknown> };
  const original = target.createNotification;
  const transport = async (message: { to: string; subject: string; html: string }, options: { idempotencyKey?: string }) => {
    captures.push({ eventType, to: message.to, subject: message.subject, html: message.html, idempotencyKey: options?.idempotencyKey });
    return { data: { id: `capture-${captures.length}` }, error: null };
  };
  target.createNotification = (data: unknown) => original.call(target, data, { transport });
  try {
    return await NotificationService.triggerNotification(eventType, eventData);
  } finally {
    target.createNotification = original;
  }
}

async function signedIn(browser: Browser, viewport: typeof DESKTOP) {
  const context = await browser.newContext({ viewport, storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  await page.goto('/login');
  await page.getByPlaceholder('tu@email.com').fill(recipient.email);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole('button', { name: /iniciar sesión/i }).click();
  await expect(page).toHaveURL(/\/dashboard(\?|$)/, { timeout: 60_000 });
  return { context, page };
}

async function openBell(page: Page, mobile: boolean) {
  if (mobile) await page.getByRole('button', { name: 'Abrir menú de navegación' }).click();
  const bell = page.getByRole('button', { name: /^Notificaciones/ });
  await expect(bell).toBeVisible({ timeout: 30_000 });
  await bell.click();
  await expect(page.getByRole('heading', { name: 'Notificaciones', level: 3 })).toBeVisible();
}

test.describe.configure({ mode: 'serial', timeout: 240_000 });

test.describe('notification preference compat (N1-03)', () => {
  test.beforeAll(async () => {
    test.setTimeout(120_000);
    if (!SUPABASE_URL || !SERVICE_KEY) throw new Error('Supabase URL and service key are required');
    if (process.env.NOTIFICATION_EMAIL_ENABLED !== 'false') throw new Error('NOTIFICATION_EMAIL_ENABLED=false is required for the app server');
    if (process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY must be unset: no real provider');
    assertLocal(SUPABASE_URL);
    service = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    const created = await service.auth.admin.createUser({ email: recipient.email, password: PASSWORD, email_confirm: true });
    if (created.error) throw new Error(`createUser: ${created.error.message}`);
    recipient.id = created.data.user.id;
    must('profile', await service.from('profiles').upsert(
      { id: recipient.id, email: recipient.email, name: 'Receptora Sintetico', first_name: 'Receptora', last_name: 'Sintetico', must_change_password: false, approval_status: 'approved' },
      { onConflict: 'id' }
    ));
    must('role', await service.from('user_roles').insert({ user_id: recipient.id, role_type: 'docente', is_active: true }));
    must('category prefs', await service.from('user_notification_category_prefs').insert([
      { user_id: recipient.id, category: 'assignments', email_mode: 'off' },
      { user_id: recipient.id, category: 'courses', email_mode: 'default' },
      { user_id: recipient.id, category: 'community', email_mode: 'digest' },
      { user_id: recipient.id, category: 'sessions', email_mode: 'off' },
    ]));
    const existing = must('types', await service.from('notification_types').select('id').in('id', LEGACY_TYPES)) as Array<{ id: string }>;
    for (const id of LEGACY_TYPES.filter((t) => !existing.some((row) => row.id === t))) {
      must(`type ${id}`, await service.from('notification_types').insert({ id, name: `${MARKER} ${id}`, category: 'system' }));
      createdTypes.push(id);
    }
    must('legacy prefs', await service.from('user_notification_preferences').insert([
      { user_id: recipient.id, notification_type: 'course_completed', email_enabled: false, in_app_enabled: true },
      { user_id: recipient.id, notification_type: 'session_cancelled', email_enabled: false, in_app_enabled: true },
    ]));
  });

  test('D5 empty: before any event the recipient sees the empty bell', async ({ browser }) => {
    const { context, page } = await signedIn(browser, DESKTOP);
    try {
      await openBell(page, false);
      await expect(page.getByRole('heading', { name: 'Sin notificaciones', level: 4 })).toBeVisible({ timeout: 30_000 });
      await shot(page, 'd5-empty-bell');
    } finally {
      await context.close();
    }
  });

  test('D5 events: all four go through the producer path and each writes one bell row', async () => {
    process.env.NOTIFICATION_EMAIL_ENABLED = 'on';
    try {
      const results = [
        await trigger('assignment_feedback', { assignment_id: randomUUID(), student_id: recipient.id, assignment: { title: `${MARKER} Tarea` } }),
        await trigger('course_completed', { course_id: randomUUID(), student_id: recipient.id, course: { name: `${MARKER} Curso` } }),
        await trigger('message_sent', { message_id: `${MARKER}-m1`, recipient_id: recipient.id, sender: { name: `${MARKER} Remitente` } }),
        await trigger('session_cancelled', {
          session: { id: randomUUID(), title: `${MARKER} Taller`, date: '15-01-2030', time: '09:00' },
          facilitator_ids: [recipient.id], attendee_ids: [],
        }),
      ];
      for (const r of results) expect(r).toEqual({ success: true, notificationsCreated: 1 });
    } finally {
      process.env.NOTIFICATION_EMAIL_ENABLED = 'false';
    }

    const rows = must('read notifications', await service.from('user_notifications').select('title').eq('user_id', recipient.id)) as Array<{ title: string }>;
    for (const [event, fragment] of [
      ['assignment_feedback', `${MARKER} Tarea`],
      ['course_completed', `${MARKER} Curso`],
      ['message_sent', `${MARKER} Remitente`],
      ['session_cancelled', `${MARKER} Taller`],
    ]) {
      const row = rows.find((r) => r.title.includes(fragment));
      if (!row) throw new Error(`no in-app row for ${event}`);
      titles[event] = row.title;
    }
    evidence.inAppRows = rows.length;
    evidence.userId = recipient.id;
  });

  test.afterAll(async () => {
    process.env.NOTIFICATION_EMAIL_ENABLED = 'false';
    const cleanup: Record<string, number | string> = {};
    const remaining: Record<string, number | string> = {};
    const count = (r: { error: { message: string } | null; count: number | null }) => (r.error ? r.error.message : r.count ?? -1);
    if (service && recipient.id) {
      const eventIds: string[] = [];
      for (const [path, value] of [
        ['event_data->assignment->>title', `${MARKER} Tarea`],
        ['event_data->course->>name', `${MARKER} Curso`],
        ['event_data->>message_id', `${MARKER}-m1`],
        ['event_data->session->>title', `${MARKER} Taller`],
      ]) {
        const found = await service.from('notification_events').select('id').eq(path, value);
        eventIds.push(...(found.data ?? []).map((r: { id: string }) => r.id));
      }
      cleanup.notification_events = count(await service.from('notification_events').delete({ count: 'exact' }).in('id', eventIds));
      for (const table of ['user_notifications', 'user_notification_preferences', 'user_notification_category_prefs', 'user_roles']) {
        cleanup[table] = count(await service.from(table).delete({ count: 'exact' }).eq('user_id', recipient.id));
      }
      cleanup.profiles = count(await service.from('profiles').delete({ count: 'exact' }).eq('id', recipient.id));
      const deleted = await service.auth.admin.deleteUser(recipient.id);
      cleanup.auth_users = deleted.error ? deleted.error.message : 1;

      for (const table of ['user_notifications', 'user_notification_preferences', 'user_notification_category_prefs', 'user_roles']) {
        remaining[table] = count(await service.from(table).select('user_id', { count: 'exact', head: true }).eq('user_id', recipient.id));
      }
      remaining.notification_events = count(await service.from('notification_events').select('id', { count: 'exact', head: true }).in('id', eventIds));
      remaining.profiles = count(await service.from('profiles').select('id', { count: 'exact', head: true }).eq('id', recipient.id));
      remaining.auth_user = (await service.auth.admin.getUserById(recipient.id)).data.user ? 1 : 0;
    }
    if (service && createdTypes.length > 0) {
      cleanup.notification_types = count(await service.from('notification_types').delete({ count: 'exact' }).in('id', createdTypes).like('name', `${MARKER} %`));
      remaining.notification_types = count(await service.from('notification_types').select('id', { count: 'exact', head: true }).like('name', `${MARKER} %`));
    }
    evidence.createdTypes = createdTypes;
    evidence.cleanup = cleanup;
    evidence.remaining = remaining;
    const manifest = JSON.stringify({ spec: 'notification-preference-compat', at: new Date().toISOString(), ...evidence });
    if (EVIDENCE_DIR) {
      mkdirSync(EVIDENCE_DIR, { recursive: true });
      writeFileSync(join(EVIDENCE_DIR, 'fixtures.json'), manifest);
    }
    if (process.env.NOTIF06_EVIDENCE_MANIFEST) appendFileSync(process.env.NOTIF06_EVIDENCE_MANIFEST, `${manifest}\n`);
  });

  test('D5 capture: off and default+legacy suppress, compat digest and the mandatory event send once', async ({ page }) => {
    const byEvent = (eventType: string) => captures.filter((c) => c.eventType === eventType);
    expect(byEvent('assignment_feedback')).toHaveLength(0);
    expect(byEvent('course_completed')).toHaveLength(0);
    expect(byEvent('message_sent')).toHaveLength(1);
    expect(byEvent('session_cancelled')).toHaveLength(1);
    expect(captures).toHaveLength(2);
    for (const c of captures) {
      expect(c.to).toBe(recipient.email);
      expect(c.subject).toBe(titles[c.eventType]);
      expect(c.idempotencyKey).toBeTruthy();
    }

    await page.setViewportSize(DESKTOP);
    for (const c of captures) {
      await page.setContent(c.html);
      await expect(page.getByRole('heading', { name: titles[c.eventType] })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Ver en Genera' })).toBeVisible();
      await shot(page, `d5-captured-email-${c.eventType}`);
    }
    evidence.captures = captures.map((c) => ({ eventType: c.eventType, subject: c.subject, idempotencyKey: c.idempotencyKey }));
    evidence.attemptsByEvent = Object.fromEntries(
      ['assignment_feedback', 'course_completed', 'message_sent', 'session_cancelled'].map((e) => [e, byEvent(e).length])
    );
  });

  for (const [label, viewport, mobile] of [
    ['desktop', DESKTOP, false],
    ['mobile', MOBILE, true],
  ] as const) {
    test(`D5 ${label}: the recipient sees all four notifications in the bell, emailed or not`, async ({ browser }) => {
      const { context, page } = await signedIn(browser, viewport);
      try {
        await openBell(page, mobile);
        for (const title of Object.values(titles)) {
          await expect(page.getByText(title, { exact: true }).first()).toBeVisible();
        }
        await shot(page, `d5-${label}-bell`);
        if (!mobile) {
          await page.reload();
          await openBell(page, false);
          for (const title of Object.values(titles)) {
            await expect(page.getByText(title, { exact: true }).first()).toBeVisible();
          }
          await shot(page, 'd5-desktop-bell-after-reload');
        }
      } finally {
        await context.close();
      }
    });
  }
});
