import { test, expect, type APIRequestContext, type Browser, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { E2E_MAIL_OUTBOX } from '../../playwright.config';

/**
 * N5-04 — the hourly due-reminders cron, end to end, under either flag.
 *
 * A synthetic published lesson assignment is due in about three hours in a course
 * two docentes are enrolled in; one of them has already submitted it. The real
 * cron route is called as Vercel calls it (GET + `Authorization: Bearer`); the app
 * server's `NOTIFICATION_OUTBOX_DELIVERY` must equal this process's:
 *
 * - unset/off: the existing synchronous path. One bell and one mirrored email for
 *   the docente who has not submitted, at once, no outbox row.
 * - on/true/1: one outbox row with its `assignment` source and the bell, no email
 *   until the real worker route sends it exactly once.
 *
 * Both: refused calls create nothing; the docente who submitted gets nothing; the
 * next hourly run adds no bell, row or email; the bell survives reloads at 1366×768
 * and 390×844 and both the bell item and the emailed link open the assignment.
 * Fixtures are deleted by exact id and the manifest is written next to the
 * screenshots. Synthetic *@qa.local.test only.
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
const PASSWORD = `N25-${randomBytes(12).toString('base64url')}!a1`;
const LOCAL_HOSTS = ['127.0.0.1', 'localhost', '::1'];
const SCHOOL = 9_500_000 + (parseInt(RUN.slice(0, 4), 16) % 100_000);
const TITLE = `Tarea sintética N25 ${RUN}`;
const BELL_TITLE = `Tarea próxima a vencer: ${TITLE}`;
const users = {
  pending: { id: '', email: `notif25-${RUN}-pendiente@qa.local.test` },
  submitted: { id: '', email: `notif25-${RUN}-entregada@qa.local.test` },
};
type User = (typeof users)[keyof typeof users];
const ids = { community: '', instructor: randomUUID(), course: randomUUID(), assignment: randomUUID(), dueAt: '', outbox: [] as string[], events: [] as string[] };
const evidence: Record<string, unknown> = { run: RUN, mode: MODE, supabaseUrl: SUPABASE_URL, appOrigin: APP_ORIGIN, school: SCHOOL, cron: [] as unknown[] };
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
  await page.screenshot({ path: join(evidenceDir(), `${MODE}-${name}.png`), fullPage: false });
}

/** Mirrored messages addressed to this run's users; the server may mirror other mail too. */
function mirrored(): Mail[] {
  if (!existsSync(MAIL_OUTBOX)) return [];
  const mine = new Set(Object.values(users).map((user) => user.email));
  return readFileSync(MAIL_OUTBOX, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line) as Mail).filter((mail) => mine.has(mail.to));
}

const mailTo = (user: User) => mirrored().filter((mail) => mail.to === user.email);

function linkOf(mail: Mail): URL {
  const hrefs = [...mail.html.matchAll(/href="([^"]+)"/g)].map((match) => match[1].replace(/&amp;/g, '&'));
  expect(hrefs.length).toBeGreaterThan(0);
  return new URL(hrefs[0]);
}

/** The cron route as Vercel or a caller would call it; the answer is kept in the manifest (it names nobody). */
async function cron(request: APIRequestContext, route: 'due-reminders' | 'notification-emails', init: { method?: 'GET' | 'POST' | 'PUT'; headers?: Record<string, string>; data?: Record<string, string> } = {}) {
  const headers = init.headers ?? { Authorization: `Bearer ${CRON_SECRET}` };
  const response = await request.fetch(`/api/cron/${route}`, { method: init.method ?? 'GET', headers, data: init.data });
  const body = await response.json();
  (evidence.cron as unknown[]).push({ route, method: init.method ?? 'GET', authorized: !init.headers, status: response.status(), body });
  return { status: response.status(), body };
}

async function bells(user: User) {
  return must('bells', await service.from('user_notifications').select('id, title, description, related_url, idempotency_key').eq('user_id', user.id)) as Array<{ id: string; title: string; description: string; related_url: string; idempotency_key: string }>;
}

async function outbox(user: User) {
  const rows = must('outbox', await service.from('notification_email_outbox').select('id, status, event_type, notification_id').eq('user_id', user.id)) as Array<{ id: string; status: string; event_type: string; notification_id: string | null }>;
  for (const row of rows) if (!ids.outbox.includes(row.id)) ids.outbox.push(row.id);
  return rows;
}

