import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { join } from 'node:path';
import { ensureStorageState, storageStatePath } from './helpers/auth';
import { calculateDemoScores, type DemoScoringInput } from '../../lib/services/assessment-builder/clientScoringService';

// W-B1c-02: what a practice closed by the cobertura gate contributes to the
// teacher-visible total. The local synthetic tenant has no assessment rows and
// seeding them is out of scope, so the results GET is fulfilled with the output
// of the real scorer over a synthetic mixed assessment (server/client agreement
// is proven in __tests__/lib/services/assessment-builder/scoringService.test.ts).
// The unassigned-caller case reaches the real route and its assignee check.
const MODULES: DemoScoringInput['modules'] = [
  { id: 'A', name: 'Práctica cerrada', weight: 3, indicators: [
    { id: 'a-prof', name: 'Profundidad A', category: 'profundidad', weight: 2, display_order: 2 },
    { id: 'a-inactive', name: 'Inactiva A', category: 'profundidad', weight: 5, display_order: 0, is_active_this_year: false },
    { id: 'a-cob', name: 'Cobertura A', category: 'cobertura', weight: 1, display_order: 1 },
    { id: 'a-frec', name: 'Frecuencia A', category: 'frecuencia', weight: 1, display_order: 3,
      frequency_config: { type: 'count', min: 0, max: 10 } },
  ] },
  { id: 'B', name: 'Práctica abierta', weight: 2, indicators: [
    { id: 'b-cob', name: 'Cobertura B', category: 'cobertura', weight: 1, display_order: 1 },
    { id: 'b-prof', name: 'Profundidad B', category: 'profundidad', weight: 3, display_order: 2 },
    { id: 'b-trasp', name: 'Traspaso B', category: 'traspaso', weight: 2, display_order: 3, is_active_this_year: false },
  ] },
  { id: 'C', name: 'Práctica sin indicadores este año', weight: 5, indicators: [
    { id: 'c-cob', name: 'Cobertura C', category: 'cobertura', weight: 1, display_order: 1, is_active_this_year: false },
  ] },
];

function resultsPayload(instance: string, gate: boolean) {
  const scores = calculateDemoScores({
    objectives: [],
    modules: MODULES,
    responses: {
      'a-cob': { coverage_value: gate },
      // Stale auto-saved answers left under the gate.
      'a-prof': { profundity_level: 4 },
      'a-frec': { frequency_value: 10 },
      'a-inactive': { profundity_level: 4 },
      'b-cob': { coverage_value: true },
      'b-prof': { profundity_level: 2 },
      'b-trasp': { sub_responses: { evidence_link: 'https://example.com/evidencia' } },
    },
    expectations: [],
    scoringConfig: {
      level_thresholds: { consolidated: 87.5, advanced: 62.5, developing: 37.5, emerging: 12.5 },
      default_weights: { objective: 1, module: 1, indicator: 1 },
    },
    transformationYear: 2,
    generationType: 'GT',
    templateName: 'Evaluación sintética de puntuación',
    templateArea: 'evaluacion',
  });
  return {
    success: true,
    instance: { id: instance, status: 'completed', completedAt: '2026-09-25T12:00:00.000Z',
      transformationYear: 2, generationType: 'GT', snapshotVersion: '1' },
    template: { name: 'Evaluación sintética de puntuación', area: 'evaluacion', areaLabel: 'Evaluación' },
    results: {
      totalScore: scores.totalScore, overallLevel: scores.overallLevel, overallLevelLabel: scores.overallLevelLabel,
      expectedLevel: scores.expectedLevel, expectedLevelLabel: scores.expectedLevelLabel,
      meetsExpectations: scores.meetsExpectations, objectiveScores: null, moduleScores: scores.moduleScores,
    },
    stats: scores.stats,
    gapAnalysis: null,
  };
}

async function openResults(page: Page, context: BrowserContext, instance: string, gate: boolean) {
  await context.route(`**/api/docente/assessments/${instance}/results`,
    route => route.fulfill({ json: resultsPayload(instance, gate) }));
  await page.goto(`/docente/assessments/${instance}/results`);
}

const totalCard = (page: Page) =>
  page.getByText('Puntuación Total', { exact: true }).locator('xpath=ancestor::div[contains(@class,"rounded-lg")][1]');

async function evidence(page: Page, name: string) {
  if (process.env.UI_EVIDENCE_DIR) {
    await page.screenshot({ path: join(process.env.UI_EVIDENCE_DIR, `${name}.png`), fullPage: true });
  }
}

for (const viewport of [{ name: 'desktop', width: 1280, height: 800 }, { name: 'mobile', width: 375, height: 667 }]) {
  test.describe(`Assessment results with a gate-closed practice (${viewport.name})`, () => {
    test.use({ storageState: storageStatePath('docente'), viewport });
    test.beforeAll(async ({ browser }) => {
      test.setTimeout(120_000);
      await ensureStorageState(browser, 'docente');
    });

    test('closed gate: the practice shows 0% at full weight and stale answers do not reach the total', async ({ page, context }) => {
      await openResults(page, context, 'aaaaaaaa-0000-4000-8000-000000000211', false);
      // (0*3 + 62.5*2) / 5 = 25. Scoring the stale answers would show 70%.
      await expect(totalCard(page)).toContainText('25%');
      await expect(totalCard(page)).not.toContainText('70%');
      const closed = page.getByRole('button', { name: /Práctica cerrada/ });
      await expect(closed).toContainText('0%');
      await expect(closed).toContainText('1 indicador');
      const open = page.getByRole('button', { name: /Práctica abierta/ });
      await expect(open).toContainText('63%');
      await expect(open).toContainText('2 indicadores');
      await expect(page.getByRole('cell', { name: 'Cobertura A' })).toBeVisible();
      for (const hidden of ['Profundidad A', 'Frecuencia A', 'Inactiva A']) {
        await expect(page.getByRole('cell', { name: hidden })).toHaveCount(0);
      }
      await expect(page.getByRole('button', { name: /Práctica sin indicadores este año/ })).toHaveCount(0);
      await evidence(page, `results-closed-${viewport.name}`);
    });

    test('counterexample, open gate: the same downstream answers now count and the total rises to 85%', async ({ page, context }) => {
      await openResults(page, context, 'aaaaaaaa-0000-4000-8000-000000000212', true);
      // A = 100, total = (100*3 + 62.5*2) / 5 = 85.
      await expect(totalCard(page)).toContainText('85%');
      const closed = page.getByRole('button', { name: /Práctica cerrada/ });
      await expect(closed).toContainText('100%');
      await expect(closed).toContainText('3 indicadores');
      await expect(page.getByRole('cell', { name: 'Profundidad A' })).toBeVisible();
      await expect(page.getByRole('cell', { name: 'Inactiva A' })).toHaveCount(0);
      await evidence(page, `results-open-${viewport.name}`);
    });

    test('unassigned caller: the real results route denies access and no score is shown', async ({ page }) => {
      const instance = 'aaaaaaaa-0000-4000-8000-000000000213';
      const denied = page.waitForResponse(response => response.url().endsWith(`/api/docente/assessments/${instance}/results`));
      await page.goto(`/docente/assessments/${instance}/results`);
      expect((await denied).status()).toBe(403);
      await expect(page.getByText('No tienes permiso para ver los resultados de esta evaluación')).toBeVisible();
      await expect(page.getByText('Puntuación Total', { exact: true })).toHaveCount(0);
      await evidence(page, `results-denied-${viewport.name}`);
    });
  });
}
