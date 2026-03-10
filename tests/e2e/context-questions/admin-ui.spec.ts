/**
 * Context General Questions — Admin UI E2E Tests
 *
 * Tests the admin question management page and the overview page
 * render correctly, have proper auth guards, and basic interactions work.
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

test.describe('Admin Context Questions — Page Access', () => {
  test('unauthenticated user is redirected to /login from question management', async ({ page }) => {
    await page.goto('/admin/context-questions');
    await page.waitForURL(/\/login/, { timeout: 10000 });
    expect(page.url()).toContain('/login');
  });

  test('unauthenticated user is redirected to /login from overview', async ({ page }) => {
    await page.goto('/admin/context-questions/overview');
    await page.waitForURL(/\/login/, { timeout: 10000 });
    expect(page.url()).toContain('/login');
  });
});

test.describe('Admin Context Questions — Management Page', () => {
  test.skip(!process.env.QA_ADMIN_EMAIL, 'Requires QA_ADMIN_EMAIL env var');

  test('admin can access question management page', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/context-questions');

    // Should see the header
    await expect(page.locator('h1:has-text("Preguntas de Contexto")').first()).toBeVisible({ timeout: 10000 });

    // Should see the "Add Question" button
    await expect(page.locator('text=Agregar Pregunta')).toBeVisible();
  });

  test('add question form opens and has required fields', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/context-questions');
    await page.waitForLoadState('networkidle');

    // Click add button
    await page.click('text=Agregar Pregunta');

    // Form should be visible with key fields
    await expect(page.locator('textarea').first()).toBeVisible({ timeout: 5000 });

    // Should have a question type selector
    await expect(page.locator('select').first()).toBeVisible();
  });
});

test.describe('Admin Context Questions — Overview Page', () => {
  test.skip(!process.env.QA_ADMIN_EMAIL, 'Requires QA_ADMIN_EMAIL env var');

  test('admin can access overview page', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/context-questions/overview');

    // Should see the header
    await expect(
      page.locator('text=Contexto General').first()
    ).toBeVisible({ timeout: 10000 });
  });

  test('overview page shows school count stats', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/context-questions/overview');
    await page.waitForLoadState('networkidle');

    // Should show at least one stat card with "escuelas" text
    await expect(
      page.locator('text=/escuela/i').first()
    ).toBeVisible({ timeout: 10000 });
  });

  test('overview page has link to manage questions', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/context-questions/overview');
    await page.waitForLoadState('networkidle');

    // Should have a link/button to manage questions
    const manageLink = page.locator('a[href="/admin/context-questions"]');
    await expect(manageLink).toBeVisible({ timeout: 10000 });
  });
});
