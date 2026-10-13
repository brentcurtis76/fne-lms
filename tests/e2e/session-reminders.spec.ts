import { test, expect, type APIRequestContext, type Browser, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { E2E_MAIL_OUTBOX } from '../../playwright.config';

/**
 * N5-03 — the hourly session-reminders cron, end to end, under either flag.
 *
 * A synthetic session starts about 24 hours from now (America/Santiago), with a
 * consultor facilitator and a docente attendee of its growth community. The real
 * cron route is called as Vercel calls it (GET + `Authorization: Bearer`); the
 * app server's `NOTIFICATION_OUTBOX_DELIVERY` must equal this process's:
 *
 * - unset/off: the existing synchronous path. One bell and one mirrored email
 *   per participant at once, no outbox row.
 * - on/true/1: one outbox row per participant with its `session` source and the
 *   bell, no email until the real worker route sends each exactly once.
 *
 * Both: unauthenticated, wrong-secret, wrong-header and wrong-method calls create
 * nothing; a second authorized run (the next hourly tick, same start) adds no bell,
 * row or email; the email carries the platform session link (never the raw
 * meeting link); the bell survives reloads at 1366×768 and 390×844 and the link
 * opens the session for each participant. Fixtures are deleted by exact id and the
 * manifest is written next to the screenshots. Synthetic *@qa.local.test only.
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
const PASSWORD = `N24-${randomBytes(12).toString('base64url')}!a1`;
const LOCAL_HOSTS = ['127.0.0.1', 'localhost', '::1'];
const SCHOOL = 9_500_000 + (parseInt(RUN.slice(0, 4), 16) % 100_000);
const TITLE = `Taller sintético N24 ${RUN}`;
const BELL_TITLE = `Recordatorio: ${TITLE} mañana`;
const RAW_LINK = `https://meet.example.invalid/n24-${RUN}?pwd=NoDebeSalir`;
const users = {
  facilitator: { id: '', email: `notif24-${RUN}-facilitadora@qa.local.test`, role: 'consultor' },
  attendee: { id: '', email: `notif24-${RUN}-asistente@qa.local.test`, role: 'docente' },
};
type User = (typeof users)[keyof typeof users];
const ids = { community: '', session: '', startsAt: '', outbox: [] as string[], events: [] as string[] };
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

/** The America/Santiago wall-clock date and minute of an instant, as the session columns store it. */
function chileWallClock(at: Date): { date: string; time: string } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(at).map((p) => [p.type, p.value])
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}:00` };
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
async function cron(request: APIRequestContext, route: 'session-reminders' | 'notification-emails', init: { method?: 'GET' | 'POST' | 'PUT'; headers?: Record<string, string> } = {}) {
  const headers = init.headers ?? { Authorization: `Bearer ${CRON_SECRET}` };
  const response = await request.fetch(`/api/cron/${route}`, { method: init.method ?? 'GET', headers });
  const body = await response.json();
  (evidence.cron as unknown[]).push({ route, method: init.method ?? 'GET', authorized: !init.headers, status: response.status(), body });
  return { status: response.status(), body };
}

async function bells(user: User) {
  return must('bells', await service.from('user_notifications').select('id, title, description, related_url, read_at').eq('user_id', user.id)) as Array<{ id: string; title: string; description: string; related_url: string; read_at: string | null }>;
}

async function markers() {
  return must('markers', await service.from('session_notifications').select('user_id, notification_type, scheduled_for, status').eq('session_id', ids.session)) as Array<Record<string, string>>;
}

async function outbox(user: User) {
  const rows = must('outbox', await service.from('notification_email_outbox').select('id, status, event_type, notification_id').eq('user_id', user.id)) as Array<{ id: string; status: string; event_type: string; notification_id: string | null }>;
  for (const row of rows) if (!ids.outbox.includes(row.id)) ids.outbox.push(row.id);
  return rows;
}

async function sourceOf(outboxId: string) {
  return must('source', await service.from('notification_email_outbox_source').select('source_kind, source_id').eq('outbox_id', outboxId));
}

async function prefs() {
  return must('prefs', await service.from('user_notification_category_prefs').select('email_mode').in('user_id', Object.values(users).map((u) => u.id)));
}

/** Nothing written by the reminder for this session yet. */
async function expectNothing() {
  for (const user of Object.values(users)) {
    expect(await bells(user)).toEqual([]);
    expect(await outbox(user)).toEqual([]);
  }
  expect(await markers()).toEqual([]);
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

test.describe.configure({ mode: 'serial', timeout: 240_000 });
test.use({ trace: 'on' });

test.describe(`session reminders cron (N5-03), outbox delivery ${MODE}`, () => {
  test.beforeAll(async () => {
    test.setTimeout(120_000);
    if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY || !CRON_SECRET) throw new Error('Supabase URL, anon key, service key and CRON_SECRET are required');
    if (process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY must be unset: no real provider');
    if (!LOCAL_HOSTS.includes(new URL(SUPABASE_URL).hostname.replace(/^\[|\]$/g, ''))) throw new Error('session-reminders refuses a non-local database');
    service = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    // A `client` school: a `qa` tenant's mail is refused before the mirror (lib/email/outbound-policy.ts), and this run must see it.
    must('school', await service.from('schools').insert({ id: SCHOOL, name: `Colegio Sintetico N24 ${RUN}`, tenant_kind: 'client' }));
    const community = must('community', await service.from('growth_communities').insert({ name: `Comunidad N24 ${RUN}`, school_id: SCHOOL }).select('id').single()) as { id: string };
    ids.community = community.id;
    for (const user of Object.values(users)) {
      const created = await service.auth.admin.createUser({ email: user.email, password: PASSWORD, email_confirm: true });
      if (created.error) throw new Error(`createUser: ${created.error.message}`);
      user.id = created.data.user.id;
      must('profile', await service.from('profiles').upsert(
        { id: user.id, email: user.email, name: 'Persona Sintetica', first_name: 'Persona', last_name: 'Sintetica', must_change_password: false, approval_status: 'approved', school_id: SCHOOL },
        { onConflict: 'id' }
      ));
      must('role', await service.from('user_roles').insert({
        user_id: user.id, role_type: user.role, school_id: SCHOOL, community_id: user.role === 'docente' ? ids.community : null, is_active: true,
      }));
    }

    // Starts 24h from now, to the next whole minute: inside the (23h, 25h] window.
    const start = new Date(Math.ceil((Date.now() + 24 * 3_600_000) / 60_000) * 60_000);
    const { date, time } = chileWallClock(start);
    ids.startsAt = start.toISOString();
    const session = must('session', await service.from('consultor_sessions').insert({
      school_id: SCHOOL, growth_community_id: ids.community, title: TITLE, session_date: date, start_time: time, end_time: '23:59:00',
      modality: 'online', meeting_link: RAW_LINK, status: 'programada', created_by: users.facilitator.id,
    }).select('id').single()) as { id: string };
    ids.session = session.id;
    must('facilitator', await service.from('session_facilitators').insert({ session_id: session.id, user_id: users.facilitator.id, facilitator_role: 'consultor_externo', is_lead: true }));
    must('attendee', await service.from('session_attendees').insert({ session_id: session.id, user_id: users.attendee.id }));
    evidence.users = Object.fromEntries(Object.entries(users).map(([name, user]) => [name, user.id]));
    evidence.session = { id: session.id, session_date: date, start_time: time, starts_at: ids.startsAt };
  });

  test.afterAll(async () => {
    const cleanup: Record<string, number | string> = {};
    const remaining: Record<string, number | string> = {};
    const count = (r: { error: { message: string } | null; count: number | null }) => (r.error ? r.error.message : r.count ?? -1);
    const userIds = Object.values(users).map((user) => user.id).filter(Boolean);
    if (service && userIds.length) {
      await Promise.all(Object.values(users).filter((user) => user.id).map(outbox));
      // The audit log keeps only an opaque reference per occurrence: this run's are recomputed exactly.
      const refs = ['session_reminder_24h'].map((event) =>
        `occ-${createHash('sha256').update(JSON.stringify([event, `record:${ids.session}:${encodeURIComponent(ids.startsAt)}`]), 'utf8').digest('hex')}`);
      const events = must('events', await service.from('notification_events').select('id').in('event_data->>occurrence_ref', refs)) as Array<{ id: string }>;
      ids.events = events.map((row) => row.id);
      const owned: Array<[string, string, Array<string | number>]> = [
        ['notification_email_outbox_source', 'outbox_id', ids.outbox],
        ['notification_email_outbox_address', 'outbox_id', ids.outbox],
        ['notification_email_outbox', 'id', ids.outbox],
        ['user_notifications', 'user_id', userIds],
        ['notification_events', 'id', ids.events],
        ['session_notifications', 'session_id', [ids.session]],
        ['session_attendees', 'session_id', [ids.session]],
        ['session_facilitators', 'session_id', [ids.session]],
        ['consultor_sessions', 'id', [ids.session]],
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
    writeFileSync(join(dir, `session-reminders-${MODE}-fixtures.json`), `${JSON.stringify(evidence, null, 2)}\n`);
    // Every owned fixture is gone: a survivor (or a failed count) fails the run.
    expect(remaining).toEqual(Object.fromEntries(Object.keys(remaining).map((table) => [table, 0])));
  });

  test('desktop: refused calls create nothing; the authorized run reminds each participant once by the selected path', async ({ browser, request }) => {
    const { context, page, problems } = await signedIn(browser, DESKTOP, users.attendee);
    expect(await openBell(page, false, 'desktop-1-empty-bell')).toBe('Notificaciones');
    await expect(page.getByText('Sin notificaciones')).toBeVisible();

    // Refused before any work: no credential, a wrong secret, a bare secret, a wrong key, the key in the body's place, a wrong method.
    expect((await cron(request, 'session-reminders', { headers: {} })).status).toBe(401);
    expect((await cron(request, 'session-reminders', { headers: { Authorization: 'Bearer not-the-secret' } })).status).toBe(401);
    expect((await cron(request, 'session-reminders', { headers: { Authorization: CRON_SECRET } })).status).toBe(401);
    expect((await cron(request, 'session-reminders', { method: 'POST', headers: { 'x-cron-key': 'not-the-key' } })).status).toBe(401);
    expect((await cron(request, 'session-reminders', { method: 'PUT', headers: { Authorization: `Bearer ${CRON_SECRET}` } })).status).toBe(405);
    await expectNothing();

    const run = await cron(request, 'session-reminders');
    expect(run.status).toBe(200);
    // The route reminds every due session in the database; this run's session is judged by its own rows below.
    expect(run.body).toMatchObject({ success: true, failed: 0 });
    expect(run.body.reminders24h).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(run.body)).not.toContain(RAW_LINK);

    const [attendeeBell, ...extra] = await bells(users.attendee);
    expect(extra).toEqual([]);
    expect(attendeeBell).toMatchObject({ title: BELL_TITLE, related_url: `/meet/session/${ids.session}` });
    expect(attendeeBell.description).toMatch(/^Tiene una sesión programada para \S+ \d{1,2} de \S+ a las \d{2}:\d{2}\.$/);
    const [facilitatorBell] = await bells(users.facilitator);
    expect(facilitatorBell).toMatchObject({ title: BELL_TITLE, related_url: `/consultor/sessions/${ids.session}` });
    expect((await markers()).map((m) => [m.user_id, m.notification_type, new Date(m.scheduled_for).toISOString(), m.status]).sort())
      .toEqual(Object.values(users).map((u) => [u.id, 'session_reminder_24h', ids.startsAt, 'sent']).sort());

    if (OUTBOX_ON) {
      // Queued with the session as its typed source, linked to the bell; no email yet.
      for (const [user, bell] of [[users.attendee, attendeeBell], [users.facilitator, facilitatorBell]] as const) {
        const [row, ...others] = await outbox(user);
        expect(others).toEqual([]);
        expect(row).toMatchObject({ status: 'pending', event_type: 'session_reminder_24h', notification_id: bell.id });
        expect(await sourceOf(row.id)).toEqual([{ source_kind: 'session', source_id: ids.session }]);
      }
      expect(mirrored()).toEqual([]);
      // The worker drains every due row; this run's two rows are sent once, and a second worker run sends none of them.
      const worker = await cron(request, 'notification-emails');
      expect(worker.body).toMatchObject({ ok: true, enabled: true, status: 'ok' });
      expect(worker.body.sent).toBeGreaterThanOrEqual(2);
      for (const user of Object.values(users)) expect((await outbox(user)).map((row) => row.status)).toEqual(['sent']);
      expect((await cron(request, 'notification-emails')).body).toMatchObject({ ok: true, enabled: true });
    } else {
      await expect.poll(() => mirrored().length, { timeout: 30_000 }).toBe(2);
      expect(await outbox(users.attendee)).toEqual([]);
      expect(await outbox(users.facilitator)).toEqual([]);
    }
    expect(mailTo(users.attendee)).toHaveLength(1);
    expect(mailTo(users.facilitator)).toHaveLength(1);

    // The next hourly tick, same start: nothing more anywhere.
    const retry = await cron(request, 'session-reminders');
    expect(retry.body).toMatchObject({ success: true, failed: 0 });
    if (OUTBOX_ON) {
      expect((await cron(request, 'notification-emails')).body).toMatchObject({ ok: true, enabled: true });
      for (const user of Object.values(users)) expect((await outbox(user)).map((row) => row.status)).toEqual(['sent']);
    }
    expect(await bells(users.attendee)).toEqual([attendeeBell]);
    expect(await bells(users.facilitator)).toEqual([facilitatorBell]);
    expect(await markers()).toHaveLength(2);
    expect(mirrored()).toHaveLength(2);
    // Nothing chose a channel for anyone. The worker's unsubscribe link records a `default` row per mailed
    // recipient (existing N3-05 behaviour), which decides nothing; the synchronous path writes none.
    expect(await prefs()).toEqual(OUTBOX_ON ? [{ email_mode: 'default' }, { email_mode: 'default' }] : []);

    const [mail] = mailTo(users.attendee);
    expect(mail.subject).toBe(BELL_TITLE);
    expect(mail.html).not.toContain(RAW_LINK);
    expect(mail.html).not.toContain('NoDebeSalir');
    const link = linkOf(mail);
    expect(link.origin).toBe(APP_ORIGIN);
    expect(link.pathname).toBe(`/meet/session/${ids.session}`);

    for (const name of ['desktop-2-bell-after-reload', 'desktop-3-bell-after-second-reload']) {
      await page.reload();
      expect(await openBell(page, false, name)).toBe('Notificaciones (1 sin leer)');
      await expect(page.getByText(BELL_TITLE)).toBeVisible();
    }

    // The bell item opens the session page the docente may see.
    await page.getByText(BELL_TITLE).click();
    await expect(page).toHaveURL(new RegExp(`/meet/session/${ids.session}$`), { timeout: 30_000 });
    await expect(page.getByRole('heading', { name: TITLE, level: 1 })).toBeVisible({ timeout: 30_000 });
    await shot(page, 'desktop-4-bell-opened-session');

    // And so does the emailed link.
    await page.goto(link.href);
    await expect(page.getByRole('heading', { name: TITLE, level: 1 })).toBeVisible({ timeout: 30_000 });
    await shot(page, 'desktop-5-mail-link-opened');
    expect(problems).toEqual([]);
    await context.close();
  });

  test('mobile: the facilitator sees the same single reminder across reloads and its links open the session', async ({ browser }) => {
    const { context, page, problems } = await signedIn(browser, MOBILE, users.facilitator);
    expect(await openBell(page, true, 'mobile-1-facilitator-bell')).toBe('Notificaciones (1 sin leer)');
    await expect(page.getByText(BELL_TITLE)).toBeVisible();
    await page.reload();
    expect(await openBell(page, true, 'mobile-2-facilitator-bell-after-reload')).toBe('Notificaciones (1 sin leer)');
    await page.getByText(BELL_TITLE).click();
    await expect(page).toHaveURL(new RegExp(`/consultor/sessions/${ids.session}$`), { timeout: 30_000 });
    await expect(page.getByRole('heading', { name: TITLE, level: 1 })).toBeVisible({ timeout: 30_000 });
    await shot(page, 'mobile-3-bell-opened-session');

    const [mail] = mailTo(users.facilitator);
    expect(mail.html).not.toContain('NoDebeSalir');
    await page.goto(linkOf(mail).href);
    await expect(page).toHaveURL(new RegExp(`/consultor/sessions/${ids.session}$`), { timeout: 30_000 });
    await expect(page.getByRole('heading', { name: TITLE, level: 1 })).toBeVisible({ timeout: 30_000 });
    await shot(page, 'mobile-4-mail-link-opened');
    expect(mirrored()).toHaveLength(2);
    expect(problems).toEqual([]);
    await context.close();
  });
});
