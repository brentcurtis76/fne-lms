import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

// Load environment variables
require('dotenv').config();

// Create Supabase admin client for test data setup
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

// Test data interfaces
interface TestData {
  user: any;
  courseId: string;
  pathId: string;
  pathName: string;
  pathDescription: string;
  courseName: string;
  courseDescription: string;
}

let testData: TestData;

// Helper functions for test data creation and cleanup
async function createTestUser(email: string, password: string) {
  // Create auth user
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true
  });
  
  if (authError) throw authError;
  
  // Create profile with correct schema
  const firstName = 'Learning';
  const lastName = 'Path Tester';
  const { error: profileError } = await supabaseAdmin
    .from('profiles')
    .insert({
      id: authData.user.id,
      email,
      name: `${firstName} ${lastName}`, // Required field
      first_name: firstName,
      last_name: lastName,
      avatar_url: null,
      approval_status: 'approved', // Set to approved for test users
      timezone: 'UTC',
      must_change_password: false // Don't require password change for test users
    });
  
  if (profileError) throw profileError;
  
  // Create a test school for the user
  const { data: school, error: schoolError } = await supabaseAdmin
    .from('schools')
    .select('id')
    .eq('name', 'Test School')
    .single();
  
  let schoolId: string;
  if (schoolError || !school) {
    // Create test school if it doesn't exist
    const { data: newSchool, error: createSchoolError } = await supabaseAdmin
      .from('schools')
      .insert({ 
        name: 'Test School',
        has_generations: false 
      })
      .select()
      .single();
    
    if (createSchoolError) throw createSchoolError;
    schoolId = newSchool.id;
  } else {
    schoolId = school.id;
  }
  
  // Assign role with school context
  const { error: roleError } = await supabaseAdmin
    .from('user_roles')
    .insert({
      user_id: authData.user.id,
      role_type: 'docente',
      is_active: true,
      school_id: schoolId // Required for docente role
    });
  
  if (roleError) throw roleError;
  
  return authData.user;
}

async function cleanupTestUser(userId: string) {
  // Delete user (cascades should handle related data)
  const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (error) console.error('Error deleting test user:', error);
}

