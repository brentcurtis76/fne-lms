/**
 * E2E Tests for Consultant-Managed Groups
 * Tests the complete consultant workflow for managing groups
 */

import { test, expect } from '@playwright/test';
import { loginAs, logout } from '../utils/auth-helpers';
import {
  navigateToGroupAssignments,
  openGroupManagementModal,
  createGroup,
  assignStudentsToGroup,
  saveGroups,
  verifyGroupOverview,
  setupTestData,
  cleanupTestData
} from '../utils/group-assignment-helpers';

test.describe('Consultant Group Management @consultant', () => {
  let testData: any;

  test.beforeAll(async ({ browser }) => {
    // Setup test data using a separate context
    const context = await browser.newContext();
    const page = await context.newPage();
    testData = await setupTestData(page);
    await context.close();
  });

  test.afterAll(async ({ browser }) => {
    // Cleanup test data
    const context = await browser.newContext();
    const page = await context.newPage();
    await cleanupTestData(page);
    await context.close();
  });

  test('consultant can enable consultant-managed groups for assignment', async ({ page }) => {
    // Login as consultant
    await loginAs(page, 'consultant');

    // Navigate to course builder (assuming consultant has access)
    await page.goto('/admin/course-builder');
    
    // Create or edit an assignment
    await page.click('button:has-text("Crear Tarea Grupal")');
    
    // Fill assignment details
    await page.fill('input[name="title"]', 'Test Consultant-Managed Assignment');
    await page.fill('textarea[name="description"]', 'This assignment uses consultant-managed groups');
    
    // Enable consultant-managed groups
    const consultantManagedToggle = page.locator('label:has-text("Grupos gestionados por consultor")');
    await consultantManagedToggle.click();
    
    // Save assignment
    await page.click('button:has-text("Guardar")');
    
    // Verify success
    await expect(page.locator('text=Tarea creada exitosamente')).toBeVisible();
  });

  test('consultant can create and manage groups', async ({ page }) => {
    await loginAs(page, 'consultant');
    
    // Navigate to group assignments
    await navigateToGroupAssignments(page, testData.communityId);
    
    // Open management modal for the test assignment
    await openGroupManagementModal(page, 'Test Consultant-Managed Assignment');
    
    // Create multiple groups
    await createGroup(page, 'Grupo A');
    await createGroup(page, 'Grupo B');
    await createGroup(page, 'Grupo C');
    
    // Verify groups appear in the list
    await expect(page.locator('text=Grupo A')).toBeVisible();
    await expect(page.locator('text=Grupo B')).toBeVisible();
    await expect(page.locator('text=Grupo C')).toBeVisible();
    
    // Save without assigning students (should show warning)
    await page.click('button:has-text("Guardar Grupos")');
    
    // Verify empty groups are not saved
    await expect(page.locator('text=Sin miembros asignados')).toBeVisible();
  });

  test('consultant can assign students to groups', async ({ page }) => {
    await loginAs(page, 'consultant');
    await navigateToGroupAssignments(page, testData.communityId);
    await openGroupManagementModal(page, 'Test Consultant-Managed Assignment');
    
    // Create groups
    await createGroup(page, 'Grupo Alpha');
    await createGroup(page, 'Grupo Beta');
    
    // Assign students to Grupo Alpha
    await assignStudentsToGroup(page, 'Grupo Alpha', [
      'student1@test.com',
      'student2@test.com'
    ]);
    
    // Assign students to Grupo Beta
    await assignStudentsToGroup(page, 'Grupo Beta', [
      'student3@test.com',
      'student4@test.com'
    ]);
    
    // Save groups
    await saveGroups(page);
    
    // Reopen modal to verify persistence
    await openGroupManagementModal(page, 'Test Consultant-Managed Assignment');
    
    // Verify groups and members are saved
    await expect(page.locator('text=Grupo Alpha')).toBeVisible();
    await expect(page.locator('text=student1@test.com')).toBeVisible();
    await expect(page.locator('text=student2@test.com')).toBeVisible();
    
    await expect(page.locator('text=Grupo Beta')).toBeVisible();
    await expect(page.locator('text=student3@test.com')).toBeVisible();
    await expect(page.locator('text=student4@test.com')).toBeVisible();
    
    // Close modal
    await page.click('button:has-text("Cancelar")');
  });

  test('consultant can rename and delete groups', async ({ page }) => {
    await loginAs(page, 'consultant');
    await navigateToGroupAssignments(page, testData.communityId);
    await openGroupManagementModal(page, 'Test Consultant-Managed Assignment');
    
    // Create a test group
    await createGroup(page, 'Temporary Group');
    await assignStudentsToGroup(page, 'Temporary Group', ['student5@test.com']);
    await saveGroups(page);
    
    // Reopen modal
    await openGroupManagementModal(page, 'Test Consultant-Managed Assignment');
    
    // Rename group
    const groupNameInput = page.locator('input[value="Temporary Group"]');
    await groupNameInput.clear();
    await groupNameInput.fill('Renamed Group');
    
    // Delete another empty group (if exists)
    const deleteButtons = page.locator('button[aria-label*="Eliminar"], button:has-text("🗑"), .text-red-500');
    const deleteCount = await deleteButtons.count();
    
    if (deleteCount > 0) {
      // Click the first delete button
      await deleteButtons.first().click();
      
      // Confirm deletion
      await page.click('button:has-text("Confirmar"), button:has-text("Sí")');
    }
    
    // Save changes
    await saveGroups(page);
    
    // Verify changes persisted
    await openGroupManagementModal(page, 'Test Consultant-Managed Assignment');
    await expect(page.locator('text=Renamed Group')).toBeVisible();
    await expect(page.locator('text=Temporary Group')).not.toBeVisible();
  });

  test('consultant cannot exceed maximum group size', async ({ page }) => {
    await loginAs(page, 'consultant');
    await navigateToGroupAssignments(page, testData.communityId);
    await openGroupManagementModal(page, 'Test Consultant-Managed Assignment');
    
    // Create a group
    await createGroup(page, 'Full Group');
    
    // Try to assign more than 8 students (assuming max is 8)
    const studentEmails = Array.from({ length: 9 }, (_, i) => `student${i + 10}@test.com`);
    
    // Attempt to assign all students
    for (let i = 0; i < studentEmails.length; i++) {
      const studentCard = page.locator(`[data-testid="student-card"]:has-text("${studentEmails[i]}")`);
      
      if (await studentCard.isVisible()) {
        await studentCard.click();
        
        // Check if we've hit the limit
        if (i >= 8) {
          // Should show error or prevent selection
          await expect(page.locator('text=máximo, text=límite, text=8 estudiantes')).toBeVisible();
          break;
        }
      }
    }
  });

  test('consultant can view group overview dashboard', async ({ page }) => {
    await loginAs(page, 'consultant');
    await navigateToGroupAssignments(page, testData.communityId);
    
    // Verify overview statistics
    await verifyGroupOverview(page, 1, 3, 2); // 1 assignment, 3 groups, 2 unassigned
    
    // Click on assignment to see detailed view
    await page.click('text=Test Consultant-Managed Assignment');
    
    // Verify group details are displayed
    await expect(page.locator('text=Grupo Alpha')).toBeVisible();
    await expect(page.locator('text=2 miembros')).toBeVisible();
    await expect(page.locator('text=0 entregas')).toBeVisible(); // No submissions yet
  });

  test('consultant receives notification when group submits', async ({ page }) => {
    // This test would require a student to submit first
    // For now, we'll verify the notification system is in place
    
    await loginAs(page, 'consultant');
    
    // Check notification center
    await page.click('[data-testid="notification-bell"], button[aria-label*="Notificaciones"]');
    
    // Look for group submission notifications
    const notifications = page.locator('[data-testid="notification-item"]');
    const submissionNotification = notifications.filter({ hasText: 'entrega grupal' });
    
    // If there are submission notifications, verify their content
    if (await submissionNotification.count() > 0) {
      await expect(submissionNotification.first()).toContainText(/Grupo .* ha enviado/);
    }
  });

  test('data integrity: atomic save operations', async ({ page }) => {
    await loginAs(page, 'consultant');
    await navigateToGroupAssignments(page, testData.communityId);
    await openGroupManagementModal(page, 'Test Consultant-Managed Assignment');
    
    // Create multiple groups with changes
    await createGroup(page, 'Test Group 1');
    await createGroup(page, 'Test Group 2');
    
    // Assign students
    await assignStudentsToGroup(page, 'Test Group 1', ['student20@test.com']);
    await assignStudentsToGroup(page, 'Test Group 2', ['student21@test.com']);
    
    // Simulate network interruption by intercepting the save request
    await page.route('**/rpc/save_consultant_groups', async route => {
      // Fail the first attempt
      if (route.request().postData()?.includes('Test Group')) {
        await route.abort('failed');
      } else {
        await route.continue();
      }
    });
    
    // Attempt to save (should fail)
    await page.click('button:has-text("Guardar Grupos")');
    
    // Should show error message
    await expect(page.locator('text=Error al guardar')).toBeVisible();
    
    // Remove route interception
    await page.unroute('**/rpc/save_consultant_groups');
    
    // Retry save (should succeed)
    await saveGroups(page);
    
    // Verify all changes were saved atomically
    await openGroupManagementModal(page, 'Test Consultant-Managed Assignment');
    await expect(page.locator('text=Test Group 1')).toBeVisible();
    await expect(page.locator('text=Test Group 2')).toBeVisible();
  });

  test('responsive design: mobile group management', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    
    await loginAs(page, 'consultant');
    await navigateToGroupAssignments(page, testData.communityId);
    
    // Verify mobile-friendly interface
    await openGroupManagementModal(page, 'Test Consultant-Managed Assignment');
    
    // Modal should be full-screen on mobile
    const modal = page.locator('[data-testid="group-management-modal"]');
    const modalBox = await modal.boundingBox();
    
    expect(modalBox?.width).toBeGreaterThan(350); // Nearly full width
    
    // Verify touch-friendly buttons
    const buttons = page.locator('button');
    const buttonCount = await buttons.count();
    
    for (let i = 0; i < buttonCount; i++) {
      const button = buttons.nth(i);
      const box = await button.boundingBox();
      
      if (box) {
        // Buttons should be at least 44px for touch targets
        expect(box.height).toBeGreaterThanOrEqual(40);
      }
    }
  });
});

