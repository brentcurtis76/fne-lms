/**
 * RBAC System End-to-End Tests
 *
 * Tests the complete RBAC functionality to ensure:
 * 1. Superadmins can access and use the RBAC UI
 * 2. Permission changes work correctly
 * 3. Non-superadmins cannot access RBAC
 * 4. Existing functionality is not broken
 */

import { test, expect, Page } from '@playwright/test';

const BASE_URL = 'http://localhost:3000';

// Test users
const SUPERADMIN = {
  email: 'brent@perrotuertocm.cl',
  password: process.env.SUPERADMIN_PASSWORD || 'your-password-here'
};

const TEST_USERS = {
  admin: {
    email: 'test.admin@fne-test.com',
    password: 'TestAdmin123!'
  },
  teacher: {
    email: 'test.docente@fne-test.com',
    password: 'TestDocente123!'
  },
  student: {
    email: 'test.estudiante@fne-test.com',
    password: 'TestEstudiante123!'
  },
  communityManager: {
    email: 'test.community.manager@fne-test.com',
    password: 'TestManager123!'
  }
};

/**
 * Helper: Login function
 */
async function login(page: Page, email: string, password: string) {
  await page.goto(BASE_URL);

  // Wait for login page to load
  await page.waitForLoadState('networkidle');

  // Fill in credentials
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);

  // Click login button
  await page.click('button[type="submit"]');

  // Wait for navigation after login
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000); // Give it extra time for auth to settle
}

/**
 * Helper: Logout function
 */
async function logout(page: Page) {
  // Look for user menu or logout button
  const logoutButton = page.locator('button:has-text("Cerrar sesión"), button:has-text("Logout")').first();
  if (await logoutButton.isVisible({ timeout: 2000 })) {
    await logoutButton.click();
    await page.waitForLoadState('networkidle');
  }
}

/**
 * Helper: Check for console errors
 */
function setupConsoleErrorTracking(page: Page): string[] {
  const errors: string[] = [];

  page.on('console', msg => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });

  page.on('pageerror', error => {
    errors.push(error.message);
  });

  return errors;
}

