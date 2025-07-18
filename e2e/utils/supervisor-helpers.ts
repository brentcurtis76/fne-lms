/**
 * Supervisor de Red E2E test helpers
 * Provides utilities for network and supervisor management testing
 */

import { Page, expect } from '@playwright/test';
import { TestUser } from './auth-helpers';

export interface NetworkData {
  name: string;
  description: string;
  id?: string;
}

export interface SchoolData {
  id: number;
  name: string;
}

/**
 * Navigate to network management page
 */
export async function navigateToNetworkManagement(page: Page) {
  console.log('📍 Navigating to network management...');
  
  // Try direct navigation first
  await page.goto('/admin/network-management');
  
  // If redirected, try via sidebar
  if (!page.url().includes('/admin/network-management')) {
    await page.click('text=Gestión de Redes');
    await page.waitForURL('**/admin/network-management');
  }
  
  // Wait for page to load
  await page.waitForLoadState('networkidle');
  await expect(page.locator('h1:has-text("Gestión de Redes de Colegios")')).toBeVisible();
}

/**
 * Create a new network
 */
export async function createNetwork(page: Page, networkData: NetworkData): Promise<string> {
  console.log(`🌐 Creating network: ${networkData.name}`);
  
  // Click "Nueva Red" button
  await page.click('button:has-text("Nueva Red")');
  
  // Wait for modal
  await expect(page.locator('h2:has-text("Crear Nueva Red")')).toBeVisible();
  
  // Fill form
  await page.fill('input[name="name"], input[placeholder*="nombre"]', networkData.name);
  await page.fill('textarea[name="description"], textarea[placeholder*="descripción"]', networkData.description);
  
  // Submit
  await page.click('button:has-text("Crear Red")');
  
  // Wait for success notification
  await expect(page.locator('text=Red creada exitosamente')).toBeVisible({ timeout: 10000 });
  
  // Wait for modal to close
  await expect(page.locator('h2:has-text("Crear Nueva Red")')).not.toBeVisible();
  
  // Get the network ID from the list
  const networkElement = page.locator(`text="${networkData.name}"`).first();
  await expect(networkElement).toBeVisible();
  
  console.log(`✅ Network created: ${networkData.name}`);
  return networkData.name;
}

/**
 * Assign schools to a network
 */
export async function assignSchoolsToNetwork(page: Page, networkName: string, schoolNames: string[]) {
  console.log(`🏫 Assigning ${schoolNames.length} schools to network: ${networkName}`);
  
  // Find the network in the list
  const networkCard = page.locator('.bg-white, .shadow-sm').filter({ hasText: networkName });
  
  // Click manage schools button
  await networkCard.locator('button:has-text("Gestionar Escuelas")').click();
  
  // Wait for modal
  await expect(page.locator('h3:has-text("Gestionar Escuelas")')).toBeVisible();
  
  // Select schools
  for (const schoolName of schoolNames) {
    // Find and check the school checkbox
    const schoolCheckbox = page.locator(`label:has-text("${schoolName}") input[type="checkbox"]`);
    if (!(await schoolCheckbox.isChecked())) {
      await schoolCheckbox.check();
    }
  }
  
  // Save
  await page.click('button:has-text("Guardar Cambios")');
  
  // Wait for success
  await expect(page.locator('text=Escuelas actualizadas exitosamente')).toBeVisible();
  
  // Verify schools appear in the network card
  for (const schoolName of schoolNames) {
    await expect(networkCard.locator(`text="${schoolName}"`)).toBeVisible();
  }
  
  console.log(`✅ Assigned ${schoolNames.length} schools to network`);
}

/**
 * Assign a supervisor to a network
 */
export async function assignSupervisorToNetwork(page: Page, userEmail: string, networkName: string) {
  console.log(`👤 Assigning supervisor ${userEmail} to network ${networkName}`);
  
  // Navigate to user management
  await page.goto('/admin/users');
  await page.waitForLoadState('networkidle');
  
  // Search for user
  await page.fill('input[placeholder*="Buscar"], input[placeholder*="Search"]', userEmail);
  await page.waitForTimeout(500); // Debounce
  
  // Find user row and click to expand
  const userRow = page.locator('tr, div.user-row').filter({ hasText: userEmail });
  await userRow.click();
  
  // Wait for expanded content
  await page.waitForTimeout(500);
  
  // Click role assignment button
  await page.click('button:has-text("Asignar Rol"), button:has-text("Manage Roles")');
  
  // Wait for role modal
  await expect(page.locator('h3:has-text("Asignar Roles"), h3:has-text("Assign Roles")')).toBeVisible();
  
  // Select supervisor_de_red role
  await page.click('label:has-text("Supervisor de Red") input[type="checkbox"]');
  
  // Select network from dropdown
  const networkSelect = page.locator('select[name="network"], select#network-select');
  await networkSelect.selectOption({ label: networkName });
  
  // Save
  await page.click('button:has-text("Guardar"), button:has-text("Save")');
  
  // Wait for success
  await expect(page.locator('text=Rol asignado exitosamente')).toBeVisible();
  
  console.log(`✅ Assigned supervisor role to ${userEmail}`);
}

