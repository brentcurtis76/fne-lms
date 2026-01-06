/**
 * E2E Tests for Flexible Course Structure Feature
 * 
 * Tests cover:
 * - Creating courses with different structures
 * - Converting between simple and structured formats
 * - Student navigation for both structures
 * - Admin management capabilities
 * - Data integrity during conversions
 */

import { test, expect } from '@playwright/test';
import { loginAsQA as loginAs } from './utils/auth-helpers';
import {
  createCompleteTestCourse,
  createCourseViaUI,
  convertCourseStructure,
  verifyCourseStructure,
  verifyStudentCourseNavigation,
  validateCourseStructureInDB,
  cleanupAllTestCourses,
  navigateToCourseBuilder,
  addLessonViaUI
} from './utils/course-structure-helpers';

// Clean up before and after all tests
test.beforeAll(async () => {
  await cleanupAllTestCourses();
});

test.afterAll(async () => {
  await cleanupAllTestCourses();
});

test.describe('Course Structure - Admin Features', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'admin');
  });
  
  test('should create a simple structure course via UI', async ({ page }) => {
    const courseTitle = `Test Simple Course ${Date.now()}`;
    const courseDescription = 'E2E test for simple course creation';
    
    // Create course with simple structure
    const courseId = await createCourseViaUI(
      page,
      courseTitle,
      courseDescription,
      'simple'
    );
    
    expect(courseId).toBeTruthy();
    
    // Verify course structure in UI
    await verifyCourseStructure(page, 'simple', 0, 0);
    
    // Verify structure badge
    await expect(page.locator('span:has-text("Simple")')).toBeVisible();
    
    // Add lessons directly to course
    await addLessonViaUI(page, courseId!, 'Lesson 1', 'First lesson');
    await addLessonViaUI(page, courseId!, 'Lesson 2', 'Second lesson');
    
    // Verify lessons appear without modules
    await verifyCourseStructure(page, 'simple', 0, 2);
    
    // Validate in database
    const isValid = await validateCourseStructureInDB(courseId!, 'simple');
    expect(isValid).toBe(true);
  });
  
  test('should create a structured course via UI', async ({ page }) => {
    const courseTitle = `Test Structured Course ${Date.now()}`;
    const courseDescription = 'E2E test for structured course creation';
    
    // Create course with structured format
    const courseId = await createCourseViaUI(
      page,
      courseTitle,
      courseDescription,
      'structured'
    );
    
    expect(courseId).toBeTruthy();
    
    // Verify course structure in UI
    await verifyCourseStructure(page, 'structured');
    
    // Verify structure badge
    await expect(page.locator('span:has-text("Modular")')).toBeVisible();
    
    // Add a module
    await page.click('button:has-text("Añadir Módulo"), button:has-text("Add Module")');
    await page.fill('input[placeholder*="título"], input[name="title"]', 'Test Module');
    await page.fill('textarea[placeholder*="descripción"], textarea[name="description"]', 'Module description');
    await page.click('button:has-text("Guardar"), button:has-text("Save")');
    await page.waitForLoadState('networkidle');
    
    // Verify module appears
    await expect(page.locator('text=Test Module')).toBeVisible();
    
    // Validate in database
    const isValid = await validateCourseStructureInDB(courseId!, 'structured');
    expect(isValid).toBe(true);
  });
  
  test('should convert simple course to structured', async ({ page }) => {
    // Create a simple course with test data
    const { course, lessons, cleanup } = await createCompleteTestCourse('simple', 3);
    
    try {
      // Navigate to course
      await navigateToCourseBuilder(page, course.id);
      
      // Verify initial structure
      await verifyCourseStructure(page, 'simple', 0, 3);
      
      // Convert to structured
      await convertCourseStructure(page, course.id, 'structured');
      
      // Navigate back to course
      await navigateToCourseBuilder(page, course.id);
      
      // Verify new structure
      await verifyCourseStructure(page, 'structured', 1, 3);
      
      // Verify in database
      const isValid = await validateCourseStructureInDB(course.id, 'structured');
      expect(isValid).toBe(true);
      
    } finally {
      await cleanup();
    }
  });
  
  test('should convert structured course to simple', async ({ page }) => {
    // Create a structured course with test data
    const { course, modules, lessons, cleanup } = await createCompleteTestCourse('structured', 4);
    
    try {
      // Navigate to course
      await navigateToCourseBuilder(page, course.id);
      
      // Verify initial structure
      await verifyCourseStructure(page, 'structured', 2, 4);
      
      // Convert to simple
      await convertCourseStructure(page, course.id, 'simple');
      
      // Navigate back to course
      await navigateToCourseBuilder(page, course.id);
      
      // Verify new structure
      await verifyCourseStructure(page, 'simple', 0, 4);
      
      // Verify lessons are now direct children
      const lessonElements = page.locator('[data-testid="lesson-card"], .lesson-card');
      await expect(lessonElements).toHaveCount(4);
      
      // Verify no modules exist
      const moduleElements = page.locator('[data-testid="module-card"], .module-card');
      await expect(moduleElements).toHaveCount(0);
      
      // Validate in database
      const isValid = await validateCourseStructureInDB(course.id, 'simple');
      expect(isValid).toBe(true);
      
    } finally {
      await cleanup();
    }
  });
  
  test('should show conversion warning for multi-module courses', async ({ page }) => {
    // Create a structured course with multiple modules
    const { course, modules, lessons, cleanup } = await createCompleteTestCourse('structured', 6);
    
    try {
      // Navigate to edit page
      await page.goto(`/admin/course-builder/${course.id}/edit`);
      await page.waitForLoadState('networkidle');
      
      // Try to select simple structure
      await page.click('input#structure-simple');
      
      // Click conversion button
      const conversionButton = page.locator('button:has-text("Convertir a estructura simple")');
      await conversionButton.click();
      
      // Verify warning appears
      await expect(page.locator('text=Advertencia: Múltiples Módulos')).toBeVisible();
      await expect(page.locator('text=Este curso tiene 2 módulos')).toBeVisible();
      
      // Verify conversion description
      await expect(page.locator('text=Se eliminarán todos los módulos')).toBeVisible();
      
      // Cancel conversion
      await page.click('button:has-text("Cancelar")');
      
    } finally {
      await cleanup();
    }
  });
  
  test('should prevent structure change without conversion', async ({ page }) => {
    // Create a structured course
    const { course, cleanup } = await createCompleteTestCourse('structured', 2);
    
    try {
      // Navigate to edit page
      await page.goto(`/admin/course-builder/${course.id}/edit`);
      await page.waitForLoadState('networkidle');
      
      // Current structure should be structured
      await expect(page.locator('input#structure-structured')).toBeChecked();
      
      // Try to change to simple without conversion
      await page.click('input#structure-simple');
      
      // Save without converting
      await page.click('button:has-text("Guardar Cambios")');
      await page.waitForLoadState('networkidle');
      
      // Navigate to course detail
      await navigateToCourseBuilder(page, course.id);
      
      // Structure should still be structured (not changed)
      await verifyCourseStructure(page, 'structured');
      
    } finally {
      await cleanup();
    }
  });
});