test.describe('Learning Paths User Experience', () => {
  test.beforeAll(async () => {
    console.log('Setting up test data for learning paths...');
    
    // 1. Create test user
    const testUser = await createTestUser(
      `learningpath.test.${Date.now()}@example.com`,
      'NuevaEdu2025!'
    );
    
    console.log('Test user created:', testUser.id);
    
    // 2. Create an instructor record first
    const { data: instructor, error: instructorError } = await supabaseAdmin
      .from('instructors')
      .insert({
        full_name: `${testUser.email} (Test Instructor)`
      })
      .select()
      .single();
      
    if (instructorError) {
      console.error('Error creating instructor:', instructorError);
      throw instructorError;
    }
    
    console.log('Instructor created:', instructor.id);
    
    // 3. Create a sample course with valid instructor_id
    const { data: course, error: courseError } = await supabaseAdmin
      .from('courses')
      .insert({
        title: 'Introducción a TypeScript',
        description: 'Aprende los fundamentos de TypeScript para desarrollo web moderno',
        instructor_id: instructor.id, // Use the created instructor's ID
        category: 'programming',
        duration_hours: 20,
        difficulty_level: 'intermediate',
        created_by: testUser.id,
        is_published: true
      })
      .select()
      .single();
    
    if (courseError) {
      console.error('Error creating course:', courseError);
      throw courseError;
    }
    
    console.log('Course created:', course.id);
    
    // 4. Create a learning path
    const { data: path, error: pathError } = await supabaseAdmin
      .from('learning_paths')
      .insert({
        name: 'Ruta de Desarrollo Web Moderno',
        description: 'Domina las tecnologías esenciales para el desarrollo web actual',
        created_by: testUser.id
      })
      .select()
      .single();
    
    if (pathError) {
      console.error('Error creating learning path:', pathError);
      throw pathError;
    }
    
    console.log('Learning path created:', path.id);
    
    // 4. Link course to path
    const { error: linkError } = await supabaseAdmin
      .from('learning_path_courses')
      .insert({
        learning_path_id: path.id,
        course_id: course.id,
        sequence_order: 1
      });
    
    if (linkError) {
      console.error('Error linking course to path:', linkError);
      throw linkError;
    }
    
    console.log('Course linked to path');
    
    // 5. Assign learning path to test user
    const { error: assignError } = await supabaseAdmin
      .from('learning_path_assignments')
      .insert({
        path_id: path.id,
        user_id: testUser.id,
        assigned_by: testUser.id
      });
    
    if (assignError) {
      console.error('Error assigning path to user:', assignError);
      throw assignError;
    }
    
    console.log('Path assigned to user');
    
    // Store test data for use in tests
    testData = {
      user: testUser,
      courseId: course.id,
      pathId: path.id,
      pathName: path.name,
      pathDescription: path.description,
      courseName: course.title,
      courseDescription: course.description
    };
    
    console.log('Test data setup complete');
  });
  
  test.afterAll(async () => {
    console.log('Cleaning up test data...');
    
    // Clean up in reverse order of creation
    if (testData?.pathId) {
      // Delete assignments first
      await supabaseAdmin
        .from('learning_path_assignments')
        .delete()
        .eq('path_id', testData.pathId);
      
      // Delete path-course links
      await supabaseAdmin
        .from('learning_path_courses')
        .delete()
        .eq('learning_path_id', testData.pathId);
      
      // Delete the path
      await supabaseAdmin
        .from('learning_paths')
        .delete()
        .eq('id', testData.pathId);
      console.log('Learning path cleaned up');
    }
    
    if (testData?.courseId) {
      await supabaseAdmin
        .from('courses')
        .delete()
        .eq('id', testData.courseId);
      console.log('Course cleaned up');
    }
    
    if (testData?.user) {
      // Clean up test user
      await cleanupTestUser(testData.user.id);
      console.log('Test user cleaned up');
    }
    
    console.log('Test data cleanup complete');
  });
  
  test('should allow a user to view their learning path and navigate to a course', async ({ page }) => {
    // 1. Navigate to signin page
    await page.goto('/login');
    
    // Fill in login credentials
    await page.fill('input[type="email"]', testData.user.email);
    await page.fill('input[type="password"]', 'NuevaEdu2025!');
    
    // Click sign in button
    await page.click('button[type="submit"]');
    
    // 2. Verify dashboard redirect and navigation
    await expect(page).toHaveURL('/dashboard');
    
    // Navigate to My Paths page
    await page.goto('/my-paths');
    
    // Wait for the page to load
    await page.waitForLoadState('networkidle');
    
    // First, wait for either the paths container or error message to appear  
    // We'll check for the error state specifically since we know that's the issue
    try {
      await page.waitForSelector('.bg-red-50', { timeout: 5000 });
      const errorMessage = page.locator('.bg-red-50');
      const errorText = await errorMessage.textContent();
      throw new Error(`API Error detected on my-paths page: ${errorText}`);
    } catch (timeoutError) {
      // If no error message found within 5 seconds, continue to check for success state
    }
    
    // Check if there's an error state with the specific text
    const errorMessage = page.getByText('Error al cargar');
    const hasError = await errorMessage.isVisible();
    
    if (hasError) {
      const errorText = await errorMessage.textContent();
      throw new Error(`API Error detected on my-paths page: ${errorText}`);
    }
    
    // If no error, proceed to check for learning paths
    // Wait for the main container of all path cards to be ready
    const pathsContainer = page.locator('.grid-cols-1, .grid'); 
    await expect(pathsContainer).toBeVisible();
    
    // Now, find the specific card for our test data within that container
    const pathCard = pathsContainer.getByText(testData.pathName);
    await expect(pathCard).toBeVisible();
    
    // Also check that the description is visible within the same container
    await expect(pathsContainer.getByText(testData.pathDescription)).toBeVisible();
    
    // Mobile UI Fix: Close sidebar if it's open (only on mobile viewports)
    const mobileSidebarCloseButton = page.locator('button[title*="Contraer sidebar"]');
    if (await mobileSidebarCloseButton.isVisible()) {
      console.log('Mobile sidebar detected - closing before clicking path card');
      await mobileSidebarCloseButton.click();
      
      // Wait for sidebar to be fully hidden by checking that the overlay is gone
      const sidebarOverlay = page.locator('.fixed.inset-0.bg-black.bg-opacity-50');
      await expect(sidebarOverlay).toBeHidden();
      
      // Also wait a bit for the sidebar transition animation to complete
      await page.waitForTimeout(500);
    }
    
    // 3. Navigate to Path Details
    // Click on the learning path card
    await pathCard.click();
    
    // Assert URL changed to path details
    await expect(page).toHaveURL(`/my-paths/${testData.pathId}`);
    
    // Wait for the details page to load
    await page.waitForLoadState('networkidle');
    
    // Assert path name and description are visible on details page
    await expect(page.getByRole('heading', { name: testData.pathName })).toBeVisible();
    await expect(page.getByText(testData.pathDescription)).toBeVisible();
    
    // Assert that the course is listed
    await expect(page.getByText(testData.courseName)).toBeVisible();
    await expect(page.getByText(testData.courseDescription)).toBeVisible();
    
    // 4. Navigate to Course
    // Mobile UI Fix: Close sidebar again if it's open on the path details page
    const mobileSidebarCloseButton2 = page.locator('button[title*="Contraer sidebar"]');
    if (await mobileSidebarCloseButton2.isVisible()) {
      console.log('Mobile sidebar detected on path details page - closing before clicking course button');
      await mobileSidebarCloseButton2.click();
      
      // Wait for sidebar to be fully hidden
      const sidebarOverlay2 = page.locator('.fixed.inset-0.bg-black.bg-opacity-50');
      await expect(sidebarOverlay2).toBeHidden();
      
      // Wait for transition animation
      await page.waitForTimeout(500);
    }
    
    // Find and click the "Iniciar Curso" button
    const startCourseButton = page.getByRole('button', { name: /Iniciar Curso|Comenzar|Start Course/i });
    await expect(startCourseButton).toBeVisible();
    await startCourseButton.click();
    
    // Assert URL changed to course page
    await expect(page).toHaveURL(`/courses/${testData.courseId}`);
    
    // Wait for the course page to load
    await page.waitForLoadState('networkidle');
    
    // Assert course title is visible on the course page
    const courseTitle = page.getByRole('heading', { name: testData.courseName, level: 1 });
    await expect(courseTitle).toBeVisible();
  });
});