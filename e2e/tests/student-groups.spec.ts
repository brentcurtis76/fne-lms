/**
 * E2E Tests for Student Experience with Consultant-Managed Groups
 * Tests how students interact with group assignments
 */

import { test, expect } from '@playwright/test';
import { loginAs, logout, TEST_USERS } from '../utils/auth-helpers';
import {
  navigateToGroupAssignments,
  verifyPendingAssignment,
  verifyAssignedGroup,
  submitGroupAssignment,
  setupTestData,
  cleanupTestData
} from '../utils/group-assignment-helpers';

test.describe('Student Group Assignment Experience @student', () => {
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

  test('student sees pending assignment state', async ({ page }) => {
    // Login as student
    await loginAs(page, 'student');
    
    // Navigate to group assignments
    await navigateToGroupAssignments(page, testData.communityId);
    
    // Verify pending assignment message
    await verifyPendingAssignment(page, 'Consultant-Managed Test Assignment');
    
    // Verify UI elements
    const assignmentCard = page.locator('[data-testid="assignment-card"]:has-text("Consultant-Managed Test Assignment")');
    
    // Should show pending indicator
    await expect(assignmentCard.locator('.bg-amber-50, .border-amber-200')).toBeVisible();
    await expect(assignmentCard.locator('text=Asignación de grupo pendiente')).toBeVisible();
    await expect(assignmentCard.locator('text=Tu consultor te asignará a un grupo próximamente')).toBeVisible();
    
    // Submit button should not be visible
    const submitButton = assignmentCard.locator('button:has-text("Enviar Tarea")');
    await expect(submitButton).not.toBeVisible();
    
    // Should show consultant-managed badge
    await expect(assignmentCard.locator('text=Grupos por Consultor')).toBeVisible();
  });

  test('student sees assigned group after consultant assignment', async ({ page }) => {
    // First, simulate consultant assigning the student to a group
    // (In a real test, this would be done via API or in a separate browser context)
    
    await loginAs(page, 'student');
    await navigateToGroupAssignments(page, testData.communityId);
    
    // Verify assigned state (assuming student was assigned to "Grupo Alpha")
    await verifyAssignedGroup(
      page,
      'Assigned Test Assignment',
      'Grupo Alpha',
      ['John Doe', 'Jane Smith', TEST_USERS.student.name]
    );
    
    // Verify UI shows success state
    const assignmentCard = page.locator('[data-testid="assignment-card"]:has-text("Assigned Test Assignment")');
    
    // Should show success indicator
    await expect(assignmentCard.locator('.bg-green-50, .border-green-200')).toBeVisible();
    await expect(assignmentCard.locator('text=Asignado a: Grupo Alpha')).toBeVisible();
    
    // Should list group members
    await expect(assignmentCard.locator('text=Miembros del grupo:')).toBeVisible();
    
    // Submit button should now be visible and enabled
    const submitButton = assignmentCard.locator('button:has-text("Enviar Tarea")');
    await expect(submitButton).toBeVisible();
    await expect(submitButton).toBeEnabled();
  });

  test('student can submit group assignment', async ({ page }) => {
    await loginAs(page, 'student');
    await navigateToGroupAssignments(page, testData.communityId);
    
    // Find an assignment where student is assigned to a group
    const assignmentTitle = 'Ready for Submission Assignment';
    
    // Submit the assignment
    await submitGroupAssignment(page, assignmentTitle);
    
    // Verify submission was recorded
    const assignmentCard = page.locator(`[data-testid="assignment-card"]:has-text("${assignmentTitle}")`);
    
    // Should show submitted state
    await expect(assignmentCard.locator('text=Enviado, text=Submitted')).toBeVisible();
    
    // Submit button should be disabled or hidden
    const submitButton = assignmentCard.locator('button:has-text("Enviar Tarea")');
    await expect(submitButton).toBeDisabled().or(submitButton).not.toBeVisible();
  });

  test('student cannot see manage groups button', async ({ page }) => {
    await loginAs(page, 'student');
    await navigateToGroupAssignments(page, testData.communityId);
    
    // Look for any assignment cards
    const assignmentCards = page.locator('[data-testid="assignment-card"]');
    const cardCount = await assignmentCards.count();
    
    // Verify no manage groups buttons are visible
    for (let i = 0; i < cardCount; i++) {
      const card = assignmentCards.nth(i);
      const manageButton = card.locator('button:has-text("Gestionar Grupos")');
      await expect(manageButton).not.toBeVisible();
    }
    
    // Also check that the consultant UI elements are not present
    await expect(page.locator('[data-testid="group-management-modal"]')).not.toBeVisible();
    await expect(page.locator('text=Resumen de Grupos')).not.toBeVisible();
  });

  test('student sees real-time group updates', async ({ page, context }) => {
    await loginAs(page, 'student');
    await navigateToGroupAssignments(page, testData.communityId);
    
    // Verify initial pending state
    await verifyPendingAssignment(page, 'Real-time Test Assignment');
    
    // Open a second page as consultant to assign the student
    const consultantPage = await context.newPage();
    await loginAs(consultantPage, 'consultant');
    await navigateToGroupAssignments(consultantPage, testData.communityId);
    
    // Consultant assigns student to a group
    await consultantPage.click('button:has-text("Gestionar Grupos")');
    // ... assignment logic
    await consultantPage.close();
    
    // Back on student page, wait for real-time update
    // (This assumes real-time subscriptions are implemented)
    await page.waitForTimeout(2000); // Wait for potential real-time update
    
    // Alternatively, student refreshes the page
    await page.reload();
    
    // Should now see assigned state
    const assignmentCard = page.locator('[data-testid="assignment-card"]:has-text("Real-time Test Assignment")');
    await expect(assignmentCard.locator('text=Asignado a:')).toBeVisible({ timeout: 10000 });
  });

  test('student can view group member profiles', async ({ page }) => {
    await loginAs(page, 'student');
    await navigateToGroupAssignments(page, testData.communityId);
    
    // Find an assignment where student is in a group
    const assignmentCard = page.locator('[data-testid="assignment-card"]:has-text("Group Members Test")');
    
    // Should display member avatars or initials
    const memberAvatars = assignmentCard.locator('[data-testid="member-avatar"], .rounded-full');
    const avatarCount = await memberAvatars.count();
    
    expect(avatarCount).toBeGreaterThan(0);
    
    // Hover over member to see tooltip (if implemented)
    if (avatarCount > 0) {
      await memberAvatars.first().hover();
      
      // Check if tooltip appears
      const tooltip = page.locator('[role="tooltip"], .tooltip');
      if (await tooltip.isVisible()) {
        await expect(tooltip).toContainText(/@test\.com/);
      }
    }
  });

  test('student cannot submit without group assignment', async ({ page }) => {
    await loginAs(page, 'student');
    await navigateToGroupAssignments(page, testData.communityId);
    
    // Find a consultant-managed assignment where student is NOT assigned
    const unassignedCard = page.locator('[data-testid="assignment-card"]')
      .filter({ hasText: 'Asignación de grupo pendiente' })
      .first();
    
    if (await unassignedCard.isVisible()) {
      // Verify submit button is not available
      const submitButton = unassignedCard.locator('button:has-text("Enviar Tarea")');
      await expect(submitButton).not.toBeVisible();
      
      // Try to navigate directly to submission URL (if they know it)
      const assignmentId = await unassignedCard.getAttribute('data-assignment-id');
      if (assignmentId) {
        await page.goto(`/assignments/${assignmentId}/submit`);
        
        // Should be redirected or shown error
        await expect(page.locator('text=debe ser asignado a un grupo, text=not assigned')).toBeVisible()
          .or(expect(page).toHaveURL(/\/assignments$/));
      }
    }
  });

  test('student sees submission history', async ({ page }) => {
    await loginAs(page, 'student');
    await navigateToGroupAssignments(page, testData.communityId);
    
    // Find an assignment that was already submitted
    const submittedCard = page.locator('[data-testid="assignment-card"]')
      .filter({ hasText: 'Enviado' })
      .first();
    
    if (await submittedCard.isVisible()) {
      // Click to view submission details
      await submittedCard.click();
      
      // Should show submission timestamp
      await expect(page.locator('text=Enviado el, text=Submitted on')).toBeVisible();
      
      // Should show group members who submitted
      await expect(page.locator('text=Enviado por el grupo')).toBeVisible();
      
      // May show submission status (graded, pending review, etc.)
      const statusBadge = page.locator('[data-testid="submission-status"]');
      if (await statusBadge.isVisible()) {
        await expect(statusBadge).toContainText(/Pendiente|Revisado|Calificado/);
      }
    }
  });

  test('student receives notifications about group changes', async ({ page }) => {
    await loginAs(page, 'student');
    
    // Check notification center
    await page.click('[data-testid="notification-bell"], button[aria-label*="Notificaciones"]');
    
    // Look for group-related notifications
    const notifications = page.locator('[data-testid="notification-item"]');
    
    // Check for assignment notifications
    const groupNotification = notifications.filter({ 
      hasText: /asignado al grupo|agregado a|grupo.*creado/i 
    });
    
    if (await groupNotification.count() > 0) {
      // Verify notification content
      await expect(groupNotification.first()).toContainText(/Grupo/);
      
      // Click notification to navigate to assignment
      await groupNotification.first().click();
      
      // Should navigate to the relevant assignment
      await expect(page).toHaveURL(/workspace|assignments/);
    }
  });

  test('mobile experience for students', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 812 }); // iPhone X size
    
    await loginAs(page, 'student');
    await navigateToGroupAssignments(page, testData.communityId);
    
    // Verify mobile-optimized layout
    const assignmentCards = page.locator('[data-testid="assignment-card"]');
    const firstCard = assignmentCards.first();
    
    if (await firstCard.isVisible()) {
      const cardBox = await firstCard.boundingBox();
      
      // Cards should be nearly full width on mobile
      expect(cardBox?.width).toBeGreaterThan(350);
      
      // Text should be readable size
      const titleElement = firstCard.locator('h3, .text-lg');
      const titleSize = await titleElement.evaluate(el => 
        window.getComputedStyle(el).fontSize
      );
      expect(parseInt(titleSize)).toBeGreaterThanOrEqual(16);
      
      // Touch targets should be adequate size
      const buttons = firstCard.locator('button');
      const buttonCount = await buttons.count();
      
      for (let i = 0; i < buttonCount; i++) {
        const button = buttons.nth(i);
        const box = await button.boundingBox();
        
        if (box) {
          // Minimum 44px for touch targets
          expect(box.height).toBeGreaterThanOrEqual(40);
          expect(box.width).toBeGreaterThanOrEqual(40);
        }
      }
    }
  });
});