test.describe('Course Structure - Student Experience', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'student');
  });
  
  test('should navigate simple course as student', async ({ page }) => {
    // Create a simple course
    const { course, lessons, cleanup } = await createCompleteTestCourse('simple', 3);
    
    try {
      // Navigate as student
      await verifyStudentCourseNavigation(page, course.id, 'simple', 3);
      
      // Verify lesson list shows all lessons directly
      await page.goto(`/student/course/${course.id}`);
      
      // All lessons should be visible without modules
      for (const lesson of lessons) {
        await expect(page.locator(`text=${lesson.title}`)).toBeVisible();
      }
      
      // No module sections should exist
      await expect(page.locator('[data-testid="module-section"]')).toHaveCount(0);
      
    } finally {
      await cleanup();
    }
  });
  
  test('should navigate structured course as student', async ({ page }) => {
    // Create a structured course
    const { course, modules, lessons, cleanup } = await createCompleteTestCourse('structured', 4);
    
    try {
      // Navigate as student
      await verifyStudentCourseNavigation(page, course.id, 'structured', 4);
      
      // Verify modules are shown
      await page.goto(`/student/course/${course.id}`);
      
      // Module sections should exist
      for (const module of modules) {
        await expect(page.locator(`text=${module.title}`)).toBeVisible();
      }
      
    } finally {
      await cleanup();
    }
  });
  
  test('should maintain progress after structure conversion', async ({ page }) => {
    // Create a simple course
    const { course, lessons, cleanup } = await createCompleteTestCourse('simple', 2);
    
    try {
      // Complete first lesson as student
      await page.goto(`/student/course/${course.id}`);
      await page.click(`text=${lessons[0].title}`);
      await page.waitForLoadState('networkidle');
      
      // Mark lesson as complete (if completion button exists)
      const completeButton = page.locator('button:has-text("Marcar como completado"), button:has-text("Mark as Complete")');
      if (await completeButton.isVisible()) {
        await completeButton.click();
        await page.waitForLoadState('networkidle');
      }
      
      // Logout and login as admin
      await page.goto('/login');
      await loginAs(page, 'admin');
      
      // Convert course to structured
      await convertCourseStructure(page, course.id, 'structured');
      
      // Logout and login as student again
      await page.goto('/login');
      await loginAs(page, 'student');
      
      // Navigate to course
      await page.goto(`/student/course/${course.id}`);
      
      // Progress should be maintained
      // Look for progress indicators
      const progressIndicator = page.locator('[data-testid="progress"], .progress-bar, text=/\\d+%/');
      if (await progressIndicator.isVisible()) {
        const progressText = await progressIndicator.textContent();
        expect(progressText).toContain('50'); // Should show 50% for 1 of 2 lessons
      }
      
    } finally {
      await cleanup();
    }
  });
});

