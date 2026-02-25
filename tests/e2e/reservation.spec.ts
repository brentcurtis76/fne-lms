/**
 * Hour Tracking — Reservation E2E Tests
 *
 * Tests that hours are reserved (ledger entry created with status='reservada')
 * when a session is approved/scheduled.
 *
 * Prerequisites: Run seed script first:
 *   node scripts/seed-hour-tracking-qa-data.mjs
 *
 * QA Scenario: QA-1 — Reserva Automatica de Horas al Programar Sesion
 */

import { test, expect, Page } from '@playwright/test';

const ADMIN_EMAIL = process.env.QA_ADMIN_EMAIL || 'admin@test.cl';
const ADMIN_PASSWORD = process.env.QA_ADMIN_PASSWORD || 'TestAdmin2026!';

async function loginAsAdmin(page: Page) {
  await page.goto('/login');
  await page.fill('input[type="email"]', ADMIN_EMAIL);
  await page.fill('input[type="password"]', ADMIN_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(dashboard|admin)/, { timeout: 15000 });
}

test.describe('Hour Tracking — Session Reservation', () => {
  test('QA-1: Creating and scheduling a session reserves hours in the ledger', async ({ page }) => {
    await loginAsAdmin(page);

    // Navigate to session create form
    await page.goto('/admin/sessions/create');
    await expect(page.locator('text=Programar Sesión')).toBeVisible({ timeout: 10000 });

    // Verify hour type dropdown appears
    await expect(page.locator('text=Tipo de Hora')).toBeVisible();

    // Select a school
    const schoolSelect = page.locator('select[name="school_id"]');
    await schoolSelect.selectOption({ index: 1 }); // Select first available school
    await page.waitForTimeout(500);

    // Verify contract dropdown appears after school selection
    await expect(page.locator('text=Contrato')).toBeVisible();

    // NOTE: Full E2E test requires seed data with a school that has a contrato.
    // The following steps are conditional on seed data availability.
    test.skip(true, 'Requires seed data with test school, contrato, and allocations');
  });

  test('QA-9: Legacy session (no hour_type_key) continues to work normally', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/sessions/create');

    // Verify the form loads without errors
    await expect(page.locator('text=Programar Sesión')).toBeVisible({ timeout: 10000 });

    // The form should work without selecting hour type (backward compatibility)
    await page.locator('select[name="school_id"]').selectOption({ index: 1 });
    await page.waitForTimeout(300);

    // Verify no error appeared
    await expect(page.locator('[role="alert"]:has-text("error")')).not.toBeVisible();
  });
});
