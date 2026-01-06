/**
 * End-to-End Tests for Supervisor de Red Feature
 * 
 * This test suite validates the complete user workflows for network
 * and supervisor management from both admin and supervisor perspectives.
 */

import { test, expect } from '@playwright/test';
import { loginAsQA as loginAs, logout, TEST_QA_USERS as TEST_USERS } from '../utils/auth-helpers';
import {
  navigateToNetworkManagement,
  createNetwork,
  assignSchoolsToNetwork,
  assignSupervisorToNetwork,
  verifySupervisorAccess,
  verifyAdminPagesDenied,
  verifySupervisorDataScope,
  deleteNetwork,
  createTestSupervisor
} from '../utils/supervisor-helpers';

// Test data
const TEST_NETWORK = {
  name: `Red E2E Test ${Date.now()}`,
  description: 'Network created by E2E test suite for supervisor feature validation'
};

const TEST_SCHOOLS = ['Los Pellines', 'San Rafael'];

test.describe('Supervisor de Red Feature', () => {
  test.describe.configure({ mode: 'serial' }); // Run tests in order

  let supervisorUser: any;

  test.beforeEach(async ({ page }) => {
    // Ensure we start from a clean state
    await page.goto('/');
  });

  test.describe('Test Flow 1: Full Admin Workflow', () => {
    test('Admin can create and manage networks', async ({ page }) => {
      // Step 1: Login as admin
      await loginAs(page, 'admin');
      
      // Verify admin dashboard access
      await expect(page.locator('h1:has-text("Panel de Control"), h1:has-text("Dashboard")')).toBeVisible();

      // Step 2: Navigate to network management
      await navigateToNetworkManagement(page);

      // Step 3: Create new network
      const networkName = await createNetwork(page, TEST_NETWORK);
      
      // Verify network appears in list
      const networkCard = page.locator('.bg-white, .shadow-sm').filter({ hasText: networkName });
      await expect(networkCard).toBeVisible();
      await expect(networkCard.locator('text=0 escuelas asignadas')).toBeVisible();
      await expect(networkCard.locator('text=0 supervisores')).toBeVisible();

      // Step 4: Assign schools to network
      await assignSchoolsToNetwork(page, networkName, TEST_SCHOOLS);
      
      // Verify school count updated
      await expect(networkCard.locator(`text=${TEST_SCHOOLS.length} escuelas asignadas`)).toBeVisible();

      // Step 5: Create test supervisor user
      supervisorUser = await createTestSupervisor(page);

      // Step 6: Assign supervisor to network
      await assignSupervisorToNetwork(page, supervisorUser.email, networkName);

      // Step 7: Verify supervisor count updated
      await navigateToNetworkManagement(page);
      await expect(networkCard.locator('text=1 supervisor')).toBeVisible();

      // Logout
      await logout(page);
    });

    test('Admin can view network details and statistics', async ({ page }) => {
      await loginAs(page, 'admin');
      await navigateToNetworkManagement(page);

      // Find our test network
      const networkCard = page.locator('.bg-white, .shadow-sm').filter({ hasText: TEST_NETWORK.name });
      await expect(networkCard).toBeVisible();

      // Verify network statistics
      await expect(networkCard.locator(`text=${TEST_SCHOOLS.length} escuelas asignadas`)).toBeVisible();
      await expect(networkCard.locator('text=1 supervisor')).toBeVisible();

      // Verify assigned schools are listed
      for (const school of TEST_SCHOOLS) {
        await expect(networkCard.locator(`text="${school}"`)).toBeVisible();
      }

      // Verify supervisor is listed
      await expect(networkCard.locator(`text="${supervisorUser.email}"`)).toBeVisible();

      await logout(page);
    });
  });

  test.describe('Test Flow 2: Supervisor Workflow and Permission Verification', () => {
    test('Supervisor has restricted access and correct data visibility', async ({ page }) => {
      // Skip if supervisor wasn't created
      if (!supervisorUser) {
        test.skip();
        return;
      }

      // Step 1: Login as supervisor
      console.log(`Logging in as supervisor: ${supervisorUser.email}`);
      await page.goto('/login');
      await page.fill('input[type="email"]', supervisorUser.email);
      await page.fill('input[type="password"]', supervisorUser.password);
      await page.click('button[type="submit"]');

      // Handle potential password change requirement
      try {
        await page.waitForSelector('h1:has-text("Cambiar Contraseña")', { timeout: 3000 });
        await page.fill('input[placeholder*="nueva contraseña"]', 'NewPassword123!');
        await page.fill('input[placeholder*="confirmar"]', 'NewPassword123!');
        await page.click('button:has-text("Cambiar Contraseña")');
      } catch {
        // No password change required
      }

      // Wait for dashboard
      await page.waitForLoadState('networkidle');

      // Step 2: Verify UI restrictions
      await verifySupervisorAccess(page);

      // Step 3: Verify access denial to admin pages
      await verifyAdminPagesDenied(page);

      // Step 4: Verify report data scope
      await verifySupervisorDataScope(page, TEST_SCHOOLS.length);

      // Step 5: Navigate to reports and verify data
      await page.goto('/reports');
      await page.waitForLoadState('networkidle');

      // Verify data scope indicator
      const scopeIndicator = page.locator('.bg-blue-50, .text-blue-700').filter({ 
        hasText: /Datos de tu red|Network data only/i 
      });
      await expect(scopeIndicator).toBeVisible();

      // Verify can only see assigned schools
      const visibleSchools = await page.locator('[data-testid="school-name"], .school-name').allTextContents();
      for (const schoolName of visibleSchools) {
        expect(TEST_SCHOOLS.some(s => schoolName.includes(s))).toBeTruthy();
      }

      await logout(page);
    });

    test('Supervisor cannot modify network configuration', async ({ page }) => {
      // Skip if supervisor wasn't created
      if (!supervisorUser) {
        test.skip();
        return;
      }

      // Login as supervisor
      await page.goto('/login');
      await page.fill('input[type="email"]', supervisorUser.email);
      await page.fill('input[type="password"]', supervisorUser.password || 'NewPassword123!');
      await page.click('button[type="submit"]');
      await page.waitForLoadState('networkidle');

      // Try to access network management directly
      await page.goto('/admin/network-management', { waitUntil: 'networkidle' });

      // Should be redirected or see access denied
      const currentUrl = page.url();
      const hasAccessDenied = await page.locator('text=Acceso Denegado, text=Access Denied').isVisible().catch(() => false);
      
      expect(
        currentUrl.includes('/dashboard') || 
        currentUrl.includes('/login') ||
        hasAccessDenied
      ).toBeTruthy();

      // Verify cannot see network management in navigation
      const sidebar = page.locator('nav, [data-testid="sidebar"]');
      await expect(sidebar.locator('text=Gestión de Redes')).not.toBeVisible();
    });
  });

  test.describe('Cleanup', () => {
    test('Remove test data', async ({ page }) => {
      // Login as admin
      await loginAs(page, 'admin');

      // Delete the test network
      try {
        await deleteNetwork(page, TEST_NETWORK.name);
      } catch (error) {
        console.log('Network already deleted or not found');
      }

      // Note: In a real scenario, you'd also delete the test supervisor user
      // But this requires additional API calls or database access
    });
  });
});

