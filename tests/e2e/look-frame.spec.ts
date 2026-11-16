import { test, expect, type Browser, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';

/**
 * Redesign 5b — the new look's frame, in a real browser against the running app and the real
 * database policies, signed in through the real login page.
 *
 * A QA tester (docente) first sees today's frame and its menu; after choosing «Diseño nuevo» in
 * «Apariencia» the new frame is drawn (a black sidebar, the bell in the top bar), with exactly the
 * same menu entries in the same order; a group opens in place and its child navigates; on a phone
 * the drawer opens and closes by its X, the veil and Escape; and after going back to «Diseño actual»
 * today's frame is back.
 *
 * Synthetic *@qa.local.test user on a local database only, deleted by exact id in afterAll.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const RUN = randomBytes(4).toString('hex');
const PASSWORD = `Frame-${randomBytes(12).toString('base64url')}!a1`;
const LOCAL_HOSTS = ['127.0.0.1', 'localhost', '::1'];
const LOOK_PAGE = '/configuracion/apariencia';
const tester = { id: '', email: `look-frame-${RUN}@qa.local.test` };
let service: SupabaseClient;

function must<T>(label: string, result: { data: T; error: { message: string } | null }): T {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
}

async function signedIn(browser: Browser) {
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  const problems: string[] = [];
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  await page.goto('/login');
  await page.getByPlaceholder('tu@email.com').fill(tester.email);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole('button', { name: /iniciar sesión/i }).click();
  await expect(page).toHaveURL(/\/dashboard(\?|$)/, { timeout: 60_000 });
  return { context, page, problems };
}

const lookOf = (page: Page) => page.evaluate(() => document.documentElement.getAttribute('data-look'));

async function panel(page: Page) {
  await page.goto('/dashboard');
  // The greeting renders once the client session and the profile have loaded: the look is decided by then.
  await expect(page.getByRole('heading', { name: /^¡Hola, Persona!/ })).toBeVisible({ timeout: 60_000 });
}

/** The ids of the menu's top-level entries, in order. */
const menuIds = (page: Page) =>
  page
    .getByTestId('global-sidebar')
    .locator('[data-testid^="sidebar-item-"]')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-testid')));

const sidebarBackground = (page: Page) =>
  page.getByTestId('global-sidebar').evaluate((element) => getComputedStyle(element).backgroundColor);

const bell = /^Notificaciones/;

async function chooseLook(page: Page, label: RegExp) {
  await page.goto(LOOK_PAGE);
  await expect(page.getByRole('heading', { name: 'Apariencia' })).toBeVisible({ timeout: 60_000 });
  await page.getByLabel(label).check();
  await page.getByTestId('look-save').click();
  await expect(page.getByTestId('look-saved')).toBeVisible();
}

test.describe.configure({ mode: 'serial', timeout: 300_000 });

test.describe('the new look\'s frame (redesign 5b)', () => {
  test.beforeAll(async () => {
    test.setTimeout(120_000);
    if (!SUPABASE_URL || !SERVICE_KEY) throw new Error('Supabase URL and service key are required');
    const target = new URL(SUPABASE_URL);
    if (!LOCAL_HOSTS.includes(target.hostname.replace(/^\[|\]$/g, ''))) throw new Error('look-frame refuses a non-local database');
    // Locally the default ports are the shared stack; in CI they are the runner's own ephemeral one.
    if (!process.env.CI && ['54321', '54322'].includes(target.port)) throw new Error('look-frame refuses the shared default stack');
    service = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    const created = await service.auth.admin.createUser({ email: tester.email, password: PASSWORD, email_confirm: true });
    if (created.error) throw new Error(`createUser: ${created.error.message}`);
    tester.id = created.data.user.id;
    must('profile', await service.from('profiles').upsert(
      {
        id: tester.id,
        email: tester.email,
        name: 'Persona Sintetica',
        first_name: 'Persona',
        last_name: 'Sintetica',
        must_change_password: false,
        approval_status: 'approved',
        can_run_qa_tests: true,
        learning_preferences: {},
      },
      { onConflict: 'id' }
    ));
    must('roles', await service.from('user_roles').insert({ user_id: tester.id, role_type: 'docente', school_id: null, is_active: true }));
  });

  test.afterAll(async () => {
    if (!service || !tester.id) return;
    await service.from('user_roles').delete().eq('user_id', tester.id);
    await service.from('profiles').delete().eq('id', tester.id);
    await service.auth.admin.deleteUser(tester.id);
  });

  test('a tester gets the new frame with the same menu, and today\'s frame back after «Diseño actual»', async ({ browser }) => {
    const { context, page, problems } = await signedIn(browser);
    const sidebar = page.getByTestId('global-sidebar');

    // Today's frame first: a white sidebar holding the bell. The tester's QA entry is the last
    // gate to answer, so the menu is read once it is there.
    await panel(page);
    expect(await lookOf(page)).toBeNull();
    await expect(page.getByTestId('sidebar-item-qa-testing')).toBeVisible({ timeout: 60_000 });
    await expect.poll(() => sidebarBackground(page)).toBe('rgb(255, 255, 255)');
    await expect(sidebar.getByRole('button', { name: bell })).toBeVisible();
    const todaysMenu = await menuIds(page);
    expect(todaysMenu.length).toBeGreaterThan(0);

    // The new look.
    await chooseLook(page, /Diseño nuevo \(en construcción\)/);
    await panel(page);
    await expect.poll(() => lookOf(page), { timeout: 60_000 }).toBe('nuevo');
    await expect.poll(() => sidebarBackground(page), { timeout: 60_000 }).toBe('rgb(10, 10, 10)');
    const topBar = page.locator('[data-frame="topbar"]');
    await expect(topBar.getByRole('button', { name: bell })).toBeVisible();
    await expect(sidebar.getByRole('button', { name: bell })).toHaveCount(0);
    await expect(topBar.getByRole('button', { name: 'Salir' })).toBeVisible();
    await expect(topBar.getByTitle('Mi Perfil')).toHaveAttribute('href', '/profile');

    // The same entries, in the same order.
    await expect(page.getByTestId('sidebar-item-qa-testing')).toBeVisible({ timeout: 60_000 });
    await expect.poll(() => menuIds(page), { timeout: 60_000 }).toEqual(todaysMenu);

    // The current page's entry is marked; a group opens in place and its child navigates.
    await expect(page.getByTestId('sidebar-item-dashboard')).toHaveAttribute('aria-current', 'page');
    const group = page.getByTestId('sidebar-item-mi-aprendizaje');
    await expect(group).toHaveAttribute('aria-expanded', 'false');
    await group.click();
    await expect(group).toHaveAttribute('aria-expanded', 'true');
    const child = sidebar.getByRole('link', { name: 'Mis Tareas', exact: true });
    await expect(child).toHaveAttribute('href', '/mi-aprendizaje/tareas');
    await child.click();
    await expect(page).toHaveURL(/\/mi-aprendizaje\/tareas(\?|$)/, { timeout: 60_000 });
    await expect(sidebar.getByRole('link', { name: 'Mis Tareas', exact: true })).toHaveAttribute('aria-current', 'page');

    // A phone: the menu is a drawer, closed by its X, by the veil and by Escape.
    await page.setViewportSize({ width: 390, height: 844 });
    await panel(page);
    const trigger = page.getByTestId('mobile-sidebar-trigger');
    const overlay = page.getByTestId('mobile-sidebar-overlay');
    await expect(trigger).toBeVisible();
    await expect(sidebar).toBeHidden();

    await trigger.click();
    await expect(overlay).toBeVisible();
    await expect(sidebar).toBeVisible();
    await sidebar.getByRole('button', { name: 'Cerrar menú' }).click();
    await expect(overlay).toHaveCount(0);
    await expect(sidebar).toBeHidden();

    await trigger.click();
    await expect(overlay).toBeVisible();
    await overlay.click({ position: { x: 370, y: 420 } });
    await expect(overlay).toHaveCount(0);

    await trigger.click();
    await expect(overlay).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(overlay).toHaveCount(0);
    await expect(sidebar).toBeHidden();

    // Back to today's look: today's frame.
    await page.setViewportSize({ width: 1366, height: 768 });
    await chooseLook(page, /Diseño actual/);
    await panel(page);
    expect(await lookOf(page)).toBeNull();
    await expect.poll(() => sidebarBackground(page), { timeout: 60_000 }).toBe('rgb(255, 255, 255)');
    await expect(sidebar.getByRole('button', { name: bell })).toBeVisible();
    await expect(page.locator('[data-frame="topbar"]')).toHaveCount(0);
    await expect.poll(() => menuIds(page), { timeout: 60_000 }).toEqual(todaysMenu);

    expect(problems).toEqual([]);
    await context.close();
  });
});
