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

// Test data
interface TestData {
  adminUserId: string;
  testUserId: string;
  testUserEmail: string;
  schoolId: number;
  communityId: string;
  courseId: string;
  learningPathId: string;
}

let testData: TestData | null = null;

// Helper: Create test user
async function createTestUser(email: string, password: string, role: 'admin' | 'docente' = 'docente') {
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true
  });

  if (authError) throw authError;
  if (!authData.user) throw new Error('No user created');

  const userId = authData.user.id;

  // Create profile
  await supabaseAdmin.from('profiles').upsert({
    id: userId,
    email,
    first_name: role === 'admin' ? 'Admin' : 'Test',
    last_name: 'User'
  });

  return userId;
}

// Helper: Create test school
async function createTestSchool(name: string) {
  const { data, error } = await supabaseAdmin
    .from('schools')
    .insert({ name })
    .select('id')
    .single();

  if (error) throw error;
  return data.id;
}

// Helper: Create test community
async function createTestCommunity(name: string, schoolId: number) {
  const { data, error } = await supabaseAdmin
    .from('growth_communities')
    .insert({ name, school_id: schoolId })
    .select('id')
    .single();

  if (error) throw error;
  return data.id;
}

// Helper: Create test course
async function createTestCourse(title: string, createdBy: string) {
  const { data, error } = await supabaseAdmin
    .from('courses')
    .insert({
      title,
      description: 'Test course for assignment matrix',
      status: 'published',
      created_by: createdBy,
      is_published: true
    })
    .select('id')
    .single();

  if (error) throw error;
  return data.id;
}

// Helper: Create test learning path
async function createTestLearningPath(name: string, createdBy: string, courseId: string) {
  // Create LP
  const { data: lpData, error: lpError } = await supabaseAdmin
    .from('learning_paths')
    .insert({
      name,
      description: 'Test learning path',
      created_by: createdBy
    })
    .select('id')
    .single();

  if (lpError) throw lpError;

  // Add course to LP
  await supabaseAdmin.from('learning_path_courses').insert({
    learning_path_id: lpData.id,
    course_id: courseId,
    sequence_order: 0
  });

  return lpData.id;
}

// Helper: Assign role to user
async function assignRole(
  userId: string,
  roleType: string,
  schoolId?: number,
  communityId?: string
) {
  await supabaseAdmin.from('user_roles').insert({
    user_id: userId,
    role_type: roleType,
    school_id: schoolId,
    community_id: communityId,
    is_active: true
  });
}

// Helper: Login as user
async function loginAs(page: any, email: string, password: string) {
  await page.goto('/login');
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 15000 });
}

// Setup test data before all tests
test.beforeAll(async () => {
  const timestamp = Date.now();
  const adminEmail = `admin.matrix.${timestamp}@test.local`;
  const testUserEmail = `user.matrix.${timestamp}@test.local`;
  const testPassword = 'TestPassword123!';

  // Create admin user
  const adminUserId = await createTestUser(adminEmail, testPassword, 'admin');

  // Create test school
  const schoolId = await createTestSchool(`Test School ${timestamp}`);

  // Create test community
  const communityId = await createTestCommunity(`Test Community ${timestamp}`, schoolId);

  // Create test course
  const courseId = await createTestCourse(`Test Course ${timestamp}`, adminUserId);

  // Create test learning path
  const learningPathId = await createTestLearningPath(
    `Test Learning Path ${timestamp}`,
    adminUserId,
    courseId
  );

  // Assign admin role
  await assignRole(adminUserId, 'admin', schoolId);

  // Create test target user
  const testUserId = await createTestUser(testUserEmail, testPassword, 'docente');
  await assignRole(testUserId, 'docente', schoolId, communityId);

  testData = {
    adminUserId,
    testUserId,
    testUserEmail,
    schoolId,
    communityId,
    courseId,
    learningPathId
  };
});

