import { test, expect as baseExpect, type Browser, type Locator, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseEnv } from 'dotenv';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { E2E_USERS, ensureStorageState, storageStatePath, type FixtureKey } from './helpers/auth';

/**
 * Characterization tests for the panel (`/dashboard`, «Mi Panel») AS IT IS TODAY.
 *
 * Why: the redesign lifts the panel's data code into a hook and adds a new layout behind a
 * per-user switch, keeping today's markup as the classic view. These tests record what the
 * classic panel does — which sections each role gets, their content for the seeded sample
 * data, where every button and link goes, which API addresses the page calls on load, and
 * what changes at phone width — so that any later loss of function fails here. They
 * deliberately include behaviour that looks odd (each such pin says so in a comment); a
 * deliberate change of behaviour must update the pin in the same change.
 *
 * Selectors: roles, visible Spanish text and the frame's existing `data-testid`s only — never
 * class names or layout. The page itself has no `data-testid`; a section is found as the
 * `<section>` element that holds its heading (see `sectionOf`).
 *
 * Data: `beforeAll` runs the redesign harness seed for courses (10) and community / news /
 * notifications (40) on top of the made-up accounts of scripts/ci/e2e-fixtures.json. The
 * seed refuses a non-local stack and is safe to run twice. Nothing below writes: pop-ups that
 * could save are closed with «Cancelar» / «Cerrar», and destinations that could write
 * («Ver Espacio Completo», «Ver Perfil Completo», «Ver canal») are pinned by `href` only.
 *
 * Not pinned on purpose: anything relative to "now" (news / video / badge / route dates —
 * the app server's clock may stand still while the browser's does not), counts that depend
 * on seed modules this spec does not run (school-wide «Educadores Activos», the consultor's
 * and the generation's statistics), and the top learner where the server's activity score
 * (which uses the server's "now") decides between several people.
 */

const ROOT = join(__dirname, '..', '..');
const fileEnv: Record<string, string> = (() => {
  try {
    return parseEnv(readFileSync(join(ROOT, '.env.local'), 'utf8'));
  } catch {
    return {};
  }
})();
const envValue = (key: string): string | undefined => process.env[key] || fileEnv[key];

// The shared stack can be slow while other browsers walk it: generous, web-first waits only.
test.setTimeout(240_000);
const expect = baseExpect.configure({ timeout: 45_000 });
test.use({ actionTimeout: 30_000, navigationTimeout: 90_000 });

// ---------------------------------------------------------------- seeded sample content
// Ids and texts written by scripts/redesign/harness/seed/10-cursos.mjs and 40-comunidad.mjs.
const COURSE = {
  c1: { id: '5eed0010-0000-4000-8000-000000000101', title: 'Curso Sintetico E2E — Evaluación formativa en el aula' },
  c2: { id: '5eed0010-0000-4000-8000-000000000102', title: 'Curso Sintetico E2E — Convivencia escolar y clima de aula' },
  c3: { id: '5eed0010-0000-4000-8000-000000000103', title: 'Curso Sintetico E2E — Aprendizaje basado en proyectos' },
  c4: { id: '5eed0010-0000-4000-8000-000000000104', title: 'Curso Sintetico E2E — Liderazgo pedagógico' },
  c5: { id: '5eed0010-0000-4000-8000-000000000105', title: 'Curso Sintetico E2E — Lectura en voz alta (borrador)' },
};
const PATH = {
  p1: { id: '5eed0010-0000-4000-8000-000000000801', name: 'Ruta Sintetica E2E — Evaluación para el aprendizaje' },
  p2: { id: '5eed0010-0000-4000-8000-000000000802', name: 'Ruta Sintetica E2E — Convivencia y liderazgo' },
};
const UPCOMING = [
  'Curso Sintetico E2E — Lectura y escritura en todas las asignaturas',
  'Curso Sintetico E2E — Matemática con material concreto',
  'Curso Sintetico E2E — Inclusión y diseño universal',
];
const UPCOMING_HIDDEN = 'Curso Sintetico E2E — Ciudadanía digital (en pausa)';
const NEWS = [
  { title: 'Encuentro sintético de Comunidades de Crecimiento 2026', slug: 'encuentro-sintetico-de-comunidades-de-crecimiento-2026' },
  { title: 'Jornada de lectura compartida en el Colegio Sintetico E2E', slug: 'jornada-sintetica-de-lectura-compartida-2026' },
  { title: 'Abrimos un nuevo ciclo de formación docente', slug: 'nuevo-ciclo-sintetico-de-formacion-docente' },
];
const SCHOOL_NAME = 'Colegio Sintetico E2E';
const COMMUNITY_ZOOM = 'e2e00000-0000-4000-8000-000000000c01'; // gcLeader's growth community
const COMMUNITY_ROLE = 'e2e00000-0000-4000-8000-000000000c02'; // communityManager's growth community

