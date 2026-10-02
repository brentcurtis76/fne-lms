/**
 * PROC-B010 — SYNTHETIC rehearsal of the Procesos de Cambio pilot journey.
 *
 *   LOCAL SYNTHETIC / NOT REAL PILOT EVIDENCE. Passing this does not close
 *   PROC-PILOT; only the supervised real pilot does (plan criterion C019).
 *
 * Journey, once per viewport (desktop 1280×800, mobile 375×667), each on its
 * own synthetic school with its own director and docente:
 *   director fills the Contexto Transversal (1° Básico, one course) → the
 *   course "1 BASICO A" appears → director assigns the docente → the product
 *   creates the instance for the published synthetic template → docente sees
 *   it in "Mis Registros" with the right course → answers Sí / 5 / level 3,
 *   saves, reloads (answers persisted in the database and shown) → submits →
 *   docente results show 100 / 50 / 75 and a 75% total → the director's
 *   dashboard shows the 75% average.
 *
 * Run ONLY on a private stack:  scripts/ci/e2e-local.sh tests/e2e/proc-pilot-journey.spec.ts
 * The fixture refuses any other target before writing (unsafeTargetReason).
 * Fixture manifest, read-only pre-cleanup inventory and verified cleanup:
 * tests/e2e/fixtures/proc-pilot-fixture.ts.
 */
import { expect, test, type Browser, type Page } from '@playwright/test';
import type pg from 'pg';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  MANIFEST, SYNTHETIC_LABEL, assertOwnedStack, cleanup, db, inventory, seed, serviceClient, unsafeTargetReason,
  type SyntheticUser, type ViewportRun,
} from './fixtures/proc-pilot-fixture';

const reason = unsafeTargetReason();
test.skip(reason !== null, `[${SYNTHETIC_LABEL}] not on a private rehearsal stack: ${reason}`);
test.describe.configure({ mode: 'serial' });

const log = (msg: string) => console.log(`[${SYNTHETIC_LABEL}] ${msg}`);

const [IND_COB, IND_FRE, IND_PRO] = MANIFEST.template.indicators;

let svc: SupabaseClient;
let c: pg.Client;

test.beforeAll(async () => {
  assertOwnedStack(); // before any client or write: the URLs belong to this wrapper run's stack
  svc = serviceClient();
  c = await db();
  await seed(svc, c);
  log(`fixture seeded: ${JSON.stringify(await inventory(c))}`);
});

test.afterAll(async () => {
  if (!c) return;
  log(`pre-cleanup inventory (read-only): ${JSON.stringify(await inventory(c))}`);
  const { residual, after } = await cleanup(svc, c);
  log(`post-cleanup inventory: ${JSON.stringify(after)}`);
  await c.end();
  const left = Object.entries(after).filter(([, n]) => n !== 0);
  if (left.length || residual.length) {
    throw new Error(`[${SYNTHETIC_LABEL}] cleanup incomplete: ${JSON.stringify({ left, residual })}`);
  }
  log('cleanup verified: no fixture row and no row referencing the fixture schools or users remains');
});

