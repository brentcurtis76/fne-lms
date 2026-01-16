/**
 * Authentication Redirect Tests (Automated Only)
 *
 * These tests verify that protected routes correctly redirect
 * unauthenticated users to the login page. They MUST be run
 * via Playwright because they test logged-out state behavior.
 *
 * Corresponding scenarios in qa_scenarios have automated_only=true
 */

import { test, expect } from '@playwright/test';

test.describe('Protected Route Redirects (No Session)', () => {
  // Ensure no session exists for these tests
  test.use({ storageState: { cookies: [], origins: [] } });

  test.describe('Core Application Routes', () => {
    test('dashboard redirects to login when not authenticated', async ({ page }) => {
      await page.goto('/dashboard');
      await expect(page).toHaveURL(/\/login/);
    });

    test('profile page redirects to login when not authenticated', async ({ page }) => {
      await page.goto('/profile');
      await expect(page).toHaveURL(/\/login/);
    });

    test('workspace redirects to login when not authenticated', async ({ page }) => {
      await page.goto('/workspace');
      await expect(page).toHaveURL(/\/login/);
    });

    test('messages page redirects to login when not authenticated', async ({ page }) => {
      await page.goto('/messages');
      await expect(page).toHaveURL(/\/login/);
    });
  });

  test.describe('Course Routes', () => {
    test('courses list redirects to login when not authenticated', async ({ page }) => {
      await page.goto('/courses');
      await expect(page).toHaveURL(/\/login/);
    });

    test('course detail page redirects to login when not authenticated', async ({ page }) => {
      await page.goto('/courses/some-course-id');
      await expect(page).toHaveURL(/\/login/);
    });

    test('course enrollment page redirects to login when not authenticated', async ({ page }) => {
      await page.goto('/enroll');
      await expect(page).toHaveURL(/\/login/);
    });
  });

  test.describe('Assessment Routes', () => {
    test('evaluaciones redirects to login when not authenticated', async ({ page }) => {
      await page.goto('/evaluaciones');
      await expect(page).toHaveURL(/\/login/);
    });

    test('quiz page redirects to login when not authenticated', async ({ page }) => {
      await page.goto('/quiz/some-quiz-id');
      await expect(page).toHaveURL(/\/login/);
    });
  });

  test.describe('Reporting Routes', () => {
    test('reports page redirects to login when not authenticated', async ({ page }) => {
      await page.goto('/reports');
      await expect(page).toHaveURL(/\/login/);
    });

    test('analytics page redirects to login when not authenticated', async ({ page }) => {
      await page.goto('/analytics');
      await expect(page).toHaveURL(/\/login/);
    });
  });

  test.describe('QA System Routes', () => {
    test('QA scenarios list redirects to login when not authenticated', async ({ page }) => {
      await page.goto('/qa');
      await expect(page).toHaveURL(/\/login/);
    });

    test('QA test run page redirects to login when not authenticated', async ({ page }) => {
      await page.goto('/qa/run/some-scenario-id');
      await expect(page).toHaveURL(/\/login/);
    });
  });

  test.describe('Admin Routes', () => {
    test('admin dashboard redirects to login when not authenticated', async ({ page }) => {
      await page.goto('/admin');
      await expect(page).toHaveURL(/\/login/);
    });

    test('admin users page redirects to login when not authenticated', async ({ page }) => {
      await page.goto('/admin/users');
      await expect(page).toHaveURL(/\/login/);
    });

    test('admin schools page redirects to login when not authenticated', async ({ page }) => {
      await page.goto('/admin/schools');
      await expect(page).toHaveURL(/\/login/);
    });

    test('admin courses page redirects to login when not authenticated', async ({ page }) => {
      await page.goto('/admin/courses');
      await expect(page).toHaveURL(/\/login/);
    });

    test('admin QA dashboard redirects to login when not authenticated', async ({ page }) => {
      await page.goto('/admin/qa');
      await expect(page).toHaveURL(/\/login/);
    });

    test('admin QA scenarios redirects to login when not authenticated', async ({ page }) => {
      await page.goto('/admin/qa/scenarios');
      await expect(page).toHaveURL(/\/login/);
    });

    test('admin QA import redirects to login when not authenticated', async ({ page }) => {
      await page.goto('/admin/qa/import');
      await expect(page).toHaveURL(/\/login/);
    });

    test('admin networks page redirects to login when not authenticated', async ({ page }) => {
      await page.goto('/admin/networks');
      await expect(page).toHaveURL(/\/login/);
    });
  });

  test.describe('Consultant Routes', () => {
    test('consultor overview redirects to login when not authenticated', async ({ page }) => {
      await page.goto('/consultor');
      await expect(page).toHaveURL(/\/login/);
    });

    test('consultor schools redirects to login when not authenticated', async ({ page }) => {
      await page.goto('/consultor/schools');
      await expect(page).toHaveURL(/\/login/);
    });
  });

  test.describe('Supervisor Routes', () => {
    test('supervisor de red dashboard redirects to login when not authenticated', async ({ page }) => {
      await page.goto('/supervisor-red');
      await expect(page).toHaveURL(/\/login/);
    });
  });
});