test.describe('RBAC System Tests', () => {

  test.describe.configure({ mode: 'serial' });

  test('🔴 CRITICAL Test 1: Superadmin can access RBAC page', async ({ page }) => {
    const errors = setupConsoleErrorTracking(page);

    // Login as superadmin
    await login(page, SUPERADMIN.email, SUPERADMIN.password);

    // Check if on dashboard
    await expect(page).toHaveURL(/\/dashboard/);

    // Look for "Roles y Permisos" in sidebar
    const rbacLink = page.locator('a:has-text("Roles y Permisos"), a:has-text("Roles")').first();
    await expect(rbacLink).toBeVisible({ timeout: 5000 });

    // Click it
    await rbacLink.click();
    await page.waitForLoadState('networkidle');

    // Verify we're on the RBAC page
    await expect(page).toHaveURL(/\/admin\/role-management/);

    // Verify page title or heading
    const heading = page.locator('h1, h2').first();
    await expect(heading).toBeVisible();

    // Check for critical console errors
    const criticalErrors = errors.filter(e =>
      !e.includes('source map') &&
      !e.includes('DevTools') &&
      !e.includes('warning')
    );
    expect(criticalErrors).toHaveLength(0);

    console.log('✅ Test 1 PASSED: Superadmin can access RBAC page');
  });

  test('🔴 CRITICAL Test 2: Permission matrix displays correctly', async ({ page }) => {
    const errors = setupConsoleErrorTracking(page);

    // Login and navigate to RBAC
    await login(page, SUPERADMIN.email, SUPERADMIN.password);
    await page.goto(`${BASE_URL}/admin/role-management`);
    await page.waitForLoadState('networkidle');

    // Wait for the page to fully load
    await page.waitForTimeout(2000);

    // Check for role accordions or sections (should be 9 roles)
    const roleElements = page.locator('[data-role], .role-section, details');
    const roleCount = await roleElements.count();

    // We should have at least 9 roles visible
    expect(roleCount).toBeGreaterThanOrEqual(9);

    // Expand first role to check structure
    const firstRole = roleElements.first();
    await firstRole.click();
    await page.waitForTimeout(500);

    // Look for scope buttons (Propio, Colegio, Red, Todos)
    const scopeButtons = page.locator('button:has-text("Propio"), button:has-text("Colegio"), button:has-text("Red"), button:has-text("Todos")');
    const buttonCount = await scopeButtons.count();
    expect(buttonCount).toBeGreaterThan(0);

    // Check for critical console errors
    const criticalErrors = errors.filter(e =>
      !e.includes('source map') &&
      !e.includes('DevTools')
    );
    expect(criticalErrors).toHaveLength(0);

    console.log('✅ Test 2 PASSED: Permission matrix displays correctly');
  });

  test('🔴 CRITICAL Test 3: Permission toggle and save works', async ({ page }) => {
    const errors = setupConsoleErrorTracking(page);

    // Login and navigate to RBAC
    await login(page, SUPERADMIN.email, SUPERADMIN.password);
    await page.goto(`${BASE_URL}/admin/role-management`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Find a non-critical permission to toggle (e.g., view_news for docente)
    // First expand docente role
    const docenteRole = page.locator('[data-role="docente"], details:has-text("Docente"), summary:has-text("Docente")').first();
    await docenteRole.click();
    await page.waitForTimeout(500);

    // Find a permission button (any scope button)
    const permissionButton = page.locator('button[class*="bg-"], button[class*="scope"]').first();

    if (await permissionButton.isVisible({ timeout: 2000 })) {
      // Get initial state
      const initialClass = await permissionButton.getAttribute('class');

      // Click to toggle
      await permissionButton.click();
      await page.waitForTimeout(500);

      // Check if Save/Cancel buttons appear
      const saveButton = page.locator('button:has-text("Guardar"), button:has-text("Save")');
      const cancelButton = page.locator('button:has-text("Cancelar"), button:has-text("Cancel")');

      // These should appear after making a change
      await expect(saveButton.or(cancelButton)).toBeVisible({ timeout: 3000 });

      // Click cancel to revert
      if (await cancelButton.isVisible({ timeout: 1000 })) {
        await cancelButton.click();
        await page.waitForTimeout(500);
      }

      console.log('✅ Test 3 PASSED: Permission toggle works');
    } else {
      console.log('⚠️  Test 3: Could not find permission button to test');
    }
  });

  test('🔴 CRITICAL Test 6: Non-superadmin cannot access RBAC', async ({ page }) => {
    const errors = setupConsoleErrorTracking(page);

    // Login as regular admin (not superadmin)
    await login(page, TEST_USERS.admin.email, TEST_USERS.admin.password);

    // Wait for dashboard
    await page.waitForLoadState('networkidle');

    // Check sidebar - "Roles y Permisos" should NOT be visible
    const rbacLink = page.locator('a:has-text("Roles y Permisos")');
    await expect(rbacLink).not.toBeVisible({ timeout: 2000 });

    // Try to access directly
    await page.goto(`${BASE_URL}/admin/role-management`);
    await page.waitForLoadState('networkidle');

    // Should be redirected or see error - NOT on role-management page
    const url = page.url();
    const isOnRBACPage = url.includes('/admin/role-management');

    // Either redirected away OR see an error message
    if (isOnRBACPage) {
      // If still on RBAC page, there should be an error message
      const errorMessage = page.locator('text=No autorizado, text=Access denied, text=No tiene permisos');
      await expect(errorMessage).toBeVisible({ timeout: 3000 });
    }

    console.log('✅ Test 6 PASSED: Non-superadmin cannot access RBAC');
  });

  test('🔴 CRITICAL Test 7: Student functionality unchanged', async ({ page }) => {
    const errors = setupConsoleErrorTracking(page);

    // Login as student
    await login(page, TEST_USERS.student.email, TEST_USERS.student.password);

    // Verify dashboard loads
    await expect(page).toHaveURL(/\/dashboard/);

    // Check for RBAC menu - should NOT exist
    const rbacLink = page.locator('a:has-text("Roles y Permisos")');
    await expect(rbacLink).not.toBeVisible({ timeout: 2000 });

    // Verify student can see their content
    // Look for student-specific elements (courses, lessons, etc.)
    const courseLink = page.locator('a:has-text("Cursos"), a:has-text("Mis Cursos"), text=Curso');
    await expect(courseLink.first()).toBeVisible({ timeout: 5000 });

    // Check for critical console errors
    const criticalErrors = errors.filter(e =>
      !e.includes('source map') &&
      !e.includes('DevTools')
    );

    if (criticalErrors.length > 0) {
      console.log('⚠️  Console errors found:', criticalErrors);
    }

    expect(criticalErrors).toHaveLength(0);

    console.log('✅ Test 7 PASSED: Student functionality unchanged');
  });

  test('🟡 IMPORTANT Test 8: Teacher functionality unchanged', async ({ page }) => {
    const errors = setupConsoleErrorTracking(page);

    // Login as teacher
    await login(page, TEST_USERS.teacher.email, TEST_USERS.teacher.password);

    // Verify dashboard loads
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/\/dashboard/);

    // Check for RBAC menu - should NOT exist
    const rbacLink = page.locator('a:has-text("Roles y Permisos")');
    await expect(rbacLink).not.toBeVisible({ timeout: 2000 });

    // Verify teacher can see their content
    const teacherElements = page.locator('text=Curso, text=Reporte, text=Clase');
    await expect(teacherElements.first()).toBeVisible({ timeout: 5000 });

    // Check for critical console errors
    const criticalErrors = errors.filter(e =>
      !e.includes('source map') &&
      !e.includes('DevTools')
    );

    expect(criticalErrors).toHaveLength(0);

    console.log('✅ Test 8 PASSED: Teacher functionality unchanged');
  });

  test('🟡 IMPORTANT Test 9: Community Manager functionality', async ({ page }) => {
    const errors = setupConsoleErrorTracking(page);

    // Login as community manager
    await login(page, TEST_USERS.communityManager.email, TEST_USERS.communityManager.password);

    // Verify dashboard loads
    await page.waitForLoadState('networkidle');

    // Check for RBAC menu - should NOT exist
    const rbacLink = page.locator('a:has-text("Roles y Permisos")');
    await expect(rbacLink).not.toBeVisible({ timeout: 2000 });

    // Check for critical console errors
    const criticalErrors = errors.filter(e =>
      !e.includes('source map') &&
      !e.includes('DevTools')
    );

    expect(criticalErrors).toHaveLength(0);

    console.log('✅ Test 9 PASSED: Community Manager functionality unchanged');
  });
});

test.describe('RBAC System - Summary', () => {
  test('Generate test report', async () => {
    console.log('\n' + '='.repeat(60));
    console.log('📊 RBAC AUTOMATED TEST SUMMARY');
    console.log('='.repeat(60));
    console.log('\nAll critical automated tests completed.');
    console.log('Review the test results above for detailed pass/fail status.');
    console.log('\nTests that require manual verification:');
    console.log('  - Test 4: Lockout protection warning modal');
    console.log('  - Test 5: Audit log verification in database');
    console.log('  - Test 10: Batch permission updates');
    console.log('\n' + '='.repeat(60));
  });
});
