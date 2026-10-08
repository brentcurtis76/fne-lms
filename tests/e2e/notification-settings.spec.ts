import { test, expect, type Browser, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * N4-02 — `/configuracion/notificaciones` in a real browser against the running
 * app and its real API, signed in through the real login page.
 *
 * A (consultor and encargado de licitación of one synthetic school) sees the
 * categories that reach those roles, the always-sent list and an inherited
 * legacy switch-off; saves from the keyboard, reloads, and returns a category
 * to Predeterminado. Loading, read and save failures are produced by
 * intercepting the browser's own requests; nothing answers in the API's place
 * on the happy path. B (docente, no school) sees only B's own settings on a
 * phone-sized screen, and a cookie that names A with B's token shows nothing of
 * A's. C (equipo directivo of the school) is offered the pending-quiz event
 * that reaches assigned reviewers, but not group submissions. Every fixture is deleted by exact id in afterAll and the manifest is
 * written next to the screenshots. Synthetic *@qa.local.test users on a local
 * database only; no email is sent and no producer runs.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const APP_ORIGIN = new URL(process.env.E2E_APP_ORIGIN ?? 'http://localhost:3000').origin;
const DESKTOP = { width: 1366, height: 768 };
const MOBILE = { width: 390, height: 844 };
const EVIDENCE_DIR = process.env.UI_EVIDENCE_DIR;
const RUN = randomBytes(4).toString('hex');
const PASSWORD = `N20-${randomBytes(12).toString('base64url')}!a1`;
const LOCAL_HOSTS = ['127.0.0.1', 'localhost', '::1'];
const PAGE = '/configuracion/notificaciones';
const API = '/api/user/notification-preferences';
const users = {
  a: { id: '', email: `notif20-${RUN}-a@qa.local.test`, roles: ['consultor', 'encargado_licitacion'] },
  b: { id: '', email: `notif20-${RUN}-b@qa.local.test`, roles: ['docente'] },
  c: { id: '', email: `notif20-${RUN}-c@qa.local.test`, roles: ['equipo_directivo'] },
};
type User = (typeof users)[keyof typeof users];
const ids = { school: 0, legacy: [] as string[], types: [] as string[] };
const evidence: Record<string, unknown> = { run: RUN, supabaseUrl: SUPABASE_URL, appOrigin: APP_ORIGIN };
let service: SupabaseClient;

function must<T>(label: string, result: { data: T; error: { message: string } | null }): T {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
}

function evidenceDir(): string {
  const dir = EVIDENCE_DIR ?? test.info().outputDir;
  mkdirSync(dir, { recursive: true });
  return dir;
}

const shot = (page: Page, name: string) => page.screenshot({ path: join(evidenceDir(), `${name}.png`), fullPage: true });
const writeManifest = () => writeFileSync(join(evidenceDir(), 'notification-settings-fixtures.json'), `${JSON.stringify(evidence, null, 2)}\n`);

async function categoryRows(user: User) {
  return must('category rows', await service.from('user_notification_category_prefs').select('category, email_mode').eq('user_id', user.id).order('category'));
}

async function signIn(user: User) {
  const client = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signInWithPassword({ email: user.email, password: PASSWORD });
  if (error || !data.session) throw new Error(`signIn: ${error?.message ?? 'no session'}`);
  return data.session;
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

async function openSettings(page: Page, path = PAGE) {
  await page.goto(path);
  await expect(page).toHaveURL(new RegExp(`${PAGE}$`));
  await expect(page.getByTestId('ns-save')).toBeVisible({ timeout: 60_000 });
}

const mode = (page: Page, category: string) => page.getByTestId(`ns-mode-${category}`);
const fitsWidth = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test.describe.configure({ mode: 'serial', timeout: 300_000 });

test.describe('notification settings page (N4-02)', () => {
  test.beforeAll(async () => {
    test.setTimeout(120_000);
    if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) throw new Error('Supabase URL, anon key and service key are required');
    const target = new URL(SUPABASE_URL);
    if (!LOCAL_HOSTS.includes(target.hostname.replace(/^\[|\]$/g, ''))) throw new Error('notification-settings refuses a non-local database');
    // Locally the default ports are the shared stack; in CI they are the runner's own ephemeral one.
    if (!process.env.CI && ['54321', '54322'].includes(target.port)) throw new Error('notification-settings refuses the shared default stack');
    service = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    const school = must('school', await service.from('schools').insert({ name: `Colegio sintético N20 ${RUN}` }).select('id').single()) as { id: number };
    ids.school = school.id;
    for (const user of Object.values(users)) {
      const created = await service.auth.admin.createUser({ email: user.email, password: PASSWORD, email_confirm: true });
      if (created.error) throw new Error(`createUser: ${created.error.message}`);
      user.id = created.data.user.id;
      must('profile', await service.from('profiles').upsert(
        { id: user.id, email: user.email, name: 'Persona Sintetica', first_name: 'Persona', last_name: 'Sintetica', must_change_password: false, approval_status: 'approved' },
        { onConflict: 'id' }
      ));
      const schoolId = user === users.b ? null : ids.school;
      must('roles', await service.from('user_roles').insert(user.roles.map((role_type) => ({ user_id: user.id, role_type, school_id: schoolId, is_active: true }))));
    }
    // A's legacy switch-off of assignment_created email. Its notification_types row is created only when missing, then deleted.
    const types = must('types', await service.from('notification_types').select('id').eq('id', 'assignment_created')) as Array<{ id: string }>;
    if (types.length === 0) {
      must('type', await service.from('notification_types').insert({ id: 'assignment_created', name: 'Tarea creada (sintético N20)', category: 'assignments' }));
      ids.types.push('assignment_created');
    }
    const legacy = must('legacy', await service.from('user_notification_preferences')
      .insert({ user_id: users.a.id, notification_type: 'assignment_created', email_enabled: false, in_app_enabled: true })
      .select('id')) as Array<{ id: string }>;
    ids.legacy.push(...legacy.map((row) => row.id));
    // B's digest choice stored before the flag went off: shown neutrally, never offered, kept until B changes it.
    must('stored digest', await service.from('user_notification_category_prefs').insert({ user_id: users.b.id, category: 'advisory', email_mode: 'digest' }));
    evidence.users = Object.fromEntries(Object.entries(users).map(([name, user]) => [name, { id: user.id, roles: user.roles }]));
    evidence.school = ids.school;
    evidence.legacy = ids.legacy;
    evidence.notificationTypes = ids.types;
    writeManifest();
  });

  test.afterAll(async () => {
    const cleanup: Record<string, number | string> = {};
    const remaining: Record<string, number | string> = {};
    const count = (r: { error: { message: string } | null; count: number | null }) => (r.error ? r.error.message : r.count ?? -1);
    const userIds = Object.values(users).map((user) => user.id).filter(Boolean);
    if (service) {
      const owned: Array<[string, string, Array<string | number>]> = [
        ['user_notification_category_prefs', 'user_id', userIds],
        ['user_notification_preferences', 'user_id', userIds],
        ['user_roles', 'user_id', userIds],
        ['profiles', 'id', userIds],
        ['notification_types', 'id', ids.types],
        ['schools', 'id', ids.school ? [ids.school] : []],
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
    evidence.cleanup = cleanup;
    evidence.remaining = remaining;
    writeManifest();
  });

  test('desktop: A is redirected and gated, sees A-scoped settings, saves from the keyboard, reloads, and recovers from failures', async ({ browser }) => {
    // Signed out: /configuracion → the settings → login, carrying the destination.
    const anonymous = await browser.newContext({ viewport: DESKTOP, storageState: { cookies: [], origins: [] } });
    const visitor = await anonymous.newPage();
    await visitor.goto('/configuracion');
    await expect(visitor).toHaveURL(`${APP_ORIGIN}/login?next=%2Fconfiguracion%2Fnotificaciones`);
    await anonymous.close();

    const { context, page, problems } = await signedIn(browser, DESKTOP, users.a);
    // Loading state: the browser's own read is held back for a moment, then let through untouched.
    await page.route(`**${API}`, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await route.continue();
    });
    await page.goto('/configuracion');
    await expect(page.getByTestId('ns-loading')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('ns-save')).toBeVisible({ timeout: 60_000 });
    await page.unroute(`**${API}`);
    await expect(page).toHaveURL(new RegExp(`${PAGE}$`));

    for (const category of ['courses', 'assignments', 'community', 'sessions', 'advisory', 'licitaciones', 'system']) {
      await expect(page.getByTestId(`ns-category-${category}`)).toBeVisible();
    }
    await expect(page.getByTestId('ns-category-qa_support')).toHaveCount(0);
    await expect(page.getByTestId('ns-event-licitacion_contrato_generado')).toHaveCount(0);
    await expect(page.getByTestId('ns-mandatory')).toContainText('Sesión cancelada');
    await expect(page.getByTestId('ns-legacy-assignment_created')).toBeVisible();
    await expect(page.getByTestId('ns-event-assignment_created')).toContainText('No se envía');
    await expect(page.getByTestId('ns-address-unavailable')).toBeVisible();
    await expect(page.getByTestId('ns-digest-note')).toContainText('todavía no está disponible');
    await expect(mode(page, 'sessions').locator('option')).toHaveText(['Predeterminado', 'Inmediato', 'Desactivado']);
    await expect(page.getByTestId('ns-save')).toBeDisabled();
    await shot(page, 'desktop-1-a-defaults');

    // Keyboard: change two categories with the arrow keys and save with Enter.
    await mode(page, 'licitaciones').focus();
    await page.keyboard.press('ArrowDown');
    await expect(mode(page, 'licitaciones')).toHaveValue('immediate');
    await page.getByLabel('Sesiones de consultoría').selectOption('off');
    await expect(page.getByTestId('ns-unsaved')).toBeVisible();
    await page.getByTestId('ns-save').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('ns-saved')).toHaveText('Tus preferencias se guardaron.');
    expect(await categoryRows(users.a)).toEqual([
      { category: 'licitaciones', email_mode: 'immediate' },
      { category: 'sessions', email_mode: 'off' },
    ]);

    await page.reload();
    await expect(page.getByTestId('ns-save')).toBeVisible({ timeout: 60_000 });
    await expect(mode(page, 'sessions')).toHaveValue('off');
    await expect(mode(page, 'licitaciones')).toHaveValue('immediate');
    await expect(page.getByTestId('ns-event-session_created')).toContainText('No se envía');
    await expect(page.getByTestId('ns-event-session_cancelled')).toContainText('Se envía siempre');
    await shot(page, 'desktop-2-a-saved-after-reload');

    // Inmediato lifts the legacy switch-off; Predeterminado brings it back.
    await mode(page, 'assignments').selectOption('immediate');
    await page.getByTestId('ns-save').click();
    await expect(page.getByTestId('ns-saved')).toBeVisible();
    await expect(page.getByTestId('ns-legacy-assignment_created')).toHaveCount(0);
    await expect(page.getByTestId('ns-event-assignment_created')).toContainText('Se envía de inmediato');
    await mode(page, 'assignments').selectOption('default');
    await page.getByTestId('ns-save').click();
    await expect(page.getByTestId('ns-saved')).toBeVisible();
    await expect(page.getByTestId('ns-legacy-assignment_created')).toBeVisible();
    await expect(page.getByTestId('ns-event-assignment_created')).toContainText('No se envía');

    // A failed save (the request never reaches the server): no success, the choice stays, nothing written.
    await page.route(`**${API}`, (route) => (route.request().method() === 'PUT' ? route.abort('failed') : route.continue()));
    await mode(page, 'system').selectOption('off');
    await page.getByTestId('ns-save').click();
    await expect(page.getByTestId('ns-save-error')).toContainText('No pudimos guardar tus preferencias');
    await expect(page.getByTestId('ns-saved')).toHaveCount(0);
    await expect(mode(page, 'system')).toHaveValue('off');
    await page.unroute(`**${API}`);
    // A read failure, then the retry reads the real API.
    await page.route(`**${API}`, (route) => route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"x","code":"read_failed"}' }));
    await page.reload();
    await expect(page.getByTestId('ns-error')).toContainText('No pudimos cargar tus preferencias.', { timeout: 60_000 });
    await shot(page, 'desktop-3-read-error');
    await page.unroute(`**${API}`);
    await page.getByTestId('ns-retry').click();
    await expect(mode(page, 'system')).toHaveValue('default');
    expect(await categoryRows(users.a)).toEqual([
      { category: 'assignments', email_mode: 'default' },
      { category: 'licitaciones', email_mode: 'immediate' },
      { category: 'sessions', email_mode: 'off' },
    ]);
    // The legacy row is untouched, in-app switch included.
    expect(must('legacy rows', await service.from('user_notification_preferences').select('notification_type, email_enabled, in_app_enabled').eq('user_id', users.a.id)))
      .toEqual([{ notification_type: 'assignment_created', email_enabled: false, in_app_enabled: true }]);
    expect(await fitsWidth(page)).toBe(true);

    // A forced password change is enforced on this page too.
    must('flag', await service.from('profiles').update({ must_change_password: true }).eq('id', users.a.id));
    await page.goto(PAGE);
    await expect(page).toHaveURL(/\/change-password(\?|$)/);
    must('unflag', await service.from('profiles').update({ must_change_password: false }).eq('id', users.a.id));
    expect(problems).toEqual([]);
    await context.close();
  });

  test('mobile: B sees and saves only B\'s own settings; a cookie naming A shows nothing of A\'s; a revoked token is signed out', async ({ browser }) => {
    const before = await categoryRows(users.a);
    const { context, page, problems } = await signedIn(browser, MOBILE, users.b);
    await openSettings(page, '/configuracion');
    for (const category of ['courses', 'assignments', 'advisory', 'system']) {
      await expect(page.getByTestId(`ns-category-${category}`)).toBeVisible();
    }
    for (const category of ['community', 'sessions', 'licitaciones', 'qa_support']) {
      await expect(page.getByTestId(`ns-category-${category}`)).toHaveCount(0);
    }
    await expect(page.getByTestId('ns-mandatory')).toHaveCount(0);
    await expect(page.getByTestId('ns-legacy-assignment_created')).toHaveCount(0);
    await expect(page.getByTestId('ns-event-quiz_review_pending')).toHaveCount(0);
    await expect(mode(page, 'assignments')).toHaveValue('default');
    await expect(mode(page, 'advisory')).toHaveValue('digest');
    await expect(mode(page, 'advisory').locator('option')).toHaveText(['Predeterminado', 'Inmediato', 'Opción anterior (se envía de inmediato)', 'Desactivado']);
    await expect(mode(page, 'advisory').locator('option[value="digest"]')).toBeDisabled();
    await expect(page.getByTestId('ns-stored-digest-advisory')).toContainText('se envían de inmediato');
    await expect(page.locator('option', { hasText: /resumen diario/i })).toHaveCount(0);
    expect(await fitsWidth(page)).toBe(true);
    await shot(page, 'mobile-1-b-own-settings');

    await mode(page, 'system').selectOption('off');
    await page.getByTestId('ns-save').click();
    await expect(page.getByTestId('ns-saved')).toBeVisible();
    expect(await categoryRows(users.b)).toEqual([{ category: 'advisory', email_mode: 'digest' }, { category: 'system', email_mode: 'off' }]);
    expect(await categoryRows(users.a)).toEqual(before);
    expect(await fitsWidth(page)).toBe(true);
    await shot(page, 'mobile-2-b-saved');
    expect(problems).toEqual([]);
    await context.close();

    // B's own token in a legacy cookie that names A: the server answers as B, never as A.
    const cookie = `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`;
    const session = await signIn(users.b);
    const legacyCookie = (accessToken: string) => ({
      name: cookie,
      url: APP_ORIGIN,
      value: encodeURIComponent(JSON.stringify({
        access_token: accessToken, refresh_token: session.refresh_token, expires_at: session.expires_at, expires_in: session.expires_in,
        token_type: 'bearer', user: { id: users.a.id, aud: 'authenticated', role: 'authenticated' },
      })),
    });
    const forged = await browser.newContext({ viewport: MOBILE, storageState: { cookies: [], origins: [] } });
    await forged.addCookies([legacyCookie(session.access_token)]);
    const forgedPage = await forged.newPage();
    await forgedPage.goto(PAGE);
    await expect(forgedPage).toHaveURL(new RegExp(`${PAGE}$`));
    // The browser's session names A while the server verified B, so the page either shows B's settings or asks to reload.
    await expect(forgedPage.getByTestId('ns-session-changed').or(forgedPage.getByTestId('ns-category-system'))).toBeVisible({ timeout: 60_000 });
    for (const category of ['sessions', 'licitaciones', 'community']) {
      await expect(forgedPage.getByTestId(`ns-category-${category}`)).toHaveCount(0);
    }
    evidence.forgedCookieOutcome = (await forgedPage.getByTestId('ns-session-changed').count()) > 0 ? 'session_changed' : 'own_settings';
    await shot(forgedPage, 'mobile-3-cookie-naming-a');
    await forged.clearCookies();
    await forged.addCookies([legacyCookie('not-a-valid-token')]);
    await forgedPage.goto(PAGE);
    await expect(forgedPage).toHaveURL(`${APP_ORIGIN}/login?next=%2Fconfiguracion%2Fnotificaciones`);
    await shot(forgedPage, 'mobile-4-revoked-token-login');
    await forged.close();
    expect(await categoryRows(users.a)).toEqual(before);
  });

  test('desktop: C, equipo directivo of the school, is offered pending quiz reviews but not group submissions', async ({ browser }) => {
    const { context, page, problems } = await signedIn(browser, DESKTOP, users.c);
    await openSettings(page);
    await expect(page.getByTestId('ns-event-quiz_review_pending')).toContainText('Quiz pendiente de revisión');
    await expect(page.getByTestId('ns-event-group_assignment_submitted')).toHaveCount(0);
    await expect(page.getByTestId('ns-category-sessions')).toHaveCount(0);
    await shot(page, 'desktop-4-c-directivo-reviewer');
    expect(problems).toEqual([]);
    await context.close();
  });
});