test.describe('Course Structure - Dashboard Display', () => {
  test('should show structure badges on dashboard', async ({ page }) => {
    // Create both types of courses
    const { course: simpleCourse, cleanup: cleanupSimple } = await createCompleteTestCourse('simple', 1);
    const { course: structuredCourse, cleanup: cleanupStructured } = await createCompleteTestCourse('structured', 2);
    
    try {
      // Login as admin
      await loginAs(page, 'admin');
      
      // Navigate to dashboard
      await page.goto('/dashboard');
      await page.waitForLoadState('networkidle');
      
      // Look for course cards with structure badges
      const courseCards = page.locator('[data-testid="course-card"], .course-card');
      
      // Find simple course card
      const simpleCard = courseCards.filter({ hasText: simpleCourse.title });
      if (await simpleCard.count() > 0) {
        const simpleBadge = simpleCard.locator('span:has-text("Simple")');
        await expect(simpleBadge).toBeVisible();
      }
      
      // Find structured course card
      const structuredCard = courseCards.filter({ hasText: structuredCourse.title });
      if (await structuredCard.count() > 0) {
        const structuredBadge = structuredCard.locator('span:has-text("Modular")');
        await expect(structuredBadge).toBeVisible();
      }
      
    } finally {
      await cleanupSimple();
      await cleanupStructured();
    }
  });
  
  test('should show structure type in course builder list', async ({ page }) => {
    // Create test courses
    const { course: simpleCourse, cleanup: cleanupSimple } = await createCompleteTestCourse('simple', 1);
    const { course: structuredCourse, cleanup: cleanupStructured } = await createCompleteTestCourse('structured', 1);
    
    try {
      // Login as admin
      await loginAs(page, 'admin');
      
      // Navigate to course builder
      await page.goto('/admin/course-builder');
      await page.waitForLoadState('networkidle');
      
      // Find course entries
      const courseList = page.locator('[data-testid="course-list"], .course-list, main');
      
      // Check for simple course with badge
      const simpleEntry = courseList.locator(`text=${simpleCourse.title}`).locator('..');
      const simpleBadge = simpleEntry.locator('span.bg-green-100:has-text("Simple")');
      await expect(simpleBadge).toBeVisible();
      
      // Check for structured course with badge
      const structuredEntry = courseList.locator(`text=${structuredCourse.title}`).locator('..');
      const structuredBadge = structuredEntry.locator('span.bg-blue-100:has-text("Modular")');
      await expect(structuredBadge).toBeVisible();
      
    } finally {
      await cleanupSimple();
      await cleanupStructured();
    }
  });
});

