import { test, expect, type Page, type Request } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateFrequencyConfig, validateFrequencyResponse } from '../../lib/services/assessment-builder/frequencyConfig';
import { mapIndicatorRow } from '../../lib/services/assessment-builder/indicatorMapper';

const id = (suffix: number) => `b0030000-0000-4000-8000-${String(suffix).padStart(12, '0')}`;
const viewports = [{ width: 1366, height: 768 }, { width: 390, height: 844 }];
const target = 'http://127.0.0.1:55621';
const live = process.env.NEXT_PUBLIC_SUPABASE_URL === target;
const users = JSON.parse(readFileSync(join(process.cwd(), 'scripts/ci/e2e-fixtures.json'), 'utf8')).users;
const invalidValues = [0, 3.2, 1.05];

function assertTarget() {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL !== target || !process.env.PROC_B003_PASSWORD) {
    throw new Error('PROC-B003 requires the isolated 55621 target and synthetic password');
  }
}

/**
 * Types an out-of-bounds or off-grid value, presses the visible Save button and returns the refused response.
 * The refusal is reported with the server's reason (for `indicatorName` when the server names the indicator), never as a
 * connection problem.
 */
async function saveInvalid(page: Page, instance: string, value: number, indicatorName?: string) {
  const input = page.getByRole('spinbutton', { name: 'Cantidad de frecuencia' });
  await input.fill(String(value));
  const validity = await input.evaluate(el => {
    const { rangeUnderflow, rangeOverflow, stepMismatch } = (el as HTMLInputElement).validity;
    return { rangeUnderflow, rangeOverflow, stepMismatch };
  });
  expect(Object.values(validity)).toContain(true);
  const refused = page.waitForResponse(response => response.url().endsWith(`/${instance}/responses`) && response.request().method() === 'PUT');
  await page.getByTestId('assessment-save-button').click();
  const response = await refused;
  expect(response.status()).toBe(400);
  expect(response.request().postDataJSON().responses[0].frequency_value).toBe(value);
  await expect(page.getByTestId('assessment-save-status')).toContainText('No hay respuestas válidas para guardar');
  const refusal = page.getByTestId('assessment-save-refusal');
  await expect(refusal).toContainText('frecuencia debe');
  if (indicatorName) await expect(refusal).toContainText(`«${indicatorName}»: frecuencia debe`);
  await expect(page.getByText(/^No se guardaron tus respuestas\. .*frecuencia debe/).first()).toBeVisible();
  await expect(page.getByText('Revisa tu conexión')).toHaveCount(0);
  await expect(input).toHaveValue(String(value));
  return { value, validity, status: response.status(), body: await response.json(), refusal: await refusal.innerText() };
}

/** A save that fails in transit or with a 5xx keeps the connection/retry message and shows no refusal reason. */
async function expectConnectionFailure(page: Page) {
  await expect(page.getByText('Revisa tu conexión e intenta nuevamente').first()).toBeVisible();
  await expect(page.getByTestId('assessment-save-refusal')).toHaveCount(0);
}

/** Network failure, then an immediate manual retry that meets a 5xx: both keep the retry message, neither is a refusal. */
async function failSaves(page: Page, abortNext: () => Promise<void>, fail500Next: () => Promise<void>) {
  await page.getByRole('spinbutton', { name: 'Cantidad de frecuencia' }).fill('1.3');
  await abortNext();
  await page.getByTestId('assessment-save-button').click();
  await expectConnectionFailure(page);
  await fail500Next();
  await page.getByTestId('assessment-save-button').click();
  await expect(page.getByTestId('assessment-save-status')).toContainText('Error sintético del servidor');
  await expectConnectionFailure(page);
}

async function login(page: Page, role: 'docente' | 'admin') {
  await page.goto('/login');
  await page.getByPlaceholder('tu@email.com').fill(live ? `${role}-proc-b003@example.test` : users[role].email);
  await page.locator('input[type="password"]').fill(live ? process.env.PROC_B003_PASSWORD! : users[role].password);
  await page.getByRole('button', { name: /Iniciar sesión/i }).click();
  await expect(page).not.toHaveURL(/\/login(?:\?|$)/, { timeout: 20_000 });
}

