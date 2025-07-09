/**
 * Group Assignment helpers for E2E tests
 * Provides utilities for testing consultant-managed groups
 */

import { Page, expect } from '@playwright/test';

export interface TestAssignment {
  id: string;
  title: string;
  isConsultantManaged: boolean;
}

export interface TestGroup {
  name: string;
  memberEmails: string[];
}

/**
 * Navigate to community workspace and group assignments tab
 */
export async function navigateToGroupAssignments(page: Page, communityId?: string) {
  // Navigate to community workspace
  if (communityId) {
    await page.goto(`/community/workspace?id=${communityId}`);
  } else {
    await page.goto('/community/workspace');
  }
  
  // Click on group assignments tab
  await page.click('text=Tareas Grupales');
  
  // Wait for assignments to load
  await page.waitForSelector('[data-testid="group-assignments"], text=Tareas Grupales', { timeout: 10000 });
}

/**
 * Create a new assignment with consultant-managed groups enabled
 */
export async function createConsultantManagedAssignment(
  page: Page,
  title: string,
  description: string
): Promise<string> {
  // This would typically involve navigating to course builder
  // For now, we'll assume the assignment is created via API
  console.log(`Creating consultant-managed assignment: ${title}`);
  
  // Return mock assignment ID
  return 'test-assignment-' + Date.now();
}

/**
 * Open group management modal for an assignment
 */
export async function openGroupManagementModal(page: Page, assignmentTitle: string) {
  // Find the assignment card
  const assignmentCard = page.locator(`[data-testid="assignment-card"]:has-text("${assignmentTitle}")`);
  await expect(assignmentCard).toBeVisible();
  
  // Click the manage groups button
  const manageButton = assignmentCard.locator('button:has-text("Gestionar Grupos")');
  await expect(manageButton).toBeVisible();
  await manageButton.click();
  
  // Wait for modal to open
  await expect(page.locator('[data-testid="group-management-modal"], text=Gestionar Grupos')).toBeVisible();
}

/**
 * Create a new group in the management modal
 */
export async function createGroup(page: Page, groupName: string): Promise<void> {
  // Click new group button
  await page.click('button:has-text("Nuevo Grupo")');
  
  // Find the new group input and update name
  const newGroupInput = page.locator('input[placeholder*="Nombre del grupo"]').last();
  await newGroupInput.clear();
  await newGroupInput.fill(groupName);
}

/**
 * Assign students to a group
 */
export async function assignStudentsToGroup(
  page: Page,
  groupName: string,
  studentEmails: string[]
): Promise<void> {
  // Click on the group to edit it
  const groupCard = page.locator(`[data-testid="group-card"]:has-text("${groupName}")`);
  await groupCard.locator('button:has-text("Editar miembros")').click();
  
  // For each student, find and click them
  for (const email of studentEmails) {
    const studentCard = page.locator(`[data-testid="student-card"]:has-text("${email}")`);
    await studentCard.click();
    
    // Verify the student is marked as selected
    await expect(studentCard).toHaveClass(/border-.*yellow|selected/);
  }
}

/**
 * Save group changes
 */
export async function saveGroups(page: Page): Promise<void> {
  const saveButton = page.locator('button:has-text("Guardar Grupos")');
  await saveButton.click();
  
  // Wait for success message
  await expect(page.locator('text=Grupos guardados exitosamente')).toBeVisible();
  
  // Wait for modal to close
  await expect(page.locator('[data-testid="group-management-modal"]')).not.toBeVisible();
}

/**
 * Verify student sees pending assignment message
 */
export async function verifyPendingAssignment(page: Page, assignmentTitle: string): Promise<void> {
  const assignmentCard = page.locator(`[data-testid="assignment-card"]:has-text("${assignmentTitle}")`);
  await expect(assignmentCard).toBeVisible();
  
  // Check for pending message
  await expect(assignmentCard.locator('text=Asignación de grupo pendiente')).toBeVisible();
  
  // Verify submit button is not available
  const submitButton = assignmentCard.locator('button:has-text("Enviar Tarea")');
  await expect(submitButton).not.toBeVisible();
}

/**
 * Verify student sees their assigned group
 */
export async function verifyAssignedGroup(
  page: Page,
  assignmentTitle: string,
  groupName: string,
  expectedMembers: string[]
): Promise<void> {
  const assignmentCard = page.locator(`[data-testid="assignment-card"]:has-text("${assignmentTitle}")`);
  await expect(assignmentCard).toBeVisible();
  
  // Check for group name
  await expect(assignmentCard.locator(`text=Asignado a: ${groupName}`)).toBeVisible();
  
  // Verify group members are listed
  for (const member of expectedMembers) {
    await expect(assignmentCard.locator(`text=${member}`)).toBeVisible();
  }
  
  // Verify submit button is now available
  const submitButton = assignmentCard.locator('button:has-text("Enviar Tarea")');
  await expect(submitButton).toBeVisible();
  await expect(submitButton).toBeEnabled();
}

/**
 * Submit a group assignment
 */
export async function submitGroupAssignment(
  page: Page,
  assignmentTitle: string,
  filePath?: string
): Promise<void> {
  const assignmentCard = page.locator(`[data-testid="assignment-card"]:has-text("${assignmentTitle}")`);
  
  // Click submit button
  await assignmentCard.locator('button:has-text("Enviar Tarea")').click();
  
  // Wait for submission modal
  await expect(page.locator('[data-testid="submission-modal"]')).toBeVisible();
  
  // If file provided, upload it
  if (filePath) {
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(filePath);
  }
  
  // Add submission comment
  await page.fill('textarea[placeholder*="comentario"]', 'Submission for E2E test');
  
  // Submit
  await page.click('button:has-text("Enviar")');
  
  // Wait for success message
  await expect(page.locator('text=Tarea enviada exitosamente')).toBeVisible();
}

/**
 * Verify consultant can see group overview
 */
export async function verifyGroupOverview(
  page: Page,
  expectedAssignments: number,
  expectedGroups: number,
  expectedUnassigned: number
): Promise<void> {
  // Navigate to overview section
  await page.click('text=Resumen de Grupos');
  
  // Verify stats
  await expect(page.locator(`text=${expectedAssignments} Tareas Gestionadas`)).toBeVisible();
  await expect(page.locator(`text=${expectedGroups} Grupos Totales`)).toBeVisible();
  await expect(page.locator(`text=${expectedUnassigned} Sin Asignar`)).toBeVisible();
}

/**
 * Create test data for group assignments
 */
export async function setupTestData(page: Page) {
  // This would typically involve API calls to create test data
  // For now, we'll assume test data is pre-seeded
  console.log('Setting up test data for group assignments');
  
  return {
    communityId: 'test-community-id',
    assignmentId: 'test-assignment-id',
    studentIds: ['student1-id', 'student2-id', 'student3-id'],
    consultantId: 'consultant-id'
  };
}

/**
 * Clean up test data after tests
 */
export async function cleanupTestData(page: Page) {
  // This would typically involve API calls to clean up test data
  console.log('Cleaning up test data');
}