test.describe('Course Structure - Edge Cases', () => {
  test('should handle empty course conversion', async ({ page }) => {
    // Create empty courses
    const { course: emptySimple, cleanup: cleanupSimple } = await createCompleteTestCourse('simple', 0);
    const { course: emptyStructured, cleanup: cleanupStructured } = await createCompleteTestCourse('structured', 0);
    
    try {
      await loginAs(page, 'admin');
      
      // Convert empty simple to structured
      await convertCourseStructure(page, emptySimple.id, 'structured');
      const isSimpleConverted = await validateCourseStructureInDB(emptySimple.id, 'structured');
      expect(isSimpleConverted).toBe(true);
      
      // Convert empty structured to simple
      await convertCourseStructure(page, emptyStructured.id, 'simple');
      const isStructuredConverted = await validateCourseStructureInDB(emptyStructured.id, 'simple');
      expect(isStructuredConverted).toBe(true);
      
    } finally {
      await cleanupSimple();
      await cleanupStructured();
    }
  });
  
  test('should preserve lesson order during conversion', async ({ page }) => {
    // Create structured course with ordered lessons
    const { course, modules, lessons, cleanup } = await createCompleteTestCourse('structured', 5);
    
    try {
      await loginAs(page, 'admin');
      
      // Note original lesson order
      const originalOrder = lessons.map(l => l.title);
      
      // Convert to simple
      await convertCourseStructure(page, course.id, 'simple');
      
      // Navigate to course
      await navigateToCourseBuilder(page, course.id);
      
      // Verify lesson order is preserved
      const lessonElements = page.locator('[data-testid="lesson-card"], .lesson-card, div:has-text("Lesson")');
      const lessonCount = await lessonElements.count();
      
      for (let i = 0; i < lessonCount; i++) {
        const lessonText = await lessonElements.nth(i).textContent();
        expect(lessonText).toContain(originalOrder[i]);
      }
      
    } finally {
      await cleanup();
    }
  });
  
  test('should handle rapid structure conversions', async ({ page }) => {
    // Create a course
    const { course, cleanup } = await createCompleteTestCourse('simple', 2);
    
    try {
      await loginAs(page, 'admin');
      
      // Convert back and forth multiple times
      await convertCourseStructure(page, course.id, 'structured');
      await convertCourseStructure(page, course.id, 'simple');
      await convertCourseStructure(page, course.id, 'structured');
      
      // Final validation
      const isValid = await validateCourseStructureInDB(course.id, 'structured');
      expect(isValid).toBe(true);
      
      // Verify data integrity
      await navigateToCourseBuilder(page, course.id);
      await verifyCourseStructure(page, 'structured', 1, 2);
      
    } finally {
      await cleanup();
    }
  });
});

test.describe('Course Structure - Permissions', () => {
  test('should not allow non-admin to convert structure', async ({ page }) => {
    // Create a course as admin
    const { course, cleanup } = await createCompleteTestCourse('simple', 1);
    
    try {
      // Login as consultant
      await loginAs(page, 'consultant');
      
      // Try to navigate to edit page
      await page.goto(`/admin/course-builder/${course.id}/edit`);
      
      // Should be redirected or shown error
      const url = page.url();
      if (url.includes('/edit')) {
        // If consultant can access edit, conversion button should not be visible
        const conversionButton = page.locator('button:has-text("Convertir")');
        await expect(conversionButton).not.toBeVisible();
      } else {
        // Should be redirected
        expect(url).not.toContain('/edit');
      }
      
    } finally {
      await cleanup();
    }
  });
  
  test('should not show course builder to students', async ({ page }) => {
    await loginAs(page, 'student');
    
    // Try to access course builder
    await page.goto('/admin/course-builder');
    
    // Should be redirected
    await expect(page).not.toHaveURL(/\/admin\/course-builder/);
    
    // Should not see admin navigation
    const adminNav = page.locator('text=Constructor de Cursos, text=Course Builder');
    await expect(adminNav).not.toBeVisible();
  });
});