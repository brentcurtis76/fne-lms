import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'dotenv';
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

  test('accepts the new password in a browser retaining a revoked pre-reset session', async ({ page }) => {
    const env = { ...parse(readFileSync(join(__dirname, '../../.env.local'), 'utf8')), ...process.env };
    const url = env.NEXT_PUBLIC_SUPABASE_URL!;
    if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname)) {
      throw new Error('Revoked-session test requires a disposable local provider');
    }
    const admin = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const email = `e2e-stale-login-${Date.now()}@example.com`;
    const oldPassword = 'SyntheticOld2026';
    const newPassword = 'SyntheticNew2026';
    const { data, error } = await admin.auth.admin.createUser({ email, password: oldPassword, email_confirm: true });
    expect(error).toBeNull();
    const userId = data.user!.id;
    try {
      const profile = await admin.from('profiles').upsert({
        id: userId, email, name: 'Sintetica Sesion', approval_status: 'approved',
        first_name: 'Sintetica', last_name: 'Sesion', must_change_password: false,
      }).select('id').single();
      expect(profile.error).toBeNull();
      await page.goto('/login');
      await page.getByTestId('login-email').fill(email);
      await page.getByTestId('login-password').fill(oldPassword);
      const signedIn = page.waitForResponse(response => response.url().includes('/auth/v1/token?grant_type=password'));
      // The dashboard's last API call; registered before sign-in so it cannot be missed.
      const dashboardPaths = page.waitForResponse(response => response.url().includes('/api/learning-paths/my-paths'));
      await page.getByTestId('login-submit').click();
      const oldSession = await (await signedIn).json();
      await expect(page).toHaveURL(/\/dashboard(?:\?|$)/, { timeout: 30_000 });
      // Let the dashboard finish its own API calls, then leave it. Any of those
      // calls landing after the reset is refused by the middleware, which expires
      // the revoked cookie (correct, but not the browser state under test here).
      await (await dashboardPaths).finished();
      await page.waitForLoadState('networkidle');
      await page.goto('about:blank');
      const cookiesBeforeReset = (await page.context().cookies()).filter(cookie => cookie.name.startsWith('sb-'));
      expect(cookiesBeforeReset.length).toBeGreaterThan(0);
      const reset = await admin.auth.admin.updateUserById(userId, { password: newPassword });
      expect(reset.error).toBeNull();
      // Prove the provider revoked this exact session while the browser still
      // holds its cookies. No cookie clearing or fresh browser context here.
      const check = await admin.auth.getUser(oldSession.access_token);
      expect(check.data.user).toBeNull();
      expect(check.error).not.toBeNull();
      expect((await page.context().cookies()).filter(cookie => cookie.name.startsWith('sb-'))).toEqual(cookiesBeforeReset);
      await page.goto('/login');
      await expect(page.getByTestId('login-submit')).toBeEnabled();
      await page.getByTestId('login-email').fill(email);
      await page.getByTestId('login-password').fill(newPassword);
      await page.getByTestId('login-submit').click();
      await expect(page).toHaveURL(/\/dashboard(?:\?|$)/, { timeout: 30_000 });
    } finally {
      const removed = await admin.auth.admin.deleteUser(userId);
      expect(removed.error).toBeNull();
    }
  });

  test('a slow dashboard response does not become an authentication failure', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByTestId('login-submit')).toBeEnabled();
    await page.clock.install();
    let release!: () => void;
    const download = new Promise<void>(resolve => { release = resolve; });
    await page.route('**/_next/data/**/dashboard.json*', async route => {
      await download;
      await route.continue();
    });
    try {
      await page.getByTestId('login-email').fill(E2E_USERS.docente.email);
      await page.getByTestId('login-password').fill(E2E_USERS.docente.password);
      await page.getByTestId('login-submit').click();
      await expect(page.getByText('Tu sesión está lista. Estamos cargando la página...')).toBeVisible();
      await page.clock.fastForward(20_000);
      await expect(page.getByText('Tu sesión está lista. Estamos cargando la página...')).toBeVisible();
      await expect(page.getByTestId('login-retry')).toHaveCount(0);
      release();
      await page.clock.resume();
      await expect(page).toHaveURL(/\/dashboard(?:\?|$)/, { timeout: 30_000 });
    } finally { release(); }
  });

  test('a failed password-state check stays put and recovers with its valid session', async ({ page }) => {
    await page.goto('/login');
    await page.route('**/rest/v1/rpc/current_password_change_state', route => route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Synthetic temporary outage' }),
    }));
    await page.getByTestId('login-email').fill(E2E_USERS.docente.email);
    await page.getByTestId('login-password').fill(E2E_USERS.docente.password);
    const diagnostic = page.waitForEvent('console', {
      predicate: message => message.type() === 'error' && message.text().startsWith('[Login] attempt failed'),
    });
    await page.getByTestId('login-submit').click();
    await expect(page.getByTestId('login-retry')).toBeVisible();
    expect(await (await diagnostic).args()[1].jsonValue()).toEqual({
      stage: 'password-state', reason: 'request-failed', status: 503,
    });
    await expect(page).toHaveURL(/\/login(?:\?|$)/);
    await page.unroute('**/rest/v1/rpc/current_password_change_state');
    await page.getByTestId('login-retry').click();
    await expect(page).toHaveURL(/\/dashboard(?:\?|$)/, { timeout: 30_000 });
  });
});
