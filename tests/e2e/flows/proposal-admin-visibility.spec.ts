/**
 * Proposal Admin Visibility — E2E Tests
 *
 * Verifies that the ProposalConfigPanel (Generar Propuesta FNE) is visible to
 * admins on the licitación detail page, and hidden from non-admin roles.
 *
 * Requires: running dev server + Supabase with seeded licitaciones.
 *
 * Tags: @flow @proposal
 */

import { test, expect } from '@playwright/test';

// A real licitación ID that exists in the test database (set via env or use a known seed ID)
const TEST_LICITACION_ID = process.env.QA_TEST_LICITACION_ID || '1';

// ── Helper: login as a role ────────────────────────────────────────────────
async function loginAs(
  page: import('@playwright/test').Page,
  email: string,
  password: string
) {
  await page.goto('/login');
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(dashboard|licitaciones|admin)/, { timeout: 15000 });
}

// ── Test 1: Admin sees the panel ───────────────────────────────────────────
test('Admin can see ProposalConfigPanel on licitación detail @flow @proposal', async ({ page }) => {
  const adminEmail = process.env.QA_ADMIN_EMAIL || 'admin@test.cl';
  const adminPassword = process.env.QA_ADMIN_PASSWORD || 'TestAdmin2026!';

  await loginAs(page, adminEmail, adminPassword);
  await page.goto(`/licitaciones/${TEST_LICITACION_ID}`);

  // Panel header should be visible — look for the "Generar Propuesta FNE" text
  const panelHeader = page.getByRole('button', { name: /Generar Propuesta FNE/i });
  await expect(panelHeader).toBeVisible({ timeout: 10000 });
});

// ── Test 2: Non-admin cannot see the panel ─────────────────────────────────
test('Non-admin (docente) cannot see ProposalConfigPanel @flow @proposal', async ({ page }) => {
  const docenteEmail = process.env.QA_DOCENTE_EMAIL || 'docente.qa@fne.cl';
  const docentePassword = process.env.QA_DOCENTE_PASSWORD || 'TestDocente2026!';

  await loginAs(page, docenteEmail, docentePassword);

  // Docente may not have access to licitaciones at all — check 403/redirect or absence of panel
  const response = await page.goto(`/licitaciones/${TEST_LICITACION_ID}`);

  // Either redirected away (no access) or page loads without the proposal panel
  if (response && response.status() === 200) {
    const panelHeader = page.getByRole('button', { name: /Generar Propuesta FNE/i });
    await expect(panelHeader).not.toBeVisible();
  } else {
    // Redirected — access denied, panel definitely not shown
    expect(page.url()).not.toContain(`/licitaciones/${TEST_LICITACION_ID}`);
  }
});

// ── Test 3: Admin can open/close the panel ─────────────────────────────────
test('Admin can toggle ProposalConfigPanel open and closed @flow @proposal', async ({ page }) => {
  const adminEmail = process.env.QA_ADMIN_EMAIL || 'admin@test.cl';
  const adminPassword = process.env.QA_ADMIN_PASSWORD || 'TestAdmin2026!';

  await loginAs(page, adminEmail, adminPassword);
  await page.goto(`/licitaciones/${TEST_LICITACION_ID}`);

  const panelHeader = page.getByRole('button', { name: /Generar Propuesta FNE/i });
  await expect(panelHeader).toBeVisible({ timeout: 10000 });

  // Panel body should NOT be visible before clicking
  const generateButton = page.getByRole('button', { name: /Generar Propuesta Final/i });
  await expect(generateButton).not.toBeVisible();

  // Click to open
  await panelHeader.click();
  await expect(generateButton).toBeVisible({ timeout: 5000 });

  // Click again to close
  await panelHeader.click();
  await expect(generateButton).not.toBeVisible();
});
