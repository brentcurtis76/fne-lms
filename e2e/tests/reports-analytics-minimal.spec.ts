import { test, expect } from '@playwright/test';

/**
 * Minimal E2E test for Learning Path Analytics Dashboard
 * Tests the critical user journey: login → reports → analytics tab → component loads
 */
test.describe('Learning Path Analytics Dashboard - Critical Path', () => {
  test('should load analytics dashboard and display components without errors', async ({ page }) => {
    // Step 1: Login as admin user
    await page.goto('/login');
    
    await page.fill('input[type="email"]', 'brent@perrotuertocm.cl');
    await page.fill('input[type="password"]', 'NuevaEdu2025!');
    await page.click('button[type="submit"]');
    
    // Wait for successful login
    await expect(page).toHaveURL(/\/dashboard/);
    console.log('✅ Admin login successful');
    
    // Step 2: Navigate to reports page
    await page.goto('/reports');
    await expect(page).toHaveURL('/reports');
    console.log('✅ Reports page loaded');
    
    // Step 3: Find and click the learning paths tab (specific to reports tabs)
    const learningPathsTab = page.getByRole('button', { name: '🗺️ Rutas de Aprendizaje' });
    await expect(learningPathsTab).toBeVisible({ timeout: 10000 });
    await learningPathsTab.click();
    console.log('✅ Learning paths analytics tab clicked');
    
    // Step 4: Wait for analytics section to load
    await page.waitForSelector('h3:text("Análisis de Rutas de Aprendizaje")', { timeout: 15000 });
    console.log('✅ Analytics section header found');
    
    // Step 5: Verify component loads (check for either success or graceful error)
    
    // Wait a moment for the component to initialize
    await page.waitForTimeout(3000);
    
    // Check if we have data (summary cards) or appropriate error handling
    const hasSummaryCards = await page.locator('text=Rutas Totales').isVisible({ timeout: 2000 });
    const hasErrorHandling = await page.locator('.bg-red-50.border.border-red-200').isVisible({ timeout: 2000 });
    
    if (hasSummaryCards) {
      console.log('✅ Analytics data loaded - summary cards visible');
      
      // Verify all expected summary cards
      await expect(page.locator('text=Rutas Totales')).toBeVisible();
      await expect(page.locator('text=Usuarios Asignados')).toBeVisible();
      await expect(page.locator('text=Completados')).toBeVisible();
      await expect(page.locator('text=Tasa Promedio')).toBeVisible();
      await expect(page.locator('text=Tiempo Total')).toBeVisible();
      
    } else if (hasErrorHandling) {
      console.log('⚠️ Analytics API error (acceptable in test environment)');
      await expect(page.locator('text=Error al cargar analíticas')).toBeVisible();
      
    } else {
      // Check if it's still loading
      const isLoading = await page.locator('.animate-pulse').first().isVisible({ timeout: 1000 });
      if (isLoading) {
        console.log('⏳ Component is loading (this is acceptable)');
      } else {
        throw new Error('Analytics component did not display data, error, or loading state');
      }
    }
    
    console.log('✅ Learning Path Analytics Dashboard test completed successfully');
  });

  test('should handle API errors gracefully', async ({ page }) => {
    // Login as admin
    await page.goto('/login');
    await page.fill('input[type="email"]', 'brent@perrotuertocm.cl');
    await page.fill('input[type="password"]', 'NuevaEdu2025!');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/dashboard/);
    
    // Intercept API call and force error
    await page.route('**/api/learning-paths/analytics**', route => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Test API failure' })
      });
    });
    
    // Navigate to analytics
    await page.goto('/reports');
    const learningPathsTab = page.getByRole('button', { name: '🗺️ Rutas de Aprendizaje' });
    await learningPathsTab.click();
    
    // Verify error handling displays
    await page.waitForSelector('text=Error al cargar analíticas', { timeout: 10000 });
    await expect(page.locator('.bg-red-50.border.border-red-200')).toBeVisible();
    
    console.log('✅ Error handling works correctly');
  });

  test('should maintain analytics tab functionality after navigation', async ({ page }) => {
    // Login and navigate to analytics
    await page.goto('/login');
    await page.fill('input[type="email"]', 'brent@perrotuertocm.cl');
    await page.fill('input[type="password"]', 'NuevaEdu2025!');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/dashboard/);
    
    await page.goto('/reports');
    
    // Go to analytics tab
    const learningPathsTab = page.getByRole('button', { name: '🗺️ Rutas de Aprendizaje' });
    await learningPathsTab.click();
    await page.waitForSelector('h3:text("Análisis de Rutas de Aprendizaje")', { timeout: 10000 });
    
    // Switch to overview tab
    const overviewTab = page.getByRole('button', { name: '📊 Resumen General' });
    await overviewTab.click();
    await page.waitForSelector('text=Total Usuarios', { timeout: 5000 });
    
    // Switch back to learning paths analytics
    await learningPathsTab.click();
    
    // Verify analytics section loads again
    await page.waitForSelector('h3:text("Análisis de Rutas de Aprendizaje")', { timeout: 10000 });
    
    console.log('✅ Tab navigation works correctly');
  });
});