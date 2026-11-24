import { test, expect, type Page } from '@playwright/test';
import { E2E_USERS, ensureStorageState, storageStatePath } from './helpers/auth';
import fixtures from '../../scripts/ci/e2e-fixtures.json';

/**
 * CORREOS r1 phase 2, scenario W1 (second half): CSV import with its result, adding GENERA users, and adding
 * pasantías leads. Each screen also keeps a docente and a visitor out.
 *
 * Invented people only. The import file is built here with per-run addresses (the stack is not reset between
 * local runs, so a fixed file would be all duplicates the second time). GENERA users: the docente persona is
 * staff (an active role at a client school). Pasantías: only the seeded lead who ticked is offered.
 *
 * Requires the seeded local Supabase stack — see .github/workflows/ci.yml gate 4.
 */
const C = fixtures.correos;
const STAMP = `${Date.now()}`;
const SCREENS = ['/admin/correos/importar', '/admin/correos/usuarios', '/admin/correos/pasantias'];

test.setTimeout(120_000);

async function tickList(page: Page, prefix: string, name: string) {
  await page.locator(`[data-testid="${prefix}-lista"][data-list-name="${name}"]`).check();
}

test.describe('Correos import, users and leads — admin', () => {
  test.use({ storageState: storageStatePath('admin') });
  test.beforeAll(async ({ browser }) => {
    test.setTimeout(120_000);
    await ensureStorageState(browser, 'admin');
  });

  test('CSV import: the reason is required; the result shows each count and that they add up', async ({ page }) => {
    // 7 rows: 3 new, 1 repeat inside the file (other case), 1 already in the database, 1 blocked, 1 malformed.
    const csv =
      '﻿Correo;Nombre;Apellido;Organización\r\n' +
      `uno.${STAMP}@example.test;"Muñoz, Ana";Pérez;Liceo Inventado\r\n` +
      `dos.${STAMP}@example.test;=HYPERLINK("http://x");Ñandú;<b>Colegio</b>\r\n` +
      `tres.${STAMP}@example.test;José;Árbol;\r\n` +
      `UNO.${STAMP}@EXAMPLE.TEST;;;\r\n` +
      `${C.searchContact.email};;;\r\n` +
      `${C.blockedAddress};;;\r\n` +
      'esto-no-es-un-correo;;;\r\n';

    await page.goto('/admin/correos/importar');
    await expect(page.getByTestId('correos-importar')).toBeVisible({ timeout: 30_000 });
    await page.getByTestId('correos-importar-archivo').setInputFiles({
      name: `contactos-${STAMP}.csv`,
      mimeType: 'text/csv',
      buffer: Buffer.from(csv, 'utf8'),
    });
    await expect(page.getByTestId('correos-importar-nombre')).toContainText(`contactos-${STAMP}.csv`);
    await tickList(page, 'correos-importar', 'Boletín general');
    // Without the reason the import cannot start.
    await expect(page.getByTestId('correos-importar-empezar')).toBeDisabled();
    await page.getByTestId('correos-importar-motivo-manual_verified').check();
    await page.getByTestId('correos-importar-nota').fill(C.basisNote);
    await expect(page.getByTestId('correos-importar-empezar')).toBeEnabled();
    await page.getByTestId('correos-importar-empezar').click();

    const result = page.getByTestId('correos-resultado');
    await expect(result).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('correos-resultado-aceptadas')).toHaveText('3');
    await expect(page.getByTestId('correos-resultado-repetidas')).toHaveText('2');
    await expect(page.getByTestId('correos-resultado-bloqueadas')).toHaveText('1');
    await expect(page.getByTestId('correos-resultado-bajas')).toHaveText('0');
    await expect(page.getByTestId('correos-resultado-invalidas')).toHaveText('1');
    await expect(page.getByTestId('correos-resultado-total')).toHaveText('7');
    await expect(page.getByTestId('correos-resultado-suma')).toContainText('suman 7, el total');
    await expect(result).toContainText('Se dieron de baja por decisión propia, no se volvieron a agregar');

    // A formula-looking cell and HTML are shown as the plain text they are.
    await page.goto('/admin/correos/contactos');
    await page.getByRole('searchbox', { name: 'Buscar personas' }).first().fill(`dos.${STAMP}`);
    const row = page.getByTestId('correos-contacto-fila').filter({ hasText: `dos.${STAMP}@example.test` });
    await expect(row).toContainText('=HYPERLINK("http://x") Ñandú', { timeout: 30_000 });
    await expect(row).toContainText('<b>Colegio</b>');
  });

  test('CSV import: a file without an address column is refused whole', async ({ page }) => {
    await page.goto('/admin/correos/importar');
    await page.getByTestId('correos-importar-archivo').setInputFiles({
      name: 'sin-correo.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('nombre,apellido\nAna,Inventada\n', 'utf8'),
    });
    await tickList(page, 'correos-importar', 'Boletín general');
    await page.getByTestId('correos-importar-motivo-manual_verified').check();
    await page.getByTestId('correos-importar-nota').fill(C.basisNote);
    await page.getByTestId('correos-importar-empezar').click();
    await expect(page.getByTestId('correos-importar-error')).toContainText('no tiene una columna de correo', { timeout: 30_000 });
  });

  test('GENERA users: staff are offered and added with the stated reason', async ({ page }) => {
    const docente = E2E_USERS.docente;
    await page.goto('/admin/correos/usuarios');
    await expect(page.getByTestId('correos-usuarios')).toBeVisible({ timeout: 30_000 });
    await page.getByTestId('correos-usuarios-buscar').fill(docente.email);
    const row = page.getByTestId('correos-usuarios-fila').filter({ hasText: docente.email });
    await expect(row).toBeVisible({ timeout: 30_000 });
    await row.getByTestId('correos-usuarios-elegir').check();
    await expect(page.getByTestId('correos-usuarios-elegidas')).toContainText('Marcaste 1 persona');
    await tickList(page, 'correos-usuarios', 'Directivos');
    await page.getByTestId('correos-usuarios-motivo-customer_relationship').check();
    await page.getByTestId('correos-usuarios-nota').fill(C.basisNote);
    await page.getByTestId('correos-usuarios-agregar').click();
    const result = page.getByTestId('correos-resultado');
    await expect(result).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('correos-resultado-total')).toHaveText('1');
    // First run: added; a later local run: already there. Either way it adds up.
    await expect(page.getByTestId('correos-resultado-suma')).toContainText('suman 1, el total');
  });

  test('GENERA users: an id outside the rule posted directly refuses the whole request', async ({ page }) => {
    const lists = await (await page.request.get('/api/admin/correos/listas')).json();
    const listId = lists.lists.find((list: { name: string }) => list.name === 'Boletín general').id;
    const answer = await page.request.post('/api/admin/correos/usuarios', {
      data: {
        user_ids: ['00000000-0000-4000-8000-000000000000'],
        list_ids: [listId],
        legal_basis: 'manual_verified',
        basis_note: C.basisNote,
      },
    });
    expect(answer.status()).toBe(422);
    expect((await answer.json()).error).toContain('No se agregó a nadie');
  });

  test('pasantías leads: only the lead who ticked is offered; the other cannot be added directly', async ({ page }) => {
    await page.goto('/admin/correos/pasantias');
    await expect(page.getByTestId('correos-pasantias')).toBeVisible({ timeout: 30_000 });
    await page.getByTestId('correos-pasantias-buscar').fill('Instituto Inventado Correos');
    const ticked = page.getByTestId('correos-pasantias-fila').filter({ hasText: C.leadTicked.email });
    await expect(ticked).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('correos-pasantias-fila').filter({ hasText: C.leadNotTicked.email })).toHaveCount(0);

    // Only "consent on a form" is offered as the reason, and it is not pre-chosen.
    await expect(page.getByTestId('correos-pasantias-motivo-consent_form')).not.toBeChecked();
    await expect(page.getByTestId('correos-pasantias-motivo-manual_verified')).toHaveCount(0);

    await ticked.getByTestId('correos-pasantias-elegir').check();
    await tickList(page, 'correos-pasantias', 'Boletín general');
    await page.getByTestId('correos-pasantias-motivo-consent_form').check();
    await page.getByTestId('correos-pasantias-nota').fill(C.basisNote);
    await page.getByTestId('correos-pasantias-agregar').click();
    await expect(page.getByTestId('correos-resultado')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('correos-resultado-suma')).toContainText('suman 1, el total');

    // The lead's own page shows the tick's notice version as the reason.
    await page.goto('/admin/correos/contactos');
    await page.getByRole('searchbox', { name: 'Buscar personas' }).first().fill(C.leadTicked.email);
    await page.getByTestId('correos-contacto-fila').filter({ hasText: C.leadTicked.email }).getByRole('link').click();
    await expect(page.getByTestId('correos-persona-motivo')).toContainText(C.leadTicked.marketingNoticeVersion, { timeout: 30_000 });

    // The lead who did not tick, posted directly by id, is refused whole.
    const list = await (await page.request.get('/api/admin/correos/listas')).json();
    const listId = list.lists.find((l: { name: string }) => l.name === 'Boletín general').id;
    const leads = await (await page.request.get('/api/admin/correos/pasantias?q=Instituto%20Inventado%20Correos')).json();
    const tickedId = leads.items.find((l: { email: string }) => l.email === C.leadTicked.email).id;
    const refused = await page.request.post('/api/admin/correos/pasantias', {
      data: { lead_ids: [tickedId, '00000000-0000-4000-8000-000000000000'], list_ids: [listId], legal_basis: 'consent_form', basis_note: C.basisNote },
    });
    expect(refused.status()).toBe(422);
  });
});