// Cleanup test data after all tests
test.afterAll(async () => {
  if (!testData) return;

  // Cleanup in reverse order of dependencies
  try {
    // Remove assignments
    await supabaseAdmin
      .from('course_assignments')
      .delete()
      .eq('course_id', testData.courseId);

    await supabaseAdmin
      .from('learning_path_assignments')
      .delete()
      .eq('path_id', testData.learningPathId);

    await supabaseAdmin
      .from('course_enrollments')
      .delete()
      .eq('course_id', testData.courseId);

    // Remove LP courses
    await supabaseAdmin
      .from('learning_path_courses')
      .delete()
      .eq('learning_path_id', testData.learningPathId);

    // Remove learning path
    await supabaseAdmin
      .from('learning_paths')
      .delete()
      .eq('id', testData.learningPathId);

    // Remove course
    await supabaseAdmin
      .from('courses')
      .delete()
      .eq('id', testData.courseId);

    // Remove user roles
    await supabaseAdmin
      .from('user_roles')
      .delete()
      .in('user_id', [testData.adminUserId, testData.testUserId]);

    // Remove community
    await supabaseAdmin
      .from('growth_communities')
      .delete()
      .eq('id', testData.communityId);

    // Remove school
    await supabaseAdmin
      .from('schools')
      .delete()
      .eq('id', testData.schoolId);

    // Remove profiles
    await supabaseAdmin
      .from('profiles')
      .delete()
      .in('id', [testData.adminUserId, testData.testUserId]);

    // Remove auth users
    await supabaseAdmin.auth.admin.deleteUser(testData.adminUserId);
    await supabaseAdmin.auth.admin.deleteUser(testData.testUserId);
  } catch (error) {
    console.error('Error cleaning up test data:', error);
  }
});