// Additional isolated tests for edge cases
test.describe('Supervisor de Red - Edge Cases', () => {
  test('Cannot create network with duplicate name', async ({ page }) => {
    await loginAs(page, 'admin');
    await navigateToNetworkManagement(page);

    // Create first network
    const duplicateName = `Duplicate Test ${Date.now()}`;
    await createNetwork(page, { name: duplicateName, description: 'First network' });

    // Try to create duplicate
    await page.click('button:has-text("Nueva Red")');
    await expect(page.locator('h2:has-text("Crear Nueva Red")')).toBeVisible();
    await page.fill('input[name="name"], input[placeholder*="nombre"]', duplicateName);
    await page.fill('textarea[name="description"], textarea[placeholder*="descripción"]', 'Duplicate network');
    await page.click('button:has-text("Crear Red")');

    // Should see error
    await expect(page.locator('text=Ya existe una red con ese nombre')).toBeVisible();

    // Cleanup
    await page.click('button:has-text("Cancelar"), button:has-text("Cancel")');
    await deleteNetwork(page, duplicateName);
  });

  test('Cannot delete network with active supervisors', async ({ page }) => {
    await loginAs(page, 'admin');
    await navigateToNetworkManagement(page);

    // Create network
    const networkName = `Delete Test ${Date.now()}`;
    await createNetwork(page, { name: networkName, description: 'Network to test deletion' });

    // Create and assign supervisor
    const supervisor = await createTestSupervisor(page);
    await assignSupervisorToNetwork(page, supervisor.email, networkName);

    // Try to delete network
    await navigateToNetworkManagement(page);
    const networkCard = page.locator('.bg-white, .shadow-sm').filter({ hasText: networkName });
    await networkCard.locator('button:has-text("Eliminar"), button[aria-label="Delete"]').click();
    await page.click('button:has-text("Confirmar"), button:has-text("Delete")');

    // Should see error
    await expect(page.locator('text=No se puede eliminar la red porque tiene supervisores activos')).toBeVisible();

    // Network should still exist
    await expect(networkCard).toBeVisible();
  });

  test('Supervisor role is automatically removed when network is deleted', async ({ page }) => {
    // This test would require database access to verify
    // In a real implementation, you'd check that user_roles.red_id is set to NULL
    test.skip();
  });
});