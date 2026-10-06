import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseEnv } from 'dotenv';
import pg from 'pg';
import { loginViaUi, E2E_USERS, type FixtureKey } from './helpers/auth';

/**
 * FNE-ANON-01 — the signed-in and public journeys that touch the `facturas` /
 * `resources` buckets and the seven learning relations, driven in a real
 * browser against the real server and local database. Run once on the
 * baseline and once with migration 20261006180000 applied: the same journeys
 * must behave the same.
 *
 *   1. admin: contract invoice upload / open / reload / delete; Cash Flow upload
 *   2. admin: lesson editor image + file blocks, save, reload
 *   3. docente: lesson text + quiz (open answer) + image + file download, reload progress
 *   4. docente: dashboard badge (user_badges_with_details)
 *   5. consultor and admin: quiz review list (pending_quiz_reviews) and grading
 *   6. community leader: group discussion (group_assignments_with_status)
 *   7. admin: school and community reports (both lists are empty/500 on the baseline)
 *   8. community member and consultor: workspace document upload / preview / download
 *   9. community_manager: news with image; signed out: published image, public pages
 *
 * Known defects of the baseline are marked `test.fail` with BASELINE_FAILURE so
 * they are neither counted as passes nor confused with regressions.
 *
 * LOCAL ONLY. Requires the `facturas` and `resources` buckets and their
 * Production-like policies, which no tracked migration creates; refuses a
 * non-loopback stack. Every non-local network request is aborted, so the
 * public pages' hard-coded Production asset URLs are never fetched. Synthetic
 * rows use fixed ids; they are replaced at the start of each run and left in
 * place afterwards for manual inspection.
 */

const ROOT = join(__dirname, '..', '..');
const fileEnv: Record<string, string> = (() => {
  for (const name of ['.env.local', '.env.development.local']) {
    try {
      return parseEnv(readFileSync(join(ROOT, name), 'utf8'));
    } catch {
      /* next */
    }
  }
  return {};
})();
const env = (key: string): string => {
  const value = process.env[key] || fileEnv[key];
  if (!value) throw new Error(`[urgent-anonymous-boundaries] ${key} is not set`);
  return value;
};
const API = env('NEXT_PUBLIC_SUPABASE_URL');
const DB_URL = env('SUPABASE_DB_URL');
const PHASE = process.env.FNE_ANON_PHASE || 'run';
const SHOTS = join(ROOT, '.fne-anon', 'screens', PHASE);
mkdirSync(SHOTS, { recursive: true });
const LOCAL = (url: string) => ['127.0.0.1', 'localhost'].includes(new URL(url).hostname);

