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
  adminUser: any;
  regularUser: any;
  instructorId: string;
  courseId: string;
  pathId?: string;
  schoolId: string;
}

let testData: TestData;

// Helper functions for test data creation and cleanup
async function createTestUser(email: string, password: string, role: 'admin' | 'docente' = 'docente') {
  // Create auth user
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true
  });
  
  if (authError) throw authError;
  
  // Create profile with correct schema
  const firstName = role === 'admin' ? 'Admin' : 'Regular';
  const lastName = 'Test User';
  const { error: profileError } = await supabaseAdmin
    .from('profiles')
    .insert({
      id: authData.user.id,
      email,
      name: `${firstName} ${lastName}`,
      first_name: firstName,
      last_name: lastName,
      avatar_url: null,
      approval_status: 'approved',
      timezone: 'UTC',
      must_change_password: false
    });
  
  if (profileError) throw profileError;
  
  // Use existing school instead of creating new one to avoid RLS issues
  const { data: schools, error: schoolError } = await supabaseAdmin
    .from('schools')
    .select('id')
    .limit(1);
  
  if (schoolError || !schools || schools.length === 0) {
    throw new Error('No schools available for testing. Please ensure at least one school exists in the database.');
  }
  
  const schoolId = schools[0].id;
  
  // Assign role with school context
  const { error: roleError } = await supabaseAdmin
    .from('user_roles')
    .insert({
      user_id: authData.user.id,
      role_type: role,
      is_active: true,
      school_id: role === 'docente' ? schoolId : null
    });
  
  if (roleError) throw roleError;
  
  return { user: authData.user, schoolId };
}

async function cleanupTestUser(userId: string) {
  // Delete user (cascades should handle related data)
  const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (error) console.error('Error deleting test user:', error);
}

