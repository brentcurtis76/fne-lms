/**
 * Proposal Consultant CRUD — E2E Tests
 *
 * Verifies create / edit / soft-delete of proposal consultants via the admin
 * UI at /admin/licitaciones/consultores.
 *
 * Requires: running dev server + Supabase with admin credentials.
 *
 * Tags: @flow @proposal
 */

import { test, expect } from '@playwright/test';

const ADMIN_EMAIL = process.env.QA_ADMIN_EMAIL || 'admin@test.cl';
const ADMIN_PASSWORD = process.env.QA_ADMIN_PASSWORD || 'TestAdmin2026!';

const QA_SUFFIX = `QA-E2E-${Date.now()}`;

test.describe('Consultant CRUD @flow @proposal', () => {
  let createdConsultorName: string;

  test.beforeEach(async ({ page }) => {
    // Login as admin
    await page.goto('/login');
    await page.fill('input[type="email"]', ADMIN_EMAIL);
    await page.fill('input[type="password"]', ADMIN_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(dashboard|licitaciones|admin)/, { timeout: 15000 });
  });

  // ── Create ───────────────────────────────────────────────────────────────
  test('Admin can navigate to consultant library page', async ({ page }) => {
    await page.goto('/admin/licitaciones/consultores');
    await expect(page).toHaveURL(/\/admin\/licitaciones\/consultores/);
    // Page should show the heading / table
    await expect(page.getByRole('heading', { name: /consultor/i })).toBeVisible({ timeout: 10000 });
  });

  test('Admin can create a new consultant', async ({ page }) => {
    createdConsultorName = `Test Consultor ${QA_SUFFIX}`;

    await page.goto('/admin/licitaciones/consultores');

    // Click "Nuevo Consultor" or equivalent add button
    const addButton = page.getByRole('button', { name: /nuevo consultor|agregar|añadir/i });
    await expect(addButton).toBeVisible({ timeout: 10000 });
    await addButton.click();

    // Fill form fields
    const nombreInput = page.getByLabel(/nombre/i).first();
    await nombreInput.fill(createdConsultorName);

    const tituloInput = page.getByLabel(/título|titulo/i).first();
    await tituloInput.fill('PhD en Educación');

    // Submit
    const submitButton = page.getByRole('button', { name: /guardar|crear|save/i });
    await submitButton.click();

    // Verify consultant appears in table
    await expect(page.getByText(createdConsultorName)).toBeVisible({ timeout: 10000 });
  });

  // ── Edit ─────────────────────────────────────────────────────────────────
  test('Admin can edit a consultant titulo', async ({ page }) => {
    await page.goto('/admin/licitaciones/consultores');

    // Find the QA consultant row and click edit
    const consultorRow = page.locator(`tr:has-text("${QA_SUFFIX}")`).first();
    const editButton = consultorRow.getByRole('button', { name: /editar|edit/i });
    await expect(editButton).toBeVisible({ timeout: 10000 });
    await editButton.click();

    // Change titulo
    const tituloInput = page.getByLabel(/título|titulo/i).first();
    await tituloInput.clear();
    await tituloInput.fill('PhD en Educación Relacional — Editado');

    const saveButton = page.getByRole('button', { name: /guardar|save/i });
    await saveButton.click();

    // Verify updated text appears in the table
    await expect(page.getByText('PhD en Educación Relacional — Editado')).toBeVisible({ timeout: 10000 });
  });

  // ── Soft-delete ───────────────────────────────────────────────────────────
  test('Admin can soft-delete a consultant and it disappears from active list', async ({ page }) => {
    await page.goto('/admin/licitaciones/consultores');

    // Find the QA consultant row and click delete
    const consultorRow = page.locator(`tr:has-text("${QA_SUFFIX}")`).first();
    const deleteButton = consultorRow.getByRole('button', { name: /eliminar|desactivar|delete/i });
    await expect(deleteButton).toBeVisible({ timeout: 10000 });
    await deleteButton.click();

    // Confirm dialog if present
    const confirmButton = page.getByRole('button', { name: /confirmar|confirm|sí|yes/i });
    if (await confirmButton.isVisible({ timeout: 2000 })) {
      await confirmButton.click();
    }

    // Consultant should no longer appear in active list
    await expect(page.getByText(QA_SUFFIX)).not.toBeVisible({ timeout: 10000 });
  });
});