async function evidence(page: Page, name: string, detail: unknown) {
  const dir = process.env.UI_EVIDENCE_DIR;
  if (!dir) return;
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: join(dir, `${name}.png`), fullPage: true });
  writeFileSync(join(dir, `${name}.json`), JSON.stringify(detail, null, 2));
}

/**
 * The editor's refusal toast settles clear of the modal's save button, so the admin can retry at once (R0-F1: the app's
 * bottom-right toast covered it and, being paused while hovered, never expired under the pointer).
 */
async function expectToastClearOfSave(page: Page) {
  const toast = page.locator('[data-rht-toaster] > div > div').filter({ hasText: /Configuración de frecuencia incompleta/i });
  const save = page.getByTestId('indicator-save-btn');
  await expect(toast).toBeVisible();
  let previous = '';
  await expect.poll(async () => {
    const current = JSON.stringify(await toast.boundingBox());
    const settled = current === previous;
    previous = current;
    return settled;
  }).toBe(true);
  await save.scrollIntoViewIfNeeded();
  const [toastBox, saveBox] = [(await toast.boundingBox())!, (await save.boundingBox())!];
  const overlap = toastBox.x < saveBox.x + saveBox.width && saveBox.x < toastBox.x + toastBox.width
    && toastBox.y < saveBox.y + saveBox.height && saveBox.y < toastBox.y + toastBox.height;
  expect(overlap).toBe(false);
  expect(await save.evaluate(el => {
    const box = el.getBoundingClientRect();
    return document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)?.closest('[data-testid]') === el;
  })).toBe(true);
  return { toast: toastBox, save: saveBox };
}

/** Expands the tree as soon as it renders and asserts it does not collapse under a first-load refetch. */
async function openIndicatorEditor(page: Page, template: string, name: string) {
  const editor = page.getByRole('button', { name: `Editar indicador: ${name}` });
  const loads: string[] = [];
  const countLoad = (request: Request) => {
    if (request.method() === 'GET' && new URL(request.url()).pathname === `/api/admin/assessment-builder/templates/${template}`) {
      loads.push(request.url());
    }
  };
  page.on('request', countLoad);
  await page.goto(`/admin/assessment-builder/${template}`);
  await page.getByRole('button', { name: 'Expandir proceso generativo: Proceso sintético' }).click();
  await page.getByTestId('module-card').getByRole('button', { name: /Acción sintética/ }).first().click();
  await expect(editor).toBeVisible();
  await page.waitForLoadState('networkidle');
  await expect(editor).toBeVisible();
  expect(loads).toHaveLength(1);
  page.off('request', countLoad);
  return editor;
}

// Local runs use `next dev`, whose hot-reload socket pushes "refresh page data"/full reloads into this page whenever another
// worker's compile lands mid-journey (R0-F2). Keep the page's heartbeat to the dev server but drop those instructions; a
// production server (CI) has no such socket, so this changes nothing there.
test.beforeEach(async ({ page }) => {
  await page.routeWebSocket(/\/_next\/webpack-hmr/, ws => { ws.connectToServer().onMessage(() => {}); });
});

