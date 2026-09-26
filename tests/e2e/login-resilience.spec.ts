import { test, expect } from '@playwright/test';
import { E2E_USERS } from './helpers/auth';

// Synthetic fixtures only. These run against the same disposable local stack
// as auth-lifecycle.spec.ts, which covers password recovery through real email
// capture and signing in with the new password. Here we inject network stalls.
test.describe('login failure recovery', () => {
  for (const viewport of [{ width: 1366, height: 768 }, { width: 390, height: 844 }]) {
    test(`a stalled sign-in offers a working retry at width ${viewport.width}`, async ({ page }) => {
      await page.context().clearCookies();
      await page.setViewportSize(viewport);
      await page.goto('/login');
      await expect(page.getByTestId('login-submit')).toBeEnabled();
      await page.clock.install();
      // Leaving a route unhandled models a request that never returns. No
      // authentication request reaches the provider until after the retry.
      await page.route('**/auth/v1/token?grant_type=password', () => {});
      await page.getByTestId('login-email').fill(E2E_USERS.docente.email);
      await page.getByTestId('login-password').fill(E2E_USERS.docente.password);
      await page.getByTestId('login-submit').click();
      await expect(page.getByText('Iniciando sesión...')).toBeVisible();
      await page.clock.fastForward(16_000);
      await expect(page.getByRole('main').getByRole('alert')).toContainText('Revisa tu conexión');
      await expect(page.getByTestId('login-retry')).toBeVisible();
      await page.screenshot({ path: test.info().outputPath(`login-retry-${viewport.width}.png`), fullPage: true });
      await page.unroute('**/auth/v1/token?grant_type=password');
      await page.getByTestId('login-retry').click();
      await expect(page.getByTestId('login-submit')).toBeEnabled();
      await page.clock.resume();
      await page.getByTestId('login-email').fill(E2E_USERS.docente.email);
      await page.getByTestId('login-password').fill(E2E_USERS.docente.password);
      await page.getByTestId('login-submit').click();
      await expect(page).toHaveURL(/\/dashboard(?:\?|$)/, { timeout: 30_000 });
    });
  }

  test('a failed password-state check stays put and recovers with its valid session', async ({ page }) => {
    await page.goto('/login');
    await page.route('**/rest/v1/rpc/current_password_change_state', route => route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Synthetic temporary outage' }),
    }));
    await page.getByTestId('login-email').fill(E2E_USERS.docente.email);
    await page.getByTestId('login-password').fill(E2E_USERS.docente.password);
    await page.getByTestId('login-submit').click();
    await expect(page.getByTestId('login-retry')).toBeVisible();
    await expect(page).toHaveURL(/\/login(?:\?|$)/);
    await page.unroute('**/rest/v1/rpc/current_password_change_state');
    await page.getByTestId('login-retry').click();
    await expect(page).toHaveURL(/\/dashboard(?:\?|$)/, { timeout: 30_000 });
  });
});
