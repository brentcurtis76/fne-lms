import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { join } from 'node:path';
import { ensureStorageState, storageStatePath } from './helpers/auth';

// Real authenticated admin page, intercepted expectations API only: the PUT never
// reaches the server, so these journeys prove what the editor sends and shows,
// not database persistence. PROC-20.
const TEMPLATE_ID = 'ab000020-0000-4000-8000-000000000001';
const FREQ = 'ab000020-0000-4000-8000-0000000000f1';
const PAGE = `/admin/assessment-builder/${TEMPLATE_ID}/expectations`;
const ERROR_TEXT =
  'No se guardaron los cambios: la cantidad de frecuencia debe ser un número entero mayor o igual a 0.';

type Row = Record<string, unknown>;

const emptyRow = (): Row => ({
  year1: null, year1Unit: null, year2: null, year2Unit: null, year3: null, year3Unit: null,
  year4: null, year4Unit: null, year5: null, year5Unit: null, tolerance: 1,
});

async function expectationsApi(context: BrowserContext) {
  const stored: Record<string, Row> = {
    GT: { ...emptyRow(), year1: 2, year1Unit: 'mes' },
    GI: emptyRow(),
  };
  const puts: Row[][] = [];
  let failNext: number | null = null;

  await context.route(`**/api/admin/assessment-builder/templates/${TEMPLATE_ID}/expectations**`, async route => {
    const request = route.request();
    if (request.method() === 'PUT') {
      const rows = request.postDataJSON().expectations as Row[];
      puts.push(rows);
      if (failNext !== null) {
        const status = failNext;
        failNext = null;
        await route.fulfill({ status, json: { error: 'Error sintético del servidor' } });
        return;
      }
      for (const row of rows) stored[row.generationType as string] = row;
      await route.fulfill({ json: { success: true, saved: rows.length } });
      return;
    }
    if (request.method() !== 'GET') {
      await route.fulfill({ status: 400, json: { error: 'Unexpected method in expectations test' } });
      return;
    }
    await route.fulfill({ json: {
      template: {
        id: TEMPLATE_ID, name: 'Plantilla sintética PROC-20', area: 'evaluacion', status: 'draft',
        version: '1.0', isAlwaysGT: false, requiresDualExpectations: true,
      },
      modules: [{
        moduleId: 'mod-1', moduleName: 'Acción sintética', moduleOrder: 1,
        indicators: [{
          indicatorId: FREQ, indicatorCode: 'F1', indicatorName: 'Frecuencia sintética',
          indicatorCategory: 'frecuencia', frequencyUnitOptions: ['semana', 'mes'],
          expectationsGT: stored.GT, expectationsGI: stored.GI,
        }],
      }],
      objectives: [],
    } });
  });

  return { puts, stored, failNextPut: (status: number) => { failNext = status; } };
}

// PostgREST calls every RPC with POST; this one is a STABLE permission check the layout makes.
const READ_ONLY_RPCS = ['/rest/v1/rpc/has_feedback_permission'];

// Every write the page attempts outside the intercepted expectations route.
function watchUnexpectedWrites(page: Page) {
  const writes: string[] = [];
  page.on('request', request => {
    const method = request.method();
    if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return;
    if (request.url().includes(`/templates/${TEMPLATE_ID}/expectations`)) return;
    if (method === 'POST' && READ_ONLY_RPCS.some(rpc => new URL(request.url()).pathname === rpc)) return;
    writes.push(`${method} ${request.url()}`);
  });
  return writes;
}

async function shot(page: Page, name: string) {
  if (process.env.UI_EVIDENCE_DIR) await page.screenshot({ path: join(process.env.UI_EVIDENCE_DIR, name), fullPage: true });
}

const count = (page: Page, gen: 'GT' | 'GI', year: number) => page.getByTestId(`freq-${FREQ}-${gen}-year${year}`);
const unit = (page: Page, gen: 'GT' | 'GI', year: number) => page.getByTestId(`freq-${FREQ}-${gen}-year${year}-unit`);

async function saveWithKeyboard(page: Page) {
  await page.getByRole('button', { name: 'Guardar Cambios' }).focus();
  await page.keyboard.press('Enter');
}

