import { test, expect, type Browser, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { E2E_USERS, loginViaUi } from './helpers/auth';

/**
 * N0-01 — the feedback modal's admin notification (/api/feedback/notify-admins).
 *
 * The browser sends only the persisted feedback id; the server decides who is
 * notified and with what text. The modal's own notify request is observed and
 * then aborted (desktop) or rewritten to an id with no row (mobile), so no run
 * of this spec can reach an e-mail provider. Every request the real server
 * answers here is a refusal that returns before anything is sent; the success
 * path through the real handler is covered by
 * __tests__/api/feedback/notify-admins.test.ts.
 *
 * Personas are the seeded synthetic fixtures: `admin` creates the feedback (the
 * feedback button is shown to admins), `docente` is a signed-in non-creator.
 */

const NOTIFY = '**/api/feedback/notify-admins';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EVIDENCE_DIR = process.env.UI_EVIDENCE_DIR;
const DESKTOP = { width: 1366, height: 768 };
const MOBILE = { width: 390, height: 844 };

const evidence: Record<string, unknown> = {};

async function shot(page: Page, name: string) {
  const dir = EVIDENCE_DIR ?? test.info().outputDir;
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: join(dir, `${name}.png`), fullPage: true });
}

async function signedInPage(browser: Browser, key: 'admin' | 'docente', viewport: typeof DESKTOP) {
  const context = await browser.newContext({ viewport, storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text().slice(0, 200));
  });
  await loginViaUi(page, E2E_USERS[key]);
  return { context, page, consoleErrors };
}

async function openModal(page: Page) {
  const trigger = page.getByRole('button', { name: 'Enviar feedback', exact: true });
  await trigger.focus();
  await page.keyboard.press('Enter');
  const textarea = page.getByPlaceholder('El botón no funciona cuando...');
  await expect(textarea).toBeFocused();
  return textarea;
}

test.describe.configure({ mode: 'serial' });

