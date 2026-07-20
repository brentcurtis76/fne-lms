import { test, expect } from '@playwright/test';

/**
 * /registro — generic public self-registration form.
 *
 * Precondition: a database with at least one school (true for the dev DB and
 * for the seeded synthetic tenant). No conditional skips — if the environment
 * has no schools these tests fail loudly rather than pass vacuously.
 *
 * The generation-selector visibility contract is covered deterministically
 * with fixture props in __tests__/components/RegistroPage.generation.test.tsx;
 * this spec covers the real page render, client validation, and the submit
 * flow with a mocked API.
 */
test.describe('registro (public generic signup)', () => {
  test('page responds and renders the form', async ({ page }) => {
    const response = await page.goto('/registro');
    expect(response, 'expected a navigation response').toBeTruthy();
    expect(response!.status(), 'no 5xx on /registro').toBeLessThan(500);

    await expect(page.getByTestId('registro-submit')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('registro-school')).toBeVisible();
    // At least one real school option beyond the placeholder.
    const optionCount = await page.getByTestId('registro-school').locator('option').count();
    expect(optionCount, 'school select lists at least one school').toBeGreaterThan(1);
  });

  test('empty submit shows validation errors and focuses the first invalid field', async ({
    page,
  }) => {
    await page.goto('/registro');
    await page.getByTestId('registro-submit').click();

    await expect(page.getByText('Ingresa tu nombre.')).toBeVisible();
    await expect(page.getByText('Selecciona tu colegio.')).toBeVisible();
    await expect(page.getByTestId('registro-first-name')).toBeFocused();
  });

  test('valid submission (mocked API) shows the success panel', async ({ page }) => {
    await page.route('**/api/registro-signup', async (route) => {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      expect(body.firstName).toBe('Sofía');
      expect(body.role).toBe('docente');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
    });

    await page.goto('/registro');
    await page.getByTestId('registro-first-name').fill('Sofía');
    await page.getByTestId('registro-last-name').fill('Prueba');
    await page.getByTestId('registro-school').selectOption({ index: 1 });
    await page.getByTestId('registro-email').fill('sofia.prueba@example.com');
    await page.getByTestId('registro-birth-date').fill('1991-03-15');
    await page.getByTestId('registro-profession').fill('Docente de Prueba');
    await page.getByTestId('registro-role').selectOption('docente');
    await page.getByTestId('registro-consent').check();
    await page.getByTestId('registro-submit').click();

    const successPanel = page.getByRole('status');
    await expect(successPanel).toBeVisible();
    await expect(successPanel).toContainText('Registro enviado');
    await expect(successPanel).toContainText('sofia.prueba@example.com');
  });
});