// ---------------------------------------------------------------- seed + service reads
let service: SupabaseClient | null = null;
function serviceClient(): SupabaseClient {
  if (service) return service;
  const url = envValue('NEXT_PUBLIC_SUPABASE_URL');
  const key = envValue('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('[panel-pin] NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set (env or .env.local)');
  service = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return service;
}

async function profileId(key: FixtureKey): Promise<string> {
  const { data, error } = await serviceClient().from('profiles').select('id').eq('email', E2E_USERS[key].email).single();
  if (error || !data) throw new Error(`[panel-pin] no profile for ${key}: ${error?.message}`);
  return data.id as string;
}

test.beforeAll(() => {
  // The harness seed reads the stack from these variables when all three are set (inside
  // scripts/ci/e2e-local.sh), otherwise from the recorded local copy; it refuses anything
  // that is not on this machine.
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const key of ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_DB_URL']) {
    const value = envValue(key);
    if (value) env[key] = value;
  }
  execFileSync(process.execPath, [join(ROOT, 'scripts', 'redesign', 'harness', 'seed.mjs'), '10', '40'], {
    cwd: ROOT,
    env,
    stdio: 'pipe',
    timeout: 120_000,
  });
});

// ---------------------------------------------------------------- helpers
/** The `<section>` that holds a heading with exactly this text. */
function sectionOf(page: Page, heading: string): Locator {
  return page
    .getByRole('main')
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: heading, exact: true }) })
    .last();
}

/** Course / route titles of a row, in order, each once (a course card prints its title twice today). */
async function titlesIn(row: Locator): Promise<string[]> {
  const all = await row.getByRole('heading', { level: 3 }).allInnerTexts();
  return [...new Set(all.map((t) => t.trim()))];
}

/**
 * Opens the panel and waits until its loading is over: the greeting has replaced «Cargando...»
 * and the calls whose answers decide which sections exist (courses and routes come last in the
 * page's main loader, the badges after it) have answered. Returns every address requested.
 */
async function openPanel(page: Page): Promise<string[]> {
  const calls: string[] = [];
  page.on('request', (req) => {
    const url = new URL(req.url());
    calls.push(`${req.method()} ${url.pathname}${url.search}`);
  });
  const wait = { timeout: 120_000 };
  const paths = page.waitForResponse((r) => r.url().includes('/api/learning-paths/my-paths'), wait);
  const badges = page.waitForResponse((r) => r.url().includes('user_badges'), wait);
  const stats = page.waitForResponse((r) => r.url().includes('/api/dashboard/stats'), wait);
  // 'commit': the page's own readiness is asserted below; the window's load event can be held up
  // by unrelated assets while the shared stack is busy.
  await page.goto('/dashboard', { waitUntil: 'commit' });
  await expect(page).toHaveURL(/\/dashboard$/);
  await Promise.all([paths, badges, stats]);
  await expect(page.getByRole('main').getByRole('heading', { level: 1, name: /^¡Hola, / })).toBeVisible();
  await expect(page.getByText('Cargando...', { exact: true })).toHaveCount(0);
  return calls;
}

/**
 * Clicks and waits until the address has become `url` at least once. The destination page is
 * not the panel's business (the course page can bounce to /login on its own when its client
 * has not read the session yet), so only the move itself is asserted.
 */
async function clickLeadsTo(page: Page, target: Locator, url: RegExp): Promise<void> {
  await Promise.all([page.waitForURL(url, { waitUntil: 'commit' }), target.click()]);
}

interface Sections {
  firstName: string;
  statsLabel: string;
  community: string | null; // the collapsed header's line, e.g. 'Colegio Sintetico E2E • 1 miembros'
  proposals: boolean;
  badges: string | null; // the summary line under «Mis Logros»
  continueLearning: string[] | null;
  routes: string[] | null;
  openCourses: string[] | null;
}

async function assertSections(page: Page, s: Sections): Promise<void> {
  const main = page.getByRole('main');

  // Welcome band
  await expect(main.getByRole('heading', { level: 1 })).toHaveText(`¡Hola, ${s.firstName}!`);
  await expect(main.getByText('Bienvenido de vuelta al hub de transformación de tu colegio')).toBeVisible();
  await expect(main.getByRole('link', { name: 'Mi Perfil' })).toBeVisible();

  // Growth community (collapsed by default)
  const communityHeading = main.getByRole('heading', { name: 'Mi Comunidad de Crecimiento' });
  if (s.community) {
    await expect(communityHeading).toBeVisible();
    await expect(main.getByRole('button', { name: /Mi Comunidad de Crecimiento/ })).toContainText(s.community);
    await expect(main.getByRole('link', { name: /Ver Espacio Completo/ })).toHaveCount(0);
  } else {
    await expect(communityHeading).toHaveCount(0);
  }

  // News: the three latest published articles, newest first
  await expect(sectionOf(page, 'Últimas Noticias').getByRole('heading', { level: 3 })).toHaveText(NEWS.map((n) => n.title));

  // Videos: two cards that link to YouTube
  const videos = sectionOf(page, 'Videos Recientes');
  await expect(videos.locator('a[href^="https://www.youtube.com/watch?v="]')).toHaveCount(2);

  // Statistics: the title is sent by the server per role
  const stats = sectionOf(page, s.statsLabel);
  await expect(stats).toBeVisible();
  await expect(stats).toContainText('Educadores Activos');
  await expect(stats).toContainText('en tu alcance');
  await expect(stats).toContainText('Curso Más Completado');
  await expect(stats).toContainText('Usuario Destacado');

  // Upcoming courses: the active ones in display order; the inactive one never shows
  const upcoming = sectionOf(page, 'Próximos Cursos');
  await expect(upcoming.getByText('Cursos que podrás tomar próximamente')).toBeVisible();
  await expect(upcoming.getByRole('heading', { level: 3 })).toHaveText(UPCOMING);
  await expect(main.getByText(UPCOMING_HIDDEN)).toHaveCount(0);

  // Course proposals (admin and consultor only)
  const proposals = main.getByRole('heading', { name: 'Propuestas de Cursos', exact: true });
  if (s.proposals) {
    await expect(proposals).toBeVisible();
    await expect(sectionOf(page, 'Propuestas de Cursos').getByText('Me gustaría realizar un curso en la plataforma')).toBeVisible();
  } else {
    await expect(proposals).toHaveCount(0);
  }

  // Mis Logros — not drawn at all for an account with no badges (today's behaviour)
  const badges = main.getByRole('heading', { name: 'Mis Logros', exact: true });
  if (s.badges) {
    await expect(badges).toBeVisible();
    await expect(sectionOf(page, 'Mis Logros').getByText(s.badges, { exact: true })).toBeVisible();
  } else {
    await expect(badges).toHaveCount(0);
  }

  // The three course / route rows: shown only when they have something
  for (const [heading, expected] of [
    ['Continuar Aprendiendo', s.continueLearning],
    ['Mis Rutas de Aprendizaje', s.routes],
    ['Mis Cursos Abiertos', s.openCourses],
  ] as const) {
    const h = main.getByRole('heading', { name: heading, exact: true });
    if (expected) {
      await expect(h).toBeVisible();
      await expect.poll(() => titlesIn(sectionOf(page, heading))).toEqual(expected);
    } else {
      await expect(h).toHaveCount(0);
    }
  }
}

