import { test, expect, type Browser, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomBytes, randomUUID } from 'node:crypto';

/**
 * Redesign 6B — the new «Mi Panel», in a real browser against the running app and the real database
 * policies, signed in through the real login page (the manner of `look-frame.spec.ts`).
 *
 * A QA tester (docente, in a growth community with one other member, with three open courses and one
 * started) first sees today's panel; after choosing «Diseño nuevo» in «Apariencia» the new panel is
 * drawn (`panel-nuevo`) with the same set of section titles; «Detalles» opens a course card and its
 * action goes to the course; a row's arrow moves it; the community bar opens; «Mi Perfil» is visible
 * at 390 px; and after «Diseño actual» today's panel is back. An admin (who has the feedback button)
 * checks that no footer link meets the round feedback button at 1,024 px and at 390 px.
 *
 * Synthetic *@qa.local.test users, school, community, instructor and courses on a local database only,
 * deleted by exact id in afterAll.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const RUN = randomBytes(4).toString('hex');
const PASSWORD = `Panel-${randomBytes(12).toString('base64url')}!a1`;
const LOCAL_HOSTS = ['127.0.0.1', 'localhost', '::1'];
const LOOK_PAGE = '/configuracion/apariencia';
const SCHOOL = 9_600_000 + (parseInt(RUN.slice(0, 4), 16) % 100_000);
const tester = { id: '', email: `look-panel-${RUN}@qa.local.test` };
const peer = { id: '', email: `look-panel-peer-${RUN}@qa.local.test` };
const admin = { id: '', email: `look-panel-admin-${RUN}@qa.local.test` };
const ids = {
  community: '',
  instructor: randomUUID(),
  courses: [randomUUID(), randomUUID(), randomUUID(), randomUUID()],
};
let service: SupabaseClient;

function must<T>(label: string, result: { data: T; error: { message: string } | null }): T {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
}

async function createAccount(account: { id: string; email: string }, role: string, extra: Record<string, unknown> = {}) {
  const created = await service.auth.admin.createUser({ email: account.email, password: PASSWORD, email_confirm: true });
  if (created.error) throw new Error(`createUser: ${created.error.message}`);
  account.id = created.data.user.id;
  must('profile', await service.from('profiles').upsert(
    {
      id: account.id,
      email: account.email,
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
  must('roles', await service.from('user_roles').insert({ user_id: account.id, role_type: role, is_active: true, ...extra }));
}

async function deleteAccount(account: { id: string }) {
  if (!account.id) return;
  await service.from('course_enrollments').delete().eq('user_id', account.id);
  await service.from('course_assignments').delete().eq('teacher_id', account.id);
  await service.from('user_roles').delete().eq('user_id', account.id);
  await service.from('profiles').delete().eq('id', account.id);
  await service.auth.admin.deleteUser(account.id);
}

async function signedIn(browser: Browser, account: { email: string }, viewport = { width: 1366, height: 768 }) {
  const context = await browser.newContext({ viewport, storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  const problems: string[] = [];
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  await page.goto('/login');
  await page.getByPlaceholder('tu@email.com').fill(account.email);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole('button', { name: /iniciar sesión/i }).click();
  await expect(page).toHaveURL(/\/dashboard(\?|$)/, { timeout: 60_000 });
  return { context, page, problems };
}

const lookOf = (page: Page) => page.evaluate(() => document.documentElement.getAttribute('data-look'));

async function panel(page: Page) {
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: /^¡Hola, Persona!/ })).toBeVisible({ timeout: 60_000 });
}

async function chooseLook(page: Page, label: RegExp) {
  await page.goto(LOOK_PAGE);
  await expect(page.getByRole('heading', { name: 'Apariencia' })).toBeVisible({ timeout: 60_000 });
  await page.getByLabel(label).check();
  await page.getByTestId('look-save').click();
  await expect(page.getByTestId('look-saved')).toBeVisible();
}

/** The section titles of the panel (the `<h2>`s inside the page's main area), as a sorted list. */
const sectionTitles = (page: Page) =>
  page
    .locator('main h2')
    .evaluateAll((elements) => elements.map((element) => (element.textContent ?? '').trim()).sort());