async function signIn(browser: Browser, run: ViewportRun, u: SyntheticUser): Promise<Page> {
  const context = await browser.newContext({ viewport: run.viewport });
  const page = await context.newPage();
  await page.goto('/login');
  await page.getByPlaceholder('tu@email.com').fill(u.email);
  await page.locator('input[type="password"]').fill(u.password);
  await page.getByRole('button', { name: /iniciar sesión/i }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
  return page;
}

async function courseIdOf(run: ViewportRun): Promise<string> {
  const { rows } = await c.query(
    `SELECT id FROM public.school_course_structure WHERE school_id = $1 AND course_name = '1 BASICO A'`, [run.schoolId]
  );
  expect(rows, 'exactly one course "1 BASICO A" was created by the context save').toHaveLength(1);
  return rows[0].id;
}

async function instanceOf(run: ViewportRun): Promise<{ id: string; status: string; course_structure_id: string }> {
  const { rows } = await c.query(
    `SELECT i.id, i.status, i.course_structure_id FROM public.assessment_instances i
       JOIN public.assessment_template_snapshots s ON s.id = i.template_snapshot_id
      WHERE i.school_id = $1 AND s.template_id = $2 AND i.status <> 'archived'`,
    [run.schoolId, MANIFEST.template.id]
  );
  expect(rows, 'exactly one live instance of the synthetic template for the school').toHaveLength(1);
  return rows[0];
}

for (const run of MANIFEST.runs) {
  test.describe(`[${SYNTHETIC_LABEL}] pilot journey — ${run.key} ${run.viewport.width}×${run.viewport.height}`, () => {
    test('director fills the Contexto Transversal and gets the course', async ({ browser }) => {
      const page = await signIn(browser, run, run.director);
      await page.goto(`/school/transversal-context/edit?school_id=${run.schoolId}`);
      await page.getByPlaceholder('Ej: 500').fill('40');
      await page.getByRole('button', { name: '1° Básico', exact: true }).click();
      await page.getByTestId('context-submit').click();
      await expect(page).toHaveURL(new RegExp(`/school/transversal-context\\?school_id=${run.schoolId}`), { timeout: 30_000 });
      const courseId = await courseIdOf(run);
      await expect(page.getByTestId(`course-card-${courseId}`)).toContainText('1 BASICO A');
      await page.context().close();
    });

    test('director assigns the docente; the product creates the instance', async ({ browser }) => {
      const courseId = await courseIdOf(run);
      const page = await signIn(browser, run, run.director);
      await page.goto(`/school/transversal-context?school_id=${run.schoolId}`);
      await page.getByTestId(`open-assign-docente-${courseId}`).click();
      await page.getByTestId('assign-docente-select').selectOption(run.docente.id!);
      await page.getByTestId('assign-docente-submit').click();
      await expect(page.getByText(/Docente asignado correctamente/)).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId(`course-assignment-locked-${courseId}`)).toBeVisible();

      const { rows: asg } = await c.query(
        'SELECT docente_id FROM public.school_course_docente_assignments WHERE course_structure_id = $1 AND is_active', [courseId]
      );
      expect(asg.map((r) => r.docente_id)).toEqual([run.docente.id]);
      const inst = await instanceOf(run);
      expect(inst.status).toBe('pending');
      expect(inst.course_structure_id, 'the instance belongs to the assigned course').toBe(courseId);
      const { rows: grants } = await c.query('SELECT user_id FROM public.assessment_instance_assignees WHERE instance_id = $1', [inst.id]);
      expect(grants.map((r) => r.user_id)).toEqual([run.docente.id]);
      await page.context().close();
    });

    test('docente finds the right evaluation, answers, saves, and the answers survive a reload', async ({ browser }) => {
      const inst = await instanceOf(run);
      const page = await signIn(browser, run, run.docente);
      await page.goto('/docente/assessments');
      await expect(page.getByRole('heading', { name: MANIFEST.template.name })).toBeVisible({ timeout: 30_000 });
      // A failed step stops the journey (plan C020): the failure message is the FINDING.
      await expect(page.getByTestId(`assessment-card-course-${inst.id}`), 'FINDING: the docente\'s evaluation card names the course')
        .toContainText('1 BASICO A');

      await page.goto(`/docente/assessments/${inst.id}`);
      await expect(page.getByTestId('assessment-context-course'), 'FINDING: the evaluation page names the docente\'s course')
        .toContainText('1 BASICO A');
      await page.getByRole('button', { name: `Sí: ${IND_COB.name}` }).click();
      await page.getByRole('spinbutton', { name: 'Cantidad de frecuencia' }).fill(String(MANIFEST.answers.frecuencia));
      await page.getByRole('button', { name: /^3\. Avanzado/ }).click();
      await page.getByTestId('assessment-save-button').click();
      await expect(page.getByTestId('assessment-save-status')).toContainText('Respuestas guardadas en el servidor', { timeout: 30_000 });

      const { rows: resp } = await c.query(
        'SELECT indicator_id, coverage_value, frequency_value, profundity_level FROM public.assessment_responses WHERE instance_id = $1', [inst.id]
      );
      const byInd = Object.fromEntries(resp.map((r) => [r.indicator_id, r]));
      expect(byInd[IND_COB.id]?.coverage_value).toBe(true);
      expect(Number(byInd[IND_FRE.id]?.frequency_value)).toBe(MANIFEST.answers.frecuencia);
      expect(byInd[IND_PRO.id]?.profundity_level).toBe(MANIFEST.answers.profundidad);

      await page.reload();
      const discard = page.getByTestId('discard-assessment-drafts');
      if (await discard.isVisible().catch(() => false)) await discard.click();
      await expect(page.getByRole('spinbutton', { name: 'Cantidad de frecuencia' })).toHaveValue(String(MANIFEST.answers.frecuencia));
      await expect(page.getByText(/3 de 3 indicadores \(100%\)/)).toBeVisible();
      await page.context().close();
    });

    test('docente submits; results reflect exactly the answers', async ({ browser }) => {
      const inst = await instanceOf(run);
      const page = await signIn(browser, run, run.docente);
      await page.goto(`/docente/assessments/${inst.id}`);
      await page.getByTestId('assessment-submit-button').click();
      await page.getByTestId('assessment-submit-confirm-button').click();
      await expect(page.getByRole('status').filter({ hasText: /^Registro completado$/ })).toBeVisible({ timeout: 30_000 });
      expect((await instanceOf(run)).status).toBe('completed');

      await page.goto(`/docente/assessments/${inst.id}/results`);
      await expect(page.getByText('Puntuación Total')).toBeVisible({ timeout: 30_000 });
      const row = (name: string) => page.getByRole('row').filter({ hasText: name });
      await expect(row(IND_COB.name)).toContainText('Sí');
      await expect(row(IND_COB.name)).toContainText(`${MANIFEST.expectedScores.cobertura}%`);
      await expect(row(IND_FRE.name)).toContainText(String(MANIFEST.answers.frecuencia));
      await expect(row(IND_FRE.name)).toContainText(`${MANIFEST.expectedScores.frecuencia}%`);
      await expect(row(IND_PRO.name)).toContainText('3 - Avanzado');
      await expect(row(IND_PRO.name)).toContainText(`${MANIFEST.expectedScores.profundidad}%`);
      const totalCard = page.getByText('Puntuación Total', { exact: true }).locator('xpath=../..');
      await expect(totalCard.locator('div.text-3xl')).toHaveText(`${MANIFEST.expectedScores.total}%`);

      const { rows: res } = await c.query('SELECT total_score FROM public.assessment_instance_results WHERE instance_id = $1', [inst.id]);
      expect(res).toHaveLength(1);
      expect(Number(res[0].total_score)).toBe(MANIFEST.expectedScores.total);
      await page.context().close();
    });

    test('director dashboard shows the result', async ({ browser }) => {
      const page = await signIn(browser, run, run.director);
      await page.goto('/directivo/assessments/dashboard');
      const avgCard = page.getByText('Promedio General', { exact: true }).locator('xpath=../..');
      await expect(avgCard.locator('div.text-3xl')).toHaveText(`${MANIFEST.expectedScores.total}%`, { timeout: 30_000 });
      await page.context().close();
      log(`${run.key}: every journey step passed (synthetic)`);
    });
  });
}