// The typed count must be fully visible inside its input and the control inside the viewport.
async function expectNotClipped(page: Page, testId: string) {
  const control = page.getByTestId(testId);
  const box = await control.evaluate(el => {
    const input = el as HTMLInputElement;
    return { scroll: input.scrollWidth, client: input.clientWidth };
  });
  expect(box.scroll).toBeLessThanOrEqual(box.client);
  await control.scrollIntoViewIfNeeded();
  const rect = await control.boundingBox();
  expect(rect).not.toBeNull();
  expect(rect!.x).toBeGreaterThanOrEqual(0);
  expect(rect!.x + rect!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
}

for (const viewport of [{ width: 1366, height: 768 }, { width: 390, height: 844 }]) {
  test.describe(`Expectations editor frequency counts @ ${viewport.width}x${viewport.height}`, () => {
    test.use({ storageState: storageStatePath('admin'), viewport });
    test.beforeAll(async ({ browser }) => {
      test.setTimeout(120_000);
      await ensureStorageState(browser, 'admin');
    });

    test('D1: a fractional count stays visible, shows the es-CL error and sends no PUT', async ({ page, context }) => {
      const api = await expectationsApi(context);
      const writes = watchUnexpectedWrites(page);
      await page.goto(PAGE);

      await count(page, 'GT', 2).fill('1.5');
      await saveWithKeyboard(page);

      const error = page.getByTestId('frequency-count-error');
      await expect(error).toBeVisible();
      await expect(error).toContainText(ERROR_TEXT);
      await expect(error).toContainText('Revisa: F1 (GT, Año 2)');
      await expect(count(page, 'GT', 2)).toHaveValue('1.5');
      await expect(count(page, 'GT', 2)).toBeFocused();
      await expect(count(page, 'GT', 2)).toHaveAttribute('aria-invalid', 'true');
      await shot(page, `d1-fraction-${viewport.width}.png`);
      expect(api.puts).toHaveLength(0);
      expect(writes).toEqual([]);
    });

    test('D2: a count with the visible default period saves that pair and reloads it', async ({ page, context }) => {
      const api = await expectationsApi(context);
      const writes = watchUnexpectedWrites(page);
      await page.goto(PAGE);

      await expect(unit(page, 'GT', 2)).toHaveValue('semana');
      await count(page, 'GT', 2).focus();
      await page.keyboard.type('5');
      await page.keyboard.press('Tab');
      await expect(unit(page, 'GT', 2)).toBeFocused();
      await expectNotClipped(page, `freq-${FREQ}-GT-year2-unit`);
      await expect(page.getByText('Hay cambios sin guardar')).toBeVisible();
      await saveWithKeyboard(page);

      await expect(page.getByText('1 expectativa guardada')).toBeVisible();
      await expect(page.getByText('Hay cambios sin guardar')).toBeHidden();
      await expect(page.getByRole('button', { name: 'Guardar Cambios' })).toBeDisabled();
      expect(api.puts).toHaveLength(1);
      expect(api.puts[0]).toHaveLength(1);
      expect(api.puts[0][0]).toMatchObject({ indicatorId: FREQ, generationType: 'GT', year2: 5, year2Unit: 'semana' });

      await page.reload();
      await expect(count(page, 'GT', 2)).toHaveValue('5');
      await expect(unit(page, 'GT', 2)).toHaveValue('semana');
      await shot(page, `d2-reload-${viewport.width}.png`);
      expect(writes).toEqual([]);
    });

    test('D3: 1000 reaches the PUT unchanged and a cleared count saves as null', async ({ page, context }) => {
      const api = await expectationsApi(context);
      const writes = watchUnexpectedWrites(page);
      await page.goto(PAGE);

      await expect(count(page, 'GT', 4)).not.toHaveAttribute('max');
      await count(page, 'GT', 4).fill('1000');
      await expectNotClipped(page, `freq-${FREQ}-GT-year4`);
      await count(page, 'GT', 1).fill('');
      await saveWithKeyboard(page);

      await expect(page.getByText('1 expectativa guardada')).toBeVisible();
      expect(api.puts[0][0]).toMatchObject({ generationType: 'GT', year1: null, year4: 1000, year4Unit: 'semana' });

      await page.reload();
      await expect(count(page, 'GT', 4)).toHaveValue('1000');
      await expect(count(page, 'GT', 1)).toHaveValue('');
      await shot(page, `d3-1000-${viewport.width}.png`);
      expect(writes).toEqual([]);
    });

    test('D4: a server error is shown and the edit stays unsaved', async ({ page, context }) => {
      const api = await expectationsApi(context);
      await page.goto(PAGE);

      api.failNextPut(500);
      await count(page, 'GI', 1).fill('3');
      await saveWithKeyboard(page);

      await expect(page.getByText('Error sintético del servidor')).toBeVisible();
      await expect(page.getByText('Hay cambios sin guardar')).toBeVisible();
      await expect(count(page, 'GI', 1)).toHaveValue('3');
      expect(api.puts[0]).toEqual([expect.objectContaining({ generationType: 'GI', year1: 3, year1Unit: 'semana' })]);
      expect(api.stored.GI.year1).toBeNull();
      await shot(page, `d4-error-${viewport.width}.png`);
    });
  });
}

// Middleware decides access before the page renders, so neither case may reach the expectations API.
function watchExpectationsRequests(page: Page) {
  const requests: string[] = [];
  page.on('request', request => {
    if (request.url().includes('/api/admin/assessment-builder')) requests.push(`${request.method()} ${request.url()}`);
  });
  return requests;
}

for (const viewport of [{ width: 1366, height: 768 }, { width: 390, height: 844 }]) {
  test.describe(`Expectations editor access @ ${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport });

    test('without a session the editor redirects to login and sends no expectations request', async ({ page }) => {
      const requests = watchExpectationsRequests(page);
      await page.goto(PAGE);
      await expect(page).toHaveURL(/\/login\?next=/);
      await shot(page, `access-no-session-${viewport.width}.png`);
      expect(requests).toEqual([]);
    });

    test.describe('denied role', () => {
      test.use({ storageState: storageStatePath('docente') });
      test.beforeAll(async ({ browser }) => {
        test.setTimeout(120_000);
        await ensureStorageState(browser, 'docente');
      });

      test('a docente is redirected to the dashboard and sends no expectations request', async ({ page }) => {
        const requests = watchExpectationsRequests(page);
        await page.goto(PAGE);
        await expect(page).toHaveURL(/\/dashboard(\?|$)/);
        await shot(page, `access-denied-docente-${viewport.width}.png`);
        expect(requests).toEqual([]);
      });
    });
  });
}