const id = (n: number) => `fa0e0000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const IDS = {
  instructor: id(1), course: id(2), module: id(3), lesson: id(4), groupLesson: id(5),
  textBlock: id(10), quizBlock: id(11), groupBlock: id(12),
  badge: id(20), userBadge: id(21), submission: id(30), consultantAssignment: id(31), consultorCommunityRole: id(32),
  group: id(40), member: id(41), cliente: id(50), contrato: id(51), cuotaModal: id(52), cuotaFlow: id(53),
};
const COMMUNITY = 'e2e00000-0000-4000-8000-000000000c01';
const COURSE_TITLE = 'FNE-ANON Curso sintetico';
const LESSON_TITLE = 'FNE-ANON Leccion sintetica';
const NEWS_TITLE = 'FNE ANON Noticia sintetica';
const CONTRACT = 'FNE-ANON-0001';
const PDF = { name: 'fneanon-factura.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n% FNE-ANON synthetic\n') };
const PNG = {
  name: 'fneanon-imagen.png', mimeType: 'image/png',
  buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'),
};
const TXT = { name: 'fneanon-material.txt', mimeType: 'text/plain', buffer: Buffer.from('FNE-ANON material sintetico\n') };
const OPEN_ANSWER = 'Respuesta abierta sintetica FNE-ANON';

const log: { journey: string; step: string; at: string }[] = [];
const openPages = new Set<Page>();
function note(journey: string, step: string) {
  log.push({ journey, step, at: new Date().toISOString() });
}
async function shot(page: Page, name: string) {
  await page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: false });
}

async function localOnly(context: BrowserContext) {
  await context.route('**/*', (route) => (LOCAL(route.request().url()) ? route.continue() : route.abort()));
}
async function signedIn(browser: Browser, key: FixtureKey): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] }, acceptDownloads: true });
  await localOnly(context);
  const page = await context.newPage();
  openPages.add(page);
  await loginViaUi(page, E2E_USERS[key]);
  return { context, page };
}

async function query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  try {
    return (await client.query(sql, params)).rows as T[];
  } finally {
    await client.end();
  }
}
const uid = async (key: FixtureKey) =>
  (await query<{ id: string }>('SELECT id FROM auth.users WHERE email = $1', [E2E_USERS[key].email]))[0].id;

async function seed() {
  const [admin, docente, leader, consultor] = await Promise.all(
    (['admin', 'docente', 'gcLeader', 'consultorAssigned'] as FixtureKey[]).map(uid),
  );
  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  const q = (sql: string, params: unknown[] = []) => client.query(sql, params);
  try {
    await q('BEGIN');
    // previous run, by id or by synthetic marker
    await q('DELETE FROM public.news_articles WHERE title = $1', [NEWS_TITLE]);
    await q(`DELETE FROM public.community_documents WHERE file_name LIKE 'fneanon-%'`);
    await q('DELETE FROM public.cuotas WHERE contrato_id = $1', [IDS.contrato]);
    await q('DELETE FROM public.contratos WHERE id = $1', [IDS.contrato]);
    await q('DELETE FROM public.clientes WHERE id = $1', [IDS.cliente]);
    await q('DELETE FROM public.user_roles WHERE id = $1', [IDS.consultorCommunityRole]);
    await q('DELETE FROM public.consultant_assignments WHERE id = $1', [IDS.consultantAssignment]);
    await q('DELETE FROM public.user_badges WHERE id = $1', [IDS.userBadge]);
    await q('DELETE FROM public.badges WHERE id = $1', [IDS.badge]);
    await q('DELETE FROM public.group_assignment_groups WHERE assignment_id = $1', [IDS.groupBlock]);
    await q('DELETE FROM public.quiz_submissions WHERE course_id = $1', [IDS.course]);
    await q('DELETE FROM public.lesson_progress WHERE lesson_id = ANY($1)', [[IDS.lesson, IDS.groupLesson]]);
    await q('DELETE FROM public.course_enrollments WHERE course_id = $1', [IDS.course]);
    await q('DELETE FROM public.blocks WHERE course_id = $1', [IDS.course]);
    await q('DELETE FROM public.lessons WHERE course_id = $1', [IDS.course]);
    await q('DELETE FROM public.modules WHERE course_id = $1', [IDS.course]);
    await q('DELETE FROM public.courses WHERE id = $1', [IDS.course]);
    await q('DELETE FROM public.instructors WHERE id = $1', [IDS.instructor]);

    await q('INSERT INTO public.instructors (id, full_name) VALUES ($1, $2)', [IDS.instructor, 'Instructora Sintetica FNE-ANON']);
    await q(`INSERT INTO public.courses (id, title, description, instructor_id, structure_type)
             VALUES ($1, $2, 'Curso sintetico para FNE-ANON-01', $3, 'structured')`, [IDS.course, COURSE_TITLE, IDS.instructor]);
    await q(`INSERT INTO public.modules (id, course_id, title, order_number) VALUES ($1, $2, 'Modulo sintetico', 1)`, [IDS.module, IDS.course]);
    await q(`INSERT INTO public.lessons (id, module_id, course_id, title, order_number) VALUES
             ($1, $3, $4, $5, 1), ($2, $3, $4, 'FNE-ANON Leccion grupal', 2)`,
      [IDS.lesson, IDS.groupLesson, IDS.module, IDS.course, LESSON_TITLE]);
    const quiz = {
      title: 'Quiz sintetico FNE-ANON',
      questions: [
        { id: 'q1', question: '¿Dos mas dos?', type: 'multiple-choice', points: 1,
          options: [{ id: 'o1', text: 'Cuatro', isCorrect: true }, { id: 'o2', text: 'Cinco', isCorrect: false }] },
        { id: 'q2', question: 'Describe una practica de aula', type: 'open-ended', points: 2, options: [],
          expectedAnswer: 'Cualquier practica', gradingGuidelines: 'Aprobar respuestas completas' },
      ],
      totalPoints: 3, allowRetries: true, showResults: true, randomizeQuestions: false, randomizeAnswers: false,
    };
    await q(`INSERT INTO public.blocks (id, course_id, lesson_id, position, type, payload) VALUES
             ($1, $4, $5, 0, 'text', $6), ($2, $4, $5, 1, 'quiz', $7), ($3, $4, $8, 0, 'group-assignment', $9)`,
      [IDS.textBlock, IDS.quizBlock, IDS.groupBlock, IDS.course, IDS.lesson,
        JSON.stringify({ title: 'Lectura sintetica', content: '<p>Texto sintetico FNE-ANON para leer.</p>' }),
        JSON.stringify(quiz), IDS.groupLesson,
        JSON.stringify({ title: 'Trabajo grupal FNE-ANON', description: 'Tarea grupal sintetica', instructions: 'Conversen' })]);
    for (const user of [docente, leader]) {
      await q(`INSERT INTO public.course_enrollments (user_id, course_id, status, access_origin) VALUES ($1, $2, 'active', 'independent')`, [user, IDS.course]);
    }
    await q(`INSERT INTO public.badges (id, name, description) VALUES ($1, 'Insignia FNE-ANON', 'Insignia sintetica')`, [IDS.badge]);
    await q(`INSERT INTO public.user_badges (id, user_id, badge_id, course_id) VALUES ($1, $2, $3, $4)`, [IDS.userBadge, docente, IDS.badge, IDS.course]);
    await q(`INSERT INTO public.quiz_submissions (id, lesson_id, block_id, student_id, course_id, total_possible_points,
               auto_gradable_points, manual_gradable_points, grading_status, answers, review_status, open_responses)
             VALUES ($1, $2, $3, $4, $5, 3, 1, 2, 'pending_review', '{}'::jsonb, 'pending', $6)`,
      [IDS.submission, IDS.lesson, 'fneanon-seeded-review', docente, IDS.course,
        JSON.stringify([{ question_id: 'q2', question: 'Describe una practica de aula', response: 'Respuesta sembrada FNE-ANON',
          points: 2, expectedAnswer: 'Cualquier practica', gradingGuidelines: 'Aprobar respuestas completas' }])]);
    await q(`INSERT INTO public.consultant_assignments (id, consultant_id, student_id, is_active, assignment_data, assigned_by)
             VALUES ($1, $2, $3, true, '{}'::jsonb, $4)`, [IDS.consultantAssignment, consultor, docente, admin]);
    await q(`INSERT INTO public.community_workspaces (community_id) SELECT $1
             WHERE NOT EXISTS (SELECT 1 FROM public.community_workspaces WHERE community_id = $1)`, [COMMUNITY]);
    await q(`INSERT INTO public.group_assignment_groups (id, assignment_id, name, school_id, community_id)
             VALUES ($1, $2, 'Grupo sintetico FNE-ANON', 990001, $3)`, [IDS.group, IDS.groupBlock, COMMUNITY]);
    await q(`INSERT INTO public.group_assignment_members (id, group_id, assignment_id, user_id, role)
             VALUES ($1, $2, $3, $4, 'leader')`, [IDS.member, IDS.group, IDS.groupBlock, leader]);
    // the assigned consultor also reaches the community workspace (documents journey)
    await q(`INSERT INTO public.user_roles (id, user_id, role_type, school_id, community_id, is_active)
             VALUES ($1, $2, 'consultor', 990001, $3, true)`, [IDS.consultorCommunityRole, consultor, COMMUNITY]);
    await q(`INSERT INTO public.clientes (id, nombre_legal, nombre_fantasia, rut, direccion, nombre_representante,
               rut_representante, fecha_escritura, nombre_notario)
             VALUES ($1, 'Cliente Sintetico FNE-ANON SpA', 'Cliente FNE-ANON', '76.000.000-0', 'Calle Sintetica 1',
               'Representante Sintetico', '11.111.111-1', '2026-01-01', 'Notario Sintetico')`, [IDS.cliente]);
    await q(`INSERT INTO public.contratos (id, numero_contrato, fecha_contrato, cliente_id, precio_total_uf, numero_cuotas,
               incluir_en_flujo, tipo_moneda, estado)
             VALUES ($1, $2, CURRENT_DATE, $3, 2000000, 2, true, 'CLP', 'activo')`, [IDS.contrato, CONTRACT, IDS.cliente]);
    await q(`INSERT INTO public.cuotas (id, contrato_id, numero_cuota, fecha_vencimiento, monto_uf) VALUES
             ($1, $3, 1, CURRENT_DATE + 3, 1000000), ($2, $3, 2, CURRENT_DATE + 35, 1000000)`,
      [IDS.cuotaModal, IDS.cuotaFlow, IDS.contrato]);
    // what the role-assignment API does after any role change (a fresh stack never populated it)
    await q('REFRESH MATERIALIZED VIEW public.user_roles_cache');
    await q('COMMIT');
  } catch (error) {
    await q('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

test.describe.serial('FNE-ANON-01 signed-in and public journeys', () => {
  test.setTimeout(180_000);

  test.beforeAll(async () => {
    expect(LOCAL(API) && LOCAL(DB_URL), 'local stack only').toBe(true);
    const buckets = await query<{ id: string; public: boolean }>(
      `SELECT id, public FROM storage.buckets WHERE id IN ('facturas', 'resources') ORDER BY id`);
    expect(buckets, 'apply the local Production storage model (.fne-anon/storage-baseline-model.sql) first')
      .toEqual([{ id: 'facturas', public: true }, { id: 'resources', public: true }]);
    await seed();
  });

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) {
      for (const page of openPages) {
        if (!page.isClosed()) await shot(page, `FAILED-${testInfo.title.replace(/[^a-z0-9]+/gi, '-')}`).catch(() => {});
      }
    }
    openPages.clear();
  });

  test.afterAll(() => {
    writeFileSync(join(SHOTS, 'journal.json'), JSON.stringify(log, null, 2));
  });

  test('1a admin: contract invoice upload, open, reload, delete', async ({ browser }) => {
    const { context, page } = await signedIn(browser, 'admin');
    await page.goto('/contracts');
    await page.getByText(CONTRACT).first().click();
    await expect(page.getByText(/Cronograma de Pagos/)).toBeVisible();
    await page.locator('input[type="file"][accept=".pdf,.jpg,.jpeg,.png"]').first().setInputFiles(PDF);
    await expect(page.getByText(`Factura subida exitosamente: ${PDF.name}`)).toBeVisible();
    note('1a', 'admin uploaded invoice in contract modal');
    const view = page.locator('a[title="Ver factura"]').first();
    await expect(view).toBeVisible();
    const href = (await view.getAttribute('href')) || '';
    expect(href).toContain('/storage/v1/object/public/facturas/');
    const opened = await page.request.get(href);
    expect(opened.status()).toBe(200);
    expect(Buffer.from(await opened.body()).equals(PDF.buffer)).toBe(true);
    await shot(page, '1a-invoice-uploaded');
    await page.reload();
    await page.getByText(CONTRACT).first().click();
    await expect(page.getByText(PDF.name)).toBeVisible();
    note('1a', 'invoice persists after reload; public URL serves the exact bytes');
    await page.locator('button[title="Eliminar factura"]').first().click();
    await page.getByRole('button', { name: 'Eliminar Factura', exact: true }).click();
    await expect(page.getByText('Factura eliminada exitosamente')).toBeVisible();
    await shot(page, '1a-invoice-deleted');
    const key = decodeURIComponent(href.split('/storage/v1/object/public/facturas/')[1]);
    expect(await query(`SELECT 1 FROM storage.objects WHERE bucket_id = 'facturas' AND name = $1`, [key])).toHaveLength(0);
    expect((await query<{ factura_url: string | null }>('SELECT factura_url FROM public.cuotas WHERE id = $1', [IDS.cuotaModal]))[0].factura_url).toBeNull();
    note('1a', 'invoice deleted: storage object and cuota link removed');
    await context.close();
  });

  test('1b admin: Cash Flow invoice upload', async ({ browser }) => {
    const { context, page } = await signedIn(browser, 'admin');
    await page.goto('/contracts');
    await page.getByRole('button', { name: /Flujo de Caja/ }).click();
    await page.getByRole('button', { name: /Vista Detallada/ }).click();
    await expect(page.getByText(CONTRACT).first()).toBeVisible();
    await page.locator('tr', { hasText: CONTRACT }).locator('input[type="file"]').first().setInputFiles(PDF);
    await expect.poll(async () =>
      (await query<{ n: number }>(`SELECT count(*)::int n FROM public.cuotas WHERE contrato_id = $1 AND factura_url LIKE '%/facturas/cuota_%'`, [IDS.contrato]))[0].n,
    { timeout: 20_000 }).toBe(1);
    const url = (await query<{ factura_url: string }>(`SELECT factura_url FROM public.cuotas WHERE contrato_id = $1 AND factura_url IS NOT NULL`, [IDS.contrato]))[0].factura_url;
    const served = await page.request.get(url);
    expect(served.status()).toBe(200);
    note('1b', 'Cash Flow upload stored in facturas and linked; public URL 200');
    await page.reload();
    await page.getByRole('button', { name: /Flujo de Caja/ }).click();
    await page.getByRole('button', { name: /Vista Detallada/ }).click();
    await expect(page.locator('tr', { hasText: CONTRACT }).getByRole('link', { name: /Ver/ }).first()).toBeVisible();
    await shot(page, '1b-cashflow-invoice');
    note('1b', 'after reload the Cash Flow row links the invoice');
    await context.close();
  });

  test('2 admin: lesson editor image and file blocks survive save and reload', async ({ browser }) => {
    const { context, page } = await signedIn(browser, 'admin');
    await page.goto(`/admin/course-builder/${IDS.course}/${IDS.module}/${IDS.lesson}`);
    await page.getByRole('button', { name: /Imágenes/ }).click();
    await page.locator('input[type="file"][accept="image/*"]').last().setInputFiles(PNG);
    await expect(page.locator('img[src*="/storage/v1/object/public/resources/images/"]').first()).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: /Descargar/ }).last().click();
    await page.locator('input[type="file"][multiple]').last().setInputFiles(TXT);
    await expect(page.getByText(TXT.name).first()).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: /Guardar Cambios/ }).click();
    await expect(page.getByText(/Lesson saved successfully/)).toBeVisible();
    note('2', 'admin added image + download blocks (uploads to resources) and saved');
    await page.reload();
    await expect(page.locator('img[src*="/storage/v1/object/public/resources/images/"]').first()).toBeVisible();
    await expect(page.getByText(TXT.name).first()).toBeVisible();
    await shot(page, '2-lesson-editor-reloaded');
    const blocks = await query<{ type: string }>('SELECT type FROM public.blocks WHERE lesson_id = $1 ORDER BY position', [IDS.lesson]);
    expect(blocks.map((b) => b.type)).toEqual(['text', 'quiz', 'image', 'download']);
    note('2', 'after reload both blocks and their stored files are present');
    await context.close();
  });

  test('3 docente: text, quiz with open answer, image, file download; progress survives reload', async ({ browser }) => {
    const { context, page } = await signedIn(browser, 'docente');
    await page.goto(`/student/lesson/${IDS.lesson}`);
    await expect(page.getByText('Texto sintetico FNE-ANON para leer.')).toBeVisible();
    await page.getByText('He leído este contenido').click();
    await page.getByRole('button', { name: /^Continuar/ }).first().click();
    note('3', 'text block completed');
    await page.locator('button[title="Siguiente bloque"]').first().click();
    await page.getByText('Cuatro').click();
    await page.getByRole('button', { name: 'Siguiente', exact: true }).and(page.locator(':enabled')).first().click();
    await page.getByPlaceholder('Escribe tu respuesta aquí...').fill(OPEN_ANSWER);
    await page.getByRole('button', { name: /Enviar Quiz/ }).click();
    await expect(page.getByText(/Quiz completado|Excelente/).first()).toBeVisible();
    await shot(page, '3-quiz-submitted');
    note('3', 'quiz submitted with an open answer (submit_quiz RPC)');
    await expect(page.getByText(/Quiz sintetico FNE-ANON - Completado/)).toBeVisible();
    await page.reload();
    await expect(page.getByText('Bloque 3 de 4').first()).toBeVisible({ timeout: 30_000 });
    note('3', 'reload resumes at the first incomplete block (text + quiz persisted)');
    const image = page.locator('img[src*="/storage/v1/object/public/resources/images/"]').first();
    await expect(image).toBeVisible({ timeout: 30_000 });
    await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
    await page.getByRole('button', { name: /He revisado esta imagen/ }).click();
    note('3', 'image from resources rendered and acknowledged');
    await page.locator('button[title="Siguiente bloque"]').first().click();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /^Descargar/ }).first().click();
    const download = await downloadPromise;
    expect(readFileSync((await download.path()) as string).equals(TXT.buffer)).toBe(true);
    await page.getByRole('button', { name: /Marcar como Completado/ }).click();
    note('3', 'file downloaded through /api/storage/download with exact bytes');
    await page.reload();
    await expect.poll(async () =>
      (await query<{ n: number }>(`SELECT count(*)::int n FROM public.lesson_progress lp JOIN auth.users u ON u.id = lp.user_id
                                   WHERE lp.lesson_id = $1 AND u.email = $2 AND lp.completed_at IS NOT NULL`, [IDS.lesson, E2E_USERS.docente.email]))[0].n,
    ).toBeGreaterThanOrEqual(4);
    await expect(page.getByText(LESSON_TITLE).first()).toBeVisible();
    await shot(page, '3-lesson-reloaded');
    const subs = await query<{ open_responses: unknown }>(
      `SELECT open_responses FROM public.quiz_submissions WHERE lesson_id = $1 AND id <> $2`, [IDS.lesson, IDS.submission]);
    expect(JSON.stringify(subs)).toContain(OPEN_ANSWER);
    note('3', 'after reload: all four blocks recorded complete; quiz submission stored');
    await context.close();
  });

  test('4 docente: dashboard shows the earned badge', async ({ browser }) => {
    const { context, page } = await signedIn(browser, 'docente');
    await expect(page.getByText('Mis Logros')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Insignia FNE-ANON').first()).toBeVisible();
    await shot(page, '4-dashboard-badge');
    note('4', 'badge read through user_badges_with_details by the signed-in docente');
    await context.close();
  });

  test('5a consultor: pending quiz review list shows the assigned student answer', async ({ browser }) => {
    const { context, page } = await signedIn(browser, 'consultorAssigned');
    await page.goto('/quiz-reviews');
    await expect(page.getByText(/Quizzes pendientes de revisión/)).toBeVisible();
    await expect(page.getByText(E2E_USERS.docente.email).first()).toBeVisible({ timeout: 30_000 });
    await shot(page, '5a-consultor-quiz-reviews');
    note('5a', 'consultor sees pending review via service API (pending_quiz_reviews)');
    await context.close();
  });

  test('5b admin: opens and grades the seeded pending open answer', async ({ browser }) => {
    const { context, page } = await signedIn(browser, 'admin');
    await page.goto(`/quiz-reviews/${IDS.submission}`);
    await expect(page.getByText('Respuesta sembrada FNE-ANON')).toBeVisible({ timeout: 30_000 });
    await page.locator('input[type="radio"][value="pass"]').first().check();
    await page.getByRole('button', { name: /Guardar revisión/ }).click();
    await expect(page.getByText(/Revisión guardada exitosamente|Quiz calificado exitosamente/).first()).toBeVisible();
    await shot(page, '5b-admin-graded');
    await expect.poll(async () =>
      (await query<{ review_status: string }>('SELECT review_status FROM public.quiz_submissions WHERE id = $1', [IDS.submission]))[0].review_status,
    ).toBe('pass');
    note('5b', 'admin graded the open answer; submission review_status = pass');
    await context.close();
  });

  test('6 community leader: group discussion opens for a group member', async ({ browser }) => {
    const { context, page } = await signedIn(browser, 'gcLeader');
    await page.goto(`/community/workspace/assignments/${IDS.groupBlock}/discussion`);
    await expect(page.getByText(/Discusión:/).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Miembros del grupo/)).toBeVisible();
    await expect(page.getByPlaceholder('Escribe un mensaje...')).toBeVisible();
    await shot(page, '6-group-discussion');
    note('6', 'discussion page renders (view query errors on .eq(id) and falls back, as on baseline)');
    await context.close();
  });

  test('7a admin: school report', async ({ browser }) => {
    const { context, page } = await signedIn(browser, 'admin');
    await page.goto('/reports');
    await expect(page.getByText('Cargando datos...')).toBeHidden({ timeout: 30_000 });
    const response = page.waitForResponse((r) => r.url().includes('/api/reports/school'), { timeout: 30_000 });
    await page.getByRole('button', { name: /^\W*Escuelas$/u }).click();
    expect((await response).status()).toBe(200);
    await expect(page.getByText('Análisis por Escuelas')).toBeVisible({ timeout: 30_000 });
    await shot(page, '7a-school-report');
    note('7a', 'school report API 200 and the school section renders for admin');
    await context.close();
  });

  test('7a2 admin: school report lists the synthetic school — BASELINE_FAILURE', async ({ browser }) => {
    test.fail(true, 'BASELINE_FAILURE: /api/reports/school selects nonexistent schools.community_id, swallows the error and reports zero schools');
    const { context, page } = await signedIn(browser, 'admin');
    await page.goto('/reports');
    await expect(page.getByText('Cargando datos...')).toBeHidden({ timeout: 30_000 });
    await page.getByRole('button', { name: /^\W*Escuelas$/u }).click();
    await expect(page.getByText('Análisis por Escuelas')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('main').getByText('Colegio Sintetico E2E').first()).toBeVisible({ timeout: 10_000 });
    await context.close();
  });

  test('7b admin: community report — BASELINE_FAILURE', async ({ browser }) => {
    test.fail(true, 'BASELINE_FAILURE: /api/reports/community selects nonexistent profiles.role and returns 500');
    const { context, page } = await signedIn(browser, 'admin');
    await page.goto('/reports');
    await expect(page.getByText('Cargando datos...')).toBeHidden({ timeout: 30_000 });
    const response = page.waitForResponse((r) => r.url().includes('/api/reports/community'), { timeout: 30_000 });
    await page.getByRole('button', { name: /^\W*Comunidades$/u }).click();
    const status = (await response).status();
    await expect(page.getByText(/No se pudieron cargar los datos de comunidades|Comunidad de Crecimiento Sintetica E2E/).first()).toBeVisible({ timeout: 30_000 });
    await shot(page, '7b-community-report');
    note('7b', `community report API status ${status}`);
    expect(status).toBe(200);
    await context.close();
  });

  for (const key of ['gcLeader', 'consultorAssigned'] as FixtureKey[]) {
    test(`8 ${key}: workspace document upload`, async ({ browser }) => {
      const { context, page } = await signedIn(browser, key);
      await page.goto(`/community/workspace?section=documents`);
      await page.getByRole('button', { name: /Subir Documento/ }).first().click();
      const file = { ...PDF, name: `fneanon-doc-${key}.pdf` };
      await page.locator('input[type="file"]').last().setInputFiles(file);
      await page.getByRole('button', { name: /^Subir Documentos/ }).last().click();
      await expect(page.getByText(/documento\(s\) subido\(s\) exitosamente/)).toBeVisible({ timeout: 30_000 });
      await page.reload();
      await expect(page.getByText(`fneanon-doc-${key}`, { exact: true }).first()).toBeVisible({ timeout: 30_000 });
      await shot(page, `8-${key}-document-uploaded`);
      const stored = await query<{ storage_path: string }>(`SELECT storage_path FROM public.community_documents WHERE file_name = $1`, [file.name]);
      expect(stored).toHaveLength(1);
      expect(await query(`SELECT 1 FROM storage.objects WHERE bucket_id = 'resources' AND name = $1`, [stored[0].storage_path])).toHaveLength(1);
      note('8', `${key} uploaded a workspace document into resources; listed after reload`);
      await context.close();
    });
  }

  test('8c workspace document preview/download — BASELINE_FAILURE', async ({ browser }) => {
    test.fail(true, 'BASELINE_FAILURE: storage_path is a bare relative path; preview src and /api/storage/download both fail');
    const { context, page } = await signedIn(browser, 'gcLeader');
    await page.goto(`/community/workspace?section=documents`);
    const response = page.waitForResponse((r) => r.url().includes('/api/storage/download'), { timeout: 15_000 });
    await page.getByText('fneanon-doc-gcLeader', { exact: true }).first().click();
    await page.getByRole('button', { name: /Descargar/ }).first().click();
    expect((await response).status()).toBe(200);
    await context.close();
  });

  test('9 community_manager: news image; signed out: published image and public pages', async ({ browser }) => {
    const { context, page } = await signedIn(browser, 'communityManager');
    await page.goto('/admin/news');
    await page.getByRole('button', { name: /Nueva Noticia/ }).click();
    await page.getByPlaceholder('Título de la noticia').fill(NEWS_TITLE);
    await page.locator('input[type="file"][accept="image/*"]').first().setInputFiles(PNG);
    await expect(page.getByText('Imagen subida exitosamente')).toBeVisible({ timeout: 30_000 });
    await page.locator('.ProseMirror').first().fill('Contenido sintetico de la noticia FNE-ANON.');
    await page.locator('#is_published').check();
    await page.getByRole('button', { name: 'Crear', exact: true }).click();
    await expect(page.getByText('Artículo creado')).toBeVisible();
    await shot(page, '9-news-created');
    note('9', 'community_manager created a published news item with an image in resources');
    await context.close();

    const anon = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    await localOnly(anon);
    const out = await anon.newPage();
    await out.goto('/noticias');
    const img = out.locator(`img[alt="${NEWS_TITLE}"]`).first();
    await expect(img).toBeVisible({ timeout: 30_000 });
    await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);
    expect(await img.getAttribute('src')).toContain('/storage/v1/object/public/resources/news-images/');
    await shot(out, '9-signed-out-news');
    note('9', 'signed out: published news image loads from the public resources URL');
    for (const path of ['/', '/equipo', '/nosotros']) {
      const response = await out.goto(path);
      expect(response?.status()).toBe(200);
      await expect(out.locator('img, video').first()).toBeAttached();
      await shot(out, `9-public${path === '/' ? '-home' : path.replace('/', '-')}`);
    }
    note('9', 'signed out: /, /equipo, /nosotros render (their hard-coded Production asset URLs are not fetched locally)');
    await anon.close();
  });
});