/** No footer link or button meets the round feedback button. */
async function footerClearOfFeedback(page: Page) {
  const feedback = page.getByRole('button', { name: 'Enviar feedback' });
  await expect(feedback).toBeVisible({ timeout: 60_000 });
  const footer = page.getByTestId('footer-nuevo');
  await footer.scrollIntoViewIfNeeded();
  const overlaps = await page.evaluate(() => {
    const button = document.querySelector('button[aria-label="Enviar feedback"]')!.getBoundingClientRect();
    const items = Array.from(document.querySelectorAll('[data-testid="footer-nuevo"] a, [data-testid="footer-nuevo"] button, [data-testid="footer-nuevo"] span'));
    return items
      .map((item) => ({ text: (item.textContent ?? '').trim(), box: item.getBoundingClientRect() }))
      .filter(({ box }) => box.left < button.right && box.right > button.left && box.top < button.bottom && box.bottom > button.top)
      .map(({ text }) => text);
  });
  expect(overlaps).toEqual([]);
}

test.describe.configure({ mode: 'serial', timeout: 300_000 });

test.describe('the new «Mi Panel» (redesign 6B)', () => {
  test.beforeAll(async () => {
    test.setTimeout(120_000);
    if (!SUPABASE_URL || !SERVICE_KEY) throw new Error('Supabase URL and service key are required');
    const target = new URL(SUPABASE_URL);
    if (!LOCAL_HOSTS.includes(target.hostname.replace(/^\[|\]$/g, ''))) throw new Error('look-panel refuses a non-local database');
    if (!process.env.CI && ['54321', '54322'].includes(target.port)) throw new Error('look-panel refuses the shared default stack');
    service = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    must('school', await service.from('schools').insert({ id: SCHOOL, name: `Colegio Sintetico Panel ${RUN}`, tenant_kind: 'client' }));
    const community = must(
      'community',
      await service.from('growth_communities').insert({ name: `Comunidad Sintetica Panel ${RUN}`, school_id: SCHOOL }).select('id').single()
    ) as { id: string };
    ids.community = community.id;
    await createAccount(tester, 'docente', { school_id: SCHOOL, community_id: ids.community });
    await createAccount(peer, 'docente', { school_id: SCHOOL, community_id: ids.community });
    await createAccount(admin, 'admin');

    must('instructor', await service.from('instructors').insert({ id: ids.instructor, full_name: 'Relatora Sintetica Panel' }));
    for (const [index, id] of ids.courses.entries()) {
      must('course', await service.from('courses').insert({
        id,
        title: `Curso Sintetico Panel ${index + 1} ${RUN}`,
        description: `Descripción sintética ${index + 1}`,
        instructor_id: ids.instructor,
        status: 'published',
      }));
      must('assignment', await service.from('course_assignments').insert({ course_id: id, teacher_id: tester.id }));
    }
    // The first course is started: «Continuar Aprendiendo»; the other three are «Mis Cursos Abiertos».
    must('enrollment', await service.from('course_enrollments').insert({
      user_id: tester.id,
      course_id: ids.courses[0],
      status: 'active',
      access_origin: 'independent',
      progress_percentage: 40,
    }));
  });

  test.afterAll(async () => {
    if (!service) return;
    await deleteAccount(tester);
    await deleteAccount(peer);
    await deleteAccount(admin);
    await service.from('course_assignments').delete().in('course_id', ids.courses);
    await service.from('course_enrollments').delete().in('course_id', ids.courses);
    await service.from('courses').delete().in('id', ids.courses);
    await service.from('instructors').delete().eq('id', ids.instructor);
    if (ids.community) {
      await service.from('community_workspaces').delete().eq('community_id', ids.community);
      await service.from('growth_communities').delete().eq('id', ids.community);
    }
    await service.from('schools').delete().eq('id', SCHOOL);
  });

  test('a tester gets the new panel with the same sections; cards, rows and the community work; today\'s panel comes back', async ({ browser }) => {
    const { context, page, problems } = await signedIn(browser, tester);

    // Today's panel first, once its rows and its community have arrived.
    await panel(page);
    expect(await lookOf(page)).toBeNull();
    await expect(page.getByRole('heading', { name: 'Mis Cursos Abiertos' })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole('heading', { name: 'Continuar Aprendiendo' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Mi Comunidad de Crecimiento' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Últimas Noticias' })).toBeVisible();
    const todays = await sectionTitles(page);
    expect(todays.length).toBeGreaterThan(4);

    // The new look.
    await chooseLook(page, /Diseño nuevo \(en construcción\)/);
    await panel(page);
    await expect.poll(() => lookOf(page), { timeout: 60_000 }).toBe('nuevo');
    await expect(page.getByTestId('panel-nuevo')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('panel-section-open')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('panel-community')).toBeVisible();
    await expect.poll(() => sectionTitles(page), { timeout: 60_000 }).toEqual(todays);

    // «Detalles» opens a course card; its action goes to the course.
    const first = page.getByTestId(`panel-course-open-${ids.courses[1]}`);
    const toggle = page.getByTestId(`panel-course-open-${ids.courses[1]}-details-toggle`);
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByTestId(`panel-course-open-${ids.courses[1]}-details`)).toBeVisible();
    await expect(first.getByText('Descripción sintética 2')).toBeVisible();
    await page.getByTestId(`panel-course-open-${ids.courses[1]}-action`).click();
    await expect(page).toHaveURL(new RegExp(`/student/course/${ids.courses[1]}`), { timeout: 60_000 });

    // A row's arrow moves it (three cards do not fit the main column at 1,366 px).
    await panel(page);
    const row = page.getByTestId('panel-section-open-row');
    const right = page.getByTestId('panel-section-open-right');
    await expect(right).toBeEnabled({ timeout: 60_000 });
    await expect(page.getByTestId('panel-section-open-left')).toBeDisabled();
    const before = await row.evaluate((element) => element.scrollLeft);
    await right.click();
    await expect.poll(() => row.evaluate((element) => element.scrollLeft)).toBeGreaterThan(before);
    await expect(page.getByTestId('panel-section-open-left')).toBeEnabled();

    // The community bar opens, with its members.
    const bar = page.getByTestId('panel-community-bar');
    await expect(bar).toHaveAttribute('aria-expanded', 'false');
    await bar.click();
    await expect(bar).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByTestId('panel-community-open')).toBeVisible();
    await expect(page.getByTestId(`panel-member-${peer.id}`)).toBeVisible();
    await expect(page.getByTestId(`panel-member-${tester.id}`).getByText('Tú')).toBeVisible();

    // «Mi Perfil» on a phone.
    await page.setViewportSize({ width: 390, height: 844 });
    await panel(page);
    await expect(page.getByTestId('panel-nuevo-profile')).toBeVisible();
    await expect(page.getByTestId('panel-nuevo-profile')).toHaveAttribute('href', '/profile');

    // Back to today's look: today's panel.
    await page.setViewportSize({ width: 1366, height: 768 });
    await chooseLook(page, /Diseño actual/);
    await panel(page);
    expect(await lookOf(page)).toBeNull();
    await expect(page.getByTestId('panel-nuevo')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Mis Cursos Abiertos' })).toBeVisible({ timeout: 60_000 });
    await expect.poll(() => sectionTitles(page), { timeout: 60_000 }).toEqual(todays);

    expect(problems).toEqual([]);
    await context.close();
  });

  test('no footer link meets the feedback button, at 1,024 px and at 390 px', async ({ browser }) => {
    const { context, page, problems } = await signedIn(browser, admin, { width: 1024, height: 768 });
    await chooseLook(page, /Diseño nuevo \(en construcción\)/);
    await panel(page);
    await expect.poll(() => lookOf(page), { timeout: 60_000 }).toBe('nuevo');
    await footerClearOfFeedback(page);

    await page.setViewportSize({ width: 390, height: 844 });
    await panel(page);
    await footerClearOfFeedback(page);

    await chooseLook(page, /Diseño actual/);
    expect(problems).toEqual([]);
    await context.close();
  });
});