async function sourceOf(outboxId: string) {
  return must('source', await service.from('notification_email_outbox_source').select('source_kind, source_id').eq('outbox_id', outboxId));
}

const occurrence = (user: User) => `record:${ids.assignment}:${user.id}:${encodeURIComponent(ids.dueAt)}`;
const sha = (value: unknown) => createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');

async function expectNothing() {
  for (const user of Object.values(users)) {
    expect(await bells(user)).toEqual([]);
    expect(await outbox(user)).toEqual([]);
  }
  expect(mirrored()).toEqual([]);
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

/** The bell opened on the loaded dashboard (no sideways scroll). Returns its accessible name. */
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

async function expectAssignmentPage(page: Page) {
  await expect(page).toHaveURL(new RegExp(`/assignments/${ids.assignment}$`), { timeout: 30_000 });
  await expect(page).toHaveTitle(`${TITLE} - Genera`, { timeout: 30_000 });
  await expect(page.getByRole('heading', { name: TITLE, exact: true }).first()).toBeVisible();
  await expect(page.getByText('Tu respuesta')).toBeVisible();
}

test.describe.configure({ mode: 'serial', timeout: 240_000 });
test.use({ trace: 'on' });

test.describe(`due reminders cron (N5-04), outbox delivery ${MODE}`, () => {
  test.beforeAll(async () => {
    test.setTimeout(120_000);
    if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY || !CRON_SECRET) throw new Error('Supabase URL, anon key, service key and CRON_SECRET are required');
    if (process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY must be unset: no real provider');
    if (!LOCAL_HOSTS.includes(new URL(SUPABASE_URL).hostname.replace(/^\[|\]$/g, ''))) throw new Error('due-reminders refuses a non-local database');
    service = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    // A `client` school: a `qa` tenant's mail is refused before the mirror (lib/email/outbound-policy.ts), and this run must see it.
    must('school', await service.from('schools').insert({ id: SCHOOL, name: `Colegio Sintetico N25 ${RUN}`, tenant_kind: 'client' }));
    const community = must('community', await service.from('growth_communities').insert({ name: `Comunidad N25 ${RUN}`, school_id: SCHOOL }).select('id').single()) as { id: string };
    ids.community = community.id;
    for (const user of Object.values(users)) {
      const created = await service.auth.admin.createUser({ email: user.email, password: PASSWORD, email_confirm: true });
      if (created.error) throw new Error(`createUser: ${created.error.message}`);
      user.id = created.data.user.id;
      must('profile', await service.from('profiles').upsert(
        { id: user.id, email: user.email, name: 'Persona Sintetica', first_name: 'Persona', last_name: 'Sintetica', must_change_password: false, approval_status: 'approved', school_id: SCHOOL },
        { onConflict: 'id' }
      ));
      must('role', await service.from('user_roles').insert({ user_id: user.id, role_type: 'docente', school_id: SCHOOL, community_id: ids.community, is_active: true }));
    }
    must('instructor', await service.from('instructors').insert({ id: ids.instructor, full_name: 'Instructor sintético N25' }));
    must('course', await service.from('courses').insert({ id: ids.course, title: `Curso sintético N25 ${RUN}`, description: 'Sintético', instructor_id: ids.instructor, status: 'published' }));
    for (const user of Object.values(users)) {
      must('enrollment', await service.from('course_enrollments').insert({ user_id: user.id, course_id: ids.course, status: 'active', access_origin: 'independent' }));
    }
    // Due in three hours, to the whole minute: inside the rolling 24-hour window.
    ids.dueAt = new Date(Math.ceil((Date.now() + 3 * 3_600_000) / 60_000) * 60_000).toISOString();
    must('assignment', await service.from('lesson_assignments').insert({
      id: ids.assignment, title: TITLE, description: 'Sintética', course_id: ids.course, created_by: users.submitted.id, due_date: ids.dueAt, is_published: true,
    }));
    must('submission', await service.from('lesson_assignment_submissions').insert({
      assignment_id: ids.assignment, student_id: users.submitted.id, submitted_by: users.submitted.id, status: 'submitted', submitted_at: new Date().toISOString(),
    }));
    evidence.users = Object.fromEntries(Object.entries(users).map(([name, user]) => [name, user.id]));
    evidence.assignment = { id: ids.assignment, course: ids.course, due_at: ids.dueAt };
  });

  test.afterAll(async () => {
    const cleanup: Record<string, number | string> = {};
    const remaining: Record<string, number | string> = {};
    const count = (r: { error: { message: string } | null; count: number | null }) => (r.error ? r.error.message : r.count ?? -1);
    const userIds = Object.values(users).map((user) => user.id).filter(Boolean);
    if (service && userIds.length) {
      await Promise.all(Object.values(users).filter((user) => user.id).map(outbox));
      // The audit log keeps only an opaque reference per occurrence: this run's are recomputed exactly.
      const refs = Object.values(users).map((user) => `occ-${sha(['assignment_due_soon', occurrence(user)])}`);
      const events = must('events', await service.from('notification_events').select('id').in('event_data->>occurrence_ref', refs)) as Array<{ id: string }>;
      ids.events = events.map((row) => row.id);
      const owned: Array<[string, string, Array<string | number>]> = [
        ['notification_email_outbox_source', 'outbox_id', ids.outbox],
        ['notification_email_outbox_address', 'outbox_id', ids.outbox],
        ['notification_email_outbox', 'id', ids.outbox],
        ['user_notifications', 'user_id', userIds],
        ['notification_events', 'id', ids.events],
        ['lesson_assignment_submissions', 'assignment_id', [ids.assignment]],
        ['lesson_assignments', 'id', [ids.assignment]],
        ['course_enrollments', 'course_id', [ids.course]],
        ['courses', 'id', [ids.course]],
        ['instructors', 'id', [ids.instructor]],
        ['user_notification_category_prefs', 'user_id', userIds],
        ['user_roles', 'user_id', userIds],
        ['profiles', 'id', userIds],
        ['growth_communities', 'id', [ids.community]],
        ['schools', 'id', [SCHOOL]],
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
    Object.assign(evidence, { community: ids.community, outbox: ids.outbox, notificationEvents: ids.events });
    evidence.mirrored = mirrored().map((mail) => ({ to: mail.to, subject: mail.subject, link: linkOf(mail).href }));
    evidence.cleanup = cleanup;
    evidence.remaining = remaining;
    const dir = evidenceDir();
    writeFileSync(join(dir, `${MODE}-mail-mirror.jsonl`), mirrored().map((mail) => JSON.stringify(mail)).join('\n') + '\n');
    writeFileSync(join(dir, `due-reminders-${MODE}-fixtures.json`), `${JSON.stringify(evidence, null, 2)}\n`);
    // Every owned fixture is gone: a survivor (or a failed count) fails the run.
    expect(remaining).toEqual(Object.fromEntries(Object.keys(remaining).map((table) => [table, 0])));
  });

  test('desktop: refused calls create nothing; the authorized run reminds the docente who has not submitted, once, by the selected path', async ({ browser, request }) => {
    const { context, page, problems } = await signedIn(browser, DESKTOP, users.pending);
    expect(await openBell(page, false, 'desktop-1-empty-bell')).toBe('Notificaciones');
    await expect(page.getByText('Sin notificaciones')).toBeVisible();

    // Refused before any work: no credential, a wrong secret, a bare secret, a wrong key, the key in the body, a wrong method.
    expect((await cron(request, 'due-reminders', { headers: {} })).status).toBe(401);
    expect((await cron(request, 'due-reminders', { headers: { Authorization: 'Bearer not-the-secret' } })).status).toBe(401);
    expect((await cron(request, 'due-reminders', { headers: { Authorization: CRON_SECRET } })).status).toBe(401);
    expect((await cron(request, 'due-reminders', { method: 'POST', headers: { 'x-cron-key': 'not-the-key' } })).status).toBe(401);
    expect((await cron(request, 'due-reminders', { method: 'POST', headers: {}, data: { cronKey: CRON_SECRET } })).status).toBe(401);
    expect((await cron(request, 'due-reminders', { method: 'PUT', headers: { Authorization: `Bearer ${CRON_SECRET}` } })).status).toBe(405);
    await expectNothing();

    const run = await cron(request, 'due-reminders');
    expect(run.status).toBe(200);
    // The route reminds every due assignment in the database; this run's assignment is judged by its own rows below.
    expect(run.body).toMatchObject({ success: true, failed: 0 });
    expect(run.body.sent).toBeGreaterThanOrEqual(1);

    const [bell, ...extra] = await bells(users.pending);
    expect(extra).toEqual([]);
    const chileDate = new Intl.DateTimeFormat('es-CL', { timeZone: 'America/Santiago', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(ids.dueAt));
    expect(bell).toMatchObject({ title: BELL_TITLE, related_url: `/assignments/${ids.assignment}`, description: `La tarea "${TITLE}" vence el ${chileDate}. No olvides completarla.` });
    expect(bell.idempotency_key).toBe(`notif-${sha(['assignment_due_soon', occurrence(users.pending), users.pending.id])}`);
    expect(await bells(users.submitted)).toEqual([]);
    expect(await outbox(users.submitted)).toEqual([]);

    if (OUTBOX_ON) {
      // Queued with the assignment as its typed source, linked to the bell; no email yet.
      const [row, ...others] = await outbox(users.pending);
      expect(others).toEqual([]);
      expect(row).toMatchObject({ status: 'pending', event_type: 'assignment_due_soon', notification_id: bell.id });
      expect(await sourceOf(row.id)).toEqual([{ source_kind: 'assignment', source_id: ids.assignment }]);
      expect(mirrored()).toEqual([]);
      const worker = await cron(request, 'notification-emails');
      expect(worker.body).toMatchObject({ ok: true, enabled: true, status: 'ok' });
      expect(worker.body.sent).toBeGreaterThanOrEqual(1);
      expect((await outbox(users.pending)).map((r) => r.status)).toEqual(['sent']);
    } else {
      await expect.poll(() => mirrored().length, { timeout: 30_000 }).toBe(1);
      expect(await outbox(users.pending)).toEqual([]);
    }
    expect(mailTo(users.pending)).toHaveLength(1);
    expect(mailTo(users.submitted)).toEqual([]);

    // The next hourly run, same due instant: nothing more anywhere.
    const retry = await cron(request, 'due-reminders');
    expect(retry.body).toMatchObject({ success: true, failed: 0 });
    expect(retry.body.alreadySent).toBeGreaterThanOrEqual(1);
    if (OUTBOX_ON) {
      expect((await cron(request, 'notification-emails')).body).toMatchObject({ ok: true, enabled: true });
      expect((await outbox(users.pending)).map((r) => r.status)).toEqual(['sent']);
    }
    expect(await bells(users.pending)).toEqual([bell]);
    expect(await bells(users.submitted)).toEqual([]);
    expect(mirrored()).toHaveLength(1);

    const [mail] = mailTo(users.pending);
    expect(mail.subject).toBe(BELL_TITLE);
    const link = linkOf(mail);
    expect(link.origin).toBe(APP_ORIGIN);
    expect(link.pathname).toBe(`/assignments/${ids.assignment}`);

    for (const name of ['desktop-2-bell-after-reload', 'desktop-3-bell-after-second-reload']) {
      await page.reload();
      expect(await openBell(page, false, name)).toBe('Notificaciones (1 sin leer)');
      await expect(page.getByText(BELL_TITLE)).toBeVisible();
    }

    // The bell item opens the assignment the docente must submit.
    await page.getByText(BELL_TITLE).click();
    await expectAssignmentPage(page);
    await shot(page, 'desktop-4-bell-opened-assignment');

    // And so does the emailed link.
    await page.goto(link.href);
    await expectAssignmentPage(page);
    await shot(page, 'desktop-5-mail-link-opened');
    expect(problems).toEqual([]);
    await context.close();
  });

  test('mobile: the same single reminder across reloads, and its links open the assignment', async ({ browser }) => {
    const { context, page, problems } = await signedIn(browser, MOBILE, users.pending);
    // The desktop test opened the item, which marked it read.
    expect(await openBell(page, true, 'mobile-1-bell')).toMatch(/^Notificaciones/);
    await expect(page.getByText(BELL_TITLE)).toBeVisible();
    await page.reload();
    await openBell(page, true, 'mobile-2-bell-after-reload');
    await page.getByText(BELL_TITLE).click();
    await expectAssignmentPage(page);
    await shot(page, 'mobile-3-bell-opened-assignment');

    await page.goto(linkOf(mailTo(users.pending)[0]).href);
    await expectAssignmentPage(page);
    await shot(page, 'mobile-4-mail-link-opened');
    expect(await bells(users.pending)).toHaveLength(1);
    expect(mirrored()).toHaveLength(1);
    expect(problems).toEqual([]);
    await context.close();
  });
});