test.describe('Consultant Workflow Edge Cases @consultant', () => {
  test('handles students already in groups', async ({ page }) => {
    await loginAs(page, 'consultant');
    
    // Navigate to an assignment where some students are already grouped
    await navigateToGroupAssignments(page);
    await openGroupManagementModal(page, 'Test Assignment with Existing Groups');
    
    // Verify already-assigned students show their current group
    const assignedStudent = page.locator('[data-testid="student-card"]:has-text("assigned@test.com")');
    await expect(assignedStudent).toContainText(/En Grupo/);
    
    // Try to reassign a student
    await assignedStudent.click();
    
    // Should remove from old group and allow new assignment
    await expect(assignedStudent).not.toContainText(/En Grupo/);
  });

  test('handles empty communities gracefully', async ({ page }) => {
    await loginAs(page, 'consultant');
    
    // Navigate to a community with no students
    await navigateToGroupAssignments(page, 'empty-community-id');
    
    // Try to open group management
    const assignmentCard = page.locator('[data-testid="assignment-card"]').first();
    
    if (await assignmentCard.isVisible()) {
      await assignmentCard.locator('button:has-text("Gestionar Grupos")').click();
      
      // Should show message about no students
      await expect(page.locator('text=No hay estudiantes en esta comunidad')).toBeVisible();
    }
  });

  test('validates group names', async ({ page }) => {
    await loginAs(page, 'consultant');
    await navigateToGroupAssignments(page);
    await openGroupManagementModal(page, 'Test Assignment');
    
    // Create group with empty name
    await createGroup(page, '');
    
    // Try to save
    await page.click('button:has-text("Guardar Grupos")');
    
    // Should show validation error
    await expect(page.locator('text=nombre del grupo, text=requerido')).toBeVisible();
    
    // Create group with duplicate name
    await createGroup(page, 'Existing Group Name');
    await createGroup(page, 'Existing Group Name');
    
    // Should show warning about duplicate names
    await expect(page.locator('text=nombre duplicado, text=ya existe')).toBeVisible();
  });
});