import { test, expect, type Browser, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';

/**
 * Redesign 5c — «Piezas de la interfaz», the tester-only sample page of the shared pieces, in a real
 * browser against the running app and the real database policies, signed in through the real login page.
 *
 * A QA tester (docente) opens the page from «Apariencia»; the window opens, Escape closes it and the
 * focus returns to its button; the confirmation answers «Cancelado» then «Confirmado»; the tabs move with
 * the arrow keys; the pagination changes the rows; on a phone the table rows become cards. The same steps
 * run twice: in today's look, and after the tester chooses the new look (5c send-back 1), where three
 * computed styles that only the `nuevo:` classes produce are checked too. A docente who is not a tester
 * is sent to the notification settings, as from «Apariencia».
 *
 * Synthetic *@qa.local.test users on a local database only, deleted by exact id in afterAll.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const RUN = randomBytes(4).toString('hex');
const PASSWORD = `Kit-${randomBytes(12).toString('base64url')}!a1`;
const LOCAL_HOSTS = ['127.0.0.1', 'localhost', '::1'];
const SETTINGS = '/configuracion/notificaciones';
const LOOK_PAGE = '/configuracion/apariencia';
const KIT_PAGE = '/configuracion/piezas';
const users = {
  tester: { id: '', email: `look-kit-${RUN}-a@qa.local.test`, tester: true },
  other: { id: '', email: `look-kit-${RUN}-b@qa.local.test`, tester: false },
};
type User = (typeof users)[keyof typeof users];
let service: SupabaseClient;

function must<T>(label: string, result: { data: T; error: { message: string } | null }): T {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
}

async function signedIn(browser: Browser, user: User) {
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, storageState: { cookies: [], origins: [] } });
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

test.describe.configure({ mode: 'serial', timeout: 300_000 });

test.describe('the sample page of the shared pieces (redesign 5c)', () => {
  test.beforeAll(async () => {
    test.setTimeout(120_000);
    if (!SUPABASE_URL || !SERVICE_KEY) throw new Error('Supabase URL and service key are required');
    const target = new URL(SUPABASE_URL);
    if (!LOCAL_HOSTS.includes(target.hostname.replace(/^\[|\]$/g, ''))) throw new Error('look-kit refuses a non-local database');
    // Locally the default ports are the shared stack; in CI they are the runner's own ephemeral one.
    if (!process.env.CI && ['54321', '54322'].includes(target.port)) throw new Error('look-kit refuses the shared default stack');
    service = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    for (const user of Object.values(users)) {
      const created = await service.auth.admin.createUser({ email: user.email, password: PASSWORD, email_confirm: true });
      if (created.error) throw new Error(`createUser: ${created.error.message}`);
      user.id = created.data.user.id;
      must('profile', await service.from('profiles').upsert(
        {
          id: user.id,
          email: user.email,
          name: 'Persona Sintetica',
          first_name: 'Persona',
          last_name: 'Sintetica',
          must_change_password: false,
          approval_status: 'approved',
          can_run_qa_tests: user.tester,
          learning_preferences: {},
        },
        { onConflict: 'id' }
      ));
      must('roles', await service.from('user_roles').insert({ user_id: user.id, role_type: 'docente', school_id: null, is_active: true }));
    }
  });

  test.afterAll(async () => {
    const userIds = Object.values(users).map((user) => user.id).filter(Boolean);
    if (!service) return;
    await service.from('user_roles').delete().in('user_id', userIds);
    await service.from('profiles').delete().in('id', userIds);
    for (const id of userIds) await service.auth.admin.deleteUser(id);
  });

  test('an account that is not a tester is sent away', async ({ browser }) => {
    const { context, page, problems } = await signedIn(browser, users.other);
    await page.goto(KIT_PAGE);
    await expect(page).toHaveURL(new RegExp(`${SETTINGS}$`));
    await expect(page.getByTestId('kit-page')).toHaveCount(0);
    expect(problems).toEqual([]);
    await context.close();
  });

  test('a tester opens the page from «Apariencia» and tries the pieces in today\'s look', async ({ browser }) => {
    const { context, page, problems } = await signedIn(browser, users.tester);

    await openKitFromLookPage(page);
    expect(await lookOf(page)).toBeNull();

    // Today's look: the plain classes, not the new look's.
    const button = page.getByTestId('kit-btn-default');
    await expect.poll(() => button.evaluate((element) => getComputedStyle(element).textTransform)).toBe('none');
    await expect.poll(() => button.evaluate((element) => parseFloat(getComputedStyle(element).borderTopLeftRadius))).toBeLessThan(100);

    await tryThePieces(page, 'today');

    expect(problems).toEqual([]);
    await context.close();
  });

  test('the same tester chooses the new look and tries the same pieces again', async ({ browser }) => {
    const { context, page, problems } = await signedIn(browser, users.tester);

    // The new look is chosen the way a tester chooses it (as in look-switch.spec.ts).
    await page.goto(LOOK_PAGE);
    await expect(page.getByRole('heading', { name: 'Apariencia' })).toBeVisible({ timeout: 60_000 });
    await page.getByLabel(/Diseño nuevo \(en construcción\)/).check();
    await page.getByTestId('look-save').click();
    await expect(page.getByTestId('look-saved')).toHaveText('Tu preferencia se guardó.');
    await expect.poll(() => lookOf(page), { timeout: 60_000 }).toBe('nuevo');

    await openKitFromLookPage(page);
    await expect.poll(() => lookOf(page), { timeout: 60_000 }).toBe('nuevo');

    // Three computed styles that only the `nuevo:` classes produce: a broken variant fails here.
    const button = page.getByTestId('kit-btn-default');
    await expect.poll(() => button.evaluate((element) => parseFloat(getComputedStyle(element).borderTopLeftRadius))).toBeGreaterThanOrEqual(999);
    await expect.poll(() => button.evaluate((element) => getComputedStyle(element).textTransform)).toBe('uppercase');
    await expect.poll(() => page.getByTestId('kit-btn-primary').evaluate((element) => getComputedStyle(element).color)).toBe('rgb(10, 10, 10)');
    await expect
      .poll(() => page.getByTestId('kit-btn-primary').evaluate((element) => getComputedStyle(element).backgroundImage))
      .toMatch(/^linear-gradient/);

    await tryThePieces(page, 'nuevo');

    expect(problems).toEqual([]);
    await context.close();
  });
});

const lookOf = (page: Page) => page.evaluate(() => document.documentElement.getAttribute('data-look'));

/** From «Apariencia», by its link, to the sample page. */
async function openKitFromLookPage(page: Page) {
  await page.goto(LOOK_PAGE);
  await expect(page.getByRole('heading', { name: 'Apariencia' })).toBeVisible({ timeout: 60_000 });
  await page.getByTestId('look-to-kit').click();
  await expect(page).toHaveURL(new RegExp(`${KIT_PAGE}$`));
  await expect(page.getByTestId('kit-page')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText('Muestras de las piezas del diseño. Nada de lo que hagas aquí se guarda.')).toBeVisible();
}

/** The same steps in either look; the confirming button's colours are the look's own. */
async function tryThePieces(page: Page, look: 'today' | 'nuevo') {
  // The window: opened by its button, closed by Escape, the focus back on the button.
  const opener = page.getByTestId('kit-open-dialog');
  await opener.click();
  const dialog = page.getByRole('dialog', { name: 'Gestión de roles' });
  await expect(dialog).toBeVisible();
  await expect(page.getByTestId('kit-dialog-role')).toBeFocused();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await expect.poll(() => dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();

  // The veil and the X close it too.
  await opener.click();
  await expect(dialog).toBeVisible();
  await page.mouse.click(8, 8);
  await expect(dialog).toHaveCount(0);
  await opener.click();
  await dialog.getByRole('button', { name: 'Cerrar' }).click();
  await expect(dialog).toHaveCount(0);

  // The confirmation: «Cancelado», then «Confirmado». The focus starts on «Cancelar».
  await page.getByTestId('kit-open-confirm').click();
  await expect(page.getByRole('dialog', { name: '¿Enviar el registro?' })).toBeVisible();
  await expect(page.getByTestId('kit-confirm-cancel')).toBeFocused();
  // Today: black with white text, as the platform's own confirmation. The new look: the yellow main action.
  const confirming = page.getByTestId('kit-confirm-confirm');
  if (look === 'today') {
    await expect.poll(() => confirming.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe('rgb(10, 10, 10)');
    await expect.poll(() => confirming.evaluate((element) => getComputedStyle(element).color)).toBe('rgb(255, 255, 255)');
  } else {
    await expect.poll(() => confirming.evaluate((element) => getComputedStyle(element).color)).toBe('rgb(10, 10, 10)');
    await expect.poll(() => confirming.evaluate((element) => getComputedStyle(element).backgroundImage)).toMatch(/^linear-gradient/);
  }
  await page.getByTestId('kit-confirm-cancel').click();
  await expect(page.getByTestId('kit-confirm-result')).toHaveText('Cancelado');
  await page.getByTestId('kit-open-confirm').click();
  await page.getByTestId('kit-confirm-confirm').click();
  await expect(page.getByTestId('kit-confirm-result')).toHaveText('Confirmado');

  // Tabs move with the arrow keys.
  await page.getByTestId('kit-tab-detalles').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('kit-tab-materiales')).toBeFocused();
  await expect(page.getByTestId('kit-tab-materiales')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('kit-tabpanel-materiales')).toBeVisible();
  await page.keyboard.press('End');
  await expect(page.getByTestId('kit-tab-actividad')).toBeFocused();
  await expect(page.getByTestId('kit-tabpanel-actividad')).toBeVisible();

  // Pagination changes the rows.
  const range = page.getByTestId('kit-pagination-range');
  await expect(range).toHaveText('Mostrando 1–5 de 12 participantes');
  await expect(page.getByTestId('kit-row-p-1')).toBeVisible();
  await page.getByTestId('kit-pagination-next').click();
  await expect(range).toHaveText('Mostrando 6–10 de 12 participantes');
  await expect(page.getByTestId('kit-row-p-1')).toHaveCount(0);
  await expect(page.getByTestId('kit-row-p-6')).toBeVisible();
  await page.getByTestId('kit-pagination-next').click();
  await expect(page.getByTestId('kit-pagination-next')).toBeDisabled();
  await page.getByTestId('kit-pagination-previous').click();
  await page.getByTestId('kit-pagination-previous').click();
  await expect(page.getByTestId('kit-pagination-previous')).toBeDisabled();

  // On a phone each row is a card that names its columns, in real text; the parts keep their table roles.
  const progressName = page.getByTestId('kit-progress-p-1').locator('[data-kit="cell-label"]');
  await expect(progressName).toBeHidden();
  await page.setViewportSize({ width: 390, height: 844 });
  const firstRow = page.getByTestId('kit-row-p-1');
  await expect.poll(() => firstRow.evaluate((row) => getComputedStyle(row).display)).toBe('block');
  await expect(firstRow).toHaveAttribute('role', 'row');
  await expect(page.getByTestId('kit-progress-p-1')).toHaveAttribute('role', 'cell');
  await expect(progressName).toBeVisible();
  await expect(progressName).toHaveText('Avance');
  await page.setViewportSize({ width: 1366, height: 768 });
}
