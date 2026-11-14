import { test, expect, type Browser, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';

/**
 * Redesign 4d — the per-account look switch, in a real browser against the running app,
 * its real API and the real database policies, signed in through the real login page.
 *
 * The promise: an account that is not offered the choice, or never made one, gets exactly
 * the page it had — no `data-look` on <html>, no «Apariencia» anywhere, no way to save one.
 * A (QA tester, docente) is offered it, switches to the new look and back, and the choice
 * is the profile's: it survives a reload, another key of `learning_preferences` is kept,
 * nothing is kept in the browser, and an ended session or a withdrawn tester mark returns the
 * page to today's look. B (docente, not a tester) sees nothing of it, is refused by the API,
 * and is not shown the new look even with the key written into B's own profile row.
 *
 * Synthetic *@qa.local.test users on a local database only, deleted by exact id in afterAll.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const RUN = randomBytes(4).toString('hex');
const PASSWORD = `Look-${randomBytes(12).toString('base64url')}!a1`;
const LOCAL_HOSTS = ['127.0.0.1', 'localhost', '::1'];
const SETTINGS = '/configuracion/notificaciones';
const LOOK_PAGE = '/configuracion/apariencia';
const API = '/api/user/look';
const users = {
  a: { id: '', email: `look-${RUN}-a@qa.local.test`, tester: true },
  b: { id: '', email: `look-${RUN}-b@qa.local.test`, tester: false },
};
type User = (typeof users)[keyof typeof users];
let service: SupabaseClient;

function must<T>(label: string, result: { data: T; error: { message: string } | null }): T {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
}

async function preferences(user: User): Promise<unknown> {
  const row = must('preferences', await service.from('profiles').select('learning_preferences').eq('id', user.id).single()) as {
    learning_preferences: unknown;
  };
  return row.learning_preferences;
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

const lookOf = (page: Page) => page.evaluate(() => document.documentElement.getAttribute('data-look'));
/** Everything this origin keeps in the browser's storage that mentions the look: there must be nothing. */
const keptInBrowser = (page: Page) =>
  page.evaluate(() =>
    [window.localStorage, window.sessionStorage].flatMap((store) =>
      Object.keys(store).filter((key) => /look/i.test(key) || /ui_look|nuevo/.test(store.getItem(key) ?? ''))
    )
  );

async function panel(page: Page) {
  await page.goto('/dashboard');
  // The greeting renders once the client session and the profile have loaded: the look is decided by then.
  await expect(page.getByRole('heading', { name: /^¡Hola, Persona!/ })).toBeVisible({ timeout: 60_000 });
}

async function openSettings(page: Page) {
  await page.goto(SETTINGS);
  await expect(page.getByTestId('notification-settings')).toBeVisible({ timeout: 60_000 });
  // The page's own content has settled (a list, the empty state or a read error) before anything is concluded from it.
  await expect(page.getByTestId('ns-loading')).toHaveCount(0, { timeout: 60_000 });
}

test.describe.configure({ mode: 'serial', timeout: 300_000 });

test.describe('the look switch (redesign 4d)', () => {
  test.beforeAll(async () => {
    test.setTimeout(120_000);
    if (!SUPABASE_URL || !SERVICE_KEY) throw new Error('Supabase URL and service key are required');
    const target = new URL(SUPABASE_URL);
    if (!LOCAL_HOSTS.includes(target.hostname.replace(/^\[|\]$/g, ''))) throw new Error('look-switch refuses a non-local database');
    // Locally the default ports are the shared stack; in CI they are the runner's own ephemeral one.
    if (!process.env.CI && ['54321', '54322'].includes(target.port)) throw new Error('look-switch refuses the shared default stack');
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
          // A key that is not the look's: saving a look must keep it.
          learning_preferences: { ritmo: 'sintetico' },
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

  test('an account that is not offered the choice sees and can do nothing of it', async ({ browser }) => {
    const { context, page, problems } = await signedIn(browser, users.b);
    expect(await lookOf(page)).toBeNull();

    await openSettings(page);
    await expect(page.getByTestId('ns-to-look')).toHaveCount(0);
    await expect(page.getByText('Apariencia', { exact: true })).toHaveCount(0);

    // The address itself answers as `/configuracion` does: the notification settings.
    await page.goto(LOOK_PAGE);
    await expect(page).toHaveURL(new RegExp(`${SETTINGS}$`));
    await expect(page.getByTestId('look-settings')).toHaveCount(0);

    // The API refuses, whatever the body says about whose look it is.
    const refused = await context.request.put(API, { data: { look: 'nuevo' } });
    expect(refused.status()).toBe(403);
    expect((await refused.json()).code).toBe('not_offered');
    const forged = await context.request.put(API, { data: { look: 'nuevo', user_id: users.a.id } });
    expect(forged.status()).toBe(400);
    expect(await preferences(users.b)).toEqual({ ritmo: 'sintetico' });
    expect(await preferences(users.a)).toEqual({ ritmo: 'sintetico' });

    // Even with the key in B's own row (a person can write their own profile row), B is not shown the new look.
    must('key by hand', await service.from('profiles').update({ learning_preferences: { ritmo: 'sintetico', ui_look: 'nuevo' } }).eq('id', users.b.id));
    await panel(page);
    expect(await lookOf(page)).toBeNull();
    must('key removed', await service.from('profiles').update({ learning_preferences: { ritmo: 'sintetico' } }).eq('id', users.b.id));

    expect(await keptInBrowser(page)).toEqual([]);
    expect(problems).toEqual([]);
    await context.close();
  });

  test('no session: the API answers 401 and the sign-in screen has no look', async ({ browser }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const anonymous = await context.request.put(API, { data: { look: 'nuevo' } });
    expect(anonymous.status()).toBe(401);
    const page = await context.newPage();
    await page.goto(LOOK_PAGE);
    await expect(page).toHaveURL(/\/login/);
    expect(await lookOf(page)).toBeNull();
    await context.close();
  });

  test('a QA tester switches to the new look and back; the profile holds the choice', async ({ browser }) => {
    const { context, page, problems } = await signedIn(browser, users.a);
    expect(await lookOf(page)).toBeNull();

    // Reached from the notification settings, by the keyboard.
    await openSettings(page);
    const link = page.getByTestId('ns-to-look');
    await expect(link).toHaveText('Apariencia');
    await link.focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(new RegExp(`${LOOK_PAGE}$`));
    await expect(page.getByRole('heading', { name: 'Apariencia' })).toBeVisible({ timeout: 60_000 });

    const current = page.getByTestId('look-option-clasico');
    const next = page.getByTestId('look-option-nuevo');
    const save = page.getByTestId('look-save');
    await expect(current).toBeChecked();
    await expect(save).toBeDisabled();

    // To the new look.
    await page.getByLabel(/Diseño nuevo \(en construcción\)/).check();
    await expect(page.getByTestId('look-unsaved')).toBeVisible();
    await save.click();
    await expect(page.getByTestId('look-saved')).toHaveText('Tu apariencia se guardó.');
    expect(await lookOf(page)).toBe('nuevo');
    expect(await keptInBrowser(page)).toEqual([]);
    expect(await preferences(users.a)).toEqual({ ritmo: 'sintetico', ui_look: 'nuevo' });
    expect(await preferences(users.b)).toEqual({ ritmo: 'sintetico' });

    // It is the profile's: a full reload, and another page, show it again.
    await page.reload();
    await expect(next).toBeChecked({ timeout: 60_000 });
    await expect.poll(() => lookOf(page), { timeout: 60_000 }).toBe('nuevo');
    await panel(page);
    await expect.poll(() => lookOf(page), { timeout: 60_000 }).toBe('nuevo');

    // Back to today's look: the attribute and the browser's copy go, the key goes, the other key stays.
    await page.goto(LOOK_PAGE);
    await expect(next).toBeChecked({ timeout: 60_000 });
    await page.getByLabel(/Diseño actual/).check();
    await save.click();
    await expect(page.getByTestId('look-saved')).toBeVisible();
    expect(await lookOf(page)).toBeNull();
    expect(await keptInBrowser(page)).toEqual([]);
    expect(await preferences(users.a)).toEqual({ ritmo: 'sintetico' });

    expect(problems).toEqual([]);
    await context.close();
  });

  test('an ended session, or a withdrawn tester mark, returns the page to today\'s look', async ({ browser }) => {
    must('stored look', await service.from('profiles').update({ learning_preferences: { ritmo: 'sintetico', ui_look: 'nuevo' } }).eq('id', users.a.id));
    const { context, page } = await signedIn(browser, users.a);
    await expect.poll(() => lookOf(page), { timeout: 60_000 }).toBe('nuevo');

    // An admin withdraws «Tester QA»: the account keeps its stored key but is shown today's look, with no screen to visit.
    must('mark withdrawn', await service.from('profiles').update({ can_run_qa_tests: false }).eq('id', users.a.id));
    await panel(page);
    expect(await lookOf(page)).toBeNull();
    await page.goto(LOOK_PAGE);
    await expect(page).toHaveURL(new RegExp(`${SETTINGS}$`));
    must('mark back', await service.from('profiles').update({ can_run_qa_tests: true }).eq('id', users.a.id));
    await panel(page);
    await expect.poll(() => lookOf(page), { timeout: 60_000 }).toBe('nuevo');

    // The session ends (its cookies are gone): the sign-in screen has today's look from its first frame,
    // because nothing in the browser remembers the look.
    await context.clearCookies();
    await page.goto('/login');
    expect(await lookOf(page)).toBeNull();
    await expect(page.getByPlaceholder('tu@email.com')).toBeVisible({ timeout: 60_000 });
    expect(await lookOf(page)).toBeNull();
    expect(await keptInBrowser(page)).toEqual([]);
    await context.close();
  });
});