if (live) {
for (const [index, viewport] of viewports.entries()) {
  const n = index + 1;
  const instance = id(Number(process.env.PROC_B003_INSTANCE_START ?? 55) + index);
  const indicator = id(30 + n);
  const templateNumber = Number(process.env.PROC_B003_TEMPLATE_START ?? 13) + index;
  const template = id(templateNumber);
  const adminN = templateNumber - 10;

  test.describe(`PROC-B003 frequency @ ${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport });
    test.beforeEach(() => assertTarget());
    test.setTimeout(180_000);

    test('UI1 docente: whole/decimal persist; bounds/grid refuse without clamp; error and submit', async ({ page }) => {
      await login(page, 'docente');
      await page.goto(`/docente/assessments/${instance}`);
      const input = page.getByRole('spinbutton', { name: 'Cantidad de frecuencia' });
      await expect(input).toBeVisible();
      await expect(input).toHaveAttribute('min', '0.1');
      await expect(input).toHaveAttribute('max', '3.1');
      await expect(input).toHaveAttribute('step', '0.1');

      const saves: { status: number; body: unknown }[] = [];
      page.on('response', async response => {
        if (response.url().endsWith(`/${instance}/responses`) && response.request().method() === 'PUT') {
          saves.push({ status: response.status(), body: await response.json().catch(() => null) });
        }
      });
      await input.fill('1');
      await page.getByTestId('assessment-save-button').click();
      await expect.poll(async () => {
        const response = await page.request.get(`/api/docente/assessments/${instance}`);
        return (await response.json()).responses[indicator]?.frequencyValue;
      }, { timeout: 20_000 }).toBe(1);
      await page.reload();
      await expect(input).toHaveValue('1');
      if (await page.getByTestId('discard-assessment-drafts').isVisible()) {
        await page.getByTestId('discard-assessment-drafts').click();
      }

      await input.fill('1.2');
      await page.getByTestId('assessment-save-button').click();
      await expect.poll(async () => {
        const response = await page.request.get(`/api/docente/assessments/${instance}`);
        return (await response.json()).responses[indicator]?.frequencyValue;
      }, { timeout: 20_000 }).toBe(1.2);
      await page.reload();
      await expect(input).toHaveValue('1.2');
      if (await page.getByTestId('discard-assessment-drafts').isVisible()) {
        await page.getByTestId('discard-assessment-drafts').click();
      }

      const url = `/api/docente/assessments/${instance}/responses`;
      const denied: unknown[] = [];
      for (const value of invalidValues) {
        const viaSave = await saveInvalid(page, instance, value, `Frecuencia sintética ${n}`);
        expect(viaSave.body).toHaveProperty('details');
        const direct = await page.request.put(url, {
          data: { responses: [{ indicator_id: indicator, frequency_value: value, frequency_unit: 'semana' }] },
        });
        expect(direct.status()).toBe(400);
        const loaded = await page.request.get(`/api/docente/assessments/${instance}`);
        expect((await loaded.json()).responses[indicator].frequencyValue).toBe(1.2);
        denied.push({ viaSave, direct: { status: direct.status(), body: await direct.json() } });
      }
      await evidence(page, `docente-refused-${viewport.width}`, { denied, persisted: 1.2 });
      await failSaves(page,
        () => page.route(url, route => route.abort('internetdisconnected'), { times: 1 }),
        () => page.route(url, route => route.fulfill({ status: 500, json: { error: 'Error sintético del servidor' } }), { times: 1 }));
      const afterFailures = await page.request.get(`/api/docente/assessments/${instance}`);
      expect((await afterFailures.json()).responses[indicator].frequencyValue).toBe(1.2);
      await evidence(page, `docente-error-${viewport.width}`, { denied, saves, nativeStep: '0.1' });

      await input.fill('1.2');
      await page.getByTestId('assessment-save-button').click();
      await expect(page.getByTestId('assessment-save-status')).toContainText('Respuestas guardadas');
      await page.getByTestId('assessment-submit-button').click();
      await page.getByTestId('assessment-submit-confirm-button').click();
      await expect(page.getByText('Evaluación completada').first()).toBeVisible();
      await page.reload();
      await expect(input).toHaveValue('1.2');
      await expect(input).toBeDisabled();
      const final = await page.request.get(`/api/docente/assessments/${instance}`);
      const persisted = await final.json();
      expect(persisted.instance.status).toBe('completed');
      expect(persisted.responses[indicator].frequencyValue).toBe(1.2);
      expect(saves.some(item => item.status === 200)).toBe(true);
      await evidence(page, `docente-submitted-${viewport.width}`, { persisted: 1.2, status: 'completed', saves });
    });

    test('UI2 admin: editor and independent publish gate reject invalid config then accept valid config', async ({ page }) => {
      await login(page, 'admin');
      const editor = await openIndicatorEditor(page, template, `Frecuencia sintética ${adminN}`);
      const publish = page.getByTestId('publish-btn');
      await expect(publish).toBeEnabled();
      const refused = page.waitForResponse(response => response.url().endsWith(`/${template}/publish`) && response.request().method() === 'POST');
      await publish.click();
      await page.getByTestId('publish-confirm-btn').click();
      const refusal = await refused;
      const refusalBody = await refusal.json();
      expect(refusal.status()).toBe(400);
      await expect(page.getByText(/configuración de frecuencia|frecuencia inválida|paso/i).first()).toBeVisible();
      const before = await page.request.get(`/api/admin/assessment-builder/templates/${template}`);
      expect((await before.json()).template.status).toBe('draft');

      await openIndicatorEditor(page, template, `Frecuencia sintética ${adminN}`);
      await editor.click();
      const min = page.getByTestId('frequency-min');
      const max = page.getByTestId('frequency-max');
      const step = page.getByTestId('frequency-step');
      await min.fill('3.1');
      await max.fill('0.1');
      await step.fill('4');
      await page.getByTestId('indicator-save-btn').click();
      await expect(page.getByText(/Configuración de frecuencia incompleta/i).first()).toBeVisible();
      const toastClear = await expectToastClearOfSave(page);
      await evidence(page, `admin-toast-clear-${viewport.width}`, toastClear);
      await expect(min).toHaveValue('3.1');

      await min.fill('0.1');
      await max.fill('3.1');
      await step.fill('0.1');
      await expect(page.getByTestId('frequency-default-unit')).toHaveValue('semana');
      const updated = page.waitForResponse(response => response.url().endsWith(`/indicators/${id(30 + adminN)}`) && response.request().method() === 'PUT');
      await page.getByTestId('indicator-save-btn').click();
      expect((await updated).status()).toBe(200);
      await expect(page.getByTestId('frequency-min')).toHaveCount(0);
      await openIndicatorEditor(page, template, `Frecuencia sintética ${adminN}`);
      await editor.click();
      await expect(page.getByTestId('frequency-min')).toHaveValue('0.1');
      await expect(page.getByTestId('frequency-max')).toHaveValue('3.1');
      await expect(page.getByTestId('frequency-step')).toHaveValue('0.1');
      await page.getByRole('button', { name: 'Cancelar' }).last().click();

      const published = page.waitForResponse(response => response.url().endsWith(`/${template}/publish`) && response.request().method() === 'POST');
      await page.getByTestId('publish-btn').click();
      await page.getByTestId('publish-confirm-btn').click();
      expect((await published).status()).toBe(200);
      await page.reload();
      const after = await page.request.get(`/api/admin/assessment-builder/templates/${template}`);
      expect((await after.json()).template.status).toBe('published');
      await evidence(page, `admin-published-${viewport.width}`, {
        template, refusal: { status: refusal.status(), body: refusalBody }, status: 'published',
        config: { min: 0.1, max: 3.1, step: 0.1, unit: 'semana' },
      });
    });
  });
}
}

if (!live) {
  for (const [index, viewport] of viewports.entries()) {
    const instance = id(201 + index);
    const template = id(211 + index);
    const moduleId = id(221 + index);
    const indicator = id(231 + index);
    const name = `Frecuencia sintética ${index + 1}`;

    test.describe(`PROC-B003 default frequency @ ${viewport.width}x${viewport.height}`, () => {
      test.use({ viewport });
      test.setTimeout(120_000);
      test('D3/UI1 docente: intercepted API refuses per validateFrequencyResponse; Save, reload, errors and submit', async ({ page }) => {
        const config = { min: 0.1, max: 3.1, step: 0.1, unit: 'semana', allowed_units: ['semana'] };
        let value: number | null = null;
        let status = 'in_progress';
        let failNext = false;
        let abortNext = false;
        const writes: number[] = [];
        const attempts: number[] = [];
        await page.route(`**/api/docente/assessments/${instance}**`, async route => {
          const request = route.request();
          const path = new URL(request.url()).pathname;
          if (path.endsWith('/responses') && request.method() === 'PUT') {
            if (abortNext) {
              abortNext = false;
              await route.abort('internetdisconnected');
              return;
            }
            if (failNext) {
              failNext = false;
              await route.fulfill({ status: 500, json: { error: 'Error sintético del servidor' } });
              return;
            }
            const sent = request.postDataJSON().responses[0];
            attempts.push(sent.frequency_value);
            const verdict = validateFrequencyResponse(config, sent.frequency_value, sent.frequency_unit);
            if (verdict.ok === false) {
              await route.fulfill({ status: 400, json: { error: 'No hay respuestas válidas para guardar', details: [verdict.message] } });
              return;
            }
            value = sent.frequency_value;
            writes.push(value!);
            await route.fulfill({ json: { success: true, saved: 1 } });
          } else if (path.endsWith('/submit') && request.method() === 'POST') {
            status = 'completed';
            await route.fulfill({ json: { success: true, completedAt: new Date().toISOString() } });
          } else if (request.method() === 'GET') {
            await route.fulfill({ json: {
              instance: { id: instance, status }, assignee: { canEdit: true, canSubmit: true },
              template: { id: template, name: 'Evaluación sintética', area: 'personalizacion' }, objectives: [],
              modules: [{ id: moduleId, name: 'Acción sintética', displayOrder: 1, weight: 1,
                indicators: [{ id: indicator, name, category: 'frecuencia', displayOrder: 1, weight: 1,
                  isActiveThisYear: true, frequencyConfig: config }] }],
              responses: value === null ? {} : { [indicator]: { frequencyValue: value, frequencyUnit: 'semana' } },
              progress: { total: 1, answered: value === null ? 0 : 1, percentage: value === null ? 0 : 100 },
            } });
          } else await route.fulfill({ status: 405, json: { error: 'Unexpected assessment request' } });
        });
        await login(page, 'docente');
        await page.goto(`/docente/assessments/${instance}`);
        const input = page.getByRole('spinbutton', { name: 'Cantidad de frecuencia' });
        await expect(input).toHaveAttribute('step', '0.1');
        await input.fill('1');
        await page.getByTestId('assessment-save-button').click();
        await expect(page.getByTestId('assessment-save-status')).toContainText('Respuestas guardadas');
        await page.reload();
        await expect(input).toHaveValue('1');
        await input.fill('1.2');
        await page.getByTestId('assessment-save-button').click();
        await expect.poll(() => value).toBe(1.2);
        await page.reload();
        await expect(input).toHaveValue('1.2');
        const denied = [];
        for (const invalid of invalidValues) {
          denied.push(await saveInvalid(page, instance, invalid));
          expect(value).toBe(1.2);
        }
        expect(attempts.slice(-invalidValues.length)).toEqual(invalidValues);
        await failSaves(page, async () => { abortNext = true; }, async () => { failNext = true; });
        expect(value).toBe(1.2);
        await input.fill('1.2');
        await page.getByTestId('assessment-save-button').click();
        await expect(page.getByTestId('assessment-save-status')).toContainText('Respuestas guardadas');
        await page.getByTestId('assessment-submit-button').click();
        await page.getByTestId('assessment-submit-confirm-button').click();
        await expect(page.getByText('Evaluación completada').first()).toBeVisible();
        await page.reload();
        await expect(input).toHaveValue('1.2');
        await expect(input).toBeDisabled();
        expect(writes).toEqual([1, 1.2, 1.2]);
        await evidence(page, `default-docente-${viewport.width}`, { attempts, writes, denied, status });
      });

      test('D3/UI2 admin: real editor validation; intercepted publish refuses per validateFrequencyConfig', async ({ page }) => {
        let status = 'draft';
        let updated = false;
        const publishes: { status: number; errors: string[] }[] = [];
        let config = { min: 0.1, max: 3.1, step: 4, unit: 'semana', allowed_units: ['semana'] };
        const objective = { id: id(241 + index), name: 'Proceso sintético', display_order: 1, weight: 1, module_count: 1 };
        const module = { id: moduleId, objective_id: objective.id, name: 'Acción sintética', display_order: 1, weight: 1, indicator_count: 2 };
        const coverage = { id: id(251 + index), module_id: moduleId, code: 'C1', name: 'Cobertura sintética', category: 'cobertura', display_order: 1, weight: 1 };
        const frequency = () => ({ id: indicator, module_id: moduleId, code: 'F1', name, category: 'frecuencia', display_order: 2,
          weight: 1, frequency_config: config, frequency_unit_options: ['semana'] });
        await page.route(`**/api/admin/assessment-builder/templates/${template}**`, async route => {
          const request = route.request();
          const path = new URL(request.url()).pathname;
          if (request.method() === 'GET' && path.endsWith(`/${template}`)) {
            await route.fulfill({ json: { template: { id: template, name: 'Plantilla sintética', area: 'personalizacion',
              version: '1.0.0', status, is_archived: false, modules: [{ ...module, indicators: [coverage, frequency()] }] } } });
          } else if (request.method() === 'GET' && path.endsWith('/objectives')) {
            await route.fulfill({ json: { objectives: [objective] } });
          } else if (request.method() === 'GET' && path.endsWith('/modules')) {
            await route.fulfill({ json: { modules: [module] } });
          } else if (request.method() === 'GET' && path.endsWith('/indicators')) {
            await route.fulfill({ json: { indicators: [coverage, frequency()].map(mapIndicatorRow) } });
          } else if (request.method() === 'PUT' && path.endsWith(`/indicators/${indicator}`)) {
            config = request.postDataJSON().frequencyConfig;
            updated = true;
            await route.fulfill({ json: { indicator: mapIndicatorRow(frequency()) } });
          } else if (request.method() === 'POST' && path.endsWith('/publish')) {
            const { valid, errors } = validateFrequencyConfig(config);
            publishes.push({ status: valid ? 200 : 400, errors });
            if (!valid) await route.fulfill({ status: 400, json: { error: 'Configuración de frecuencia inválida', details: errors } });
            else { status = 'published'; await route.fulfill({ json: { template: { version: '1.0.0' }, message: 'Template publicado correctamente' } }); }
          } else await route.fulfill({ status: 405, json: { error: 'Unexpected builder request' } });
        });
        await login(page, 'admin');
        const editor = await openIndicatorEditor(page, template, name);
        await page.getByTestId('publish-btn').click();
        await page.getByTestId('publish-confirm-btn').click();
        await expect(page.getByText(/Configuración de frecuencia inválida/i).first()).toBeVisible();
        expect(publishes).toEqual([{ status: 400, errors: [expect.stringContaining('paso')] }]);
        expect(status).toBe('draft');
        await openIndicatorEditor(page, template, name);
        await editor.click();
        const min = page.getByTestId('frequency-min');
        await min.fill('3.1');
        await page.getByTestId('frequency-max').fill('0.1');
        await page.getByTestId('frequency-step').fill('4');
        await page.getByTestId('indicator-save-btn').click();
        await expect(page.getByText(/Configuración de frecuencia incompleta/i).first()).toBeVisible();
        const toastClear = await expectToastClearOfSave(page);
        expect(updated).toBe(false);
        await min.fill('0.1');
        await page.getByTestId('frequency-max').fill('3.1');
        await page.getByTestId('frequency-step').fill('0.1');
        await page.getByTestId('indicator-save-btn').click();
        await expect.poll(() => updated).toBe(true);
        expect(config).toMatchObject({ min: 0.1, max: 3.1, step: 0.1, unit: 'semana' });
        await page.getByTestId('publish-btn').click();
        await page.getByTestId('publish-confirm-btn').click();
        await expect.poll(() => status).toBe('published');
        expect(publishes.map(item => item.status)).toEqual([400, 200]);
        await page.reload();
        await expect(page.getByText(/Publicado|published/i).first()).toBeVisible();
        await evidence(page, `default-admin-${viewport.width}`, { status, config, publishes, toastClear });
      });
    });
  }
}