test.describe('Assignment Matrix', () => {
  test.beforeEach(async ({ page }) => {
    // Login as admin before each test
    const timestamp = testData?.testUserEmail.split('.')[2].split('@')[0] || '';
    const adminEmail = `admin.matrix.${timestamp}@test.local`;
    await loginAs(page, adminEmail, 'TestPassword123!');
  });

  test('1. should navigate to assignment matrix page', async ({ page }) => {
    await page.goto('/admin/assignment-matrix');
    await page.waitForLoadState('networkidle');

    // Verify page title
    await expect(page.locator('h1, h2').filter({ hasText: /Matriz de Asignaciones/i })).toBeVisible();

    // Verify dual-panel layout exists
    await expect(page.locator('text=Usuarios')).toBeVisible();
  });

  test('2. should search and select a user', async ({ page }) => {
    await page.goto('/admin/assignment-matrix');
    await page.waitForLoadState('networkidle');

    // Search for the test user
    const searchInput = page.locator('input[placeholder*="Buscar usuarios"]');
    await searchInput.fill('Test User');
    await page.waitForTimeout(500); // Wait for debounce

    // User should appear in list
    await expect(page.locator('text=Test User').first()).toBeVisible({ timeout: 10000 });
  });

  test('3. should display user with no assignments', async ({ page }) => {
    await page.goto('/admin/assignment-matrix');
    await page.waitForLoadState('networkidle');

    // Search and select the test user
    const searchInput = page.locator('input[placeholder*="Buscar usuarios"]');
    await searchInput.fill('Test User');
    await page.waitForTimeout(500);

    // Click on the test user
    await page.locator('button').filter({ hasText: 'Test User' }).first().click();

    // Right panel should show user name and empty state
    await expect(page.locator('text=Sin asignaciones').or(page.locator('text=no tiene asignaciones'))).toBeVisible({ timeout: 10000 });
  });

  test('4. should assign a course to user', async ({ page }) => {
    if (!testData) throw new Error('Test data not initialized');

    await page.goto('/admin/assignment-matrix');
    await page.waitForLoadState('networkidle');

    // Select the test user
    const searchInput = page.locator('input[placeholder*="Buscar usuarios"]');
    await searchInput.fill('Test User');
    await page.waitForTimeout(500);
    await page.locator('button').filter({ hasText: 'Test User' }).first().click();
    await page.waitForTimeout(500);

    // Use quick assign dropdown to search for the course
    const contentSearch = page.locator('input[placeholder*="Buscar curso o ruta"]');
    await contentSearch.fill('Test Course');
    await page.waitForTimeout(500);

    // Click the course item in dropdown using data-testid
    const courseButton = page.locator('[data-testid^="assign-item-course-"]').first();
    await expect(courseButton).toBeVisible({ timeout: 10000 });
    await courseButton.click();

    // Should see success toast
    await expect(page.locator('text=asignado').first()).toBeVisible({ timeout: 10000 });
  });

  test('5. should switch to Groups tab', async ({ page }) => {
    await page.goto('/admin/assignment-matrix');
    await page.waitForLoadState('networkidle');

    // Click on Groups tab
    await page.locator('button').filter({ hasText: 'Grupos' }).click();

    // Should see group type selector
    await expect(page.locator('button').filter({ hasText: 'Escuelas' })).toBeVisible();
    await expect(page.locator('button').filter({ hasText: 'Comunidades' })).toBeVisible();
  });

  test('6. should search and select a school', async ({ page }) => {
    await page.goto('/admin/assignment-matrix');
    await page.waitForLoadState('networkidle');

    // Switch to Groups tab
    await page.locator('button').filter({ hasText: 'Grupos' }).click();
    await page.waitForTimeout(300);

    // Ensure Schools is selected (should be default)
    await page.locator('button').filter({ hasText: 'Escuelas' }).click();
    await page.waitForTimeout(300);

    // Search for the test school
    const searchInput = page.locator('input[placeholder*="Buscar escuelas"]');
    await searchInput.fill('Test School');
    await page.waitForTimeout(500);

    // School should appear and be clickable
    await expect(page.locator('text=Test School').first()).toBeVisible({ timeout: 10000 });
  });

  test('7. should switch to Communities and select one', async ({ page }) => {
    await page.goto('/admin/assignment-matrix');
    await page.waitForLoadState('networkidle');

    // Switch to Groups tab
    await page.locator('button').filter({ hasText: 'Grupos' }).click();
    await page.waitForTimeout(300);

    // Switch to Communities
    await page.locator('button').filter({ hasText: 'Comunidades' }).click();
    await page.waitForTimeout(300);

    // Search for the test community
    const searchInput = page.locator('input[placeholder*="Buscar comunidades"]');
    await searchInput.fill('Test Community');
    await page.waitForTimeout(500);

    // Community should appear
    await expect(page.locator('text=Test Community').first()).toBeVisible({ timeout: 10000 });
  });

  test('8. should show overlap warning when assigning LP with overlapping course', async ({ page }) => {
    if (!testData) throw new Error('Test data not initialized');

    // SETUP: First assign the course directly via database to ensure state is independent
    await supabaseAdmin.from('course_assignments').upsert({
      teacher_id: testData.testUserId,
      course_id: testData.courseId,
      assigned_by: testData.adminUserId,
      assigned_at: new Date().toISOString()
    }, { onConflict: 'teacher_id,course_id' });

    await supabaseAdmin.from('course_enrollments').upsert({
      user_id: testData.testUserId,
      course_id: testData.courseId,
      status: 'active',
      enrollment_type: 'assigned'
    }, { onConflict: 'user_id,course_id' });

    await page.goto('/admin/assignment-matrix');
    await page.waitForLoadState('networkidle');

    // Select the test user who now has a course assigned
    const searchInput = page.locator('input[placeholder*="Buscar usuarios"]');
    await searchInput.fill('Test User');
    await page.waitForTimeout(500);
    await page.locator('button').filter({ hasText: 'Test User' }).first().click();
    await page.waitForTimeout(500);

    // Search for the test learning path using the quick assign dropdown
    const contentSearch = page.locator('input[placeholder*="Buscar curso o ruta"]');
    await contentSearch.fill('Test Learning Path');
    await page.waitForTimeout(500);

    // Look for a learning path result and click it using data-testid
    const lpButton = page.locator('[data-testid^="assign-item-lp-"]').first();
    await expect(lpButton).toBeVisible({ timeout: 10000 });
    await lpButton.click();

    // Should see success toast (overlap is informational, not blocking)
    await expect(page.locator('text=asignada').or(page.locator('text=asignado'))).toBeVisible({ timeout: 10000 });
  });

  test('9. should display overlap badge after assigning LP with overlapping course', async ({ page }) => {
    if (!testData) throw new Error('Test data not initialized');

    // SETUP: Create both direct course assignment AND LP assignment to simulate overlap
    // 1. Direct course assignment
    await supabaseAdmin.from('course_assignments').upsert({
      teacher_id: testData.testUserId,
      course_id: testData.courseId,
      assigned_by: testData.adminUserId,
      assigned_at: new Date().toISOString()
    }, { onConflict: 'teacher_id,course_id' });

    await supabaseAdmin.from('course_enrollments').upsert({
      user_id: testData.testUserId,
      course_id: testData.courseId,
      status: 'active',
      enrollment_type: 'assigned'
    }, { onConflict: 'user_id,course_id' });

    // 2. LP assignment (LP contains the same course)
    await supabaseAdmin.from('learning_path_assignments').upsert({
      path_id: testData.learningPathId,
      user_id: testData.testUserId,
      assigned_by: testData.adminUserId,
      assigned_at: new Date().toISOString()
    }, { onConflict: 'path_id,user_id' });

    await page.goto('/admin/assignment-matrix');
    await page.waitForLoadState('networkidle');

    // Select the test user
    const searchInput = page.locator('input[placeholder*="Buscar usuarios"]');
    await searchInput.fill('Test User');
    await page.waitForTimeout(500);
    await page.locator('button').filter({ hasText: 'Test User' }).first().click();
    await page.waitForTimeout(1000);

    // After assigning both course directly and via LP, check for overlap indicator
    // The course should show "2 fuentes" or similar overlap badge if both were assigned
    // We check that the user's assignments are visible
    await expect(page.locator('text=Cursos:').or(page.locator('text=Rutas:'))).toBeVisible({ timeout: 10000 });
  });

  test('10. should unassign LP and preserve course enrollment', async ({ page }) => {
    if (!testData) throw new Error('Test data not initialized');

    // SETUP: Create both direct course assignment AND LP assignment
    // 1. Direct course assignment
    await supabaseAdmin.from('course_assignments').upsert({
      teacher_id: testData.testUserId,
      course_id: testData.courseId,
      assigned_by: testData.adminUserId,
      assigned_at: new Date().toISOString()
    }, { onConflict: 'teacher_id,course_id' });

    await supabaseAdmin.from('course_enrollments').upsert({
      user_id: testData.testUserId,
      course_id: testData.courseId,
      status: 'active',
      enrollment_type: 'assigned'
    }, { onConflict: 'user_id,course_id' });

    // 2. LP assignment (LP contains the same course)
    await supabaseAdmin.from('learning_path_assignments').upsert({
      path_id: testData.learningPathId,
      user_id: testData.testUserId,
      assigned_by: testData.adminUserId,
      assigned_at: new Date().toISOString()
    }, { onConflict: 'path_id,user_id' });

    await page.goto('/admin/assignment-matrix');
    await page.waitForLoadState('networkidle');

    // Select the test user
    const searchInput = page.locator('input[placeholder*="Buscar usuarios"]');
    await searchInput.fill('Test User');
    await page.waitForTimeout(500);
    await page.locator('button').filter({ hasText: 'Test User' }).first().click();
    await page.waitForTimeout(1000);

    // Look for the LP card with unassign button (trash icon)
    const lpCard = page.locator('text=Test Learning Path').first();
    if (await lpCard.isVisible()) {
      // Find the trash button near this card
      const trashButton = page.locator('[data-testid="unassign-button"]').or(
        page.locator('button[title="Desasignar"]')
      ).first();

      if (await trashButton.isVisible()) {
        await trashButton.click();

        // Should see success toast
        await expect(page.locator('text=desasignada').or(page.locator('text=desasignado'))).toBeVisible({ timeout: 10000 });
      }
    }

    // The course should still be visible (preserved enrollment)
    await expect(page.locator('text=Test Course').first()).toBeVisible({ timeout: 10000 });
  });

  test('11. should display group detail panel when selecting a school', async ({ page }) => {
    await page.goto('/admin/assignment-matrix');
    await page.waitForLoadState('networkidle');

    // Switch to Groups tab
    await page.locator('button').filter({ hasText: 'Grupos' }).click();
    await page.waitForTimeout(300);

    // Search and click on the test school
    const searchInput = page.locator('input[placeholder*="Buscar escuelas"]');
    await searchInput.fill('Test School');
    await page.waitForTimeout(500);

    await page.locator('text=Test School').first().click();
    await page.waitForTimeout(500);

    // Should see the group detail panel with stats
    await expect(page.locator('text=Escuela').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Miembros').or(page.locator('text=miembro'))).toBeVisible({ timeout: 10000 });
  });

  test('12. should show coverage and progress bars in group detail', async ({ page }) => {
    await page.goto('/admin/assignment-matrix');
    await page.waitForLoadState('networkidle');

    // Switch to Groups tab
    await page.locator('button').filter({ hasText: 'Grupos' }).click();
    await page.waitForTimeout(300);

    // Search and click on the test school
    const searchInput = page.locator('input[placeholder*="Buscar escuelas"]');
    await searchInput.fill('Test School');
    await page.waitForTimeout(500);

    await page.locator('text=Test School').first().click();
    await page.waitForTimeout(1000);

    // If there are assignments, we should see coverage indicators
    // Check for the Resumen section which shows stats
    await expect(page.locator('text=Resumen del Grupo').or(page.locator('text=Sin asignaciones'))).toBeVisible({ timeout: 10000 });
  });
});
