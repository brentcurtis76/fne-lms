import { test, expect, type BrowserContext } from '@playwright/test';
import { ensureStorageState, storageStatePath } from './helpers/auth';

// Real authenticated page and browser storage, intercepted assessment API only.
// These tests prove client recovery/order, not database persistence. API failure
// semantics and the response journal are also covered by dedicated Vitest tests.
const INSTANCE = 'aaaaaaaa-0000-4000-8000-000000000091';
const PAGE = `/docente/assessments/${INSTANCE}`;

async function assessmentApi(context: BrowserContext) {
  let frequencyValue = 2;
  let failSave = false;
  let failLoad = false;
  const writes: number[] = [];
  await context.route(`**/api/docente/assessments/${INSTANCE}**`, async route => {
    const request = route.request();
    if (request.method() === 'PUT') {
      if (failSave) { await route.abort('internetdisconnected'); return; }
      const body = request.postDataJSON();
      frequencyValue = body.responses[0].frequency_value;
      writes.push(frequencyValue);
      await route.fulfill({ json: { saved: body.responses.length, success: true } });
      return;
    }
    if (request.method() !== 'GET') {
      await route.fulfill({ status: 400, json: { error: 'Unexpected submission in draft test' } });
      return;
    }
    if (failLoad) {
      await route.fulfill({ status: 500, json: { error: 'No se pudieron recuperar las respuestas guardadas.' } });
      return;
    }
    await route.fulfill({ json: {
      instance: { id: INSTANCE, status: 'in_progress' },
      template: { name: 'Evaluación sintética de recuperación', area: 'personalizacion' },
      assignee: { canEdit: true }, objectives: [],
      modules: [{ id: 'module', name: 'Acción sintética', displayOrder: 0, weight: 1, indicators: [{
        id: 'indicator', name: 'Frecuencia sintética', category: 'frecuencia', displayOrder: 0,
        weight: 1, isActiveThisYear: true,
      }] }],
      responses: { indicator: { frequencyValue } },
      progress: { total: 1, answered: 1, percentage: 100 },
    } });
  });
  return { writes, setSaveFailure: (value: boolean) => { failSave = value; },
    setLoadFailure: (value: boolean) => { failLoad = value; } };
}

test.describe('Assessment draft recovery', () => {
  test.use({ storageState: storageStatePath('docente') });
  test.beforeAll(async ({ browser }) => {
    test.setTimeout(120_000);
    await ensureStorageState(browser, 'docente');
  });

  test('recovers after a forced close and saves on reconnect, then reloads the saved answer', async ({ page, context }) => {
    const api = await assessmentApi(context);
    api.setSaveFailure(true);
    await page.goto(PAGE);
    const answer = page.getByRole('spinbutton', { name: 'Cantidad de frecuencia' });
    await expect(answer).toHaveValue('2');
    await answer.fill('17');
    await expect(page.getByTestId('assessment-save-status')).toContainText('borrador');
    // Force-close: no unload handler or final network request is needed for recovery.
    await page.close();
    const reopened = await context.newPage();
    await reopened.goto(PAGE);
    await expect(reopened.getByTestId('recover-assessment-draft')).toBeVisible();
    await expect(reopened.getByRole('spinbutton', { name: 'Cantidad de frecuencia' })).toHaveValue('2');
    await reopened.getByTestId('recover-assessment-draft').click();
    await expect(reopened.getByRole('spinbutton', { name: 'Cantidad de frecuencia' })).toHaveValue('17');
    api.setSaveFailure(false);
    await reopened.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect(reopened.getByTestId('assessment-save-status')).toContainText('Respuestas guardadas en el servidor.');
    expect(api.writes).toEqual([17]);
    await reopened.reload();
    await expect(reopened.getByRole('spinbutton', { name: 'Cantidad de frecuencia' })).toHaveValue('17');
    await expect(reopened.getByTestId('recover-assessment-draft')).toHaveCount(0);
  });

  test('shows a retry screen on load failure instead of an empty editable form', async ({ page, context }) => {
    const api = await assessmentApi(context);
    api.setLoadFailure(true);
    await page.goto(PAGE);
    await expect(page.getByRole('heading', { name: 'No pudimos cargar la evaluación' })).toBeVisible();
    await expect(page.getByRole('spinbutton')).toHaveCount(0);
    api.setLoadFailure(false);
    await page.getByTestId('retry-assessment-load').click();
    await expect(page.getByRole('spinbutton', { name: 'Cantidad de frecuencia' })).toHaveValue('2');
    expect(api.writes).toEqual([]);
  });
});

