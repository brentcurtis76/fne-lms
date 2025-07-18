/**
 * Permission-focused E2E tests for Supervisor de Red
 * Validates security boundaries and access control
 */

import { test, expect } from '@playwright/test';
import { loginAs, TEST_USERS } from '../utils/auth-helpers';
import { SUPERVISOR_TEST_CONFIG, generateTestData } from './supervisor.config';

test.describe('Supervisor de Red - Security & Permissions', () => {
  const testData = generateTestData();

  test.beforeAll(async ({ browser }) => {
    // Setup: Create a supervisor user via admin
    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    
    await loginAs(adminPage, 'admin');
    
    // Create test network
    await adminPage.goto('/admin/network-management');
    await adminPage.click(SUPERVISOR_TEST_CONFIG.selectors.newNetworkButton);
    await adminPage.fill(SUPERVISOR_TEST_CONFIG.selectors.networkNameInput, testData.networkName);
    await adminPage.fill(SUPERVISOR_TEST_CONFIG.selectors.networkDescriptionInput, 'Test network for permissions');
    await adminPage.click('button:has-text("Crear Red")');
    await adminPage.waitForSelector('text=Red creada exitosamente');
    
    // Create supervisor user
    await adminPage.goto('/admin/users');
    await adminPage.click('button:has-text("Nuevo Usuario")');
    await adminPage.fill('input[name="email"]', testData.supervisorEmail);
    await adminPage.fill('input[name="firstName"]', 'Test');
    await adminPage.fill('input[name="lastName"]', 'Supervisor');
    await adminPage.fill('input[name="password"]', SUPERVISOR_TEST_CONFIG.testUsers.supervisorTemplate.defaultPassword);
    await adminPage.click('button:has-text("Crear Usuario")');
    await adminPage.waitForSelector('text=Usuario creado exitosamente');
    
    await adminContext.close();
  });

  test('Supervisor cannot access admin endpoints via API', async ({ page }) => {
    // Login as supervisor
    await page.goto('/login');
    await page.fill('input[type="email"]', testData.supervisorEmail);
    await page.fill('input[type="password"]', SUPERVISOR_TEST_CONFIG.testUsers.supervisorTemplate.defaultPassword);
    await page.click('button[type="submit"]');
    
    // Get auth token from cookies/storage
    const cookies = await page.context().cookies();
    const authCookie = cookies.find(c => c.name.includes('auth') || c.name.includes('token'));
    
    // Try to access admin API endpoints
    const adminEndpoints = [
      '/api/admin/networks',
      '/api/admin/users',
      '/api/admin/settings'
    ];
    
    for (const endpoint of adminEndpoints) {
      const response = await page.request.get(endpoint, {
        headers: authCookie ? { 'Cookie': `${authCookie.name}=${authCookie.value}` } : {}
      });
      
      // Should get 403 Forbidden
      expect([403, 401]).toContain(response.status());
    }
  });

  test('Supervisor sidebar reflects correct permissions', async ({ page }) => {
    // Login as supervisor
    await page.goto('/login');
    await page.fill('input[type="email"]', testData.supervisorEmail);
    await page.fill('input[type="password"]', SUPERVISOR_TEST_CONFIG.testUsers.supervisorTemplate.defaultPassword);
    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle');

    const permissions = SUPERVISOR_TEST_CONFIG.permissions.supervisor_de_red;
    
    // Check visible items
    for (const item of permissions.sidebarItems) {
      await expect(page.locator(`nav >> text=${item}`)).toBeVisible();
    }
    
    // Check hidden items
    for (const item of permissions.hiddenItems) {
      await expect(page.locator(`nav >> text=${item}`)).not.toBeVisible();
    }
  });

  test('Direct URL access enforcement', async ({ page }) => {
    // Login as supervisor
    await page.goto('/login');
    await page.fill('input[type="email"]', testData.supervisorEmail);
    await page.fill('input[type="password"]', SUPERVISOR_TEST_CONFIG.testUsers.supervisorTemplate.defaultPassword);
    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle');

    const permissions = SUPERVISOR_TEST_CONFIG.permissions.supervisor_de_red;
    
    // Test blocked pages
    for (const blockedUrl of permissions.cannotAccess) {
      await page.goto(blockedUrl);
      
      // Should redirect or show error
      const currentUrl = page.url();
      const isBlocked = 
        currentUrl.includes('/dashboard') ||
        currentUrl.includes('/login') ||
        (await page.locator('text=/Acceso Denegado|Access Denied|403/').isVisible().catch(() => false));
      
      expect(isBlocked).toBeTruthy();
    }
    
    // Test allowed pages
    for (const allowedUrl of permissions.canAccess) {
      await page.goto(allowedUrl);
      await expect(page).toHaveURL(new RegExp(allowedUrl));
    }
  });

  test('Data isolation in reports', async ({ page }) => {
    // First, assign the supervisor to the network as admin
    await loginAs(page, 'admin');
    await page.goto('/admin/users');
    await page.fill('input[placeholder*="Buscar"]', testData.supervisorEmail);
    await page.waitForTimeout(500);
    
    const userRow = page.locator('tr, div.user-row').filter({ hasText: testData.supervisorEmail });
    await userRow.click();
    await page.click('button:has-text("Asignar Rol")');
    await page.click('label:has-text("Supervisor de Red") input[type="checkbox"]');
    await page.selectOption('select[name="network"]', { label: testData.networkName });
    await page.click('button:has-text("Guardar")');
    await page.waitForSelector('text=Rol asignado exitosamente');
    
    // Logout and login as supervisor
    await page.goto('/logout');
    await page.goto('/login');
    await page.fill('input[type="email"]', testData.supervisorEmail);
    await page.fill('input[type="password"]', SUPERVISOR_TEST_CONFIG.testUsers.supervisorTemplate.defaultPassword);
    await page.click('button[type="submit"]');
    
    // Navigate to reports
    await page.goto('/reports');
    await page.waitForLoadState('networkidle');
    
    // Should see network scope indicator
    await expect(page.locator('text=/Datos de tu red|Network data|Red:/i')).toBeVisible();
    
    // Should NOT see "Todos los datos" or "All data" (admin scope)
    await expect(page.locator('text=/Todos los datos|All data/i')).not.toBeVisible();
  });

  test('Supervisor cannot modify user roles', async ({ page }) => {
    // Login as supervisor
    await page.goto('/login');
    await page.fill('input[type="email"]', testData.supervisorEmail);
    await page.fill('input[type="password"]', SUPERVISOR_TEST_CONFIG.testUsers.supervisorTemplate.defaultPassword);
    await page.click('button[type="submit"]');
    
    // Even if they somehow reach user management
    const response = await page.goto('/admin/users', { waitUntil: 'domcontentloaded' });
    
    // Should be blocked
    expect(
      page.url().includes('/dashboard') ||
      page.url().includes('/login') ||
      response?.status() === 403
    ).toBeTruthy();
  });

  test.afterAll(async ({ browser }) => {
    // Cleanup: Remove test data
    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    
    await loginAs(adminPage, 'admin');
    
    // Delete test network
    await adminPage.goto('/admin/network-management');
    const networkCard = adminPage.locator(SUPERVISOR_TEST_CONFIG.selectors.networkCard).filter({ 
      hasText: testData.networkName 
    });
    
    if (await networkCard.isVisible()) {
      await networkCard.locator(SUPERVISOR_TEST_CONFIG.selectors.deleteButton).click();
      await adminPage.click('button:has-text("Confirmar")');
    }
    
    await adminContext.close();
  });
});