/**
 * QA System E2E Tests
 *
 * Tests for the QA testing system pages and functionality.
 * These tests verify:
 * - QA scenario list page accessibility
 * - Admin QA dashboard
 * - Scenario management CRUD
 * - Import functionality
 * - Test run viewing
 */

import { test, expect } from '@playwright/test';

// Test credentials - these should match test users in the database
const ADMIN_EMAIL = process.env.QA_ADMIN_EMAIL || 'admin@test.com';
const ADMIN_PASSWORD = process.env.QA_ADMIN_PASSWORD || 'testpassword';
const TESTER_EMAIL = process.env.QA_TESTER_EMAIL || 'tester@test.com';
const TESTER_PASSWORD = process.env.QA_TESTER_PASSWORD || 'testpassword';

// Helper to login
async function login(page: any, email: string, password: string) {
  await page.goto('/login');
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(dashboard|admin|qa)/);
}

test.describe('QA Tester Interface', () => {
  test.beforeEach(async ({ page }) => {
    // This test may be skipped if no test user credentials are configured
    test.skip(!TESTER_EMAIL || !TESTER_PASSWORD, 'Tester credentials not configured');
  });

  test('should show QA scenarios list page', async ({ page }) => {
    await login(page, TESTER_EMAIL, TESTER_PASSWORD);
    await page.goto('/qa');

    // Should show the page header
    await expect(page.locator('h1')).toContainText('Escenarios de Prueba');

    // Should have a list of scenarios or empty state
    const hasScenarios = await page.locator('[data-testid="scenario-card"]').count() > 0;
    const hasEmptyState = await page.locator('text=No hay escenarios disponibles').isVisible().catch(() => false);

    expect(hasScenarios || hasEmptyState).toBeTruthy();
  });

  test('should require authentication for QA pages', async ({ page }) => {
    await page.goto('/qa');

    // Should redirect to login
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe('QA Admin Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!ADMIN_EMAIL || !ADMIN_PASSWORD, 'Admin credentials not configured');
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  });

  test('should show admin QA dashboard', async ({ page }) => {
    await page.goto('/admin/qa');

    // Should show the dashboard header
    await expect(page.locator('h1')).toContainText('QA Dashboard');

    // Should show statistics cards
    await expect(page.locator('text=Total Escenarios')).toBeVisible();
    await expect(page.locator('text=Ejecuciones Recientes')).toBeVisible();
  });

  test('should navigate to scenarios management', async ({ page }) => {
    await page.goto('/admin/qa');

    // Click on manage scenarios link
    await page.click('a[href="/admin/qa/scenarios"]');

    await expect(page).toHaveURL('/admin/qa/scenarios');
    await expect(page.locator('h1')).toContainText('Gestión de Escenarios');
  });

  test('should navigate to import page', async ({ page }) => {
    await page.goto('/admin/qa');

    // Click on import link
    await page.click('a[href="/admin/qa/import"]');

    await expect(page).toHaveURL('/admin/qa/import');
    await expect(page.locator('h1')).toContainText('Importar Escenarios');
  });

  test('should deny access to non-admin users', async ({ page }) => {
    // Logout and login as non-admin
    await page.goto('/api/auth/signout');

    if (TESTER_EMAIL && TESTER_PASSWORD) {
      await login(page, TESTER_EMAIL, TESTER_PASSWORD);
      await page.goto('/admin/qa');

      // Should show access denied
      await expect(page.locator('text=Acceso Denegado')).toBeVisible();
    }
  });
});

test.describe('QA Scenarios Management', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!ADMIN_EMAIL || !ADMIN_PASSWORD, 'Admin credentials not configured');
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  });

  test('should display scenarios list', async ({ page }) => {
    await page.goto('/admin/qa/scenarios');

    // Should show the page
    await expect(page.locator('h1')).toContainText('Gestión de Escenarios');

    // Should show filter/search options
    await expect(page.locator('input[placeholder*="Buscar"]')).toBeVisible();
  });

  test('should filter scenarios by feature area', async ({ page }) => {
    await page.goto('/admin/qa/scenarios');

    // Look for feature area filter dropdown
    const featureFilter = page.locator('select').first();
    if (await featureFilter.isVisible()) {
      await featureFilter.selectOption({ label: 'Autenticación' });

      // URL should include filter parameter
      await expect(page).toHaveURL(/feature_area=authentication/);
    }
  });

  test('should show scenario creation form', async ({ page }) => {
    await page.goto('/admin/qa/scenarios');

    // Click create new scenario button
    await page.click('button:has-text("Nuevo Escenario")');

    // Should show the form
    await expect(page.locator('input[name="name"]')).toBeVisible();
    await expect(page.locator('select[name="feature_area"]')).toBeVisible();
  });
});

