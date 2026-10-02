import { test, expect, type APIRequestContext, type Browser, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { E2E_MAIL_OUTBOX } from '../../playwright.config';

/**
 * N3-07 — immediate notification email, seen in the local mail mirror.
 *
 * A synthetic admin assigns a synthetic course through the real
 * `POST /api/admin/course-assignments`. The app server itself triggers the
 * `course_assigned` notification and its immediate email; with no provider key
 * the only trace of that email is the local E2E outbox (`lib/email/outbox.ts`),
 * which the server appends to because it runs with `E2E_MAIL_OUTBOX` set. The
 * recipient signs in through the real login page, sees the notification in the
 * bell at 1366×768 and 390×844, across reloads, and opens the link the email
 * actually carries.
 *
 * Denied and empty paths add no mail: a docente calling the admin route gets
 * 403, a repeated assignment notifies nobody, and a recipient who switched
 * course email off gets the bell notification and no email. Every fixture is
 * deleted by exact id in afterAll and the manifest is written next to the
 * screenshots. Synthetic *@qa.local.test users only; no real provider.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const APP_ORIGIN = new URL(process.env.E2E_APP_ORIGIN ?? 'http://localhost:3000').origin;
const DESKTOP = { width: 1366, height: 768 };
const MOBILE = { width: 390, height: 844 };
const EVIDENCE_DIR = process.env.UI_EVIDENCE_DIR;
const RUN = randomBytes(4).toString('hex');
const PASSWORD = `N18-${randomBytes(12).toString('base64url')}!a1`;
const LOCAL_HOSTS = ['127.0.0.1', 'localhost', '::1'];
const COURSE_TITLE = `Curso sintético N18 ${RUN}`;
const SUBJECT = `Nuevo curso asignado: ${COURSE_TITLE}`;
const users = {
  admin: { id: '', email: `notif18-${RUN}-admin@qa.local.test`, role: 'admin' },
  recipient: { id: '', email: `notif18-${RUN}-recibe@qa.local.test`, role: 'docente' },
  optedOut: { id: '', email: `notif18-${RUN}-sin-correo@qa.local.test`, role: 'docente' },
};
type User = (typeof users)[keyof typeof users];
const ids = { instructor: randomUUID(), course: randomUUID(), events: [] as string[] };
const evidence: Record<string, unknown> = { run: RUN, supabaseUrl: SUPABASE_URL, appOrigin: APP_ORIGIN };
let service: SupabaseClient;

type Mail = { to: string; subject: string; html: string };

function must<T>(label: string, result: { data: T; error: { message: string } | null }): T {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
}

function evidenceDir(): string {
  const dir = EVIDENCE_DIR ?? test.info().outputDir;
  mkdirSync(dir, { recursive: true });
  return dir;
}

async function shot(page: Page, name: string) {
  await page.screenshot({ path: join(evidenceDir(), `${name}.png`), fullPage: false });
}

/** The mirrored messages addressed to this run's users; the server may mirror other mail too. */
function mirrored(): Mail[] {
  if (!existsSync(E2E_MAIL_OUTBOX)) return [];
  const mine = new Set(Object.values(users).map((user) => user.email));
  return readFileSync(E2E_MAIL_OUTBOX, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Mail)
    .filter((mail) => mine.has(mail.to));
}

/** The call-to-action href of a rendered notification email. */
function linkOf(mail: Mail): URL {
  const hrefs = [...mail.html.matchAll(/href="([^"]+)"/g)].map((match) => match[1].replace(/&amp;/g, '&'));
  expect(hrefs.length).toBeGreaterThan(0);
  return new URL(hrefs[0]);
}

async function accessToken(user: User): Promise<string> {
  const client = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signInWithPassword({ email: user.email, password: PASSWORD });
  if (error || !data.session) throw new Error(`signIn: ${error?.message ?? 'no session'}`);
  return data.session.access_token;
}

async function courseEventIds(): Promise<string[]> {
  const rows = must('events', await service.from('notification_events').select('id').eq('event_type', 'course_assigned')) as Array<{ id: string }>;
  return rows.map((row) => row.id);
}

/** The real assignment route, as `caller`. Any course_assigned event row it writes is recorded for cleanup. */
async function assign(request: APIRequestContext, caller: User, recipient: User) {
  const before = new Set(await courseEventIds());
  const response = await request.post('/api/admin/course-assignments', {
    headers: { Authorization: `Bearer ${await accessToken(caller)}` },
    data: { courseId: ids.course, teacherIds: [recipient.id] },
  });
  ids.events.push(...(await courseEventIds()).filter((id) => !before.has(id)));
  return response;
}

async function inApp(user: User): Promise<Array<{ id: string; title: string; related_url: string | null }>> {
  return must('notifications', await service.from('user_notifications').select('id, title, related_url').eq('user_id', user.id)) as Array<{ id: string; title: string; related_url: string | null }>;
}

async function signedIn(browser: Browser, viewport: typeof DESKTOP, user: User) {
  const context = await browser.newContext({ viewport, storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  const problems: string[] = [];
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  await page.goto('/login');
  await page.getByPlaceholder('tu@email.com').fill(user.email);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole('button', { name: /iniciar sesión/i }).click();
  await expect(page).toHaveURL(/\/dashboard(\?|$)/, { timeout: 60_000 });
  return { context, page, problems };
}

/** The loaded dashboard without sideways scroll, and its bell opened. Returns the bell's accessible name. */
async function openBell(page: Page, mobile: boolean, screenshot: string): Promise<string> {
  await expect(page.getByText('¡Hola, Persona!')).toBeVisible({ timeout: 60_000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  if (mobile) await page.getByRole('button', { name: 'Abrir menú de navegación' }).click();
  const bell = page.getByRole('button', { name: /^Notificaciones/ });
  await expect(bell).toBeVisible({ timeout: 30_000 });
  const name = (await bell.getAttribute('aria-label')) ?? '';
  await bell.click();
  await shot(page, screenshot);
  return name;
}

test.describe.configure({ mode: 'serial', timeout: 240_000 });

test.describe('notification email in the local mail mirror (N3-07)', () => {
  test.beforeAll(async () => {
    test.setTimeout(120_000);
    if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) throw new Error('Supabase URL, anon key and service key are required');
    if (process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY must be unset: no real provider');
    if (!LOCAL_HOSTS.includes(new URL(SUPABASE_URL).hostname.replace(/^\[|\]$/g, ''))) throw new Error('notification-mail-mirror refuses a non-local database');
    service = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    for (const user of Object.values(users)) {
      const created = await service.auth.admin.createUser({ email: user.email, password: PASSWORD, email_confirm: true });
      if (created.error) throw new Error(`createUser: ${created.error.message}`);
      user.id = created.data.user.id;
      must('profile', await service.from('profiles').upsert(
        { id: user.id, email: user.email, name: 'Persona Sintetica', first_name: 'Persona', last_name: 'Sintetica', must_change_password: false, approval_status: 'approved' },
        { onConflict: 'id' }
      ));
      must('role', await service.from('user_roles').insert({ user_id: user.id, role_type: user.role, is_active: true }));
    }
    must('prefs', await service.from('user_notification_category_prefs').insert({ user_id: users.optedOut.id, category: 'courses', email_mode: 'off' }));
    must('instructor', await service.from('instructors').insert({ id: ids.instructor, full_name: 'Instructor sintético N18' }));
    must('course', await service.from('courses').insert({ id: ids.course, title: COURSE_TITLE, description: 'Sintético', instructor_id: ids.instructor }));
    evidence.users = Object.fromEntries(Object.entries(users).map(([name, user]) => [name, user.id]));
  });

  test.afterAll(async () => {
    const cleanup: Record<string, number | string> = {};
    const remaining: Record<string, number | string> = {};
    const count = (r: { error: { message: string } | null; count: number | null }) => (r.error ? r.error.message : r.count ?? -1);
    const userIds = Object.values(users).map((user) => user.id).filter(Boolean);
    if (service && userIds.length) {
      const owned: Array<[string, string, string[]]> = [
        ['user_notifications', 'user_id', userIds],
        ['notification_events', 'id', ids.events],
        ['course_enrollments', 'course_id', [ids.course]],
        ['course_assignments', 'course_id', [ids.course]],
        ['courses', 'id', [ids.course]],
        ['instructors', 'id', [ids.instructor]],
        ['user_notification_category_prefs', 'user_id', userIds],
        ['user_roles', 'user_id', userIds],
        ['profiles', 'id', userIds],
      ];
      for (const [table, column, values] of owned) {
        cleanup[table] = count(await service.from(table).delete({ count: 'exact' }).in(column, values));
      }
      cleanup.auth_users = 0;
      for (const id of userIds) {
        const deleted = await service.auth.admin.deleteUser(id);
        if (deleted.error) cleanup.auth_users = deleted.error.message;
        else if (typeof cleanup.auth_users === 'number') cleanup.auth_users += 1;
      }
      for (const [table, column, values] of owned) {
        remaining[table] = count(await service.from(table).select('*', { count: 'exact', head: true }).in(column, values));
      }
      remaining.auth_users = 0;
      for (const id of userIds) {
        if ((await service.auth.admin.getUserById(id)).data.user) remaining.auth_users += 1;
      }
    }
    evidence.course = ids.course;
    evidence.instructor = ids.instructor;
    evidence.notificationEvents = ids.events;
    evidence.mirrored = mirrored().map((mail) => ({ to: mail.to, subject: mail.subject, link: linkOf(mail).href }));
    evidence.cleanup = cleanup;
    evidence.remaining = remaining;
    const dir = evidenceDir();
    writeFileSync(join(dir, 'mail-mirror.jsonl'), mirrored().map((mail) => JSON.stringify(mail)).join('\n') + '\n');
    writeFileSync(join(dir, 'notification-mail-mirror-fixtures.json'), `${JSON.stringify(evidence, null, 2)}\n`);
  });

  test('desktop: an assignment mails the recipient once through the mirror, and the bell and the link agree', async ({ browser, request }) => {
    const { context, page, problems } = await signedIn(browser, DESKTOP, users.recipient);
    // Empty: nothing yet, in the bell or in the mirror.
    expect(await openBell(page, false, 'desktop-1-empty-bell')).toBe('Notificaciones');
    await expect(page.getByText('Sin notificaciones')).toBeVisible();
    expect(mirrored()).toEqual([]);

    // Denied: a docente cannot use the admin route. No notification, no mail.
    const denied = await assign(request, users.recipient, users.recipient);
    expect(denied.status()).toBe(403);
    expect(JSON.stringify(await denied.json())).not.toContain('qa.local.test');
    expect(await inApp(users.recipient)).toEqual([]);
    expect(mirrored()).toEqual([]);

    // The real flow: one in-app notification and one mirrored email, to the recipient's own address.
    const granted = await assign(request, users.admin, users.recipient);
    expect(granted.status()).toBe(200);
    await expect.poll(() => mirrored().length, { timeout: 30_000 }).toBe(1);
    const [mail] = mirrored();
    expect(mail.to).toBe(users.recipient.email);
    expect(mail.subject).toBe(SUBJECT);
    expect(mail.html).toContain(COURSE_TITLE);
    const link = linkOf(mail);
    expect(link.origin).toBe(APP_ORIGIN);
    expect(link.pathname).toBe('/mi-aprendizaje');
    const notifications = await inApp(users.recipient);
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({ title: SUBJECT, related_url: '/mi-aprendizaje' });

    // The bell shows it after a reload, and again after another one.
    for (const name of ['desktop-2-bell-after-reload', 'desktop-3-bell-after-second-reload']) {
      await page.reload();
      expect(await openBell(page, false, name)).toBe('Notificaciones (1 sin leer)');
      await expect(page.getByText(SUBJECT)).toBeVisible();
    }

    // The link the email carries opens the recipient's learning page.
    await page.goto(link.href);
    await expect(page).toHaveURL(new RegExp(`^${APP_ORIGIN}/mi-aprendizaje`));
    await expect(page.getByRole('heading', { name: 'Mi Aprendizaje' })).toBeVisible({ timeout: 60_000 });
    await shot(page, 'desktop-4-mail-link-opened');
    expect(problems).toEqual([]);
    await context.close();
  });

  test('mobile: a repeated assignment and an opted-out recipient add no mail; the bell still shows each notification', async ({ browser, request }) => {
    // Assigning the same course again notifies nobody.
    const again = await assign(request, users.admin, users.recipient);
    expect(again.status()).toBe(200);
    expect(await inApp(users.recipient)).toHaveLength(1);

    // A recipient who switched course email off: the in-app notification, and no email.
    const optedOut = await assign(request, users.admin, users.optedOut);
    expect(optedOut.status()).toBe(200);
    await expect.poll(async () => (await inApp(users.optedOut)).length, { timeout: 30_000 }).toBe(1);
    expect(mirrored().map((mail) => mail.to)).toEqual([users.recipient.email]);

    for (const [user, screenshot] of [[users.recipient, 'mobile-1-recipient-bell'], [users.optedOut, 'mobile-2-opted-out-bell']] as const) {
      const { context, page, problems } = await signedIn(browser, MOBILE, user);
      expect(await openBell(page, true, screenshot)).toBe('Notificaciones (1 sin leer)');
      await expect(page.getByText(SUBJECT)).toBeVisible();
      await page.reload();
      expect(await openBell(page, true, `${screenshot}-after-reload`)).toBe('Notificaciones (1 sin leer)');
      await expect(page.getByText(SUBJECT)).toBeVisible();
      expect(problems).toEqual([]);
      await context.close();
    }
    expect(mirrored()).toHaveLength(1);
  });
});