test.describe('Admin Learning Paths Management', () => {
  test.beforeAll(async () => {
    console.log('Setting up test data for admin learning paths...');
    
    // 1. Create admin test user
    const { user: adminUser, schoolId } = await createTestUser(
      `admin.learningpath.test.${Date.now()}@example.com`,
      'NuevaEdu2025!',
      'admin'
    );
    
    console.log('Admin test user created:', adminUser.id);
    
    // 2. Create regular test user for assignment testing
    const { user: regularUser } = await createTestUser(
      `regular.learningpath.test.${Date.now()}@example.com`,
      'NuevaEdu2025!',
      'docente'
    );
    
    console.log('Regular test user created:', regularUser.id);
    
    // 3. Create an instructor record for courses
    const { data: instructor, error: instructorError } = await supabaseAdmin
      .from('instructors')
      .insert({
        full_name: `${adminUser.email} (Test Instructor)`
      })
      .select()
      .single();
      
    if (instructorError) {
      console.error('Error creating instructor:', instructorError);
      throw instructorError;
    }
    
    console.log('Instructor created:', instructor.id);
    
    // 4. Create a sample course for path creation
    const { data: course, error: courseError } = await supabaseAdmin
      .from('courses')
      .insert({
        title: 'Curso de Prueba para Rutas Admin',
        description: 'Curso creado específicamente para testing de rutas de aprendizaje',
        instructor_id: instructor.id,
        category: 'programming',
        duration_hours: 15,
        difficulty_level: 'beginner',
        created_by: adminUser.id,
        is_published: true
      })
      .select()
      .single();
    
    if (courseError) {
      console.error('Error creating course:', courseError);
      throw courseError;
    }
    
    console.log('Course created:', course.id);
    
    // Store test data for use in tests
    testData = {
      adminUser,
      regularUser,
      instructorId: instructor.id,
      courseId: course.id,
      schoolId
    };
    
    console.log('Test data setup complete');
  });
  
  test.afterAll(async () => {
    console.log('Cleaning up admin test data...');
    
    // Clean up learning path if created
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
    
    // Clean up instructor
    if (testData?.instructorId) {
      await supabaseAdmin
        .from('instructors')
        .delete()
        .eq('id', testData.instructorId);
      console.log('Instructor cleaned up');
    }
    
    if (testData?.adminUser) {
      await cleanupTestUser(testData.adminUser.id);
      console.log('Admin test user cleaned up');
    }
    
    if (testData?.regularUser) {
      await cleanupTestUser(testData.regularUser.id);
      console.log('Regular test user cleaned up');
    }
    
    console.log('Admin test data cleanup complete');
  });
  
  test('should allow admin to access learning paths management page', async ({ page }) => {
    // Login as admin
    await page.goto('/login');
    
    // Fill in login credentials
    await page.fill('input[type="email"]', testData.adminUser.email);
    await page.fill('input[type="password"]', 'NuevaEdu2025!');
    
    // Click sign in button
    await page.click('button[type="submit"]');
    
    // Verify dashboard redirect
    await expect(page).toHaveURL('/dashboard');
    
    // Navigate to admin learning paths page
    await page.goto('/admin/learning-paths');
    
    // Wait for page to load
    await page.waitForLoadState('networkidle');
    
    // Verify we're on the admin learning paths page
    await expect(page).toHaveURL('/admin/learning-paths');
    
    // Verify key elements are visible (use first() to avoid strict mode violations)
    await expect(page.getByRole('heading', { name: /rutas de aprendizaje/i }).first()).toBeVisible();
    await expect(page.getByText(/crea y gestiona rutas de aprendizaje/i).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /crear nueva ruta/i })).toBeVisible();
  });

  test('should create a new learning path with course selection', async ({ page }) => {
    // Login as admin
    await page.goto('/login');
    await page.fill('input[type="email"]', testData.adminUser.email);
    await page.fill('input[type="password"]', 'NuevaEdu2025!');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/dashboard');
    
    // Navigate to admin learning paths page
    await page.goto('/admin/learning-paths');
    await page.waitForLoadState('networkidle');
    
    // Click create new path button
    await page.click('button:has-text("Crear Nueva Ruta")');
    
    // Verify navigation to creation page
    await expect(page).toHaveURL('/admin/learning-paths/new');
    await page.waitForLoadState('networkidle');
    
    // Fill in path details
    const pathName = `Ruta Admin Test ${Date.now()}`;
    const pathDescription = 'Descripción de prueba para ruta creada por admin';
    
    await page.fill('input#name', pathName);
    await page.fill('textarea#description', pathDescription);
    
    // Add course to path by clicking on it in the left panel
    const courseCard = page.getByText('Curso de Prueba para Rutas Admin').locator('..');
    await courseCard.click();
    
    // Verify course was added to selected courses on the right
    const selectedCoursesSection = page.locator('.space-y-2').last(); // Selected courses container
    await expect(selectedCoursesSection.getByText('Curso de Prueba para Rutas Admin')).toBeVisible();
    
    // Submit the form - look for "Guardar Ruta" button
    await page.click('button:has-text("Guardar Ruta")');
    
    // Wait for success redirect
    await page.waitForURL('/admin/learning-paths', { timeout: 10000 });
    
    // Verify the path was created and appears in the list
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(pathName)).toBeVisible();
    await expect(page.getByText(pathDescription)).toBeVisible();
    
    // Store path ID for cleanup (extract from page or query database)
    const pathRows = page.locator('table tbody tr');
    const pathRow = pathRows.filter({ hasText: pathName }).first();
    const editLink = pathRow.locator('a[href*="/admin/learning-paths/"][href*="/edit"]');
    const editHref = await editLink.getAttribute('href');
    if (editHref) {
      const pathIdMatch = editHref.match(/\/admin\/learning-paths\/([^\/]+)\/edit/);
      if (pathIdMatch) {
        testData.pathId = pathIdMatch[1];
      }
    }
  });

  test('should edit an existing learning path', async ({ page }) => {
    // Prerequisites: create a path first (this test depends on the previous test)
    if (!testData.pathId) {
      // Create a path directly if not available from previous test
      const { data: path, error: pathError } = await supabaseAdmin
        .from('learning_paths')
        .insert({
          name: 'Ruta para Edición Test',
          description: 'Descripción original',
          created_by: testData.adminUser.id
        })
        .select()
        .single();
      
      if (pathError) throw pathError;
      testData.pathId = path.id;
      
      // Link course to path
      await supabaseAdmin
        .from('learning_path_courses')
        .insert({
          learning_path_id: path.id,
          course_id: testData.courseId,
          sequence_order: 1
        });
    }
    
    // Login as admin
    await page.goto('/login');
    await page.fill('input[type="email"]', testData.adminUser.email);
    await page.fill('input[type="password"]', 'NuevaEdu2025!');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/dashboard');
    
    // Navigate to edit page
    await page.goto(`/admin/learning-paths/${testData.pathId}/edit`);
    await page.waitForLoadState('networkidle');
    
    // Modify path details
    const updatedName = `Ruta Admin Editada ${Date.now()}`;
    const updatedDescription = 'Descripción actualizada por prueba de edición';
    
    await page.fill('input[name="name"]', updatedName);
    await page.fill('textarea[name="description"]', updatedDescription);
    
    // Submit changes
    await page.click('button[type="submit"]');
    
    // Wait for success redirect
    await page.waitForURL('/admin/learning-paths', { timeout: 10000 });
    
    // Verify changes appear in the list
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(updatedName)).toBeVisible();
    await expect(page.getByText(updatedDescription)).toBeVisible();
  });

  test('should assign a learning path to a user', async ({ page }) => {
    // Prerequisites: ensure we have a path to assign
    if (!testData.pathId) {
      const { data: path, error: pathError } = await supabaseAdmin
        .from('learning_paths')
        .insert({
          name: 'Ruta para Asignación Test',
          description: 'Descripción para prueba de asignación',
          created_by: testData.adminUser.id
        })
        .select()
        .single();
      
      if (pathError) throw pathError;
      testData.pathId = path.id;
    }
    
    // Login as admin
    await page.goto('/login');
    await page.fill('input[type="email"]', testData.adminUser.email);
    await page.fill('input[type="password"]', 'NuevaEdu2025!');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/dashboard');
    
    // Navigate to assignment page
    await page.goto(`/admin/learning-paths/${testData.pathId}/assign`);
    await page.waitForLoadState('networkidle');
    
    // Verify assignment page loaded
    await expect(page.getByText(/asignar ruta/i)).toBeVisible();
    
    // Select user for assignment (implementation may vary)
    const userSelect = page.locator('select').first();
    if (await userSelect.isVisible()) {
      await userSelect.selectOption({ value: testData.regularUser.id });
    } else {
      // Alternative: search for user by email
      const userInput = page.getByPlaceholder(/buscar usuario|email/i);
      if (await userInput.isVisible()) {
        await userInput.fill(testData.regularUser.email);
        await page.keyboard.press('Enter');
      }
    }
    
    // Submit assignment
    await page.click('button:has-text("Asignar")');
    
    // Wait for success feedback
    await expect(page.getByText(/asignado|exitoso/i)).toBeVisible({ timeout: 10000 });
    
    // Verify assignment was created in database
    const { data: assignment } = await supabaseAdmin
      .from('learning_path_assignments')
      .select('*')
      .eq('path_id', testData.pathId)
      .eq('user_id', testData.regularUser.id)
      .single();
    
    expect(assignment).toBeTruthy();
  });

  test('should delete a learning path', async ({ page }) => {
    // Create a path specifically for deletion testing
    const { data: pathToDelete, error: pathError } = await supabaseAdmin
      .from('learning_paths')
      .insert({
        name: 'Ruta para Eliminación Test',
        description: 'Esta ruta será eliminada en la prueba',
        created_by: testData.adminUser.id
      })
      .select()
      .single();
    
    if (pathError) throw pathError;
    
    // Login as admin
    await page.goto('/login');
    await page.fill('input[type="email"]', testData.adminUser.email);
    await page.fill('input[type="password"]', 'NuevaEdu2025!');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/dashboard');
    
    // Navigate to learning paths list
    await page.goto('/admin/learning-paths');
    await page.waitForLoadState('networkidle');
    
    // Find the delete button for our test path
    const pathRow = page.locator('table tbody tr').filter({ hasText: 'Ruta para Eliminación Test' });
    const deleteButton = pathRow.locator('button').filter({ hasText: /eliminar|delete/i }).or(
      pathRow.locator('[title*="eliminar"], [title*="delete"]')
    );
    
    // Click delete button
    await deleteButton.click();
    
    // Confirm deletion in modal
    await expect(page.getByText(/¿estás seguro/i)).toBeVisible();
    await page.click('button:has-text("Eliminar")');
    
    // Wait for success feedback
    await expect(page.getByText(/eliminada|eliminado|exitoso/i)).toBeVisible({ timeout: 10000 });
    
    // Verify path is no longer visible in the list
    await expect(page.getByText('Ruta para Eliminación Test')).not.toBeVisible();
    
    // Verify deletion in database
    const { data: deletedPath } = await supabaseAdmin
      .from('learning_paths')
      .select('*')
      .eq('id', pathToDelete.id)
      .single();
    
    expect(deletedPath).toBeFalsy();
  });

  test('should prevent non-admin users from accessing admin features', async ({ page }) => {
    // Login as regular user (not admin)
    await page.goto('/login');
    await page.fill('input[type="email"]', testData.regularUser.email);
    await page.fill('input[type="password"]', 'NuevaEdu2025!');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/dashboard');
    
    // Attempt to navigate to admin learning paths page
    await page.goto('/admin/learning-paths');
    
    // Should be redirected away or see permission error
    await page.waitForLoadState('networkidle');
    
    // Check that we're either redirected to dashboard or see an error
    const currentUrl = page.url();
    const hasPermissionError = await page.getByText(/no tienes permisos|sin permisos|unauthorized/i).isVisible();
    
    expect(currentUrl.includes('/dashboard') || hasPermissionError).toBeTruthy();
    
    // Verify admin-specific elements are not visible
    if (!currentUrl.includes('/dashboard')) {
      await expect(page.getByRole('button', { name: /crear nueva ruta/i })).not.toBeVisible();
    }
  });
});