test.describe('feedback modal → notify-admins (N0-01)', () => {
  let feedbackId = '';

  test.afterAll(() => {
    if (EVIDENCE_DIR) {
      writeFileSync(join(EVIDENCE_DIR, 'ui-evidence.json'), JSON.stringify(evidence, null, 2));
    }
  });

  test('UI1: desktop creator submits feedback; the notify request carries only the id', async ({ browser }) => {
    const { context, page, consoleErrors } = await signedInPage(browser, 'admin', DESKTOP);
    const notifyBodies: unknown[] = [];
    await page.route(NOTIFY, async (route) => {
      notifyBodies.push(route.request().postDataJSON());
      await route.abort('blockedbyclient');
    });

    const marker = `NOTIF-01 E2E escritorio ${Date.now()}`;
    await openModal(page);
    await page.keyboard.type(marker);
    await page.getByRole('button', { name: 'Problema' }).click();
    await page.getByRole('button', { name: 'Enviar →' }).click();

    await expect(page.getByText('Tu reporte fue enviado.')).toBeVisible();
    await expect.poll(() => notifyBodies.length).toBe(1);
    const body = notifyBodies[0] as Record<string, unknown>;
    expect(Object.keys(body)).toEqual(['feedback_id']);
    expect(String(body.feedback_id)).toMatch(UUID);
    feedbackId = String(body.feedback_id);
    await expect(page.getByText(`#FB-${feedbackId.slice(0, 8).toUpperCase()}`)).toBeVisible();
    await shot(page, 'ui1-desktop-success');

    // Persisted: still there after navigating away and reloading.
    await page.goto('/admin/feedback');
    await page.reload();
    await expect(page.getByText(marker)).toBeVisible();
    await shot(page, 'ui1-desktop-after-reload');
    expect(notifyBodies).toHaveLength(1);

    evidence.UI1 = {
      actor: E2E_USERS.admin.email,
      role: 'admin (feedback creator)',
      viewport: '1366x768',
      actions: ['login', 'keyboard-open modal', 'type description', 'click Problema', 'submit', 'reload /admin/feedback'],
      notifyRequests: notifyBodies,
      notifyHandling: 'observed, then aborted by the test (no provider reachable)',
      feedbackId,
      marker,
      consoleErrors,
      screenshots: ['ui1-desktop-success.png', 'ui1-desktop-after-reload.png'],
    };
    await context.close();
  });

  test('UI2: mobile anonymous and tampered attempts are refused; the modal stays usable', async ({ browser }) => {
    expect(feedbackId).toMatch(UUID);
    const tampered = {
      feedback_id: feedbackId,
      assigned_users: [randomUUID()],
      user_name: 'TEXTO_INYECTADO',
      description: 'TEXTO_INYECTADO',
      page_url: 'https://evil.example.com/phish',
    };

    // 1. Anonymous: no session at all.
    const anonContext = await browser.newContext({ viewport: MOBILE, storageState: { cookies: [], origins: [] } });
    const anonPage = await anonContext.newPage();
    await anonPage.goto('/login');
    const anon = await anonPage.request.post('/api/feedback/notify-admins', { data: tampered });
    const anonBody = await anon.json();
    expect(anon.status()).toBe(401);
    expect(anonBody).toEqual({ error: 'Debes iniciar sesión' });
    await shot(anonPage, 'ui2-mobile-anonymous');
    await anonContext.close();

    // 2. Signed in, but not the creator of that feedback row.
    const other = await signedInPage(browser, 'docente', MOBILE);
    const foreign = await other.page.request.post('/api/feedback/notify-admins', { data: tampered });
    const foreignBody = await foreign.json();
    expect(foreign.status()).toBe(403);
    expect(foreignBody).toEqual({ error: 'No tienes permiso para notificar este feedback' });
    await shot(other.page, 'ui2-mobile-non-creator');
    await other.context.close();

    // 3. The creator on mobile, keyboard only; a tampered client payload is refused.
    const { context, page, consoleErrors } = await signedInPage(browser, 'admin', MOBILE);
    const absentId = randomUUID();
    // The row the modal saved, recorded so the run's test data can be cleaned up exactly.
    let mobileFeedbackId = '';
    await page.route(NOTIFY, (route) => {
      mobileFeedbackId = String(route.request().postDataJSON()?.feedback_id ?? '');
      return route.continue({ postData: JSON.stringify({ ...tampered, feedback_id: absentId }) });
    });
    const marker = `NOTIF-01 E2E móvil ${Date.now()}`;
    await openModal(page);
    await page.keyboard.type(marker);
    const submit = page.getByRole('button', { name: 'Enviar →' });
    for (let i = 0; i < 10 && !(await submit.evaluate((el) => el === document.activeElement)); i++) {
      await page.keyboard.press('Tab');
    }
    await expect(submit).toBeFocused();
    const refusal = page.waitForResponse((response) => response.url().includes('/api/feedback/notify-admins'));
    await page.keyboard.press('Enter');
    const refused = await refusal;
    const refusedBody = await refused.json();
    expect(refused.status()).toBe(404);
    expect(refusedBody).toEqual({ error: 'Feedback no encontrado' });
    expect(refusedBody.success).toBeUndefined();
    expect(mobileFeedbackId).toMatch(UUID);

    // The feedback itself was saved; the refusal does not break the modal.
    await expect(page.getByText('Tu reporte fue enviado.')).toBeVisible();
    await shot(page, 'ui2-mobile-modal-after-refusal');
    const close = page.getByRole('button', { name: '✓ Cerrar', exact: true });
    await close.focus();
    await expect(close).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByText('Tu reporte fue enviado.')).toBeHidden();
    await shot(page, 'ui2-mobile-modal-closed');

    evidence.UI2 = {
      viewport: '390x844',
      anonymous: { status: anon.status(), body: anonBody },
      nonCreator: { actor: E2E_USERS.docente.email, status: foreign.status(), body: foreignBody },
      creatorTamper: {
        actor: E2E_USERS.admin.email,
        rewrittenTo: 'absent feedback id + caller recipients/text',
        status: refused.status(),
        body: refusedBody,
      },
      feedbackId: mobileFeedbackId,
      marker,
      consoleErrors,
      screenshots: [
        'ui2-mobile-anonymous.png',
        'ui2-mobile-non-creator.png',
        'ui2-mobile-modal-after-refusal.png',
        'ui2-mobile-modal-closed.png',
      ],
    };
    await context.close();
  });
});