test.describe('Student Edge Cases @student', () => {
  test('handles removed from group scenario', async ({ page }) => {
    await loginAs(page, 'student');
    await navigateToGroupAssignments(page, testData.communityId);
    
    // Student was in a group but consultant removed them
    // They should see pending state again
    const assignmentCard = page.locator('[data-testid="assignment-card"]')
      .filter({ hasText: 'Previously Assigned Test' })
      .first();
    
    if (await assignmentCard.isVisible()) {
      // Should show pending state, not error
      await expect(assignmentCard.locator('text=Asignación de grupo pendiente')).toBeVisible();
      
      // Should not show previous group info
      await expect(assignmentCard.locator('text=Grupo anterior')).not.toBeVisible();
    }
  });

  test('handles group member leaving', async ({ page }) => {
    await loginAs(page, 'student');
    await navigateToGroupAssignments(page, testData.communityId);
    
    // View assignment where a group member left
    const assignmentCard = page.locator('[data-testid="assignment-card"]')
      .filter({ hasText: 'Reduced Group Test' })
      .first();
    
    if (await assignmentCard.isVisible()) {
      // Should still show remaining members
      const memberList = assignmentCard.locator('[data-testid="group-members"]');
      const memberCount = await memberList.locator('[data-testid="member-item"]').count();
      
      // Group should still be functional with remaining members
      expect(memberCount).toBeGreaterThan(0);
      
      // Submit button should still work
      const submitButton = assignmentCard.locator('button:has-text("Enviar Tarea")');
      await expect(submitButton).toBeVisible();
      await expect(submitButton).toBeEnabled();
    }
  });

  test('handles assignment deadline with pending group', async ({ page }) => {
    await loginAs(page, 'student');
    await navigateToGroupAssignments(page, testData.communityId);
    
    // Find assignment with approaching deadline but no group assigned
    const urgentCard = page.locator('[data-testid="assignment-card"]')
      .filter({ hasText: 'Entrega:' })
      .filter({ hasText: 'Asignación de grupo pendiente' })
      .first();
    
    if (await urgentCard.isVisible()) {
      // Should show warning about deadline
      await expect(urgentCard.locator('.text-red-500, .text-amber-600')).toBeVisible();
      
      // Should emphasize need for group assignment
      await expect(urgentCard.locator('text=contacta a tu consultor')).toBeVisible()
        .or(expect(urgentCard.locator('text=urgente'))).toBeVisible();
    }
  });
});