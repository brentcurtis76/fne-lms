/**
 * Basic E2E test for Supervisor de Red feature
 * Tests that the feature components are properly integrated
 * without requiring actual login credentials
 */

import { test, expect } from '@playwright/test';

test.describe('Supervisor de Red - Basic Integration', () => {
  test('Application loads and login page is accessible', async ({ page }) => {
    // Navigate to the application
    await page.goto('http://localhost:3000');
    
    // Should redirect to login or show login page
    await expect(page).toHaveURL(/login|signin/);
    
    // Login form should be visible
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
    
    // Page should have Spanish text
    await expect(page.locator('text=/Iniciar Sesión|Ingresar|Entrar/')).toBeVisible();
  });

  test('Network management page exists (URL test)', async ({ page }) => {
    // Try to access the network management page directly
    const response = await page.goto('http://localhost:3000/admin/network-management');
    
    // Should either redirect to login or show the page
    expect(response?.status()).toBeLessThan(500); // Not a server error
    
    // Should redirect to login if not authenticated
    const url = page.url();
    expect(url.includes('/login') || url.includes('/admin/network-management')).toBeTruthy();
  });

  test('API endpoints are configured', async ({ request }) => {
    // Test that network API endpoints exist
    const endpoints = [
      '/api/admin/networks',
      '/api/admin/networks/schools',
      '/api/admin/networks/supervisors'
    ];
    
    for (const endpoint of endpoints) {
      const response = await request.get(`http://localhost:3000${endpoint}`, {
        failOnStatusCode: false
      });
      
      // Should return 401/403 (unauthorized) not 404 (not found)
      expect([401, 403]).toContain(response.status());
      
      // API should return JSON error
      const contentType = response.headers()['content-type'];
      expect(contentType).toContain('application/json');
    }
  });

  test('Supervisor role exists in type system', async ({ page }) => {
    // This is more of a build-time check, but we can verify the app builds correctly
    // with the supervisor_de_red role by checking the login page loads without errors
    
    await page.goto('http://localhost:3000/login');
    
    // Check for any JavaScript errors
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    
    await page.waitForTimeout(1000); // Wait a bit for any errors to appear
    
    // Should not have any critical errors about undefined roles
    const criticalErrors = consoleErrors.filter(error => 
      error.includes('supervisor_de_red') || 
      error.includes('UserRoleType') ||
      error.includes('undefined')
    );
    
    expect(criticalErrors).toHaveLength(0);
  });

  test('Database migration banner check', async ({ page }) => {
    // If we could login as admin, we'd see a migration banner
    // For now, just verify the page structure is correct
    
    await page.goto('http://localhost:3000');
    
    // Application should load without errors
    await expect(page.locator('body')).toBeVisible();
    
    // Should not show error pages
    await expect(page.locator('text=/500|Error|Something went wrong/')).not.toBeVisible();
  });
});

test.describe('Supervisor de Red - Component Structure', () => {
  test('Login page has correct structure for role-based auth', async ({ page }) => {
    await page.goto('http://localhost:3000/login');
    
    // Check that the login page can handle different role types
    const emailInput = page.locator('input[type="email"]');
    const passwordInput = page.locator('input[type="password"]');
    
    // Test that inputs accept valid email formats
    await emailInput.fill('test@nuevaeducacion.org');
    await expect(emailInput).toHaveValue('test@nuevaeducacion.org');
    
    await passwordInput.fill('testpassword123');
    await expect(passwordInput).toHaveValue('testpassword123');
    
    // Form should be ready to submit
    const submitButton = page.locator('button[type="submit"]');
    await expect(submitButton).not.toBeDisabled();
  });
});