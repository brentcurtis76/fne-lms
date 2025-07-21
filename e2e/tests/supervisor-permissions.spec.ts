/**
 * Permission-focused E2E tests for Supervisor de Red
 * Validates security boundaries and access control
 */

import { test, expect } from '@playwright/test';
import { createSupervisorTestData, cleanupSupervisorTestData, SupervisorTestData } from '../utils/supervisor-test-data';

test.describe('Supervisor de Red - Security & Permissions', () => {
  let supervisorData: SupervisorTestData;

  test.beforeAll(async () => {
    // Create supervisor test data directly in database using admin privileges
    supervisorData = await createSupervisorTestData();
    console.log(`📋 Test supervisor created: ${supervisorData.email}`);
  });

  test.afterAll(async () => {
    // Clean up test data
    if (supervisorData) {
      await cleanupSupervisorTestData(supervisorData);
    }
  });

  test('Supervisor cannot access admin endpoints via API', async ({ page }) => {
    // Login as supervisor with proper wait for authentication
    await page.goto('/login');
    await page.fill('input[type="email"]', supervisorData.email);
    await page.fill('input[type="password"]', supervisorData.password);
    await page.click('button[type="submit"]');
    
    // Wait for successful login by checking for dashboard elements
    await expect(page.locator('text=Mi Panel')).toBeVisible({ timeout: 10000 });
    await page.waitForLoadState('networkidle');
    
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
      
      // Should get 403 Forbidden or 401 Unauthorized
      expect([403, 401]).toContain(response.status());
    }
  });

  test('Supervisor sidebar reflects correct permissions', async ({ page }) => {
    // Login as supervisor
    await page.goto('/login');
    await page.fill('input[type="email"]', supervisorData.email);
    await page.fill('input[type="password"]', supervisorData.password);
    await page.click('button[type="submit"]');
    
    // Wait for dashboard to load fully - using the main heading
    await expect(page.locator('main').locator('h1').first()).toBeVisible({ timeout: 10000 });
    await page.waitForLoadState('networkidle');
    
    // Check visible sidebar items - using exact button text from UI
    const visibleItems = [
      'Mi Panel',
      'Mi Perfil',
      'Mis Rutas',
      'Reportes',
      'Espacio Colaborativo',
      'Rutas de Aprendizaje'  // Supervisors CAN manage learning paths
    ];
    
    for (const item of visibleItems) {
      const button = page.locator(`button:has-text("${item}")`);
      await expect(button).toBeVisible({ timeout: 5000 });
    }
    
    // Check hidden admin items - these should NOT be visible
    const hiddenItems = [
      'Usuarios',
      'Redes de Colegios',
      'Cursos',
      'Escuelas',
      'Consultorías',
      'Gestión',
      'Configuración'
    ];
    
    for (const item of hiddenItems) {
      const button = page.locator(`button:has-text("${item}")`);
      await expect(button).not.toBeVisible();
    }
  });

  test('Direct URL access enforcement', async ({ page }) => {
    // Login as supervisor
    await page.goto('/login');
    await page.fill('input[type="email"]', supervisorData.email);
    await page.fill('input[type="password"]', supervisorData.password);
    await page.click('button[type="submit"]');
    
    // Wait for successful login
    await expect(page.locator('main').locator('h1').first()).toBeVisible({ timeout: 10000 });
    await page.waitForLoadState('networkidle');
    
    // Test blocked pages - supervisor should be redirected
    const blockedUrls = [
      '/admin/users',
      '/admin/network-management',
      '/admin/settings',
      '/admin/course-builder'
    ];
    
    for (const blockedUrl of blockedUrls) {
      await page.goto(blockedUrl);
      await page.waitForLoadState('networkidle');
      
      // Should be redirected away from admin pages
      const currentUrl = page.url();
      expect(currentUrl).not.toContain(blockedUrl);
      
      // Should either be on dashboard or see access denied
      const isOnDashboard = currentUrl.includes('/dashboard');
      const hasAccessDenied = await page.locator('text=/Acceso Denegado|Access Denied|No autorizado/i').isVisible().catch(() => false);
      
      expect(isOnDashboard || hasAccessDenied).toBeTruthy();
    }
    
    // Test allowed pages - supervisor should access these
    const allowedUrls = [
      '/dashboard',
      '/profile',
      '/reports'
    ];
    
    for (const allowedUrl of allowedUrls) {
      await page.goto(allowedUrl);
      await page.waitForLoadState('networkidle');
      
      // Should stay on the requested page
      expect(page.url()).toContain(allowedUrl);
    }
  });

  test('Data isolation in reports', async ({ page }) => {
    // Login as supervisor
    await page.goto('/login');
    await page.fill('input[type="email"]', supervisorData.email);
    await page.fill('input[type="password"]', supervisorData.password);
    await page.click('button[type="submit"]');
    
    // Wait for dashboard
    await expect(page.locator('main').locator('h1').first()).toBeVisible({ timeout: 10000 });
    
    // Navigate to reports
    await page.goto('/reports');
    await page.waitForLoadState('networkidle');
    
    // Should see network scope indicator
    await expect(page.locator('text=/Datos de tu red:|Datos de red:|Red:/i')).toBeVisible({ timeout: 10000 });
    
    // Should see the network name
    await expect(page.locator(`text=/${supervisorData.networkName}/`)).toBeVisible();
    
    // Should NOT see "Todos los datos" (admin scope)
    await expect(page.locator('text=/Todos los datos|All data|Datos de toda la plataforma/i')).not.toBeVisible();
  });

  test('Supervisor cannot modify user roles', async ({ page }) => {
    // Login as supervisor
    await page.goto('/login');
    await page.fill('input[type="email"]', supervisorData.email);
    await page.fill('input[type="password"]', supervisorData.password);
    await page.click('button[type="submit"]');
    
    // Wait for dashboard
    await expect(page.locator('main').locator('h1').first()).toBeVisible({ timeout: 10000 });
    
    // Try to directly access user management
    const response = await page.goto('/admin/users', { waitUntil: 'domcontentloaded' });
    
    // Should be blocked - either redirected or get error status
    const currentUrl = page.url();
    const isBlocked = 
      !currentUrl.includes('/admin/users') ||
      response?.status() === 403 ||
      response?.status() === 401;
    
    expect(isBlocked).toBeTruthy();
    
    // If somehow on the page, role modification buttons should not be visible
    if (currentUrl.includes('/admin/users')) {
      await expect(page.locator('button:has-text("Asignar Rol")')).not.toBeVisible();
    }
  });
});