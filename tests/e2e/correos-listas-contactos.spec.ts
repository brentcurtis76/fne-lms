import { test, expect, type Page } from '@playwright/test';
import { ensureStorageState, storageStatePath } from './helpers/auth';
import fixtures from '../../scripts/ci/e2e-fixtures.json';

/**
 * CORREOS r1 phase 2, scenario W1 (first half): the lists screen, contacts with search, adding one person, a
 * person's page, a blocked address, and erasing a person. Each screen also keeps a docente and a visitor out.
 *
 * Invented people only (`fixtures.correos`, seeded by scripts/ci/seed-e2e.mjs). The stack is not reset between
 * local runs, so everything this spec CREATES carries a per-run stamp (a list cannot be deleted, an erasure
 * cannot be undone): the seeded rows are only ever read. The erase test adds its own person and erases that one.
 *
 * Requires the seeded local Supabase stack — see .github/workflows/ci.yml gate 4.
 */
const C = fixtures.correos;
const STAMP = `${Date.now()}`;
const SCREENS = ['/admin/correos/listas', '/admin/correos/contactos'];

test.setTimeout(120_000);

async function tickList(page: Page, prefix: string, name: string) {
  await page.locator(`[data-testid="${prefix}-lista"][data-list-name="${name}"]`).check();
}

async function addPerson(page: Page, email: string) {
  await page.goto('/admin/correos/contactos');
  await page.getByTestId('correos-contactos-agregar').click();
  const dialog = page.getByTestId('correos-persona-dialogo');
  await expect(dialog).toBeVisible();
  await dialog.getByTestId('correos-persona-correo').fill(email);
  await dialog.getByTestId('correos-persona-nombre').fill('Persona');
  await dialog.getByTestId('correos-persona-apellido').fill('Inventada E2E');
  await tickList(page, 'correos-persona', 'Boletín general');
  await dialog.getByTestId('correos-persona-motivo-manual_verified').check();
  await dialog.getByTestId('correos-persona-nota').fill(C.basisNote);
  await dialog.getByTestId('correos-persona-guardar').click();
}

