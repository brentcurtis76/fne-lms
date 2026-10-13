import { test, expect, type APIRequestContext, type Browser, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { E2E_MAIL_OUTBOX } from '../../playwright.config';

/**
 * N5-02 — flag-selected notification delivery, end to end, under either flag.
 *
 * A synthetic admin assigns a synthetic course through the real
 * `POST /api/admin/course-assignments`; the app server triggers `course_assigned`
 * for each recipient. The spec reads the app server's flag from its own
 * `NOTIFICATION_OUTBOX_DELIVERY` (the server must run with the same value):
 *
 * - unset/off: the existing synchronous path. The bell row and one immediate
 *   email (seen in the `E2E_MAIL_OUTBOX` mirror) per recipient, a digest choice
 *   mailed immediately as before, and no outbox row. The cron routes answer
 *   `enabled: false`.
 * - on/true/1: the source-aware enqueue. The bell row at once, an outbox row with
 *   its typed source, and no email until the real worker route
 *   (`/api/cron/notification-emails`) runs: it mirrors exactly one message and a
 *   second run sends nothing. A digest row waits for the real digest route
 *   (`/api/cron/email-digest`): nothing before its 09:00 America/Santiago due
 *   instant; with its own row moved just before that instant, one digest.
 *   The worker only reaches the mirror with a provider key, so the enabled
 *   server must answer provider calls locally: never a real provider.
 *
 * Both: a docente calling the admin route gets 403 and nothing is created, an
 * email-off recipient gets the bell and no email, preferences stay as set, the
 * bell works at 1366×768 and 390×844 across reloads, and the email link opens.
 * Every fixture is deleted by exact id in afterAll and the manifest is written
 * next to the screenshots. Synthetic *@qa.local.test users only.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const CRON_SECRET = process.env.CRON_SECRET ?? '';
const MAIL_OUTBOX = process.env.E2E_MAIL_OUTBOX || E2E_MAIL_OUTBOX;
const OUTBOX_ON = ['on', 'true', '1'].includes((process.env.NOTIFICATION_OUTBOX_DELIVERY ?? '').trim().toLowerCase());
const MODE = OUTBOX_ON ? 'on' : 'off';
const APP_ORIGIN = new URL(process.env.E2E_APP_ORIGIN ?? 'http://localhost:3000').origin;
const DESKTOP = { width: 1366, height: 768 };
const MOBILE = { width: 390, height: 844 };
const EVIDENCE_DIR = process.env.UI_EVIDENCE_DIR;
const RUN = randomBytes(4).toString('hex');
const PASSWORD = `N23-${randomBytes(12).toString('base64url')}!a1`;
const LOCAL_HOSTS = ['127.0.0.1', 'localhost', '::1'];
const COURSE_TITLE = `Curso sintético N23 ${RUN}`;
const SUBJECT = `Nuevo curso asignado: ${COURSE_TITLE}`;
const DIGEST_SUBJECT = 'Tu resumen diario de Genera: 1 notificación';
const users = {
  admin: { id: '', email: `notif23-${RUN}-admin@qa.local.test`, role: 'admin' },
  recipient: { id: '', email: `notif23-${RUN}-recibe@qa.local.test`, role: 'docente' },
  optedOut: { id: '', email: `notif23-${RUN}-sin-correo@qa.local.test`, role: 'docente' },
  digest: { id: '', email: `notif23-${RUN}-resumen@qa.local.test`, role: 'docente' },
};
type User = (typeof users)[keyof typeof users];
const PREFS = [
  { user: users.optedOut, email_mode: 'off' },
  { user: users.digest, email_mode: 'digest' },
];
const ids = { instructor: randomUUID(), course: randomUUID(), events: [] as string[], outbox: [] as string[], digestRuns: [] as string[] };
const evidence: Record<string, unknown> = { run: RUN, mode: MODE, supabaseUrl: SUPABASE_URL, appOrigin: APP_ORIGIN, cron: [] as unknown[] };
let service: SupabaseClient;

type Mail = { to: string; subject: string; html: string };
type OutboxRow = { id: string; status: string; email_mode: string; event_type: string; notification_id: string | null; idempotency_key: string };

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
  await page.screenshot({ path: join(evidenceDir(), `${MODE}-${name}.png`), fullPage: false });
}

/** The mirrored messages addressed to this run's users; the server may mirror other mail too. */
function mirrored(): Mail[] {
  if (!existsSync(MAIL_OUTBOX)) return [];
  const mine = new Set(Object.values(users).map((user) => user.email));
  return readFileSync(MAIL_OUTBOX, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Mail)
    .filter((mail) => mine.has(mail.to));
}

const mailTo = (user: User) => mirrored().filter((mail) => mail.to === user.email);

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

/** A cron route as Vercel calls it. The answer is kept in the manifest (it names nobody). */
async function cron(request: APIRequestContext, route: 'notification-emails' | 'email-digest', authorized = true) {
  const response = await request.get(`/api/cron/${route}`, { headers: authorized ? { Authorization: `Bearer ${CRON_SECRET}` } : {} });
  const body = await response.json();
  (evidence.cron as unknown[]).push({ route, authorized, status: response.status(), body });
  return { status: response.status(), body };
}

async function inApp(user: User): Promise<Array<{ id: string; title: string; related_url: string | null }>> {
  return must('notifications', await service.from('user_notifications').select('id, title, related_url').eq('user_id', user.id)) as Array<{ id: string; title: string; related_url: string | null }>;
}

async function outbox(user: User): Promise<OutboxRow[]> {
  const rows = must('outbox', await service.from('notification_email_outbox')
    .select('id, status, email_mode, event_type, notification_id, idempotency_key').eq('user_id', user.id)) as OutboxRow[];
  for (const row of rows) if (!ids.outbox.includes(row.id)) ids.outbox.push(row.id);
  return rows;
}

async function sourceOf(outboxId: string) {
  return must('source', await service.from('notification_email_outbox_source').select('source_kind, source_id').eq('outbox_id', outboxId)) as Array<{ source_kind: string; source_id: string }>;
}

async function prefs(user: User) {
  return must('prefs', await service.from('user_notification_category_prefs').select('category, email_mode').eq('user_id', user.id));
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
test.use({ trace: 'on' });

test.describe(`flag-selected notification delivery (N5-02), outbox delivery ${MODE}`, () => {
  test.beforeAll(async () => {
    test.setTimeout(120_000);
    if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY || !CRON_SECRET) throw new Error('Supabase URL, anon key, service key and CRON_SECRET are required');
    if (process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY must be unset: no real provider');
    if (!LOCAL_HOSTS.includes(new URL(SUPABASE_URL).hostname.replace(/^\[|\]$/g, ''))) throw new Error('notification-dispatch refuses a non-local database');
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
    for (const { user, email_mode } of PREFS) {
      must('prefs', await service.from('user_notification_category_prefs').insert({ user_id: user.id, category: 'courses', email_mode }));
    }
    must('instructor', await service.from('instructors').insert({ id: ids.instructor, full_name: 'Instructor sintético N23' }));
    must('course', await service.from('courses').insert({ id: ids.course, title: COURSE_TITLE, description: 'Sintético', instructor_id: ids.instructor }));
    evidence.users = Object.fromEntries(Object.entries(users).map(([name, user]) => [name, user.id]));
  });

  test.afterAll(async () => {
    const cleanup: Record<string, number | string> = {};
    const remaining: Record<string, number | string> = {};
    const count = (r: { error: { message: string } | null; count: number | null }) => (r.error ? r.error.message : r.count ?? -1);
    const userIds = Object.values(users).map((user) => user.id).filter(Boolean);
    if (service && userIds.length) {
      const runs = must('runs', await service.from('notification_digest_runs').select('id').in('user_id', userIds)) as Array<{ id: string }>;
      ids.digestRuns.push(...runs.map((run) => run.id).filter((id) => !ids.digestRuns.includes(id)));
      await Promise.all(Object.values(users).filter((user) => user.id).map(outbox));
      const owned: Array<[string, string, string[]]> = [
        ['notification_digest_runs', 'id', ids.digestRuns],
        ['notification_email_outbox_source', 'outbox_id', ids.outbox],
        ['notification_email_outbox_address', 'outbox_id', ids.outbox],
        ['notification_email_outbox', 'id', ids.outbox],
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
      // Run members are not the service role's to delete: they go with their run (ON DELETE CASCADE).
      for (const [table, column, values] of [['notification_digest_run_members', 'run_id', ids.digestRuns], ...owned] as const) {
        remaining[table] = count(await service.from(table).select('*', { count: 'exact', head: true }).in(column, values));
      }
      remaining.auth_users = 0;
      for (const id of userIds) {
        if ((await service.auth.admin.getUserById(id)).data.user) remaining.auth_users += 1;
      }
    }
    Object.assign(evidence, { course: ids.course, instructor: ids.instructor, notificationEvents: ids.events, outbox: ids.outbox, digestRuns: ids.digestRuns });
    evidence.mirrored = mirrored().map((mail) => ({ to: mail.to, subject: mail.subject, link: linkOf(mail).href }));
    evidence.cleanup = cleanup;
    evidence.remaining = remaining;
    const dir = evidenceDir();
    writeFileSync(join(dir, `${MODE}-mail-mirror.jsonl`), mirrored().map((mail) => JSON.stringify(mail)).join('\n') + '\n');
    writeFileSync(join(dir, `notification-dispatch-${MODE}-fixtures.json`), `${JSON.stringify(evidence, null, 2)}\n`);
    // Every owned fixture is gone: a survivor (or a failed count) fails the run.
    expect(remaining).toEqual(Object.fromEntries(Object.keys(remaining).map((table) => [table, 0])));
  });

  test('desktop: an assignment reaches the recipient once, by the selected path, and the bell and the link agree', async ({ browser, request }) => {
    const { context, page, problems } = await signedIn(browser, DESKTOP, users.recipient);
    // Empty: nothing yet, in the bell, the outbox or the mirror.
    expect(await openBell(page, false, 'desktop-1-empty-bell')).toBe('Notificaciones');
    await expect(page.getByText('Sin notificaciones')).toBeVisible();
    expect(mirrored()).toEqual([]);

    // Denied: a docente cannot use the admin route, nor anyone the worker route. Nothing is created.
    const denied = await assign(request, users.recipient, users.recipient);
    expect(denied.status()).toBe(403);
    expect(JSON.stringify(await denied.json())).not.toContain('qa.local.test');
    expect((await cron(request, 'notification-emails', false)).status).toBe(401);
    expect(await inApp(users.recipient)).toEqual([]);
    expect(await outbox(users.recipient)).toEqual([]);
    expect(ids.events).toEqual([]);
    expect(mirrored()).toEqual([]);

    const granted = await assign(request, users.admin, users.recipient);
    expect(granted.status()).toBe(200);
    await expect.poll(async () => (await inApp(users.recipient)).length, { timeout: 30_000 }).toBe(1);
    const [bell] = await inApp(users.recipient);
    expect(bell).toMatchObject({ title: SUBJECT, related_url: '/mi-aprendizaje' });

    if (OUTBOX_ON) {
      // Queued with its typed source, the bell written by the same call, and no email yet.
      const [row, ...others] = await outbox(users.recipient);
      expect(others).toEqual([]);
      expect(row).toMatchObject({ status: 'pending', email_mode: 'immediate', event_type: 'course_assigned', notification_id: bell.id });
      expect(await sourceOf(row.id)).toEqual([{ source_kind: 'course', source_id: ids.course }]);
      expect(mirrored()).toEqual([]);

      // The real worker route mirrors it once; another run sends nothing more.
      expect((await cron(request, 'notification-emails')).body).toMatchObject({ ok: true, enabled: true, status: 'ok', claimed: 1, sent: 1 });
      expect(mailTo(users.recipient)).toHaveLength(1);
      expect(await outbox(users.recipient)).toEqual([{ ...row, status: 'sent' }]);
      expect((await cron(request, 'notification-emails')).body).toMatchObject({ enabled: true, claimed: 0, sent: 0 });
    } else {
      // The existing synchronous path: mailed at once, nothing queued, the worker route idle.
      await expect.poll(() => mailTo(users.recipient).length, { timeout: 30_000 }).toBe(1);
      expect(await outbox(users.recipient)).toEqual([]);
      expect((await cron(request, 'notification-emails')).body).toEqual({ ok: true, enabled: false });
    }
    expect(mirrored()).toHaveLength(1);
    const [mail] = mirrored();
    expect(mail.to).toBe(users.recipient.email);
    expect(mail.subject).toBe(SUBJECT);
    expect(mail.html).toContain(COURSE_TITLE);
    const link = linkOf(mail);
    expect(link.origin).toBe(APP_ORIGIN);
    expect(link.pathname).toBe('/mi-aprendizaje');

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

  test('mobile: repeat, email-off and digest recipients keep their channels; a digest waits for the digest route', async ({ browser, request }) => {
    // Assigning the same course again notifies nobody.
    expect((await assign(request, users.admin, users.recipient)).status()).toBe(200);
    expect(await inApp(users.recipient)).toHaveLength(1);
    expect(await outbox(users.recipient)).toHaveLength(OUTBOX_ON ? 1 : 0);

    // Email off: the bell, no email, nothing queued.
    expect((await assign(request, users.admin, users.optedOut)).status()).toBe(200);
    await expect.poll(async () => (await inApp(users.optedOut)).length, { timeout: 30_000 }).toBe(1);
    expect(await outbox(users.optedOut)).toEqual([]);

    // Digest: flag off keeps the old digest-as-immediate mail; flag on queues it for the digest route only.
    expect((await assign(request, users.admin, users.digest)).status()).toBe(200);
    await expect.poll(async () => (await inApp(users.digest)).length, { timeout: 30_000 }).toBe(1);
    if (OUTBOX_ON) {
      const [row, ...others] = await outbox(users.digest);
      expect(others).toEqual([]);
      expect(row).toMatchObject({ status: 'pending', email_mode: 'digest', event_type: 'course_assigned' });
      expect(await sourceOf(row.id)).toEqual([{ source_kind: 'course', source_id: ids.course }]);
      // The immediate worker leaves it alone, and the digest route waits for the row's due instant.
      expect((await cron(request, 'notification-emails')).body).toMatchObject({ enabled: true, claimed: 0, sent: 0 });
      expect((await cron(request, 'email-digest')).body).toMatchObject({ enabled: true, status: 'ok', opened: 0, sent: 0 });
      expect(await outbox(users.digest)).toEqual([row]);
      expect(mailTo(users.digest)).toEqual([]);

      // This run's own row, moved to just before the due instant the database computes: one digest, once.
      const due = must('due', await service.rpc('notification_digest_due', { p_at: new Date().toISOString() })) as Array<{ due_at: string }>;
      const before = new Date(new Date(due[0].due_at).getTime() - 60_000).toISOString();
      must('backdate', await service.from('notification_email_outbox').update({ created_at: before }).eq('id', row.id));
      expect((await cron(request, 'email-digest')).body).toMatchObject({ enabled: true, status: 'ok', opened: 1, claimed: 1, sent: 1 });
      expect(await outbox(users.digest)).toEqual([{ ...row, status: 'sent' }]);
      expect((await cron(request, 'email-digest')).body).toMatchObject({ enabled: true, opened: 0, sent: 0 });
      expect(mailTo(users.digest).map((mail) => mail.subject)).toEqual([DIGEST_SUBJECT]);
      expect(mailTo(users.digest)[0].html).toContain(COURSE_TITLE);
    } else {
      await expect.poll(() => mailTo(users.digest).length, { timeout: 30_000 }).toBe(1);
      expect(mailTo(users.digest)[0].subject).toBe(SUBJECT);
      expect(await outbox(users.digest)).toEqual([]);
      expect((await cron(request, 'email-digest')).body).toEqual({ ok: true, enabled: false });
    }
    expect(mailTo(users.optedOut)).toEqual([]);
    expect(mirrored().map((mail) => mail.to).sort()).toEqual([users.recipient.email, users.digest.email].sort());
    for (const { user, email_mode } of PREFS) expect(await prefs(user)).toEqual([{ category: 'courses', email_mode }]);

    for (const [user, screenshot] of [[users.recipient, 'mobile-1-recipient-bell'], [users.optedOut, 'mobile-2-email-off-bell'], [users.digest, 'mobile-3-digest-bell']] as const) {
      const { context, page, problems } = await signedIn(browser, MOBILE, user);
      expect(await openBell(page, true, screenshot)).toBe('Notificaciones (1 sin leer)');
      await expect(page.getByText(SUBJECT)).toBeVisible();
      await page.reload();
      expect(await openBell(page, true, `${screenshot}-after-reload`)).toBe('Notificaciones (1 sin leer)');
      await expect(page.getByText(SUBJECT)).toBeVisible();
      expect(problems).toEqual([]);
      await context.close();
    }
    expect(mirrored()).toHaveLength(2);
  });
});