test.describe('Correos import, users and leads — docente', () => {
  test.use({ storageState: storageStatePath('docente') });
  test.beforeAll(async ({ browser }) => {
    test.setTimeout(120_000);
    await ensureStorageState(browser, 'docente');
  });

  test('is kept out of every screen and every route', async ({ page }) => {
    for (const screen of SCREENS) {
      await page.goto(screen);
      await expect(page).toHaveURL(/\/dashboard(\?|$)/, { timeout: 30_000 });
    }
    for (const url of ['/api/admin/correos/usuarios', '/api/admin/correos/pasantias']) {
      const answer = await page.request.get(url);
      expect(answer.status()).toBe(403);
      expect(await answer.text()).not.toContain('@example');
    }
    const answer = await page.request.post('/api/admin/correos/importar', {
      data: { csv: 'correo\nalguien@example.test\n', list_ids: [], legal_basis: 'manual_verified', basis_note: 'x' },
    });
    expect(answer.status()).toBe(403);
  });
});

test.describe('Correos import, users and leads — visitor', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('is sent to sign in, and the routes answer 401', async ({ page }) => {
    for (const screen of SCREENS) {
      await page.goto(screen);
      await expect(page).toHaveURL(/\/login(\?|$)/, { timeout: 30_000 });
    }
    expect((await page.request.get('/api/admin/correos/usuarios')).status()).toBe(401);
  });
});