test.describe('Correos lists and contacts — admin', () => {
  test.use({ storageState: storageStatePath('admin') });
  test.beforeAll(async ({ browser }) => {
    test.setTimeout(120_000);
    await ensureStorageState(browser, 'admin');
  });

  test('lists: the day-one lists, a new one, a taken name refused, archive', async ({ page }) => {
    await page.goto('/admin/correos/listas');
    await expect(page.getByTestId('correos-listas')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('[data-testid="correos-lista-fila"][data-list-name="Boletín general"]')).toBeVisible();
    await expect(page.locator('[data-testid="correos-lista-fila"][data-list-name="Directivos"]')).toBeVisible();

    const name = `Lista E2E ${STAMP}`;
    await page.getByTestId('correos-listas-nueva').click();
    await page.getByTestId('correos-lista-nombre').fill(name);
    await page.getByTestId('correos-lista-descripcion').fill('Lista inventada para la prueba.');
    await page.getByTestId('correos-lista-guardar').click();
    const row = page.locator(`[data-testid="correos-lista-fila"][data-list-name="${name}"]`);
    await expect(row).toBeVisible({ timeout: 30_000 });
    await expect(row.getByTestId('correos-lista-suscritas')).toHaveText('0');

    // The same name in other letter case and with spaces is refused in plain words.
    await page.getByTestId('correos-listas-nueva').click();
    await page.getByTestId('correos-lista-nombre').fill(`  ${name.toUpperCase()} `);
    await page.getByTestId('correos-lista-guardar').click();
    await expect(page.getByTestId('correos-lista-error')).toContainText('Ya existe una lista con ese nombre');
    await page.getByTestId('correos-lista-dialogo').getByRole('button', { name: 'Cancelar' }).click();

    await row.getByTestId('correos-lista-archivar').click();
    await page.getByTestId('correos-listas-confirmar-confirm').click();
    await expect(row).toContainText('Archivada', { timeout: 30_000 });
    await expect(row.getByTestId('correos-lista-archivar')).toHaveCount(0);
  });

  test('contacts: search finds the seeded person; their page shows list, state and reason', async ({ page }) => {
    await page.goto('/admin/correos/contactos');
    await expect(page.getByTestId('correos-contactos')).toBeVisible({ timeout: 30_000 });
    await page.getByRole('searchbox', { name: 'Buscar personas' }).first().fill('contacto.semilla');
    const row = page.getByTestId('correos-contacto-fila').filter({ hasText: C.searchContact.email });
    await expect(row).toBeVisible({ timeout: 30_000 });
    await row.getByRole('link', { name: C.searchContact.email }).click();

    await expect(page.getByTestId('correos-persona')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('correos-persona-correo')).toHaveText(C.searchContact.email);
    const membership = page.locator('[data-testid="correos-persona-lista"][data-list-name="Boletín general"]');
    await expect(membership.getByTestId('correos-persona-lista-estado')).toHaveText('Suscrito');
    await expect(page.getByTestId('correos-persona-motivo')).toContainText('Lo verificamos a mano');
    await expect(page.getByTestId('correos-persona-bloqueada')).toHaveText('No');

    // Search by organisation finds them too.
    await page.goto('/admin/correos/contactos');
    await page.getByRole('searchbox', { name: 'Buscar personas' }).first().fill('Liceo Inventado Correos');
    await expect(page.getByTestId('correos-contacto-fila').filter({ hasText: C.searchContact.email })).toBeVisible({ timeout: 30_000 });
  });

  test('add one person: no reason, no save; with it, subscribed; a blocked address is refused', async ({ page }) => {
    const email = `e2e.persona.${STAMP}@example.test`;
    await page.goto('/admin/correos/contactos');
    await page.getByTestId('correos-contactos-agregar').click();
    const dialog = page.getByTestId('correos-persona-dialogo');
    await dialog.getByTestId('correos-persona-correo').fill(email);
    await tickList(page, 'correos-persona', 'Boletín general');
    // Nothing is pre-chosen: without a reason it is refused.
    for (const basis of ['consent_form', 'customer_relationship', 'manual_verified']) {
      await expect(dialog.getByTestId(`correos-persona-motivo-${basis}`)).not.toBeChecked();
    }
    await dialog.getByTestId('correos-persona-guardar').click();
    await expect(dialog.getByTestId('correos-persona-error')).toContainText('permiso');
    await dialog.getByRole('button', { name: 'Cancelar' }).click();

    await addPerson(page, email);
    await expect(page.getByTestId('correos-contactos-aviso')).toContainText('quedó suscrita', { timeout: 30_000 });
    await page.getByTestId('correos-contactos-aviso').getByRole('link', { name: 'Ver a la persona' }).click();
    await expect(page.getByTestId('correos-persona-correo')).toHaveText(email, { timeout: 30_000 });
    await expect(page.locator('[data-testid="correos-persona-lista"][data-list-name="Boletín general"]')).toContainText('Suscrito');

    // The same address in other letter case is the same person: already there.
    await addPerson(page, `  ${email.toUpperCase()} `);
    await expect(page.getByTestId('correos-contactos-aviso')).toContainText('ya estaba', { timeout: 30_000 });

    await addPerson(page, C.blockedAddress);
    await expect(page.getByTestId('correos-contactos-aviso')).toContainText('bloqueada y no se puede agregar', { timeout: 30_000 });
  });

  test('erase a person: asks first, cannot be undone, then the address is gone', async ({ page }) => {
    const email = `e2e.borrar.${STAMP}@example.test`;
    await addPerson(page, email);
    await expect(page.getByTestId('correos-contactos-aviso')).toContainText('quedó suscrita', { timeout: 30_000 });
    await page.getByTestId('correos-contactos-aviso').getByRole('link', { name: 'Ver a la persona' }).click();
    await expect(page.getByTestId('correos-persona-correo')).toHaveText(email, { timeout: 30_000 });

    // Cancel first: nothing happens.
    await page.getByTestId('correos-persona-borrar').click();
    const ask = page.getByTestId('correos-borrar-confirmar');
    await expect(ask).toContainText('No se puede deshacer');
    await page.getByTestId('correos-borrar-confirmar-cancel').click();
    await expect(page.getByTestId('correos-persona-correo')).toHaveText(email);

    await page.getByTestId('correos-persona-borrar').click();
    await page.getByTestId('correos-borrar-confirmar-confirm').click();
    await expect(page.getByTestId('correos-persona-aviso')).toContainText('se borraron los datos', { timeout: 30_000 });
    await expect(page.getByTestId('correos-persona-correo')).toHaveText('Borrado');
    await expect(page.getByTestId('correos-persona-bloqueo')).toContainText('Se borraron sus datos');
    await expect(page.getByTestId('correos-persona-borrar')).toHaveCount(0);

    // Searching for the old address finds nothing, and it cannot be added again.
    await page.goto('/admin/correos/contactos');
    await page.getByRole('searchbox', { name: 'Buscar personas' }).first().fill(`e2e.borrar.${STAMP}`);
    await expect(page.getByText('Nadie coincide con la búsqueda')).toBeVisible({ timeout: 30_000 });
    await addPerson(page, email.toUpperCase());
    await expect(page.getByTestId('correos-contactos-aviso')).toContainText('bloqueada', { timeout: 30_000 });
  });

  test('no sidebar or menu entry names Correos', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.locator('nav, aside').getByText('Correos', { exact: true })).toHaveCount(0);
  });
});

for (const persona of ['docente'] as const) {
  test.describe(`Correos lists and contacts — ${persona}`, () => {
    test.use({ storageState: storageStatePath(persona) });
    test.beforeAll(async ({ browser }) => {
      test.setTimeout(120_000);
      await ensureStorageState(browser, persona);
    });

    test('is kept out of every screen and every route', async ({ page }) => {
      for (const screen of SCREENS) {
        await page.goto(screen);
        await expect(page).toHaveURL(/\/dashboard(\?|$)/, { timeout: 30_000 });
      }
      for (const url of ['/api/admin/correos/listas', '/api/admin/correos/contactos?q=semilla']) {
        const answer = await page.request.get(url);
        expect(answer.status()).toBe(403);
        expect(await answer.text()).not.toContain('@example.test');
      }
      const erase = await page.request.post('/api/admin/correos/contactos/borrar', {
        data: { contact_id: '00000000-0000-4000-8000-000000000000' },
      });
      expect(erase.status()).toBe(403);
    });
  });
}

test.describe('Correos lists and contacts — visitor', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('is sent to sign in, and the routes answer 401', async ({ page }) => {
    for (const screen of SCREENS) {
      await page.goto(screen);
      await expect(page).toHaveURL(/\/login(\?|$)/, { timeout: 30_000 });
    }
    const answer = await page.request.get('/api/admin/correos/contactos');
    expect(answer.status()).toBe(401);
  });
});