/** Addresses the panel calls on load, as `METHOD /path?query`, compared without the host. */
function pathsOnly(calls: string[]): string[] {
  return [...new Set(calls.map((c) => c.replace(/\?.*$/, '')))];
}

// Calls every signed-in account makes when the panel opens.
const COMMON_CALLS = [
  'GET /api/news?limit=3',
  'GET /api/youtube/latest?limit=2',
  'GET /api/dashboard/stats',
  'GET /api/upcoming-courses',
  'GET /api/learning-paths/my-paths',
];
// Direct database reads of the page's own loader (pathnames of the Supabase REST API).
const COMMON_READS = ['GET /rest/v1/profiles', 'GET /rest/v1/user_roles', 'GET /rest/v1/user_badges_with_details'];

/**
 * One sign-in per account per run of this file (the phone blocks reuse the desktop state), and
 * one retry: the sign-in form is shared with other browsers on a busy local copy, and a sign-in
 * that fails here says nothing about the panel.
 */
const signedInThisRun = new Set<FixtureKey>();
async function signedIn(browser: Browser, key: FixtureKey): Promise<void> {
  if (signedInThisRun.has(key) && existsSync(storageStatePath(key))) return;
  try {
    await ensureStorageState(browser, key);
  } catch {
    await ensureStorageState(browser, key);
  }
  signedInThisRun.add(key);
}

function asRole(key: FixtureKey, body: () => void): void {
  test.describe(`as ${key} (${E2E_USERS[key].role})`, () => {
    test.use({ storageState: storageStatePath(key) });
    test.beforeAll(async ({ browser }) => {
      test.setTimeout(240_000);
      await signedIn(browser, key);
    });
    body();
  });
}

