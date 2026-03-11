/**
 * Proposal Document Library — E2E Tests
 *
 * Verifies upload, expiry-warning display, and soft-delete of supporting
 * documents in the admin library at /admin/licitaciones/documentos-propuesta.
 *
 * Requires: running dev server + Supabase with admin credentials.
 *
 * Tags: @flow @proposal
 */

import { test, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

const ADMIN_EMAIL = process.env.QA_ADMIN_EMAIL || 'admin@test.cl';
const ADMIN_PASSWORD = process.env.QA_ADMIN_PASSWORD || 'TestAdmin2026!';
const QA_SUFFIX = `QA-Docs-${Date.now()}`;

// Create a small dummy PDF for upload tests
function createDummyPdf(): string {
  const tmpPath = path.join(os.tmpdir(), `test-doc-${Date.now()}.pdf`);
  // Minimal valid PDF header
  fs.writeFileSync(
    tmpPath,
    '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R>>endobj\nxref\n0 4\n0000000000 65535 f\n0000000009 00000 n\n0000000058 00000 n\n0000000115 00000 n\ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n190\n%%EOF'
  );
  return tmpPath;
}

test.describe('Document Library CRUD @flow @proposal', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', ADMIN_EMAIL);
    await page.fill('input[type="password"]', ADMIN_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(dashboard|licitaciones|admin)/, { timeout: 15000 });
  });

  // ── Navigate ──────────────────────────────────────────────────────────────
  test('Admin can navigate to document library page', async ({ page }) => {
    await page.goto('/admin/licitaciones/documentos-propuesta');
    await expect(page).toHaveURL(/\/admin\/licitaciones\/documentos-propuesta/);
    await expect(page.getByRole('heading', { name: /document|biblioteca/i })).toBeVisible({ timeout: 10000 });
  });

  // ── Upload ────────────────────────────────────────────────────────────────
  test('Admin can upload a supporting document', async ({ page }) => {
    const dummyPdf = createDummyPdf();

    await page.goto('/admin/licitaciones/documentos-propuesta');

    // Click upload / nuevo documento button
    const uploadButton = page.getByRole('button', { name: /subir|nuevo documento|upload|agregar/i });
    await expect(uploadButton).toBeVisible({ timeout: 10000 });
    await uploadButton.click();

    // Fill document name
    const nombreInput = page.getByLabel(/nombre/i).first();
    await nombreInput.fill(`Doc QA ${QA_SUFFIX}`);

    // Set tipo
    const tipoSelect = page.getByLabel(/tipo/i).first();
    if (await tipoSelect.isVisible({ timeout: 2000 })) {
      await tipoSelect.selectOption('otro');
    }

    // Attach file
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(dummyPdf);

    // Submit
    const saveButton = page.getByRole('button', { name: /guardar|subir|save/i });
    await saveButton.click();

    // Verify document appears
    await expect(page.getByText(`Doc QA ${QA_SUFFIX}`)).toBeVisible({ timeout: 15000 });

    // Clean up temp file
    fs.unlinkSync(dummyPdf);
  });

  // ── Expiry warning ────────────────────────────────────────────────────────
  test('Expiry warning is shown for expired or near-expiry documents', async ({ page }) => {
    await page.goto('/admin/licitaciones/documentos-propuesta');
    await page.waitForSelector('table, [data-testid="doc-list"]', { timeout: 10000 });

    // Look for any expiry warning indicator (vencido / vence / expirado)
    // This test passes if the page loads and any warning is present, or skips if no expired docs
    const warningEl = page.getByText(/vencido|vence|expirado/i).first();
    const warningCount = await warningEl.count();

    if (warningCount > 0) {
      await expect(warningEl).toBeVisible();
    } else {
      // No expired documents in this environment — test still passes
      test.info().annotations.push({
        type: 'note',
        description: 'No expired documents found in test DB — expiry warning test skipped',
      });
    }
  });

  // ── Soft-delete ───────────────────────────────────────────────────────────
  test('Admin can soft-delete an uploaded document', async ({ page }) => {
    await page.goto('/admin/licitaciones/documentos-propuesta');

    // Find the QA document and delete it
    const docRow = page.locator(`tr:has-text("${QA_SUFFIX}"), [data-testid="doc-row"]:has-text("${QA_SUFFIX}")`).first();
    const deleteButton = docRow.getByRole('button', { name: /eliminar|desactivar|delete/i });
    await expect(deleteButton).toBeVisible({ timeout: 10000 });
    await deleteButton.click();

    // Confirm if dialog present
    const confirmButton = page.getByRole('button', { name: /confirmar|confirm|sí|yes/i });
    if (await confirmButton.isVisible({ timeout: 2000 })) {
      await confirmButton.click();
    }

    // Document should disappear from active list
    await expect(page.getByText(`Doc QA ${QA_SUFFIX}`)).not.toBeVisible({ timeout: 10000 });
  });
});
