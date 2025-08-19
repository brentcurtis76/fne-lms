/**
 * Course structure test helpers
 * Provides utilities for testing flexible course structures
 */

import { Page, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client for test data setup
// Use production database if local is not available
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://sxlogxqzmarhqsblxmtj.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export interface TestCourse {
  id?: string;
  title: string;
  description: string;
  structure_type: 'simple' | 'structured';
  instructor_id?: string;
}

export interface TestModule {
  id?: string;
  course_id: string;
  title: string;
  description: string;
  order_number: number;
}

export interface TestLesson {
  id?: string;
  course_id: string;
  module_id?: string | null;
  title: string;
  order_number: number;
  content?: any; // Content is stored as JSONB
  lesson_type?: string;
}

/**
 * Create a test course with specified structure
 */
export async function createTestCourse(
  courseData: TestCourse
): Promise<{ course: any; cleanup: () => Promise<void> }> {
  console.log(`📚 Creating test course: ${courseData.title} (${courseData.structure_type})`);
  
  const { data: course, error } = await supabase
    .from('courses')
    .insert({
      ...courseData,
      created_at: new Date().toISOString()
    })
    .select()
    .single();
  
  if (error) {
    throw new Error(`Failed to create test course: ${error.message}`);
  }
  
  console.log(`✅ Created course with ID: ${course.id}`);
  
  // Return cleanup function
  const cleanup = async () => {
    console.log(`🧹 Cleaning up course: ${course.id}`);
    
    // Delete all blocks from lessons in this course
    const { data: lessons } = await supabase
      .from('lessons')
      .select('id')
      .eq('course_id', course.id);
    
    if (lessons && lessons.length > 0) {
      const lessonIds = lessons.map(l => l.id);
      await supabase
        .from('blocks')
        .delete()
        .in('lesson_id', lessonIds);
    }
    
    // Delete all lessons
    await supabase
      .from('lessons')
      .delete()
      .eq('course_id', course.id);
    
    // Delete all modules
    await supabase
      .from('modules')
      .delete()
      .eq('course_id', course.id);
    
    // Delete the course
    await supabase
      .from('courses')
      .delete()
      .eq('id', course.id);
    
    console.log(`✅ Cleaned up course: ${course.id}`);
  };
  
  return { course, cleanup };
}

/**
 * Create a test module for a structured course
 */
export async function createTestModule(moduleData: TestModule): Promise<any> {
  console.log(`📦 Creating test module: ${moduleData.title}`);
  
  const { data: module, error } = await supabase
    .from('modules')
    .insert({
      ...moduleData,
      created_at: new Date().toISOString()
    })
    .select()
    .single();
  
  if (error) {
    throw new Error(`Failed to create test module: ${error.message}`);
  }
  
  console.log(`✅ Created module with ID: ${module.id}`);
  return module;
}

/**
 * Create a test lesson
 */
export async function createTestLesson(lessonData: TestLesson): Promise<any> {
  console.log(`📝 Creating test lesson: ${lessonData.title}`);
  
  // Prepare lesson data according to actual schema
  const lessonToInsert = {
    course_id: lessonData.course_id,
    module_id: lessonData.module_id || null,
    title: lessonData.title,
    order_number: lessonData.order_number,
    content: lessonData.content || [],  // Content is JSONB, default to empty array
    lesson_type: lessonData.lesson_type || 'standard',
    is_mandatory: true,
    has_files: false,
    has_entry_quiz: false,
    has_exit_quiz: false,
    created_at: new Date().toISOString()
  };
  
  const { data: lesson, error } = await supabase
    .from('lessons')
    .insert(lessonToInsert)
    .select()
    .single();
  
  if (error) {
    throw new Error(`Failed to create test lesson: ${error.message}`);
  }
  
  console.log(`✅ Created lesson with ID: ${lesson.id}`);
  return lesson;
}

/**
 * Create a complete test course with modules and lessons
 */
