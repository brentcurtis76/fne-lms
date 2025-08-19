/**
 * Minimal E2E Tests for Course Structure Feature
 * These tests verify core functionality without complex scenarios
 */

import { test, expect } from '@playwright/test';
import { createCompleteTestCourse, validateCourseStructureInDB } from './utils/course-structure-helpers';

test.describe('Course Structure - Core Functionality', () => {
  
  test('should create and validate simple course structure', async () => {
    // Create a simple course
    const { course, lessons, cleanup } = await createCompleteTestCourse('simple', 2);
    
    try {
      // Validate structure in database
      const isValid = await validateCourseStructureInDB(course.id, 'simple');
      expect(isValid).toBe(true);
      
      // Verify lessons exist
      expect(lessons).toHaveLength(2);
      expect(lessons[0].module_id).toBeNull();
      expect(lessons[1].module_id).toBeNull();
      
    } finally {
      await cleanup();
    }
  });
  
  test('should create and validate structured course', async () => {
    // Create a structured course
    const { course, modules, lessons, cleanup } = await createCompleteTestCourse('structured', 3);
    
    try {
      // Validate structure in database
      const isValid = await validateCourseStructureInDB(course.id, 'structured');
      expect(isValid).toBe(true);
      
      // Verify modules exist
      expect(modules).toHaveLength(2);
      
      // Verify lessons have module associations
      expect(lessons).toHaveLength(3);
      const lessonsWithModules = lessons.filter(l => l.module_id !== null);
      expect(lessonsWithModules).toHaveLength(3);
      
    } finally {
      await cleanup();
    }
  });
  
  test('should convert simple course to structured', async () => {
    // Create a simple course
    const { course, cleanup } = await createCompleteTestCourse('simple', 2);
    
    try {
      // Import Supabase for conversion
      const { createClient } = require('@supabase/supabase-js');
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://sxlogxqzmarhqsblxmtj.supabase.co',
        process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI'
      );
      
      // Get direct lessons before conversion
      const { data: directLessonsBefore } = await supabase
        .from('lessons')
        .select('*')
        .eq('course_id', course.id)
        .is('module_id', null);
      
      expect(directLessonsBefore).toHaveLength(2);
      
      // Convert to structured
      // Create a module
      const { data: newModule } = await supabase
        .from('modules')
        .insert({
          course_id: course.id,
          title: 'Converted Module',
          description: 'Module created during conversion',
          order_number: 1
        })
        .select()
        .single();
      
      expect(newModule).toBeTruthy();
      
      // Move lessons to module
      for (const lesson of directLessonsBefore) {
        await supabase
          .from('lessons')
          .update({ module_id: newModule.id })
          .eq('id', lesson.id);
      }
      
      // Update course structure type
      await supabase
        .from('courses')
        .update({ structure_type: 'structured' })
        .eq('id', course.id);
      
      // Validate new structure
      const isValid = await validateCourseStructureInDB(course.id, 'structured');
      expect(isValid).toBe(true);
      
      // Verify no direct lessons remain
      const { data: directLessonsAfter } = await supabase
        .from('lessons')
        .select('*')
        .eq('course_id', course.id)
        .is('module_id', null);
      
      expect(directLessonsAfter).toHaveLength(0);
      
    } finally {
      await cleanup();
    }
  });
  
  test('should convert structured course to simple', async () => {
    // Create a structured course
    const { course, modules, lessons, cleanup } = await createCompleteTestCourse('structured', 2);
    
    try {
      // Import Supabase for conversion
      const { createClient } = require('@supabase/supabase-js');
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://sxlogxqzmarhqsblxmtj.supabase.co',
        process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI'
      );
      
      // Verify initial state
      expect(modules).toHaveLength(2);
      
      // Convert to simple - remove module associations
      for (const lesson of lessons) {
        await supabase
          .from('lessons')
          .update({ module_id: null })
          .eq('id', lesson.id);
      }
      
      // Delete modules
      await supabase
        .from('modules')
        .delete()
        .eq('course_id', course.id);
      
      // Update course structure type
      await supabase
        .from('courses')
        .update({ structure_type: 'simple' })
        .eq('id', course.id);
      
      // Validate new structure
      const isValid = await validateCourseStructureInDB(course.id, 'simple');
      expect(isValid).toBe(true);
      
      // Verify all lessons are direct
      const { data: directLessons } = await supabase
        .from('lessons')
        .select('*')
        .eq('course_id', course.id)
        .is('module_id', null);
      
      expect(directLessons).toHaveLength(2);
      
    } finally {
      await cleanup();
    }
  });
});