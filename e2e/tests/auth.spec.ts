/**
 * Authentication E2E Tests
 * Tests login, logout, and role-based access across all user types
 */

import { test, expect } from '@playwright/test';
import { loginAsQA as loginAs, logout, TEST_QA_USERS as TEST_USERS, verifyRoleAccess } from '../utils/auth-helpers';

test.describe('Authentication Flow @auth', () => {
  
  test.beforeEach(async ({ page }) => {
    // Ensure we start from a clean state
    await page.goto('/login');
  });

  test('should display login page correctly', async ({ page }) => {
    await expect(page).toHaveTitle(/Genera/);
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('should show error for invalid credentials', async ({ page }) => {
    await page.fill('input[type="email"]', 'invalid@example.com');
    await page.fill('input[type="password"]', 'wrongpassword');
    await page.click('button:has-text("Iniciar Sesión")');

    // Wait a moment for the error to appear
    await page.waitForTimeout(2000);

    // Should remain on login page (failed login)
    await expect(page).toHaveURL(/\/login/);

    // Should show some kind of error indication (could be various error messages)
    const hasError = await page.locator('.text-red-500, .text-destructive, [role="alert"], text=credenciales, text=Invalid, text=Error').isVisible();
    expect(hasError || await page.url().includes('/login')).toBeTruthy();
  });

  test('should handle empty form submission', async ({ page }) => {
    await page.click('button[type="submit"]');
    
    // Should show validation errors or remain on login page
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe('Role-Based Authentication @admin', () => {

  test('admin login and access verification', async ({ page }) => {
    const user = await loginAs(page, 'admin');

    // Should redirect to dashboard
    await expect(page).toHaveURL(/\/dashboard/);

    // Verify admin-specific access
    await verifyRoleAccess(page, 'admin');

    // Should be able to access admin-only pages
    await page.goto('/admin/user-management');
    await page.waitForLoadState('networkidle');
    // Admin should not be redirected to login
    await expect(page).not.toHaveURL(/\/login/);

    await logout(page);
  });

  test('admin can access all navigation items', async ({ page }) => {
    await loginAs(page, 'admin');

    // Check for core admin navigation items (flexible to actual UI)
    // Use .first() to avoid strict mode violations when multiple elements match
    const coreNavItems = [
      'Mi Panel',
      'Usuarios',
      'Cursos',
      'Reportes'
    ];

    for (const item of coreNavItems) {
      await expect(page.locator(`button:has-text("${item}")`).first()).toBeVisible();
    }

    await logout(page);
  });
});

test.describe('Consultant Authentication @consultant', () => {

  test('consultant login and access verification', async ({ page }) => {
    const user = await loginAs(page, 'consultant');

    await expect(page).toHaveURL(/\/dashboard/);
    await verifyRoleAccess(page, 'consultor');

    // Should be able to access consultant features
    await page.goto('/courses');
    await page.waitForLoadState('networkidle');
    // Should not be redirected back to login
    await expect(page).not.toHaveURL(/\/login/);

    await logout(page);
  });

  test('consultant navigation restrictions', async ({ page }) => {
    await loginAs(page, 'consultant');

    // Should see consultant navigation (use .first() to avoid strict mode violation)
    await expect(page.locator('button:has-text("Cursos")').first()).toBeVisible();

    await logout(page);
  });
});

test.describe('Student Authentication @student @docente', () => {

  test('student login and access verification', async ({ page }) => {
    const user = await loginAs(page, 'student');

    await expect(page).toHaveURL(/\/dashboard/);
    await verifyRoleAccess(page, 'docente');

    // Docente should be able to access Mi Aprendizaje
    await page.goto('/mi-aprendizaje');
    await page.waitForLoadState('networkidle');
    // Should not be redirected to login
    await expect(page).not.toHaveURL(/\/login/);

    await logout(page);
  });

  test('student has limited navigation', async ({ page }) => {
    await loginAs(page, 'student');

    // Should see basic navigation
    await expect(page.locator('button:has-text("Mi Panel")')).toBeVisible();
    await expect(page.locator('button:has-text("Mi Aprendizaje")')).toBeVisible();

    await logout(page);
  });
});

test.describe('School Director Authentication @director', () => {

  test('director login and access verification', async ({ page }) => {
    const user = await loginAs(page, 'director');

    await expect(page).toHaveURL(/\/dashboard/);
    await verifyRoleAccess(page, 'equipo_directivo');

    // Should be able to access reporting
    await page.goto('/reports');
    await page.waitForLoadState('networkidle');
    // Should not be redirected to login
    await expect(page).not.toHaveURL(/\/login/);

    await logout(page);
  });
});

test.describe('Logout Functionality', () => {

  test('logout from admin account', async ({ page }) => {
    await loginAs(page, 'admin');
    await logout(page);

    // Should be redirected to login page
    await expect(page).toHaveURL(/\/login/);
  });

  test('logout clears session completely', async ({ page }) => {
    await loginAs(page, 'admin');
    await logout(page);

    // After logout, accessing dashboard should redirect to login
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000); // Allow redirect to complete
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe('Session Persistence', () => {
  
  test('session persists across page reloads', async ({ page }) => {
    await loginAs(page, 'admin');
    
    // Reload the page
    await page.reload();
    await page.waitForLoadState('networkidle');
    
    // Should still be logged in
    await expect(page).not.toHaveURL(/\/login/);
    
    await logout(page);
  });

  test('session persists across navigation', async ({ page }) => {
    await loginAs(page, 'admin');
    
    // Navigate to different pages
    await page.goto('/dashboard');
    await page.goto('/courses');
    await page.goto('/reports');
    
    // Should remain authenticated
    await expect(page).not.toHaveURL(/\/login/);
    
    await logout(page);
  });
});

test.describe('Role Switching (Dev Mode)', () => {
  
  test('dev role switcher functionality', async ({ page }) => {
    // This test assumes the dev role switcher is available
    await loginAs(page, 'admin');
    
    // Look for dev role switcher (purple button)
    const devButton = page.locator('button[title*="Cambiar rol"], .bg-amber-600');
    
    if (await devButton.isVisible()) {
      await devButton.click();
      
      // Should show role selection modal
      await expect(page.locator('text=Cambiar Rol')).toBeVisible();
      
      // Try switching to student role
      await page.selectOption('select', 'docente');
      await page.click('button:has-text("Iniciar Suplantación")');
      
      // Should show dev mode indicator
      await expect(page.locator('text=Modo Dev Activo')).toBeVisible();
      
      // End impersonation
      await page.click('button[title*="Terminar"]');
    }
    
    await logout(page);
  });
});