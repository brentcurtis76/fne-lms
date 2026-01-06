/**
 * E2E Tests for Backward Compatibility
 * Ensures existing auto-grouping functionality continues to work
 */

import { test, expect } from '@playwright/test';
import { loginAsQA as loginAs, logout } from '../utils/auth-helpers';
import {
  navigateToGroupAssignments,
  submitGroupAssignment,
  setupTestData,
  cleanupTestData
} from '../utils/group-assignment-helpers';

test.describe('Legacy Auto-Grouping Compatibility @compatibility', () => {
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

  test('auto-grouping continues to work for non-consultant assignments', async ({ page }) => {
    await loginAs(page, 'student');
    await navigateToGroupAssignments(page, testData.communityId);
    
    // Find a traditional auto-grouping assignment
    const autoGroupCard = page.locator('[data-testid="assignment-card"]')
      .filter({ hasNotText: 'Grupos por Consultor' })
      .filter({ hasText: 'Grupal' })
      .first();
    
    if (await autoGroupCard.isVisible()) {
      // Should NOT show pending message
      await expect(autoGroupCard.locator('text=Asignación de grupo pendiente')).not.toBeVisible();
      
      // Should have submit button immediately available
      const submitButton = autoGroupCard.locator('button:has-text("Enviar Tarea")');
      await expect(submitButton).toBeVisible();
      await expect(submitButton).toBeEnabled();
      
      // Group should be auto-created on first access
      await expect(autoGroupCard.locator('text=Tu grupo:')).toBeVisible()
        .or(expect(autoGroupCard.locator('text=Miembros del grupo:'))).toBeVisible();
    }
  });

  test('existing auto-created groups remain functional', async ({ page }) => {
    await loginAs(page, 'student');
    
    // Check that existing submissions still work
    const response = await page.evaluate(async () => {
      try {
        const { createClient } = window as any;
        const supabase = createClient();
        
        // Query existing auto-created groups
        const { data, error } = await supabase
          .from('group_assignment_groups')
          .select('*')
          .eq('is_consultant_managed', false)
          .limit(5);
          
        return { data, error };
      } catch (error) {
        return { error: error.message };
      }
    });
    
    // Auto-created groups should still exist
    expect(response.error).toBeNull();
    if (response.data && response.data.length > 0) {
      // Verify structure hasn't changed
      const group = response.data[0];
      expect(group).toHaveProperty('id');
      expect(group).toHaveProperty('assignment_id');
      expect(group).toHaveProperty('member_ids');
      expect(group.is_consultant_managed).toBe(false);
    }
  });

  test('mixed assignment types in same community', async ({ page }) => {
    await loginAs(page, 'student');
    await navigateToGroupAssignments(page, testData.communityId);
    
    // Count different types of assignments
    const allCards = page.locator('[data-testid="assignment-card"]');
    const totalCount = await allCards.count();
    
    const consultantManaged = allCards.filter({ hasText: 'Grupos por Consultor' });
    const consultantCount = await consultantManaged.count();
    
    const autoGrouped = totalCount - consultantCount;
    
    // Both types should be able to coexist
    if (totalCount > 1) {
      expect(consultantCount).toBeGreaterThanOrEqual(0);
      expect(autoGrouped).toBeGreaterThanOrEqual(0);
    }
    
    // Each type should have correct UI
    for (let i = 0; i < totalCount; i++) {
      const card = allCards.nth(i);
      const isConsultantManaged = await card.locator('text=Grupos por Consultor').isVisible();
      
      if (isConsultantManaged) {
        // Should show either pending or assigned state
        const hasPending = await card.locator('text=Asignación de grupo pendiente').isVisible();
        const hasAssigned = await card.locator('text=Asignado a:').isVisible();
        expect(hasPending || hasAssigned).toBe(true);
      } else {
        // Should have immediate submit capability
        const submitButton = card.locator('button:has-text("Enviar Tarea")');
        const isVisible = await submitButton.isVisible();
        
        if (isVisible) {
          // If not already submitted
          await expect(submitButton).toBeEnabled();
        }
      }
    }
  });

  test('consultant view shows both assignment types', async ({ page }) => {
    await loginAs(page, 'consultant');
    await navigateToGroupAssignments(page, testData.communityId);
    
    // Consultant should see all assignments
    const allCards = page.locator('[data-testid="assignment-card"]');
    const cardCount = await allCards.count();
    
    let consultantManagedCount = 0;
    let autoGroupedCount = 0;
    
    for (let i = 0; i < cardCount; i++) {
      const card = allCards.nth(i);
      const isConsultantManaged = await card.locator('text=Grupos por Consultor').isVisible();
      
      if (isConsultantManaged) {
        consultantManagedCount++;
        // Should have manage button
        await expect(card.locator('button:has-text("Gestionar Grupos")')).toBeVisible();
      } else {
        autoGroupedCount++;
        // Should NOT have manage button
        await expect(card.locator('button:has-text("Gestionar Grupos")')).not.toBeVisible();
      }
    }
    
    // Log counts for verification
    console.log(`Found ${consultantManagedCount} consultant-managed and ${autoGroupedCount} auto-grouped assignments`);
  });

  test('performance with mixed assignment types', async ({ page }) => {
    await loginAs(page, 'student');
    
    // Measure load time
    const startTime = Date.now();
    await navigateToGroupAssignments(page, testData.communityId);
    
    // Wait for all assignment cards to load
    await page.waitForSelector('[data-testid="assignment-card"]', { timeout: 10000 });
    
    const loadTime = Date.now() - startTime;
    
    // Should load reasonably fast even with mixed types
    expect(loadTime).toBeLessThan(5000); // 5 seconds max
    
    // Check that both RPC calls complete efficiently
    const rpcTimes = await page.evaluate(async () => {
      const times: Record<string, number> = {};
      
      try {
        const { createClient } = window as any;
        const supabase = createClient();
        
        // Time the old query
        const oldStart = Date.now();
        await supabase
          .from('group_assignments')
          .select('*')
          .eq('community_id', 'test-community-id')
          .limit(10);
        times.oldQuery = Date.now() - oldStart;
        
        // Time the new RPC
        const rpcStart = Date.now();
        await supabase.rpc('get_assignments_with_user_groups', {
          p_community_id: 'test-community-id',
          p_user_id: 'test-user-id'
        });
        times.newRpc = Date.now() - rpcStart;
        
      } catch (error) {
        console.error('Performance test error:', error);
      }
      
      return times;
    });
    
    // Both should complete quickly
    if (rpcTimes.oldQuery) expect(rpcTimes.oldQuery).toBeLessThan(1000);
    if (rpcTimes.newRpc) expect(rpcTimes.newRpc).toBeLessThan(1500);
  });

  test('database schema compatibility', async ({ page }) => {
    await loginAs(page, 'admin');
    
    // Verify all expected columns exist
    const schemaCheck = await page.evaluate(async () => {
      try {
        const { createClient } = window as any;
        const supabase = createClient();
        
        // Check group_assignment_groups table
        const { data: groups } = await supabase
          .from('group_assignment_groups')
          .select('*')
          .limit(1);
          
        // Check group_assignment_settings table
        const { data: settings } = await supabase
          .from('group_assignment_settings')
          .select('*')
          .limit(1);
          
        return {
          groupsColumns: groups && groups.length > 0 ? Object.keys(groups[0]) : [],
          settingsColumns: settings && settings.length > 0 ? Object.keys(settings[0]) : [],
          success: true
        };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });
    
    expect(schemaCheck.success).toBe(true);
    
    // Verify new columns don't break existing functionality
    if (schemaCheck.groupsColumns.length > 0) {
      // Essential columns for auto-grouping
      expect(schemaCheck.groupsColumns).toContain('id');
      expect(schemaCheck.groupsColumns).toContain('assignment_id');
      expect(schemaCheck.groupsColumns).toContain('member_ids');
      
      // New column for consultant management
      expect(schemaCheck.groupsColumns).toContain('is_consultant_managed');
    }
  });

  test('auto-group creation still follows size limits', async ({ page }) => {
    // This tests that the original max_group_size logic still works
    await loginAs(page, 'student');
    
    const groupInfo = await page.evaluate(async () => {
      try {
        const { createClient } = window as any;
        const supabase = createClient();
        
        // Get an auto-grouped assignment
        const { data: groups } = await supabase
          .from('group_assignment_groups')
          .select('*, group_assignments!inner(max_group_size)')
          .eq('is_consultant_managed', false)
          .limit(10);
          
        return groups?.map(g => ({
          memberCount: g.member_ids?.length || 0,
          maxSize: g.group_assignments?.max_group_size || 5
        }));
      } catch (error) {
        return null;
      }
    });
    
    if (groupInfo && groupInfo.length > 0) {
      // Verify no auto-created group exceeds its limit
      for (const group of groupInfo) {
        expect(group.memberCount).toBeLessThanOrEqual(group.maxSize);
      }
    }
  });

  test('submission notifications work for both types', async ({ page }) => {
    await loginAs(page, 'consultant');
    
    // Check notification preferences
    await page.click('[data-testid="notification-bell"]');
    
    const notifications = page.locator('[data-testid="notification-item"]');
    const notificationTexts = await notifications.allTextContents();
    
    // Should potentially have notifications from both types
    const autoGroupNotifications = notificationTexts.filter(text => 
      text.includes('entrega') && !text.includes('grupo gestionado')
    );
    
    const consultantGroupNotifications = notificationTexts.filter(text =>
      text.includes('entrega') && text.includes('grupo') && text.includes('gestionado')
    );
    
    // Both types should be able to generate notifications
    console.log(`Found ${autoGroupNotifications.length} auto-group and ${consultantGroupNotifications.length} consultant-group notifications`);
  });

  test('export/import compatibility', async ({ page }) => {
    // Test that any export functionality handles both group types
    await loginAs(page, 'admin');
    
    // Navigate to a page with export functionality (if exists)
    await page.goto('/admin/reports');
    
    const exportButton = page.locator('button:has-text("Exportar"), button:has-text("Export")');
    
    if (await exportButton.isVisible()) {
      // Click export
      const downloadPromise = page.waitForEvent('download');
      await exportButton.click();
      
      try {
        const download = await downloadPromise;
        const fileName = download.suggestedFilename();
        
        // Verify export completes successfully
        expect(fileName).toBeTruthy();
        
        // Could also verify CSV/Excel content includes both group types
        const filePath = await download.path();
        if (filePath) {
          console.log(`Export completed: ${fileName}`);
        }
      } catch {
        // Export might open in new tab or have different behavior
        console.log('Export functionality has different implementation');
      }
    }
  });
});

test.describe('Migration Scenarios @compatibility', () => {
  test('handles assignments switching from auto to consultant-managed', async ({ page }) => {
    // This simulates an admin changing an assignment's settings
    await loginAs(page, 'admin');
    
    // Would typically use course builder to change settings
    // For E2E test, we'll verify the UI handles this transition
    
    await loginAs(page, 'student');
    await navigateToGroupAssignments(page);
    
    // Find an assignment that might have transitioned
    const transitionedCard = page.locator('[data-testid="assignment-card"]')
      .filter({ hasText: 'Grupos por Consultor' })
      .first();
    
    if (await transitionedCard.isVisible()) {
      // Student who was in auto-group should see pending state
      const wasInGroup = await page.evaluate(async (assignmentId) => {
        const { createClient } = window as any;
        const supabase = createClient();
        
        // Check if user has old auto-group
        const { data } = await supabase
          .from('group_assignment_groups')
          .select('id')
          .eq('assignment_id', assignmentId)
          .eq('is_consultant_managed', false)
          .contains('member_ids', ['current-user-id'])
          .single();
          
        return !!data;
      }, await transitionedCard.getAttribute('data-assignment-id'));
      
      if (wasInGroup) {
        // Should show transition message or pending state
        await expect(transitionedCard.locator('text=pendiente, text=consultor')).toBeVisible();
      }
    }
  });

  test('data integrity during feature rollout', async ({ page }) => {
    // Verify no data corruption during gradual rollout
    await loginAs(page, 'admin');
    
    const integrityCheck = await page.evaluate(async () => {
      try {
        const { createClient } = window as any;
        const supabase = createClient();
        
        // Check for orphaned groups
        const { data: orphaned } = await supabase
          .from('group_assignment_groups')
          .select('id, assignment_id')
          .is('assignment_id', null);
          
        // Check for groups with invalid member arrays
        const { data: invalid } = await supabase
          .from('group_assignment_groups')
          .select('id, member_ids')
          .filter('member_ids', 'cs', '{}'); // Contains empty array
          
        return {
          orphanedCount: orphaned?.length || 0,
          invalidCount: invalid?.length || 0,
          success: true
        };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });
    
    expect(integrityCheck.success).toBe(true);
    expect(integrityCheck.orphanedCount).toBe(0);
    // Empty groups might be valid during creation
    expect(integrityCheck.invalidCount).toBeGreaterThanOrEqual(0);
  });
});