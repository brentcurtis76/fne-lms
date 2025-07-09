/**
 * E2E Tests for Security and Permissions
 * Tests access control and security boundaries for consultant-managed groups
 */

import { test, expect } from '@playwright/test';
import { loginAs, logout, createAuthenticatedContext } from '../utils/auth-helpers';
import {
  navigateToGroupAssignments,
  openGroupManagementModal,
  setupTestData,
  cleanupTestData
} from '../utils/group-assignment-helpers';

test.describe('Group Management Security @security', () => {
  let testData: any;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    testData = await setupTestData(page);
    await context.close();
  });

  test.afterAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await cleanupTestData(page);
    await context.close();
  });

  test('cross-community access is blocked', async ({ page }) => {
    // Login as consultant for Community A
    await loginAs(page, 'consultant');
    
    // Try to access Community B's assignments
    await page.goto('/community/workspace?id=community-b-id');
    
    // Should either redirect or show no management options
    const manageButtons = page.locator('button:has-text("Gestionar Grupos")');
    const buttonCount = await manageButtons.count();
    
    if (buttonCount > 0) {
      // If buttons exist, they should be for consultant's own communities only
      for (let i = 0; i < buttonCount; i++) {
        const button = manageButtons.nth(i);
        const card = button.locator('xpath=ancestor::*[@data-testid="assignment-card"]');
        const communityId = await card.getAttribute('data-community-id');
        
        // Verify consultant has access to this community
        expect(testData.consultantCommunities).toContain(communityId);
      }
    }
  });

  test('student cannot access group management', async ({ page }) => {
    await loginAs(page, 'student');
    await navigateToGroupAssignments(page, testData.communityId);
    
    // Verify no manage buttons visible
    await expect(page.locator('button:has-text("Gestionar Grupos")')).not.toBeVisible();
    
    // Try to access management modal directly via URL manipulation
    await page.evaluate(() => {
      // Attempt to trigger modal programmatically
      window.dispatchEvent(new CustomEvent('open-group-modal', { 
        detail: { assignmentId: 'test-id' } 
      }));
    });
    
    // Modal should not open
    await expect(page.locator('[data-testid="group-management-modal"]')).not.toBeVisible();
    
    // Try to call the RPC function directly
    const response = await page.evaluate(async () => {
      try {
        const { createClient } = window as any;
        const supabase = createClient();
        const result = await supabase.rpc('save_consultant_groups', {
          p_assignment_id: 'test-id',
          p_community_id: 'test-community',
          p_groups: []
        });
        return result;
      } catch (error) {
        return { error: error.message };
      }
    });
    
    // Should return unauthorized error
    expect(response.error).toContain('Unauthorized');
  });

  test('admin cannot manage consultant groups', async ({ page }) => {
    // Even admins should not be able to manage groups unless they're also consultants
    await loginAs(page, 'admin');
    await navigateToGroupAssignments(page, testData.communityId);
    
    // Admin might see assignments but not manage groups
    const assignmentCards = page.locator('[data-testid="assignment-card"]');
    const cardCount = await assignmentCards.count();
    
    for (let i = 0; i < cardCount; i++) {
      const card = assignmentCards.nth(i);
      const isConsultantManaged = await card.locator('text=Grupos por Consultor').isVisible();
      
      if (isConsultantManaged) {
        // Admin who is not a consultant should not see manage button
        const manageButton = card.locator('button:has-text("Gestionar Grupos")');
        
        // Check if admin is also a consultant for this community
        const adminIsConsultant = testData.adminConsultantCommunities?.includes(testData.communityId);
        
        if (!adminIsConsultant) {
          await expect(manageButton).not.toBeVisible();
        }
      }
    }
  });

  test('unauthenticated access is blocked', async ({ page }) => {
    // Don't login, try to access directly
    await page.goto('/community/workspace');
    
    // Should redirect to login
    await expect(page).toHaveURL(/\/login/);
    
    // Try to access API endpoints directly
    const apiResponse = await page.request.get('/api/group-assignments');
    expect(apiResponse.status()).toBe(401);
    
    // Try to call RPC functions
    const rpcResponse = await page.request.post('/rest/v1/rpc/save_consultant_groups', {
      data: {
        p_assignment_id: 'test',
        p_community_id: 'test',
        p_groups: []
      }
    });
    expect(rpcResponse.status()).toBe(401);
  });

  test('RLS policies block unauthorized data access', async ({ page }) => {
    await loginAs(page, 'consultant');
    
    // Try to access groups from another consultant's assignment
    const response = await page.evaluate(async () => {
      try {
        const { createClient } = window as any;
        const supabase = createClient();
        
        // Try to read groups for an assignment in a different community
        const { data, error } = await supabase
          .from('group_assignment_groups')
          .select('*')
          .eq('assignment_id', 'other-consultant-assignment-id')
          .eq('is_consultant_managed', true);
          
        return { data, error };
      } catch (error) {
        return { error: error.message };
      }
    });
    
    // Should return empty data or error
    expect(response.data).toBeNull().or(response.data).toHaveLength(0);
  });

  test('consultant cannot modify auto-created groups', async ({ page }) => {
    await loginAs(page, 'consultant');
    
    // Try to modify a non-consultant-managed group
    const response = await page.evaluate(async () => {
      try {
        const { createClient } = window as any;
        const supabase = createClient();
        
        // Attempt to update an auto-created group
        const { data, error } = await supabase
          .from('group_assignment_groups')
          .update({ name: 'Hacked Group Name' })
          .eq('is_consultant_managed', false)
          .select();
          
        return { data, error };
      } catch (error) {
        return { error: error.message };
      }
    });
    
    // Should be blocked by RLS
    expect(response.error).toBeTruthy();
    expect(response.data).toBeNull().or(response.data).toHaveLength(0);
  });

  test('data isolation between communities', async ({ page, browser }) => {
    // Create two browser contexts for different consultants
    const context1 = await browser.newContext();
    const page1 = await context1.newPage();
    
    const context2 = await browser.newContext();
    const page2 = await context2.newPage();
    
    // Login as consultant for Community A
    await loginAs(page1, 'consultant');
    await navigateToGroupAssignments(page1, 'community-a-id');
    
    // Login as consultant for Community B
    // (Using a different test user that's consultant for Community B)
    await page2.goto('/login');
    await page2.fill('input[type="email"]', 'consultant2@test.com');
    await page2.fill('input[type="password"]', 'test123456');
    await page2.click('button[type="submit"]');
    await page2.waitForURL(/\/dashboard/);
    
    await navigateToGroupAssignments(page2, 'community-b-id');
    
    // Consultant A creates groups
    if (await page1.locator('button:has-text("Gestionar Grupos")').isVisible()) {
      await openGroupManagementModal(page1, 'Test Assignment A');
      
      // Check that consultant A cannot see Community B's students
      const studentList = page1.locator('[data-testid="student-card"]');
      const studentCount = await studentList.count();
      
      for (let i = 0; i < studentCount; i++) {
        const student = studentList.nth(i);
        const email = await student.locator('text=@').textContent();
        
        // Verify all students belong to Community A
        expect(email).not.toContain('community-b');
      }
    }
    
    // Clean up
    await context1.close();
    await context2.close();
  });

  test('SQL injection attempts are blocked', async ({ page }) => {
    await loginAs(page, 'consultant');
    await navigateToGroupAssignments(page, testData.communityId);
    await openGroupManagementModal(page, 'Test Assignment');
    
    // Try SQL injection in group name
    const maliciousNames = [
      "'; DROP TABLE group_assignment_groups; --",
      "\" OR 1=1 --",
      "'; UPDATE profiles SET role='admin' WHERE email='hacker@test.com'; --",
      "<script>alert('XSS')</script>",
      "${1+1}",
      "{{7*7}}"
    ];
    
    for (const name of maliciousNames) {
      // Create group with malicious name
      await page.click('button:has-text("Nuevo Grupo")');
      const input = page.locator('input[placeholder*="Nombre del grupo"]').last();
      await input.fill(name);
      
      // Try to save
      await page.click('button:has-text("Guardar Grupos")');
      
      // Check that the name is properly escaped/sanitized
      await page.waitForTimeout(1000);
      
      // Reopen modal to verify
      await openGroupManagementModal(page, 'Test Assignment');
      
      // Group name should be saved as-is (escaped) or rejected
      const savedGroup = page.locator(`text="${name}"`);
      if (await savedGroup.isVisible()) {
        // Name was saved but should be escaped
        const groupElement = await savedGroup.elementHandle();
        const innerHTML = await groupElement?.evaluate(el => el.innerHTML);
        
        // Verify no script execution
        expect(innerHTML).not.toContain('<script>');
        expect(innerHTML).not.toContain('alert(');
      }
    }
    
    // Verify tables still exist (injection failed)
    const tablesExist = await page.evaluate(async () => {
      try {
        const { createClient } = window as any;
        const supabase = createClient();
        const { data } = await supabase.from('group_assignment_groups').select('id').limit(1);
        return true;
      } catch {
        return false;
      }
    });
    
    expect(tablesExist).toBe(true);
  });

  test('rate limiting on group operations', async ({ page }) => {
    await loginAs(page, 'consultant');
    await navigateToGroupAssignments(page, testData.communityId);
    
    // Attempt many rapid saves
    const saveAttempts = [];
    
    for (let i = 0; i < 20; i++) {
      saveAttempts.push(
        page.evaluate(async () => {
          try {
            const { createClient } = window as any;
            const supabase = createClient();
            const result = await supabase.rpc('save_consultant_groups', {
              p_assignment_id: 'test-rate-limit',
              p_community_id: 'test-community',
              p_groups: [{ name: 'Test', member_ids: [] }]
            });
            return { success: true, error: result.error };
          } catch (error) {
            return { success: false, error: error.message };
          }
        })
      );
    }
    
    const results = await Promise.all(saveAttempts);
    
    // Some requests should fail due to rate limiting
    const failures = results.filter(r => !r.success || r.error);
    expect(failures.length).toBeGreaterThan(0);
    
    // Check for rate limit error messages
    const rateLimitErrors = failures.filter(f => 
      f.error?.includes('rate') || 
      f.error?.includes('too many') ||
      f.error?.includes('429')
    );
    expect(rateLimitErrors.length).toBeGreaterThan(0);
  });

  test('CORS and CSP headers are properly configured', async ({ page }) => {
    await loginAs(page, 'consultant');
    
    // Intercept responses to check headers
    const responses: any[] = [];
    
    page.on('response', response => {
      if (response.url().includes('/api/') || response.url().includes('/rest/')) {
        responses.push({
          url: response.url(),
          headers: response.headers()
        });
      }
    });
    
    await navigateToGroupAssignments(page, testData.communityId);
    await page.waitForTimeout(2000);
    
    // Check security headers
    for (const response of responses) {
      const headers = response.headers;
      
      // CORS should be restricted
      if (headers['access-control-allow-origin']) {
        expect(headers['access-control-allow-origin']).not.toBe('*');
      }
      
      // CSP should be present
      if (headers['content-security-policy']) {
        expect(headers['content-security-policy']).toContain("default-src");
        expect(headers['content-security-policy']).not.toContain("unsafe-inline");
      }
      
      // Other security headers
      expect(headers['x-frame-options']).toBeTruthy();
      expect(headers['x-content-type-options']).toBe('nosniff');
    }
  });
});

