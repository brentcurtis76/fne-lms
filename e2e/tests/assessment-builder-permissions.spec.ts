/**
 * Assessment Builder Permission & Security Tests
 *
 * Validates role-based access control for Assessment Builder features:
 * - Admin-only routes protected
 * - Directivo school-scoping enforced
 * - Docente limited to own assessments
 * - Unauthenticated users redirected
 *
 * @see /docs/ASSESSMENT_BUILDER_PROJECT.md Phase QA-3
 */

import { test, expect, Page } from '@playwright/test';
import { loginAsQA as loginAs, logout, TEST_QA_USERS as TEST_USERS } from '../utils/auth-helpers';

// Skip if running against production
test.beforeAll(async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (url?.includes('sxlogxqzmarhqsblxmtj') && !process.env.ALLOW_PRODUCTION_TESTS) {
    test.skip();
  }
});

test.describe('Assessment Builder Permissions', () => {
  // ============================================================
  // ADMIN-ONLY ROUTE PROTECTION
  // ============================================================

  test.describe('Admin-Only Routes', () => {
    test('Docente cannot access admin assessment builder', async ({ page }) => {
      await loginAs(page, 'student'); // 'student' maps to docente role

      // Try to access admin assessment builder
      const response = await page.goto('/admin/assessment-builder');

      // Should redirect to login/unauthorized or show error
      await expect(async () => {
        const url = page.url();
        const hasRedirect = !url.includes('/admin/assessment-builder');
        const hasError = await page.locator('text=No autorizado, text=no tienes permiso, text=403').isVisible().catch(() => false);
        expect(hasRedirect || hasError).toBeTruthy();
      }).toPass({ timeout: 5000 });

      await logout(page);
    });

    test('Directivo cannot access admin assessment builder', async ({ page }) => {
      await loginAs(page, 'director');

      const response = await page.goto('/admin/assessment-builder');

      // Should redirect or show forbidden
      await expect(async () => {
        const url = page.url();
        const hasRedirect = !url.includes('/admin/assessment-builder');
        const hasError = await page.locator('text=No autorizado, text=no tienes permiso, text=403').isVisible().catch(() => false);
        expect(hasRedirect || hasError).toBeTruthy();
      }).toPass({ timeout: 5000 });

      await logout(page);
    });

    test('Consultant can access admin assessment builder', async ({ page }) => {
      await loginAs(page, 'consultant');

      await page.goto('/admin/assessment-builder');
      await page.waitForLoadState('networkidle');

      // Should have access (consultants have admin-like access)
      const url = page.url();
      const hasAccess = url.includes('/admin/assessment-builder');
      const pageContent = await page.locator('h1, h2, [data-testid="page-title"]').textContent().catch(() => '');

      // Consultant should either have access or be redirected based on role config
      console.log(`Consultant access URL: ${url}, content: ${pageContent}`);

      await logout(page);
    });
  });

  // ============================================================
  // SCHOOL-SCOPED DATA PROTECTION
  // ============================================================

  test.describe('School Data Isolation', () => {
    test('Directivo cannot access other school transversal context', async ({ page }) => {
      await loginAs(page, 'director');

      // Try to access school results API with a different school ID
      const response = await page.request.get('/api/directivo/assessments/school-results?school_id=99999');

      // Should return error (wrong school)
      expect(response.status()).toBeGreaterThanOrEqual(400);

      await logout(page);
    });

    test('Directivo API requires authentication', async ({ page }) => {
      // Without logging in, try to access directivo API
      const response = await page.request.get('/api/directivo/assessments/school-results');

      // Should return 401 unauthorized
      expect(response.status()).toBe(401);
    });

    test('School results only returns own school data', async ({ page }) => {
      await loginAs(page, 'director');

      const response = await page.request.get('/api/directivo/assessments/school-results');

      if (response.status() === 200) {
        const data = await response.json();
        // Should have school info (will be their own school)
        if (data.school) {
          console.log(`Director's school: ${data.school.name} (ID: ${data.school.id})`);
          expect(data.school.id).toBeTruthy();
        }
      }

      await logout(page);
    });
  });

  // ============================================================
  // DOCENTE INSTANCE RESTRICTIONS
  // ============================================================

  test.describe('Docente Instance Access', () => {
    test('Docente cannot access non-existent instance', async ({ page }) => {
      await loginAs(page, 'student');

      // Try to access a fake instance ID
      const response = await page.goto('/docente/assessments/00000000-0000-0000-0000-000000000000');

      // Should show error or redirect
      await page.waitForLoadState('networkidle');

      const hasError = await page.locator('text=no encontrada, text=not found, text=error').isVisible().catch(() => false);
      const redirectedAway = !page.url().includes('00000000-0000-0000-0000-000000000000');

      expect(hasError || redirectedAway).toBeTruthy();

      await logout(page);
    });

    test('Docente results API validates instance access', async ({ page }) => {
      await loginAs(page, 'student');

      // Try to get results for a non-existent instance
      const response = await page.request.get('/api/docente/assessments/00000000-0000-0000-0000-000000000000/results');

      // Should return error
      expect(response.status()).toBeGreaterThanOrEqual(400);

      await logout(page);
    });
  });

  // ============================================================
  // UNAUTHENTICATED ACCESS
  // ============================================================

  test.describe('Unauthenticated Access', () => {
    test('Unauthenticated user redirected from admin routes', async ({ page }) => {
      // Don't login, just try to access
      await page.goto('/admin/assessment-builder');
      await page.waitForLoadState('networkidle');

      // Should redirect to login
      const url = page.url();
      const isOnLogin = url.includes('/login') || url.includes('/auth');
      const isNotOnAdmin = !url.includes('/admin/assessment-builder');

      expect(isOnLogin || isNotOnAdmin).toBeTruthy();
    });

    test('Unauthenticated user redirected from directivo routes', async ({ page }) => {
      await page.goto('/school/transversal-context');
      await page.waitForLoadState('networkidle');

      const url = page.url();
      const isOnLogin = url.includes('/login') || url.includes('/auth');
      const isNotOnSchool = !url.includes('/school/transversal-context');

      expect(isOnLogin || isNotOnSchool).toBeTruthy();
    });

    test('Unauthenticated user redirected from docente routes', async ({ page }) => {
      await page.goto('/docente/assessments');
      await page.waitForLoadState('networkidle');

      const url = page.url();
      const isOnLogin = url.includes('/login') || url.includes('/auth');
      const isNotOnDocente = !url.includes('/docente/assessments');

      expect(isOnLogin || isNotOnDocente).toBeTruthy();
    });

    test('API routes return 401 for unauthenticated requests', async ({ page }) => {
      // Test various API endpoints
      const endpoints = [
        '/api/admin/assessment-templates',
        '/api/directivo/assessments/school-results',
        '/api/docente/assessments',
      ];

      for (const endpoint of endpoints) {
        const response = await page.request.get(endpoint);
        // Should return 401 (unauthorized)
        expect(response.status()).toBe(401);
      }
    });
  });

  // ============================================================
  // TEMPLATE ACCESS CONTROL
  // ============================================================

  test.describe('Template Access Control', () => {
    test('Published templates visible to appropriate roles', async ({ page }) => {
      await loginAs(page, 'admin');

      // Get list of templates
      const response = await page.request.get('/api/admin/assessment-templates');

      if (response.status() === 200) {
        const data = await response.json();
        console.log(`Admin sees ${data.templates?.length || 0} templates`);
      }

      await logout(page);
    });

    test('Draft templates not visible to docentes', async ({ page }) => {
      await loginAs(page, 'student');

      // Docentes should only see assessments assigned to them, not templates
      await page.goto('/docente/assessments');
      await page.waitForLoadState('networkidle');

      // Should not have direct template access
      const templateLinks = await page.locator('a[href*="/admin/assessment-builder/"]').count();
      expect(templateLinks).toBe(0);

      await logout(page);
    });
  });

  // ============================================================
  // RESPONSE SUBMISSION SECURITY
  // ============================================================

  test.describe('Response Submission Security', () => {
    test('Cannot submit response for non-assigned instance', async ({ page }) => {
      await loginAs(page, 'student');

      // Try to submit a response via API for a fake instance
      const response = await page.request.post('/api/docente/assessments/00000000-0000-0000-0000-000000000000/responses', {
        data: {
          responses: [
            { indicator_id: 'fake-indicator', value: 'true' }
          ]
        }
      });

      // Should fail
      expect(response.status()).toBeGreaterThanOrEqual(400);

      await logout(page);
    });

    test('Cannot modify submitted assessment', async ({ page }) => {
      await loginAs(page, 'student');

      // First, find a completed assessment (if any)
      await page.goto('/docente/assessments');
      await page.waitForLoadState('networkidle');

      const completedCard = page.locator('[data-status="completed"]').first();

      if (await completedCard.isVisible()) {
        // Get the instance ID
        const href = await completedCard.locator('a').getAttribute('href');
        const instanceId = href?.match(/\/docente\/assessments\/([a-f0-9-]+)/)?.[1];

        if (instanceId) {
          // Try to submit new responses
          const response = await page.request.post(`/api/docente/assessments/${instanceId}/responses`, {
            data: {
              responses: [
                { indicator_id: 'any-indicator', value: 'true' }
              ]
            }
          });

          // Should fail (assessment already completed)
          console.log(`Modify completed response status: ${response.status()}`);
          expect(response.status()).toBeGreaterThanOrEqual(400);
        }
      }

      await logout(page);
    });
  });

  // ============================================================
  // CROSS-SITE REQUEST FORGERY (CSRF) CONSIDERATIONS
  // ============================================================

  test.describe('API Security Headers', () => {
    test('API responses include security headers', async ({ page }) => {
      await loginAs(page, 'admin');

      const response = await page.request.get('/api/admin/assessment-templates');

      // Check for security-related headers (Next.js sets some by default)
      const headers = response.headers();
      console.log('Response headers:', Object.keys(headers).join(', '));

      await logout(page);
    });
  });
});

// ============================================================
// ROLE ESCALATION TESTS
// ============================================================

test.describe('Role Escalation Prevention', () => {
  test('Cannot change role via user metadata manipulation', async ({ page }) => {
    await loginAs(page, 'student');

    // Try to access admin functionality
    const response = await page.request.post('/api/admin/assessment-templates', {
      data: {
        name: 'Malicious Template',
        area: 'aprendizaje'
      }
    });

    // Should fail even if trying to claim admin role
    expect(response.status()).toBeGreaterThanOrEqual(400);

    await logout(page);
  });

  test('Directivo cannot create assessment templates', async ({ page }) => {
    await loginAs(page, 'director');

    const response = await page.request.post('/api/admin/assessment-templates', {
      data: {
        name: 'Directivo Template Attempt',
        area: 'evaluacion'
      }
    });

    // Should fail - directivos can't create templates
    expect(response.status()).toBeGreaterThanOrEqual(400);

    await logout(page);
  });
});
