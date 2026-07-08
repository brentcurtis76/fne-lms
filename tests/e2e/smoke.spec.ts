import { test, expect } from '@playwright/test';

/**
 * Fase 0 smoke suite — the CI e2e gate runs ONLY this file until the seeded
 * synthetic tenant exists (Fase 1). Keeps the gate real without requiring
 * authenticated fixtures. Itinerary: "CI pipeline green on an empty smoke test".
 */
test.describe('smoke', () => {
  test('root responds without a server error', async ({ page }) => {
    const response = await page.goto('/');
    expect(response, 'expected a navigation response').toBeTruthy();
    expect(response!.status(), 'no 5xx on /').toBeLessThan(500);
  });

  test('login page renders its form', async ({ page }) => {
    await page.goto('/login');
    await expect(page).toHaveTitle(/.+/);
    await expect(
      page.locator('form, input[type="email"], input[type="password"]').first()
    ).toBeVisible({ timeout: 15_000 });
  });
});