// ================================================================= docente
test.describe('panel — desktop', () => {
  asRole('docente', () => {
    test('sections and their content', async ({ page }) => {
      await openPanel(page);
      await assertSections(page, {
        firstName: 'Docente',
        statsLabel: 'Estadísticas de tu Escuela',
        community: null,
        proposals: false,
        badges: '2 insignias obtenidas · 120 puntos',
        // Assigned courses with an enrolment, most progress first. The completed course is not
        // shown in any row of the panel (today's behaviour).
        continueLearning: [COURSE.c1.title, COURSE.c3.title],
        routes: [PATH.p1.name],
        openCourses: null,
      });
      const main = page.getByRole('main');
      await expect(main.getByText('Primera ruta iniciada')).toBeVisible();
      await expect(sectionOf(page, 'Mis Logros').getByText('Curso completado', { exact: true })).toBeVisible();
      for (const row of ['Continuar Aprendiendo', 'Mis Rutas de Aprendizaje']) {
        await expect(sectionOf(page, row).getByText(COURSE.c2.title)).toHaveCount(0);
      }

      // School-scoped statistics: the most completed course of the school, with its count
      const stats = sectionOf(page, 'Estadísticas de tu Escuela');
      await expect(stats).toContainText(
        new RegExp(`Curso Más Completado\\s*${COURSE.c2.title}\\s*Relator: Instructor Sintetico E2E\\s*2\\s*completaciones`)
      );
      await expect(stats).toContainText('cursos completados');

      // The route card: progress counts courses completed in the route, not lessons
      const route = sectionOf(page, 'Mis Rutas de Aprendizaje');
      await expect(route).toContainText('0 de 3 cursos');
      await expect(route.getByText('Comenzar ruta')).toBeVisible();
    });

    test('«Mi Perfil» goes to /profile', async ({ page }) => {
      await openPanel(page);
      const link = page.getByRole('main').getByRole('link', { name: 'Mi Perfil' });
      await expect(link).toHaveAttribute('href', '/profile');
      await link.click();
      await expect(page).toHaveURL(/\/profile$/);
    });

    test('news: «Ver todas» goes to /noticias; a card opens the article in a new tab', async ({ page, context }) => {
      await openPanel(page);
      const news = sectionOf(page, 'Últimas Noticias');
      for (const n of NEWS) {
        const card = news.getByRole('link', { name: new RegExp(n.title) });
        await expect(card).toHaveAttribute('href', `/noticias/${n.slug}`);
        // Odd but today's behaviour: an internal page opened in a new tab.
        await expect(card).toHaveAttribute('target', '_blank');
      }
      const [popup] = await Promise.all([
        context.waitForEvent('page'),
        news.getByRole('link', { name: new RegExp(NEWS[0].title) }).click(),
      ]);
      await expect(popup).toHaveURL(new RegExp(`/noticias/${NEWS[0].slug}$`));
      await popup.close();
      await expect(page).toHaveURL(/\/dashboard$/);

      const all = news.getByRole('link', { name: 'Ver todas' });
      await expect(all).toHaveAttribute('href', '/noticias');
      await all.click();
      await expect(page).toHaveURL(/\/noticias$/);
    });

    test('videos: «Ver canal» and each video card open YouTube in a new tab', async ({ page }) => {
      await openPanel(page);
      const videos = sectionOf(page, 'Videos Recientes');
      const channel = videos.getByRole('link', { name: 'Ver canal' });
      await expect(channel).toHaveAttribute('href', 'https://www.youtube.com/@NuevaEducacionFundacion');
      await expect(channel).toHaveAttribute('target', '_blank');
      const cards = videos.locator('a[href^="https://www.youtube.com/watch?v="]');
      await expect(cards).toHaveCount(2);
      for (const card of await cards.all()) {
        await expect(card).toHaveAttribute('target', '_blank');
        await expect(card.getByRole('heading', { level: 3 })).not.toHaveText('');
      }
    });

    test('badges: «Ver todos» points at /mi-aprendizaje/logros, which does not exist', async ({ page }) => {
      await openPanel(page);
      const link = sectionOf(page, 'Mis Logros').getByRole('link', { name: 'Ver todos' });
      await expect(link).toHaveAttribute('href', '/mi-aprendizaje/logros');
      // Broken today (inventory: dead link) — pinned so a fix is a deliberate change here.
      const res = await page.request.get('/mi-aprendizaje/logros');
      expect(res.status()).toBe(404);
    });

    test('course cards: hovering shows the action; «Continuar» opens the course', async ({ page }) => {
      await openPanel(page);
      const row = sectionOf(page, 'Continuar Aprendiendo');

      // A course not started yet offers «Comenzar»
      await row.getByRole('heading', { name: COURSE.c3.title }).first().hover();
      await expect(row.getByRole('button', { name: 'Comenzar' })).toBeVisible();
      await page.getByRole('main').getByRole('heading', { level: 1 }).hover();
      await expect(row.getByRole('button', { name: 'Comenzar' })).toHaveCount(0);

      // A course in progress offers «Continuar», which opens /student/course/{id}
      await row.getByRole('heading', { name: COURSE.c1.title }).first().hover();
      const action = row.getByRole('button', { name: 'Continuar' });
      await expect(action).toBeVisible();
      // The expanded card shows the description (the docente's course query does not read the
      // learning objectives, so «Objetivos de aprendizaje» never shows for non-admins).
      await expect(row.getByText(/^Herramientas prácticas para recoger evidencia/)).toBeVisible();
      await clickLeadsTo(page, action, new RegExp(`/student/course/${COURSE.c1.id}$`));
    });

    test('route card opens the route; «Ver todas» points at /mi-aprendizaje', async ({ page }) => {
      await openPanel(page);
      const routes = sectionOf(page, 'Mis Rutas de Aprendizaje');
      await expect(routes.getByRole('link', { name: 'Ver todas' })).toHaveAttribute('href', '/mi-aprendizaje');
      await clickLeadsTo(page, routes.getByRole('heading', { name: PATH.p1.name }), new RegExp(`/mi-aprendizaje/ruta/${PATH.p1.id}$`));
    });

    test('upcoming course cards show the release month on hover and lead nowhere', async ({ page }) => {
      await openPanel(page);
      const upcoming = sectionOf(page, 'Próximos Cursos');
      await expect(upcoming.getByText('Próximamente', { exact: true })).toHaveCount(3);
      await expect(upcoming.getByText('marzo de 2030', { exact: true })).toBeVisible();
      await upcoming.getByRole('heading', { name: UPCOMING[0] }).hover();
      await expect(upcoming.getByText('Disponible en marzo de 2030')).toBeVisible();
      await upcoming.getByRole('heading', { name: UPCOMING[0] }).click();
      await expect(page).toHaveURL(/\/dashboard$/);
      await expect(upcoming.getByRole('link')).toHaveCount(0);
    });

    test('API addresses called on load', async ({ page }) => {
      const calls = await openPanel(page);
      await expect.poll(() => calls).toEqual(expect.arrayContaining(COMMON_CALLS));
      const paths = pathsOnly(calls);
      expect(paths).toEqual(
        expect.arrayContaining([...COMMON_READS, 'GET /rest/v1/course_assignments', 'GET /rest/v1/course_enrollments'])
      );
      // Not for a docente: proposals, the community members, the whole catalogue.
      expect(paths).not.toContain('GET /api/course-proposals');
      expect(paths).not.toContain('GET /api/community/members');
      expect(paths).not.toContain('GET /rest/v1/courses');
    });

    test('menu: shows, without the community and QA entries; «Mi pasantía» and «Mis Registros» follow their checks', async ({ page }) => {
      await openPanel(page);
      const sidebar = page.getByTestId('global-sidebar');
      await expect(sidebar).toBeVisible();
      await expect(page.getByTestId('sidebar-item-dashboard')).toContainText('Mi Panel');
      await expect(page.getByTestId('sidebar-item-mi-aprendizaje')).toBeVisible();

      // «Mi pasantía» appears when /api/pasantias/mine says the account is a traveller
      // (true on the harness copy, whose module 60 is not run here; false on a fresh stack).
      const mine = await page.request.get('/api/pasantias/mine');
      expect(mine.ok()).toBe(true);
      const { hasPasantia } = (await mine.json()) as { hasPasantia?: boolean };
      if (hasPasantia === true) {
        await expect(page.getByTestId('sidebar-item-mi-pasantia')).toContainText('Mi pasantía');
      } else {
        await expect(page.getByTestId('sidebar-item-mi-pasantia')).toHaveCount(0);
      }

      // «Mis Registros» (under «Gestor de Cambio») appears when the account has assigned registros.
      const { count, error } = await serviceClient()
        .from('assessment_instance_assignees')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', await profileId('docente'));
      expect(error).toBeNull();
      if ((count ?? 0) > 0) {
        await page.getByTestId('sidebar-item-assessment-builder').click();
        await expect(sidebar.getByText('Mis Registros', { exact: true })).toBeVisible();
      } else {
        await expect(sidebar.getByText('Mis Registros', { exact: true })).toHaveCount(0);
      }

      await expect(page.getByTestId('sidebar-item-workspace')).toHaveCount(0);
      await expect(page.getByTestId('sidebar-item-qa-testing')).toHaveCount(0);
    });
  });

  // =============================================================== admin
  asRole('admin', () => {
    test('sections and their content', async ({ page }) => {
      await openPanel(page);
      await assertSections(page, {
        firstName: 'Admin',
        statsLabel: 'Estadísticas de la Plataforma',
        community: null,
        proposals: true,
        badges: null,
        continueLearning: null,
        routes: null,
        // Odd but today's behaviour: an admin gets the WHOLE catalogue, drafts included,
        // newest first, all as not started, under «Mis Cursos Abiertos».
        openCourses: [COURSE.c5.title, COURSE.c4.title, COURSE.c3.title, COURSE.c2.title, COURSE.c1.title],
      });
      await expect(sectionOf(page, 'Estadísticas de la Plataforma')).toContainText(COURSE.c2.title);
      const proposals = sectionOf(page, 'Propuestas de Cursos');
      await expect(proposals.getByRole('heading', { name: 'Sin propuestas aún' })).toBeVisible();
      await expect(proposals.getByText('Sé el primero en proponer un nuevo curso')).toBeVisible();
    });

    test('course proposals: «Nueva Propuesta» and «Crear Propuesta» open the form, «Cancelar» closes it', async ({ page }) => {
      await openPanel(page);
      const proposals = sectionOf(page, 'Propuestas de Cursos');
      for (const name of ['Nueva Propuesta', 'Crear Propuesta']) {
        await proposals.getByRole('button', { name }).click();
        const dialog = page.getByRole('dialog');
        await expect(dialog.getByRole('heading', { name: 'Nueva Propuesta de Curso' })).toBeVisible();
        await expect(dialog.getByRole('button', { name: 'Enviar Propuesta' })).toBeVisible();
        await dialog.getByRole('button', { name: 'Cancelar' }).click();
        await expect(page.getByRole('dialog')).toHaveCount(0);
      }
    });

    test('course row arrows scroll sideways', async ({ page }) => {
      await openPanel(page);
      const row = sectionOf(page, 'Mis Cursos Abiertos');
      await row.scrollIntoViewIfNeeded();
      const first = row.getByRole('heading', { name: COURSE.c5.title }).first();
      const last = row.getByRole('heading', { name: COURSE.c1.title }).first();
      await expect(first).toBeInViewport();
      await expect(last).not.toBeInViewport();
      // Today the arrows only take clicks while the pointer is over the row.
      await row.getByRole('heading', { name: 'Mis Cursos Abiertos' }).hover();
      await row.getByRole('button', { name: 'Desplazar derecha' }).click();
      await expect(last).toBeInViewport();
      await row.getByRole('heading', { name: 'Mis Cursos Abiertos' }).hover();
      await row.getByRole('button', { name: 'Desplazar izquierda' }).click();
      await expect(first).toBeInViewport();
    });

    test('a course card of «Mis Cursos Abiertos» offers «Comenzar» and opens the course', async ({ page }) => {
      await openPanel(page);
      const row = sectionOf(page, 'Mis Cursos Abiertos');
      await row.getByRole('heading', { name: COURSE.c5.title }).first().hover();
      const action = row.getByRole('button', { name: 'Comenzar' });
      await expect(action).toBeVisible();
      await clickLeadsTo(page, action, new RegExp(`/student/course/${COURSE.c5.id}$`));
    });

    test('API addresses called on load', async ({ page }) => {
      const calls = await openPanel(page);
      await expect.poll(() => calls).toEqual(expect.arrayContaining([...COMMON_CALLS, 'GET /api/course-proposals']));
      const paths = pathsOnly(calls);
      expect(paths).toEqual(expect.arrayContaining([...COMMON_READS, 'GET /rest/v1/courses']));
      // The admin reads the catalogue, not their own assignments.
      expect(paths).not.toContain('GET /rest/v1/course_assignments');
    });

    test('menu: shows with «Espacio Colaborativo» and «QA Testing»', async ({ page }) => {
      await openPanel(page);
      await expect(page.getByTestId('global-sidebar')).toBeVisible();
      await expect(page.getByTestId('sidebar-item-dashboard')).toContainText('Mi Panel');
      await expect(page.getByTestId('sidebar-item-workspace')).toContainText('Espacio Colaborativo');
      await expect(page.getByTestId('sidebar-item-qa-testing')).toContainText('QA Testing');
    });
  });

  // =============================================================== consultor
  asRole('consultorAssigned', () => {
    test('sections and their content', async ({ page }) => {
      await openPanel(page);
      await assertSections(page, {
        firstName: 'Consultor',
        statsLabel: 'Estadísticas de tus Estudiantes',
        community: null,
        proposals: true,
        badges: null,
        continueLearning: null,
        routes: null,
        openCourses: null,
      });
    });

    test('API addresses called on load', async ({ page }) => {
      const calls = await openPanel(page);
      await expect.poll(() => calls).toEqual(expect.arrayContaining([...COMMON_CALLS, 'GET /api/course-proposals']));
      expect(pathsOnly(calls)).toEqual(expect.arrayContaining([...COMMON_READS, 'GET /rest/v1/course_assignments']));
    });

    test('menu: shows with «Espacio Colaborativo» (consultors see it without a community), without «QA Testing»', async ({ page }) => {
      await openPanel(page);
      await expect(page.getByTestId('sidebar-item-dashboard')).toContainText('Mi Panel');
      await expect(page.getByTestId('sidebar-item-workspace')).toContainText('Espacio Colaborativo');
      await expect(page.getByTestId('sidebar-item-qa-testing')).toHaveCount(0);
    });
  });

  // =============================================================== equipo_directivo
  asRole('directivo', () => {
    test('sections and their content', async ({ page }) => {
      await openPanel(page);
      await assertSections(page, {
        firstName: 'Equipo',
        statsLabel: 'Estadísticas de tu Escuela',
        community: null,
        proposals: false,
        badges: null,
        // Enrolled in two courses through a route but with no direct assignment: no course row.
        continueLearning: null,
        routes: [PATH.p2.name],
        openCourses: null,
      });
      await expect(sectionOf(page, 'Estadísticas de tu Escuela')).toContainText(
        new RegExp(`Curso Más Completado\\s*${COURSE.c2.title}[\\s\\S]*2\\s*completaciones`)
      );
      await expect(sectionOf(page, 'Mis Rutas de Aprendizaje')).toContainText('0 de 2 cursos');
    });

    test('menu: shows without «Espacio Colaborativo» and «QA Testing»', async ({ page }) => {
      await openPanel(page);
      await expect(page.getByTestId('sidebar-item-dashboard')).toContainText('Mi Panel');
      await expect(page.getByTestId('sidebar-item-mi-aprendizaje')).toBeVisible();
      await expect(page.getByTestId('sidebar-item-workspace')).toHaveCount(0);
      await expect(page.getByTestId('sidebar-item-qa-testing')).toHaveCount(0);
    });
  });

  // =============================================================== lider_comunidad
  asRole('gcLeader', () => {
    test('sections and their content', async ({ page }) => {
      await openPanel(page);
      await assertSections(page, {
        firstName: 'Lider',
        statsLabel: 'Estadísticas de tu Comunidad',
        community: `${SCHOOL_NAME} • 1 miembros`,
        proposals: false,
        badges: '1 insignia obtenida · 100 puntos',
        continueLearning: [COURSE.c1.title],
        routes: [PATH.p2.name],
        openCourses: null,
      });
      // Community-scoped statistics: the leader is the only member.
      const stats = sectionOf(page, 'Estadísticas de tu Comunidad');
      await expect(stats).toContainText(/Educadores Activos\s*1\s*en tu alcance/);
      await expect(stats).toContainText(/1\s*completaciones/);
      await expect(stats).toContainText(
        /Usuario Destacado[\s\S]*Lider Comunidad Sintetico\s*Líder de Comunidad\s*Colegio Sintetico E2E\s*2\s*cursos completados/
      );
      // A completed route: «Completado», full progress, and no call to action.
      const route = sectionOf(page, 'Mis Rutas de Aprendizaje');
      await expect(route.getByText('Completado', { exact: true })).toBeVisible();
      await expect(route).toContainText('2 de 2 cursos');
      await expect(route.getByText('Comenzar ruta')).toHaveCount(0);
      await expect(route.getByText('Continuar aprendiendo')).toHaveCount(0);
      await expect(sectionOf(page, 'Mis Logros').getByText(COURSE.c4.title)).toBeVisible();
    });

    test('community section: opens and closes, lists the members, links to the workspace', async ({ page }) => {
      await openPanel(page);
      const main = page.getByRole('main');
      const toggle = main.getByRole('button', { name: /Mi Comunidad de Crecimiento/ });
      await toggle.click();
      await expect(main.getByRole('heading', { level: 3, name: SCHOOL_NAME, exact: true })).toBeVisible();
      await expect(main.getByRole('link', { name: /Ver Espacio Completo/ })).toHaveAttribute('href', '/community/workspace');
      // Since pull request 193 (N87) the gear «Configuración» is offered only to those who can save
      // the settings: an admin or that community's manager. A community leader is neither.
      await expect(main.getByRole('button', { name: 'Configuración', exact: true })).toHaveCount(0);
      // One member (the account itself), with role label and «Tú». No picker with one community.
      const member = main.getByRole('button', { name: /Lider Comunidad Sintetico/ });
      await expect(member).toHaveCount(1);
      await expect(member).toContainText('Líder de Comunidad');
      await expect(member).toContainText('Tú');
      await expect(main.getByText('Seleccionar comunidad:')).toHaveCount(0);
      await toggle.click();
      await expect(main.getByRole('link', { name: /Ver Espacio Completo/ })).toHaveCount(0);
      await expect(member).toHaveCount(0);
    });

    test('community section: a member opens the profile pop-up', async ({ page }) => {
      await openPanel(page);
      const main = page.getByRole('main');
      await main.getByRole('button', { name: /Mi Comunidad de Crecimiento/ }).click();
      await main.getByRole('button', { name: /Lider Comunidad Sintetico/ }).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      await expect(dialog).toContainText('Lider Comunidad Sintetico');
      await expect(dialog).toContainText('(Tú)');
      await expect(dialog).toContainText('Líder de Comunidad');
      // Shows the member's e-mail (inventory: shown to every other member too).
      await expect(dialog).toContainText('Correo electrónico');
      await expect(dialog).toContainText(E2E_USERS.gcLeader.email);
      await expect(dialog).toContainText('Miembro desde');
      await expect(dialog.getByRole('link', { name: /Ver Perfil Completo/ })).toHaveAttribute(
        'href',
        `/user/${await profileId('gcLeader')}`
      );
      await dialog.getByRole('button', { name: 'Cerrar', exact: true }).click();
      await expect(page.getByRole('dialog')).toHaveCount(0);
    });

    test('community section: the gear is not offered to the community leader', async ({ page }) => {
      await openPanel(page);
      const main = page.getByRole('main');
      await main.getByRole('button', { name: /Mi Comunidad de Crecimiento/ }).click();
      // The bar is open (its links show) and still no gear: since pull request 193 (N87) only an
      // admin or that community's manager, who can save the settings, is offered it.
      await expect(main.getByRole('link', { name: /Ver Espacio Completo/ })).toBeVisible();
      await expect(main.getByRole('button', { name: 'Configuración', exact: true })).toHaveCount(0);
    });

    test('API addresses called on load', async ({ page }) => {
      const calls = await openPanel(page);
      await expect
        .poll(() => calls)
        .toEqual(expect.arrayContaining([...COMMON_CALLS, `GET /api/community/members?community_id=${COMMUNITY_ZOOM}`]));
      const paths = pathsOnly(calls);
      expect(paths).toEqual(expect.arrayContaining([...COMMON_READS, 'GET /rest/v1/community_workspaces']));
      expect(paths).not.toContain('GET /api/course-proposals');
      // The workspace exists (seeded), so loading the panel does not create one.
      expect(paths).not.toContain('POST /api/community/ensure-workspace');
    });

    test('menu: shows with «Espacio Colaborativo», without «QA Testing»', async ({ page }) => {
      await openPanel(page);
      await expect(page.getByTestId('sidebar-item-dashboard')).toContainText('Mi Panel');
      await expect(page.getByTestId('sidebar-item-workspace')).toContainText('Espacio Colaborativo');
      await expect(page.getByTestId('sidebar-item-qa-testing')).toHaveCount(0);
    });
  });

  // =============================================================== community_manager
  asRole('communityManager', () => {
    test('sections and their content', async ({ page }) => {
      const calls = await openPanel(page);
      await assertSections(page, {
        firstName: 'Community',
        // Not in the server's label map: falls back to the "own learning" label.
        statsLabel: 'Estadísticas de tu Aprendizaje',
        community: `${SCHOOL_NAME} • 1 miembros`,
        proposals: false,
        badges: null,
        // An overdue assignment still shows as a course to continue.
        continueLearning: [COURSE.c1.title],
        routes: null,
        openCourses: null,
      });
      // Odd but today's behaviour: scope is only the account itself.
      const stats = sectionOf(page, 'Estadísticas de tu Aprendizaje');
      await expect(stats).toContainText(/Educadores Activos\s*1\s*en tu alcance/);
      await expect(stats.getByText('Sin datos disponibles')).toHaveCount(2);
      await expect.poll(() => calls).toContain(`GET /api/community/members?community_id=${COMMUNITY_ROLE}`);
    });

    test('community section: the gear opens the workspace settings pop-up, «Cancelar» closes it', async ({ page }) => {
      await openPanel(page);
      const main = page.getByRole('main');
      await main.getByRole('button', { name: /Mi Comunidad de Crecimiento/ }).click();
      // This community's manager can save the settings, so the gear is offered (N87).
      const gear = main.getByRole('button', { name: 'Configuración', exact: true });
      await expect(gear).toBeVisible();
      await gear.click();
      const title = page.getByRole('heading', { name: 'Configuración de la Comunidad' });
      await expect(title).toBeVisible();
      await expect(page.getByText('Nombre de la Comunidad', { exact: true })).toBeVisible();
      await expect(page.getByText('Imagen de la Comunidad', { exact: true })).toBeVisible();
      await expect(page.getByText('Cualquier miembro puede cambiar el nombre del grupo')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Guardar cambios' })).toBeVisible();
      await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
      await expect(title).toHaveCount(0);
    });
  });

  // =============================================================== lider_generacion
  asRole('generationLeader', () => {
    test('sections and their content', async ({ page }) => {
      await openPanel(page);
      await assertSections(page, {
        firstName: 'Lider',
        statsLabel: 'Estadísticas de tu Generación',
        community: null,
        proposals: false,
        badges: null,
        // Odd but today's behaviour: a CANCELLED assignment (enrolment paused) still shows here,
        // and the self-enrolled course without an assignment does not.
        continueLearning: [COURSE.c2.title],
        routes: null,
        openCourses: null,
      });
    });
  });

  // =============================================================== supervisor_de_red
  asRole('networkSupervisor', () => {
    test('sections and their content', async ({ page }) => {
      await openPanel(page);
      await assertSections(page, {
        firstName: 'Supervisora',
        statsLabel: 'Estadísticas de tu Red',
        community: null,
        proposals: false,
        badges: null,
        continueLearning: null,
        routes: null,
        openCourses: null,
      });
    });
  });

  // =============================================================== encargado_licitacion
  asRole('procurementManager', () => {
    test('sections and their content', async ({ page }) => {
      await openPanel(page);
      await assertSections(page, {
        firstName: 'Encargada',
        statsLabel: 'Estadísticas de tu Aprendizaje',
        community: null,
        proposals: false,
        badges: null,
        continueLearning: null,
        routes: null,
        openCourses: null,
      });
      const stats = sectionOf(page, 'Estadísticas de tu Aprendizaje');
      await expect(stats).toContainText(/Educadores Activos\s*1\s*en tu alcance/);
      await expect(stats.getByText('Sin datos disponibles')).toHaveCount(2);
    });
  });
});

// ================================================================= phone width
test.describe('panel — phone (390 px)', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  asRole('docente', () => {
    test('«Mi Perfil» is hidden; the menu opens from the header button and closes on the backdrop', async ({ page }) => {
      await openPanel(page);
      // Hidden on phones today (inventory: no other profile entry on the page).
      await expect(page.getByRole('main').getByRole('link', { name: 'Mi Perfil' })).toBeHidden();

      const sidebar = page.getByTestId('global-sidebar');
      await expect(sidebar).not.toBeInViewport();
      await page.getByTestId('mobile-sidebar-trigger').click();
      await expect(sidebar).toBeInViewport();
      await expect(page.getByTestId('sidebar-item-dashboard')).toContainText('Mi Panel');
      await page.getByTestId('mobile-sidebar-overlay').click({ position: { x: 370, y: 400 } });
      await expect(page.getByTestId('mobile-sidebar-overlay')).toHaveCount(0);
      await expect(sidebar).not.toBeInViewport();
    });

    test('course card: the first tap opens it, the second tap opens the course', async ({ page }) => {
      await openPanel(page);
      const row = sectionOf(page, 'Continuar Aprendiendo');
      await row.getByRole('heading', { name: COURSE.c1.title }).first().click();
      await expect(row.getByRole('button', { name: 'Continuar' })).toBeVisible();
      await expect(page).toHaveURL(/\/dashboard$/);
      await clickLeadsTo(page, row.getByRole('heading', { name: COURSE.c1.title }).first(), new RegExp(`/student/course/${COURSE.c1.id}$`));
    });
  });

  asRole('admin', () => {
    test('«Nueva Propuesta» loses its text (icon only) but still opens the form', async ({ page }) => {
      await openPanel(page);
      const proposals = sectionOf(page, 'Propuestas de Cursos');
      await expect(proposals.getByText('Nueva Propuesta', { exact: true })).toBeHidden();
      // The icon-only button has no accessible name today; it is the first button of the section.
      await proposals.getByRole('button').first().click();
      const dialog = page.getByRole('dialog');
      await expect(dialog.getByRole('heading', { name: 'Nueva Propuesta de Curso' })).toBeVisible();
      await dialog.getByRole('button', { name: 'Cancelar' }).click();
      await expect(page.getByRole('dialog')).toHaveCount(0);
    });
  });
});