test.describe('Permission Edge Cases @security', () => {
  test('consultant loses access mid-session', async ({ page }) => {
    await loginAs(page, 'consultant');
    await navigateToGroupAssignments(page);
    
    // Simulate consultant role being revoked (would normally be done via admin)
    // For testing, we'll check how the UI handles permission errors
    
    // Intercept the RPC call to simulate permission loss
    await page.route('**/rpc/save_consultant_groups', route => {
      route.fulfill({
        status: 403,
        body: JSON.stringify({ 
          error: 'Unauthorized: User is not a consultant for this community' 
        })
      });
    });
    
    // Try to save groups
    await openGroupManagementModal(page, 'Test Assignment');
    await page.click('button:has-text("Nuevo Grupo")');
    await page.click('button:has-text("Guardar Grupos")');
    
    // Should show appropriate error message
    await expect(page.locator('text=No tienes permisos')).toBeVisible();
    
    // UI should handle gracefully
    await expect(page.locator('[data-testid="group-management-modal"]')).toBeVisible();
  });

  test('handles session expiration gracefully', async ({ page }) => {
    await loginAs(page, 'consultant');
    await navigateToGroupAssignments(page);
    
    // Simulate session expiration
    await page.evaluate(() => {
      // Clear auth tokens
      localStorage.removeItem('supabase.auth.token');
      sessionStorage.removeItem('supabase.auth.token');
    });
    
    // Try to perform an action
    try {
      await openGroupManagementModal(page, 'Test Assignment');
      await page.click('button:has-text("Guardar Grupos")');
    } catch {
      // Expected to fail
    }
    
    // Should redirect to login or show session expired message
    await expect(page).toHaveURL(/\/login/)
      .or(expect(page.locator('text=sesión.*expirado, text=session.*expired'))).toBeVisible();
  });
});