/**
 * Verify supervisor has correct access
 */
export async function verifySupervisorAccess(page: Page) {
  console.log('🔍 Verifying supervisor access restrictions...');
  
  // Check sidebar - should NOT have admin items
  const sidebar = page.locator('nav, [data-testid="sidebar"]');
  
  // Should have these items
  await expect(sidebar.locator('text=Mi Panel, text=Dashboard')).toBeVisible();
  await expect(sidebar.locator('text=Mi Perfil, text=Profile')).toBeVisible();
  await expect(sidebar.locator('text=Reportes, text=Reports')).toBeVisible();
  
  // Should NOT have these admin items
  await expect(sidebar.locator('text=Usuarios, text=Users')).not.toBeVisible();
  await expect(sidebar.locator('text=Gestión de Redes')).not.toBeVisible();
  await expect(sidebar.locator('text=Configuración, text=Settings')).not.toBeVisible();
  
  console.log('✅ Sidebar access verified');
}

/**
 * Verify supervisor is denied access to admin pages
 */
export async function verifyAdminPagesDenied(page: Page) {
  console.log('🚫 Verifying admin pages are blocked...');
  
  const adminPages = [
    '/admin/network-management',
    '/admin/users',
    '/admin/settings'
  ];
  
  for (const adminPage of adminPages) {
    console.log(`Testing access to ${adminPage}...`);
    await page.goto(adminPage);
    
    // Should either redirect or show access denied
    expect(
      page.url().includes('/dashboard') || 
      page.url().includes('/login') ||
      await page.locator('text=Acceso Denegado, text=Access Denied').isVisible()
    ).toBeTruthy();
  }
  
  console.log('✅ Admin pages properly blocked');
}

/**
 * Verify supervisor only sees data from their network
 */
export async function verifySupervisorDataScope(page: Page, expectedSchoolCount: number) {
  console.log('📊 Verifying data scope restrictions...');
  
  // Navigate to reports
  await page.goto('/reports');
  await page.waitForLoadState('networkidle');
  
  // Check data scope indicator
  const scopeIndicator = page.locator('text=Datos de tu red, text=Network data only');
  await expect(scopeIndicator).toBeVisible();
  
  // Verify limited data visibility
  // The exact checks depend on your reporting UI, but generally:
  const schoolsVisible = await page.locator('[data-testid="school-card"], .school-item').count();
  expect(schoolsVisible).toBeLessThanOrEqual(expectedSchoolCount);
  
  console.log(`✅ Data scope verified - seeing data from ${schoolsVisible} schools`);
}

/**
 * Delete a network (cleanup)
 */
export async function deleteNetwork(page: Page, networkName: string) {
  console.log(`🗑️ Deleting network: ${networkName}`);
  
  await navigateToNetworkManagement(page);
  
  // Find network
  const networkCard = page.locator('.bg-white, .shadow-sm').filter({ hasText: networkName });
  
  // Click delete button
  await networkCard.locator('button:has-text("Eliminar"), button[aria-label="Delete"]').click();
  
  // Confirm deletion
  await page.click('button:has-text("Confirmar"), button:has-text("Delete")');
  
  // Wait for success
  await expect(page.locator('text=Red eliminada exitosamente')).toBeVisible();
  
  // Verify network is gone
  await expect(networkCard).not.toBeVisible();
  
  console.log(`✅ Network deleted: ${networkName}`);
}

/**
 * Create test supervisor user
 */
export async function createTestSupervisor(page: Page): Promise<TestUser> {
  const timestamp = Date.now();
  const supervisorUser: TestUser = {
    email: `supervisor-e2e-${timestamp}@test.com`,
    password: 'Test123456!',
    role: 'supervisor_de_red',
    name: `Test Supervisor ${timestamp}`
  };
  
  console.log(`👤 Creating test supervisor: ${supervisorUser.email}`);
  
  // Navigate to user management
  await page.goto('/admin/users');
  
  // Click create user
  await page.click('button:has-text("Nuevo Usuario"), button:has-text("New User")');
  
  // Fill form
  await page.fill('input[name="email"]', supervisorUser.email);
  await page.fill('input[name="firstName"]', supervisorUser.name.split(' ')[0]);
  await page.fill('input[name="lastName"]', supervisorUser.name.split(' ').slice(1).join(' '));
  await page.fill('input[name="password"]', supervisorUser.password);
  
  // Submit
  await page.click('button:has-text("Crear Usuario"), button:has-text("Create User")');
  
  // Wait for success
  await expect(page.locator('text=Usuario creado exitosamente')).toBeVisible();
  
  console.log(`✅ Test supervisor created: ${supervisorUser.email}`);
  return supervisorUser;
}