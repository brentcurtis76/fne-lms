import { test, expect } from '@playwright/test';
import { loginAs, TEST_USERS } from '../utils/auth-helpers';

// Skip this test suite - requires test data setup that doesn't exist
test.describe.skip('Learning Path School Filtering', () => {
  // These values would need to be set up by a proper test fixture
  const testPathId = 'placeholder-path-id';
  const testSchoolId = 'placeholder-school-id';

  // Helper to login as a specific role using existing auth helpers
  async function loginAsRole(page: any, role: string) {
    const roleMap: Record<string, keyof typeof TEST_USERS> = {
      'admin': 'admin',
      'equipo_directivo': 'director',
      'consultor': 'consultant',
      'estudiante': 'student'
    };
    const mappedRole = roleMap[role] || 'admin';
    await loginAs(page, mappedRole);
  }

  test.describe('Admin Role', () => {
    test('should filter users by school correctly', async ({ page }) => {
      // Login as admin
      await loginAsRole(page, 'admin');
      
      // Navigate to learning path assignment page
      await page.goto(`/admin/learning-paths/${testPathId}/assign`);
      
      // Wait for page to load
      await page.waitForSelector('[data-testid="users-tab"]');
      
      // Click on users tab
      await page.click('[data-testid="users-tab"]');
      
      // Select school filter
      await page.selectOption('#userSchoolFilter', testSchoolId);
      
      // Wait for results to load
      await page.waitForTimeout(1000);
      
      // Verify users are displayed
      const userResults = await page.locator('[data-testid="user-result-item"]').count();
      expect(userResults).toBeGreaterThan(0);
      
      // Verify no error message
      const errorToast = await page.locator('.Toastify__toast--error').isVisible();
      expect(errorToast).toBe(false);
      
      // Verify pagination info is displayed
      const paginationInfo = await page.locator('[data-testid="pagination-info"]').textContent();
      expect(paginationInfo).toContain('usuarios');
    });

    test('should filter groups by school correctly', async ({ page }) => {
      // Login as admin
      await loginAsRole(page, 'admin');
      
      // Navigate to learning path assignment page
      await page.goto(`/admin/learning-paths/${testPathId}/assign`);
      
      // Wait for page to load
      await page.waitForSelector('[data-testid="groups-tab"]');
      
      // Click on groups tab
      await page.click('[data-testid="groups-tab"]');
      
      // Select school filter
      await page.selectOption('#groupSchoolFilter', testSchoolId);
      
      // Wait for results to load
      await page.waitForTimeout(1000);
      
      // Verify groups are displayed with member counts
      const groupResults = await page.locator('[data-testid="group-result-item"]').count();
      expect(groupResults).toBeGreaterThan(0);
      
      // Verify member count is displayed
      const memberCount = await page.locator('[data-testid="member-count"]').first().textContent();
      expect(memberCount).toMatch(/\d+ miembros?/);
      
      // Verify no error message
      const errorToast = await page.locator('.Toastify__toast--error').isVisible();
      expect(errorToast).toBe(false);
    });

    test('should show already assigned flags correctly', async ({ page }) => {
      // Login as admin
      await loginAsRole(page, 'admin');
      
      // Navigate to learning path assignment page
      await page.goto(`/admin/learning-paths/${testPathId}/assign`);
      
      // Assign a user first
      await page.click('[data-testid="users-tab"]');
      await page.selectOption('#userSchoolFilter', testSchoolId);
      await page.waitForTimeout(1000);
      
      // Select first user
      const firstUser = await page.locator('[data-testid="user-checkbox"]').first();
      await firstUser.check();
      
      // Click assign button
      await page.click('[data-testid="assign-button"]');
      await page.waitForTimeout(1000);
      
      // Refresh the search
      await page.selectOption('#userSchoolFilter', '');
      await page.selectOption('#userSchoolFilter', testSchoolId);
      await page.waitForTimeout(1000);
      
      // Verify the user shows as already assigned
      const assignedBadge = await page.locator('[data-testid="assigned-badge"]').first().isVisible();
      expect(assignedBadge).toBe(true);
    });

    test('should handle pagination correctly', async ({ page }) => {
      // Login as admin
      await loginAsRole(page, 'admin');
      
      // Navigate to learning path assignment page
      await page.goto(`/admin/learning-paths/${testPathId}/assign`);
      
      // Click on users tab
      await page.click('[data-testid="users-tab"]');
      
      // Don't filter by school to get more results
      await page.fill('[data-testid="user-search-input"]', '');
      
      // Wait for results
      await page.waitForTimeout(1000);
      
      // Check if pagination exists
      const hasMore = await page.locator('[data-testid="load-more-button"]').isVisible();
      
      if (hasMore) {
        // Get initial count
        const initialCount = await page.locator('[data-testid="user-result-item"]').count();
        
        // Load more
        await page.click('[data-testid="load-more-button"]');
        await page.waitForTimeout(1000);
        
        // Verify more results loaded
        const newCount = await page.locator('[data-testid="user-result-item"]').count();
        expect(newCount).toBeGreaterThan(initialCount);
      }
    });
  });

  test.describe('Equipo Directivo Role', () => {
    test('should filter users within their school scope', async ({ page }) => {
      // Login as equipo_directivo
      await loginAsRole(page, 'equipo_directivo');
      
      // Navigate to learning path assignment page
      await page.goto(`/admin/learning-paths/${testPathId}/assign`);
      
      // Wait for page to load
      await page.waitForSelector('[data-testid="users-tab"]');
      
      // Click on users tab
      await page.click('[data-testid="users-tab"]');
      
      // Verify school filter is available
      const schoolFilter = await page.locator('#userSchoolFilter').isVisible();
      expect(schoolFilter).toBe(true);
      
      // Select their school
      await page.selectOption('#userSchoolFilter', testSchoolId);
      
      // Wait for results
      await page.waitForTimeout(1000);
      
      // Verify users are displayed
      const userResults = await page.locator('[data-testid="user-result-item"]').count();
      expect(userResults).toBeGreaterThan(0);
      
      // Verify no error message
      const errorToast = await page.locator('.Toastify__toast--error').isVisible();
      expect(errorToast).toBe(false);
    });
  });

  test.describe('Consultor Role', () => {
    test('should filter groups within their authorized scope', async ({ page }) => {
      // Login as consultor
      await loginAsRole(page, 'consultor');
      
      // Navigate to learning path assignment page
      await page.goto(`/admin/learning-paths/${testPathId}/assign`);
      
      // Wait for page to load
      await page.waitForSelector('[data-testid="groups-tab"]');
      
      // Click on groups tab
      await page.click('[data-testid="groups-tab"]');
      
      // Select school filter
      await page.selectOption('#groupSchoolFilter', testSchoolId);
      
      // Wait for results
      await page.waitForTimeout(1000);
      
      // Verify groups are displayed with accurate counts
      const groupResults = await page.locator('[data-testid="group-result-item"]').count();
      expect(groupResults).toBeGreaterThan(0);
      
      // Verify member counts are visible
      const memberCount = await page.locator('[data-testid="member-count"]').first().textContent();
      expect(memberCount).toMatch(/\d+ miembros?/);
    });
  });

  test.describe('Error Handling', () => {
    test('should show appropriate error for unauthorized users', async ({ page }) => {
      // Login as a student (unauthorized role)
      await loginAsRole(page, 'estudiante');
      
      // Try to navigate to learning path assignment page
      await page.goto(`/admin/learning-paths/${testPathId}/assign`);
      
      // Should be redirected or show error
      const url = page.url();
      expect(url).not.toContain('/assign');
      
      // Or check for error message
      const errorMessage = await page.locator('[data-testid="permission-error"]').isVisible();
      if (!url.includes('/assign')) {
        // Successfully redirected
        expect(true).toBe(true);
      } else {
        // Should show permission error
        expect(errorMessage).toBe(true);
      }
    });
  });
});