export async function createCompleteTestCourse(
  structureType: 'simple' | 'structured',
  lessonCount: number = 3
): Promise<{ course: any; modules: any[]; lessons: any[]; cleanup: () => Promise<void> }> {
  
  // Use test namespace to avoid conflicts with production
  const testNamespace = process.env.TEST_NAMESPACE || `e2e_test_${Date.now()}`;
  const courseTitle = `Test ${structureType} Course ${testNamespace}`;
  
  // First, we need to get or create an instructor
  const { data: instructors } = await supabase
    .from('instructors')
    .select('id')
    .limit(1);
  
  let instructorId;
  if (instructors && instructors.length > 0) {
    instructorId = instructors[0].id;
  } else {
    // Create a test instructor
    const { data: newInstructor } = await supabase
      .from('instructors')
      .insert({
        full_name: 'Test Instructor',
        email: `instructor_${testNamespace}@test.local`,
        bio: 'Test instructor for E2E tests'
      })
      .select()
      .single();
    
    instructorId = newInstructor?.id;
  }
  
  // Create course
  const { course, cleanup } = await createTestCourse({
    title: courseTitle,
    description: `Test course for ${structureType} structure E2E tests`,
    structure_type: structureType,
    instructor_id: instructorId
  });
  
  const modules: any[] = [];
  const lessons: any[] = [];
  
  if (structureType === 'structured') {
    // Create modules for structured course
    const module1 = await createTestModule({
      course_id: course.id,
      title: 'Module 1',
      description: 'First test module',
      order_number: 1
    });
    modules.push(module1);
    
    const module2 = await createTestModule({
      course_id: course.id,
      title: 'Module 2',
      description: 'Second test module',
      order_number: 2
    });
    modules.push(module2);
    
    // Create lessons in modules
    for (let i = 0; i < lessonCount; i++) {
      const moduleId = i < Math.ceil(lessonCount / 2) ? module1.id : module2.id;
      const lesson = await createTestLesson({
        course_id: course.id,
        module_id: moduleId,
        title: `Lesson ${i + 1}`,
        order_number: i + 1,
        content: [{ type: 'text', content: `Content for lesson ${i + 1}` }]
      });
      lessons.push(lesson);
    }
  } else {
    // Create direct lessons for simple course
    for (let i = 0; i < lessonCount; i++) {
      const lesson = await createTestLesson({
        course_id: course.id,
        module_id: null,
        title: `Lesson ${i + 1}`,
        order_number: i + 1,
        content: [{ type: 'text', content: `Content for lesson ${i + 1}` }]
      });
      lessons.push(lesson);
    }
  }
  
  console.log(`✅ Created complete ${structureType} course with ${lessons.length} lessons`);
  
  return { course, modules, lessons, cleanup };
}

/**
 * Navigate to course builder and verify structure
 */
export async function navigateToCourseBuilder(page: Page, courseId: string) {
  await page.goto(`/admin/course-builder/${courseId}`);
  await page.waitForLoadState('networkidle');
  
  // Verify page loaded
  await expect(page.locator('h1')).toBeVisible();
}

/**
 * Verify course structure in the UI
 */
export async function verifyCourseStructure(
  page: Page,
  expectedStructure: 'simple' | 'structured',
  moduleCount?: number,
  lessonCount?: number
) {
  // Check for structure badge
  const structureBadge = page.locator(
    `span:has-text("${expectedStructure === 'simple' ? 'Simple' : 'Modular'}")`
  );
  await expect(structureBadge).toBeVisible();
  
  if (expectedStructure === 'structured' && moduleCount !== undefined) {
    // Verify modules are visible
    const moduleElements = page.locator('[data-testid="module-card"], .module-card, div:has-text("Módulo")');
    await expect(moduleElements).toHaveCount(moduleCount);
  }
  
  if (lessonCount !== undefined) {
    // Verify lessons are visible
    const lessonElements = page.locator('[data-testid="lesson-card"], .lesson-card, div:has-text("Lección")');
    await expect(lessonElements).toHaveCount(lessonCount);
  }
}