// Cobertura gate at submission (W-B1c-01). The assessment GET is intercepted with a
// synthetic module; the valid-submit POST is answered in the browser (the route's own
// verdict is covered by __tests__/api/docente/assessments/submit.test.ts), while the
// unassigned-caller POST reaches the real route and its RLS-scoped assignee check.
const GATE_MODULE = {
  id: 'gate-module', name: 'Acción sintética con cobertura', displayOrder: 0, weight: 1, indicators: [
    { id: 'gate-cob', name: 'Cobertura sintética', category: 'cobertura', displayOrder: 0, weight: 1, isActiveThisYear: true },
    { id: 'gate-frec', name: 'Frecuencia condicionada', category: 'frecuencia', displayOrder: 1, weight: 1, isActiveThisYear: true },
    { id: 'gate-tras', name: 'Traspaso inactivo este año', category: 'traspaso', displayOrder: 2, weight: 1, isActiveThisYear: false },
  ],
};

async function gateAssessmentApi(context: BrowserContext, instance: string, coverageValue: boolean, answerSubmit: boolean) {
  const submits: number[] = [];
  await context.route(`**/api/docente/assessments/${instance}`, route => route.fulfill({ json: {
    instance: { id: instance, status: 'in_progress' },
    template: { name: 'Evaluación sintética de cobertura', area: 'personalizacion' },
    assignee: { canEdit: true, canSubmit: true }, objectives: [], modules: [GATE_MODULE],
    responses: { 'gate-cob': { coverageValue } },
    progress: { total: 1, answered: 1, percentage: 100 },
  } }));
  if (answerSubmit) {
    await context.route(`**/api/docente/assessments/${instance}/submit`, route => {
      submits.push(1);
      return route.fulfill({ json: { success: true, completedAt: '2026-09-25T12:00:00.000Z' } });
    });
  }
  return submits;
}

for (const viewport of [{ name: 'desktop', width: 1280, height: 800 }, { name: 'mobile', width: 375, height: 667 }]) {
  test.describe(`Assessment cobertura gate submission (${viewport.name})`, () => {
    test.use({ storageState: storageStatePath('docente'), viewport });
    test.beforeAll(async ({ browser }) => {
      test.setTimeout(120_000);
      await ensureStorageState(browser, 'docente');
    });

    test('closed gate: hidden and inactive indicators are not required and the teacher can submit', async ({ page, context }) => {
      const instance = 'aaaaaaaa-0000-4000-8000-000000000092';
      const submits = await gateAssessmentApi(context, instance, false, true);
      await page.goto(`/docente/assessments/${instance}`);
      await expect(page.getByText('Cobertura sintética')).toBeVisible();
      await expect(page.getByText('No implementada')).toBeVisible();
      await expect(page.getByText('Frecuencia condicionada')).toHaveCount(0);
      await expect(page.getByText('Traspaso inactivo este año')).toHaveCount(0);
      await page.getByTestId('assessment-submit-button').click();
      await page.getByTestId('assessment-submit-confirm-button').click();
      await expect(page.getByRole('status').filter({ hasText: /^Evaluación completada$/ })).toBeVisible();
      await expect(page.getByRole('main').getByText('Evaluación completada', { exact: true })).toBeVisible();
      await expect(page.getByTestId('assessment-submit-button')).toHaveCount(0);
      expect(submits).toEqual([1]);
    });

    test('open gate: a missing applicable answer keeps submission blocked', async ({ page, context }) => {
      const instance = 'aaaaaaaa-0000-4000-8000-000000000093';
      const submits = await gateAssessmentApi(context, instance, true, true);
      await page.goto(`/docente/assessments/${instance}`);
      await expect(page.getByText('Frecuencia condicionada')).toBeVisible();
      await expect(page.getByText('Traspaso inactivo este año')).toHaveCount(0);
      await expect(page.getByTestId('assessment-submit-button')).toBeDisabled();
      expect(submits).toEqual([]);
    });

    test('unassigned (other-school) caller: the real submit route denies the closed-gate submission', async ({ page, context }) => {
      const instance = 'aaaaaaaa-0000-4000-8000-000000000094';
      await gateAssessmentApi(context, instance, false, false);
      const denied = page.waitForResponse(response => response.url().endsWith(`/api/docente/assessments/${instance}/submit`));
      await page.goto(`/docente/assessments/${instance}`);
      await page.getByTestId('assessment-submit-button').click();
      await page.getByTestId('assessment-submit-confirm-button').click();
      expect((await denied).status()).toBe(403);
      await expect(page.getByText('No tienes permiso para enviar esta evaluación')).toBeVisible();
      await expect(page.getByTestId('assessment-submit-button')).toBeVisible();
    });
  });
}
