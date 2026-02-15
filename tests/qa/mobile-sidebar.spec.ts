import { test, expect, type Page } from '@playwright/test';

const MOBILE_E2E_EMAIL = process.env.MOBILE_E2E_EMAIL;
const MOBILE_E2E_PASSWORD = process.env.MOBILE_E2E_PASSWORD;

async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/dashboard/);
}

test.describe('Mobile Sidebar Navigation', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeEach(async () => {
    test.skip(!MOBILE_E2E_EMAIL || !MOBILE_E2E_PASSWORD, 'Set MOBILE_E2E_EMAIL and MOBILE_E2E_PASSWORD to run mobile sidebar E2E tests');
  });

  test('opens from mobile header trigger and closes after navigation', async ({ page }) => {
    await login(page, MOBILE_E2E_EMAIL as string, MOBILE_E2E_PASSWORD as string);

    const sidebar = page.getByTestId('global-sidebar');
    await expect(sidebar).not.toBeVisible();

    await page.getByTestId('mobile-sidebar-trigger').click();
    await expect(sidebar).toBeVisible();

    await page.getByTestId('sidebar-item-profile').click();
    await expect(page).toHaveURL(/\/profile/);
    await expect(sidebar).not.toBeVisible();
  });
});