/**
 * Convert course structure via UI
 */
export async function convertCourseStructure(
  page: Page,
  courseId: string,
  targetStructure: 'simple' | 'structured'
) {
  // Navigate to course edit page
  await page.goto(`/admin/course-builder/${courseId}/edit`);
  await page.waitForLoadState('networkidle');
  
  // Select target structure
  const radioSelector = targetStructure === 'simple' 
    ? 'input#structure-simple'
    : 'input#structure-structured';
  
  await page.click(radioSelector);
  
  // Look for conversion button
  const conversionButton = page.locator(
    `button:has-text("Convertir a estructura ${targetStructure === 'simple' ? 'simple' : 'modular'}")`
  );
  
  if (await conversionButton.isVisible()) {
    // Click conversion button
    await conversionButton.click();
    
    // Wait for modal
    await expect(page.locator('text=Convertir Estructura del Curso')).toBeVisible();
    
    // Confirm conversion
    await page.click('button:has-text("Convertir Estructura")');
    
    // Wait for conversion to complete
    await page.waitForLoadState('networkidle');
    
    // Wait for success message or page reload
    await page.waitForTimeout(2000);
  }
  
  // Save changes
  await page.click('button:has-text("Guardar Cambios")');
  
  // Wait for save to complete
  await page.waitForLoadState('networkidle');
}

/**
 * Verify student can navigate course
 */
export async function verifyStudentCourseNavigation(
  page: Page,
  courseId: string,
  structureType: 'simple' | 'structured',
  lessonCount: number
) {
  // Navigate to student course view
  await page.goto(`/student/course/${courseId}`);
  await page.waitForLoadState('networkidle');
  
  if (structureType === 'simple') {
    // Verify direct lesson navigation
    const lessonLinks = page.locator('a[href*="/student/course/"][href*="/lesson/"]');
    await expect(lessonLinks).toHaveCount(lessonCount);
    
    // Try navigating to first lesson
    await lessonLinks.first().click();
    await page.waitForLoadState('networkidle');
    
    // Verify lesson page loaded
    await expect(page.locator('h1, h2').first()).toBeVisible();
    
    // Check for navigation buttons
    const nextButton = page.locator('button:has-text("Siguiente"), button:has-text("Next")');
    if (lessonCount > 1) {
      await expect(nextButton).toBeVisible();
    }
  } else {
    // Verify module-based navigation
    const moduleElements = page.locator('[data-testid="module-section"], .module-section, div:has-text("Módulo")');
    await expect(moduleElements.first()).toBeVisible();
    
    // Expand first module if needed
    const expandButton = page.locator('button[aria-expanded="false"]').first();
    if (await expandButton.isVisible()) {
      await expandButton.click();
    }
    
    // Click first lesson
    const firstLesson = page.locator('a[href*="/lesson/"]').first();
    await firstLesson.click();
    await page.waitForLoadState('networkidle');
    
    // Verify lesson loaded
    await expect(page.locator('h1, h2').first()).toBeVisible();
  }
}

/**
 * Create course via UI
 */
export async function createCourseViaUI(
  page: Page,
  title: string,
  description: string,
  structureType: 'simple' | 'structured'
) {
  // Navigate to course builder
  await page.goto('/admin/course-builder');
  await page.waitForLoadState('networkidle');
  
  // Click create course button
  await page.click('button:has-text("Crear Nuevo Curso"), button:has-text("Create New Course")');
  
  // Fill course form
  await page.fill('input[id="title"], input[name="title"]', title);
  await page.fill('textarea[id="description"], textarea[name="description"]', description);
  
  // Select structure type
  const radioSelector = structureType === 'simple' 
    ? 'input#structure-simple'
    : 'input#structure-structured';
  
  await page.click(radioSelector);
  
  // Submit form
  await page.click('button[type="submit"]:has-text("Crear Curso"), button[type="submit"]:has-text("Create Course")');
  
  // Wait for redirect to course detail page
  await page.waitForURL(/\/admin\/course-builder\/[a-f0-9-]+/);
  await page.waitForLoadState('networkidle');
  
  // Extract course ID from URL
  const url = page.url();
  const courseId = url.match(/course-builder\/([a-f0-9-]+)/)?.[1];
  
  return courseId;
}