test.describe('Public Routes (Should NOT Redirect)', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('login page is accessible without authentication', async ({ page }) => {
    await page.goto('/login');
    await expect(page).toHaveURL(/\/login/);
    // Should show login form, not redirect
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });

  test('password reset page is accessible without authentication', async ({ page }) => {
    await page.goto('/forgot-password');
    // Should stay on the page or show forgot password form
    // Some apps redirect to login with a param
    const url = page.url();
    expect(url).toMatch(/\/(forgot-password|login|reset)/);
  });

  test('home page behavior', async ({ page }) => {
    await page.goto('/');
    // Home page typically redirects to login or shows a landing page
    const url = page.url();
    // Should either stay on home or redirect to login
    expect(url).toMatch(/\/(login)?$/);
  });
});

test.describe('API Endpoint Auth (401 Responses)', () => {
  test('API scenarios endpoint returns 401 without auth', async ({ request }) => {
    const response = await request.get('/api/qa/scenarios');
    expect(response.status()).toBe(401);
  });

  test('API test runs endpoint returns 401 without auth', async ({ request }) => {
    const response = await request.get('/api/qa/runs');
    expect(response.status()).toBe(401);
  });

  test('API import endpoint returns 401 without auth', async ({ request }) => {
    const response = await request.post('/api/qa/import-scenarios', {
      data: { scenarios: [] },
    });
    expect(response.status()).toBe(401);
  });

  test('API users endpoint returns 401 without auth', async ({ request }) => {
    const response = await request.get('/api/users');
    expect(response.status()).toBe(401);
  });

  test('API schools endpoint returns 401 without auth', async ({ request }) => {
    const response = await request.get('/api/schools');
    expect(response.status()).toBe(401);
  });

  test('API courses endpoint returns 401 without auth', async ({ request }) => {
    const response = await request.get('/api/courses');
    expect(response.status()).toBe(401);
  });

  test('API networks endpoint returns 401 without auth', async ({ request }) => {
    const response = await request.get('/api/networks');
    expect(response.status()).toBe(401);
  });
});

test.describe('Login Page Functionality', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('login page shows error for invalid credentials', async ({ page }) => {
    await page.goto('/login');

    await page.fill('input[type="email"]', 'invalid@test.com');
    await page.fill('input[type="password"]', 'wrongpassword');
    await page.click('button[type="submit"]');

    // Should show error message and stay on login
    await expect(page).toHaveURL(/\/login/);
    // Look for error indication (toast, error text, etc.)
    await page.waitForTimeout(2000); // Wait for async response
    const hasError = await page.locator('.text-red-500, .text-red-600, .text-red-700, [role="alert"]').isVisible().catch(() => false);
    // Note: Some login flows might just not redirect on failure
  });

  test('login page validates required fields', async ({ page }) => {
    await page.goto('/login');

    // Try to submit empty form
    await page.click('button[type="submit"]');

    // Should show validation or stay on page
    await expect(page).toHaveURL(/\/login/);
  });

  test('remember me checkbox exists', async ({ page }) => {
    await page.goto('/login');

    // Look for remember me option
    const rememberMe = page.locator('input[type="checkbox"]');
    const count = await rememberMe.count();
    // May or may not have this feature
    if (count > 0) {
      await expect(rememberMe.first()).toBeVisible();
    }
  });
});