test.describe('QA Import Functionality', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!ADMIN_EMAIL || !ADMIN_PASSWORD, 'Admin credentials not configured');
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  });

  test('should display import page', async ({ page }) => {
    await page.goto('/admin/qa/import');

    // Should show import instructions
    await expect(page.locator('text=¿Cómo funciona?')).toBeVisible();

    // Should show JSON textarea
    await expect(page.locator('textarea')).toBeVisible();

    // Should show validate button
    await expect(page.locator('button:has-text("Validar JSON")')).toBeVisible();
  });

  test('should load sample JSON', async ({ page }) => {
    await page.goto('/admin/qa/import');

    // Click load sample button
    await page.click('button:has-text("Cargar ejemplo")');

    // Textarea should now have content
    const textareaValue = await page.locator('textarea').inputValue();
    expect(textareaValue).toContain('scenarios');
    expect(textareaValue).toContain('Login con credenciales válidas');
  });

  test('should validate JSON input', async ({ page }) => {
    await page.goto('/admin/qa/import');

    // Load sample
    await page.click('button:has-text("Cargar ejemplo")');

    // Click validate
    await page.click('button:has-text("Validar JSON")');

    // Should show parsed scenarios
    await expect(page.locator('text=Escenario(s) Encontrado(s)')).toBeVisible();

    // Should show import button
    await expect(page.locator('button:has-text("Importar Escenarios")')).toBeVisible();
  });

  test('should show error for invalid JSON', async ({ page }) => {
    await page.goto('/admin/qa/import');

    // Enter invalid JSON
    await page.fill('textarea', '{ invalid json }');

    // Click validate
    await page.click('button:has-text("Validar JSON")');

    // Should show error
    await expect(page.locator('.text-red-700, .text-red-600')).toBeVisible();
  });

  test('should show error for empty scenarios array', async ({ page }) => {
    await page.goto('/admin/qa/import');

    // Enter valid JSON with empty scenarios
    await page.fill('textarea', '{ "scenarios": [] }');

    // Click validate
    await page.click('button:has-text("Validar JSON")');

    // Should show error about empty array
    await expect(page.locator('text=está vacío')).toBeVisible();
  });
});

test.describe('QA Test Runs', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!ADMIN_EMAIL || !ADMIN_PASSWORD, 'Admin credentials not configured');
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  });

  test('should display test run details page', async ({ page }) => {
    await page.goto('/admin/qa');

    // If there are recent runs, click on one
    const runLink = page.locator('a[href*="/admin/qa/runs/"]').first();
    if (await runLink.isVisible()) {
      await runLink.click();

      // Should show test run details
      await expect(page.locator('text=Detalles de Ejecución')).toBeVisible();
    }
  });
});

test.describe('QA API Endpoints', () => {
  test('should return scenarios list via API', async ({ request }) => {
    // This test checks API directly
    const response = await request.get('/api/qa/scenarios');

    // Without auth, should return 401
    expect(response.status()).toBe(401);
  });

  test('should return 401 for unauthenticated import', async ({ request }) => {
    const response = await request.post('/api/qa/import-scenarios', {
      data: { scenarios: [] },
    });

    expect(response.status()).toBe(401);
  });
});

test.describe('Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!ADMIN_EMAIL || !ADMIN_PASSWORD, 'Admin credentials not configured');
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  });

  test('QA dashboard should have no accessibility violations', async ({ page }) => {
    await page.goto('/admin/qa');

    // Basic accessibility checks
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('main, [role="main"]')).toBeVisible();

    // All images should have alt text
    const images = page.locator('img');
    const count = await images.count();
    for (let i = 0; i < count; i++) {
      const img = images.nth(i);
      const alt = await img.getAttribute('alt');
      expect(alt).not.toBeNull();
    }
  });

  test('Import page form should be accessible', async ({ page }) => {
    await page.goto('/admin/qa/import');

    // Textarea should have label
    const textarea = page.locator('textarea');
    const id = await textarea.getAttribute('id');
    if (id) {
      const label = page.locator(`label[for="${id}"]`);
      await expect(label).toBeVisible();
    }

    // Buttons should be focusable
    const validateBtn = page.locator('button:has-text("Validar JSON")');
    await validateBtn.focus();
    await expect(validateBtn).toBeFocused();
  });
});