/**
 * Add lesson to course via UI
 */
export async function addLessonViaUI(
  page: Page,
  courseId: string,
  lessonTitle: string,
  lessonDescription: string,
  moduleId?: string
) {
  // Navigate to course detail page
  await page.goto(`/admin/course-builder/${courseId}`);
  await page.waitForLoadState('networkidle');
  
  if (moduleId) {
    // Find module and add lesson to it
    const moduleSection = page.locator(`[data-module-id="${moduleId}"], div:has-text("Módulo")`).first();
    const addLessonButton = moduleSection.locator('button:has-text("Añadir Lección"), button:has-text("Add Lesson")');
    await addLessonButton.click();
  } else {
    // Add direct lesson for simple course
    await page.click('button:has-text("Añadir Lección"), button:has-text("Add Lesson")');
  }
  
  // Fill lesson form
  await page.fill('input[placeholder*="título"], input[name="title"]', lessonTitle);
  await page.fill('textarea[placeholder*="descripción"], textarea[name="description"]', lessonDescription);
  
  // Save lesson
  await page.click('button:has-text("Guardar"), button:has-text("Save")');
  
  // Wait for save to complete
  await page.waitForLoadState('networkidle');
}

/**
 * Validate course structure in database
 */
export async function validateCourseStructureInDB(
  courseId: string,
  expectedStructure: 'simple' | 'structured'
): Promise<boolean> {
  const { data: course } = await supabase
    .from('courses')
    .select('structure_type')
    .eq('id', courseId)
    .single();
  
  if (!course) {
    throw new Error(`Course ${courseId} not found in database`);
  }
  
  const isValid = course.structure_type === expectedStructure;
  
  if (expectedStructure === 'simple') {
    // Check that no modules exist
    const { data: modules } = await supabase
      .from('modules')
      .select('id')
      .eq('course_id', courseId);
    
    const hasNoModules = !modules || modules.length === 0;
    
    // Check that lessons have no module_id
    const { data: lessons } = await supabase
      .from('lessons')
      .select('module_id')
      .eq('course_id', courseId);
    
    const allLessonsAreDirect = lessons?.every(l => l.module_id === null) ?? true;
    
    return isValid && hasNoModules && allLessonsAreDirect;
  } else {
    // For structured courses, just verify the type
    return isValid;
  }
}

/**
 * Clean up all test courses created during tests
 */
export async function cleanupAllTestCourses() {
  console.log('🧹 Cleaning up all test courses...');
  
  // Find all test courses (those with "Test" in title)
  const { data: testCourses } = await supabase
    .from('courses')
    .select('id')
    .like('title', '%Test%Course%');
  
  if (testCourses && testCourses.length > 0) {
    for (const course of testCourses) {
      // Delete all related data
      const { data: lessons } = await supabase
        .from('lessons')
        .select('id')
        .eq('course_id', course.id);
      
      if (lessons && lessons.length > 0) {
        const lessonIds = lessons.map(l => l.id);
        await supabase
          .from('blocks')
          .delete()
          .in('lesson_id', lessonIds);
      }
      
      await supabase
        .from('lessons')
        .delete()
        .eq('course_id', course.id);
      
      await supabase
        .from('modules')
        .delete()
        .eq('course_id', course.id);
      
      await supabase
        .from('courses')
        .delete()
        .eq('id', course.id);
    }
    
    console.log(`✅ Cleaned up ${testCourses.length} test courses`);
  }
}