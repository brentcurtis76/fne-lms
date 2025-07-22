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
  schoolId: string;
  learningPaths: Array<{
    id: string;
    name: string;
    courseIds: string[];
  }>;
  testUsers: Array<{
    id: string;
    email: string;
  }>;
  courses: Array<{
    id: string;
    title: string;
  }>;
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
      last_name: lastName
    });
  
  if (profileError) throw profileError;
  
  // Add admin role if specified
  if (role === 'admin') {
    const { error: roleError } = await supabaseAdmin
      .from('user_roles')
      .insert({
        user_id: authData.user.id,
        role_type: 'admin',
        is_active: true
      });
    
    if (roleError) throw roleError;
  }
  
  return authData.user;
}

async function createTestCourse(title: string, instructorId: string) {
  const { data: courseData, error } = await supabaseAdmin
    .from('courses')
    .insert({
      title,
      description: `Test course: ${title}`,
      category: 'Test Category',
      instructor_id: instructorId,
      duration_hours: 2,
      difficulty_level: 'beginner',
      is_published: true,
      status: 'published'
    })
    .select()
    .single();
  
  if (error) throw error;
  return courseData;
}

async function createTestLearningPath(name: string, description: string, courseIds: string[], createdBy: string) {
  const { data: pathData, error } = await supabaseAdmin
    .rpc('create_full_learning_path', {
      p_name: name,
      p_description: description,
      p_course_ids: courseIds,
      p_created_by: createdBy
    });
  
  if (error) throw error;
  return pathData;
}

async function assignLearningPath(pathId: string, userIds: string[], assignedBy: string) {
  const { error } = await supabaseAdmin
    .rpc('batch_assign_learning_path', {
      p_path_id: pathId,
      p_user_ids: userIds,
      p_group_ids: [],
      p_assigned_by: assignedBy
    });
  
  if (error) throw error;
}

async function createTestProgressData(userId: string, pathId: string, courseIds: string[]) {
  // Create some course enrollments to simulate progress
  for (let i = 0; i < courseIds.length; i++) {
    const courseId = courseIds[i];
    const isCompleted = i < Math.floor(courseIds.length / 2); // Complete first half
    
    await supabaseAdmin
      .from('course_enrollments')
      .insert({
        user_id: userId,
        course_id: courseId,
        progress_percentage: isCompleted ? 100 : Math.floor(Math.random() * 80),
        status: isCompleted ? 'completed' : 'in_progress',
        enrolled_at: new Date().toISOString(),
        completed_at: isCompleted ? new Date().toISOString() : null
      });
  }

  // Create learning path assignment with time tracking
  await supabaseAdmin
    .from('learning_path_assignments')
    .upsert({
      path_id: pathId,
      user_id: userId,
      assigned_by: testData.adminUser.id,
      assigned_at: new Date().toISOString(),
      started_at: new Date().toISOString(),
      last_activity_at: new Date().toISOString(),
      total_time_spent_minutes: Math.floor(Math.random() * 300) + 60,
      current_course_sequence: Math.floor(courseIds.length / 2) + 1
    });
}

async function cleanupTestData() {
  if (!testData) return;
  
  console.log('Cleaning up test data...');
  
  try {
    // Clean up in reverse dependency order
    
    // 1. Clean up progress sessions
    await supabaseAdmin
      .from('learning_path_progress_sessions')
      .delete()
      .in('path_id', testData.learningPaths.map(p => p.id));
    
    // 2. Clean up assignments
    await supabaseAdmin
      .from('learning_path_assignments')
      .delete()
      .in('path_id', testData.learningPaths.map(p => p.id));
    
    // 3. Clean up course enrollments
    const allCourseIds = testData.learningPaths.flatMap(p => p.courseIds);
    await supabaseAdmin
      .from('course_enrollments')
      .delete()
      .in('course_id', allCourseIds);
    
    // 4. Clean up learning path courses
    await supabaseAdmin
      .from('learning_path_courses')
      .delete()
      .in('learning_path_id', testData.learningPaths.map(p => p.id));
    
    // 5. Clean up learning paths
    await supabaseAdmin
      .from('learning_paths')
      .delete()
      .in('id', testData.learningPaths.map(p => p.id));
    
    // 6. Clean up courses
    if (testData.courses?.length > 0) {
      await supabaseAdmin
        .from('courses')
        .delete()
        .in('id', testData.courses.map(c => c.id));
    }
    
    // 7. Clean up user roles
    const allUserIds = [
      testData.adminUser.id,
      ...testData.testUsers.map(u => u.id)
    ].filter(Boolean);
    
    await supabaseAdmin
      .from('user_roles')
      .delete()
      .in('user_id', allUserIds);
    
    // 8. Clean up profiles
    await supabaseAdmin
      .from('profiles')
      .delete()
      .in('id', allUserIds);
    
    // 9. Clean up auth users
    for (const userId of allUserIds) {
      try {
        await supabaseAdmin.auth.admin.deleteUser(userId);
      } catch (error) {
        console.warn(`Failed to delete auth user ${userId}:`, error);
      }
    }
    
    console.log('Test data cleanup completed');
  } catch (error) {
    console.error('Error during cleanup:', error);
  }
}

// Setup test data before all tests
test.beforeAll(async () => {
  console.log('Setting up test data for reports analytics...');
  
  try {
    // Get existing school to avoid RLS issues
    const { data: schools } = await supabaseAdmin
      .from('schools')
      .select('id')
      .limit(1);
    
    const schoolId = schools?.[0]?.id;
    if (!schoolId) {
      throw new Error('No existing schools found for testing');
    }
    
    // Create admin user
    const adminUser = await createTestUser(
      `admin-analytics-${Date.now()}@test.com`,
      'testPassword123!',
      'admin'
    );
    
    // Create test users for progress data
    const testUsers = [];
    for (let i = 0; i < 3; i++) {
      const user = await createTestUser(
        `user-analytics-${Date.now()}-${i}@test.com`,
        'testPassword123!'
      );
      testUsers.push({
        id: user.id,
        email: user.email
      });
    }
    
    // Create test courses
    const courses = [];
    for (let i = 1; i <= 4; i++) {
      const course = await createTestCourse(
        `Analytics Test Course ${i}`,
        adminUser.id
      );
      courses.push(course);
    }
    
    // Create test learning paths
    const learningPaths = [];
    
    // Path 1: All courses, high completion
    const path1 = await createTestLearningPath(
      'High Performance Learning Path',
      'A learning path with high completion rates for testing',
      courses.map(c => c.id),
      adminUser.id
    );
    learningPaths.push({
      id: path1.id,
      name: path1.name,
      courseIds: courses.map(c => c.id)
    });
    
    // Path 2: First two courses, medium completion
    const path2 = await createTestLearningPath(
      'Medium Performance Learning Path',
      'A learning path with medium completion rates for testing',
      courses.slice(0, 2).map(c => c.id),
      adminUser.id
    );
    learningPaths.push({
      id: path2.id,
      name: path2.name,
      courseIds: courses.slice(0, 2).map(c => c.id)
    });
    
    // Assign learning paths to users and create progress data
    for (const path of learningPaths) {
      await assignLearningPath(path.id, testUsers.map(u => u.id), adminUser.id);
      
      // Create progress data for each user
      for (const user of testUsers) {
        await createTestProgressData(user.id, path.id, path.courseIds);
      }
    }
    
    // Store test data globally
    testData = {
      adminUser,
      schoolId,
      learningPaths,
      testUsers,
      courses
    };
    
    console.log('Test data setup completed successfully');
    console.log(`Created ${learningPaths.length} learning paths with ${testUsers.length} users`);
    
    // Wait a moment for data to be fully committed
    await new Promise(resolve => setTimeout(resolve, 2000));
    
  } catch (error) {
    console.error('Failed to setup test data:', error);
    throw error;
  }
});

// Cleanup after all tests
test.afterAll(async () => {
  await cleanupTestData();
});

test.describe('Learning Path Analytics Dashboard', () => {
  test('should successfully load and display learning path analytics', async ({ page }) => {
    // 1. Login as admin user
    await page.goto('/login');
    
    await page.fill('input[type="email"]', testData.adminUser.email);
    await page.fill('input[type="password"]', 'testPassword123!');
    await page.click('button[type="submit"]');
    
    // Wait for login to complete
    await expect(page).toHaveURL(/\/dashboard/);
    
    // 2. Navigate to reports page
    await page.goto('/reports');
    await expect(page).toHaveURL('/reports');
    
    // 3. Click on the "Rutas de Aprendizaje" tab
    await page.click('button:has-text("Rutas de Aprendizaje")');
    
    // Wait for the analytics component to load
    await page.waitForSelector('[data-testid="learning-path-analytics"], .space-y-6:has(h3:text("Análisis de Rutas de Aprendizaje"))', { timeout: 10000 });
    
    // 4. Verify analytics component elements are present
    
    // Check for summary cards section
    await expect(page.locator('.grid.grid-cols-1.md\\:grid-cols-2.lg\\:grid-cols-5')).toBeVisible();
    
    // Check for specific summary cards by looking for the text content
    await expect(page.locator('text=Rutas Totales')).toBeVisible();
    await expect(page.locator('text=Usuarios Asignados')).toBeVisible();
    await expect(page.locator('text=Completados')).toBeVisible();
    await expect(page.locator('text=Tasa Promedio')).toBeVisible();
    await expect(page.locator('text=Tiempo Total')).toBeVisible();
    
    // Verify summary cards have numerical values
    const summaryCards = page.locator('.grid.grid-cols-1.md\\:grid-cols-2.lg\\:grid-cols-5 .bg-white.rounded-lg');
    await expect(summaryCards).toHaveCount(5);
    
    // Check for charts/visualizations sections
    await expect(page.locator('text=Rendimiento por Ruta de Aprendizaje')).toBeVisible();
    
    // Verify chart containers are present
    const chartContainers = page.locator('.bg-white.rounded-lg.shadow-sm.border.border-gray-200');
    await expect(chartContainers).toHaveCountGreaterThan(0);
    
    console.log('✅ Learning path analytics component loaded successfully');
  });

  test('should react to date range filter changes', async ({ page }) => {
    // Login as admin
    await page.goto('/login');
    await page.fill('input[type="email"]', testData.adminUser.email);
    await page.fill('input[type="password"]', 'testPassword123!');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/dashboard/);
    
    // Navigate to reports and learning paths tab
    await page.goto('/reports');
    await page.click('button:has-text("Rutas de Aprendizaje")');
    
    // Wait for initial load
    await page.waitForSelector('text=Rutas Totales', { timeout: 10000 });
    
    // Intercept API calls to verify filter changes
    const apiRequests: string[] = [];
    page.on('request', request => {
      const url = request.url();
      if (url.includes('/api/learning-paths/analytics')) {
        apiRequests.push(url);
        console.log('📡 Analytics API call:', url);
      }
    });
    
    // Get current date range filter value
    const dateRangeSelector = page.locator('select').filter({ hasText: 'Últimos' }).first();
    await expect(dateRangeSelector).toBeVisible();
    
    // Change date range from default (30 days) to 90 days
    await dateRangeSelector.selectOption('90');
    
    // Wait a moment for the request to be made
    await page.waitForTimeout(2000);
    
    // Verify an API request was made with the new date range
    const latestRequest = apiRequests[apiRequests.length - 1];
    expect(latestRequest).toBeDefined();
    expect(latestRequest).toContain('dateRange=90');
    
    // Verify the component still displays properly after filter change
    await expect(page.locator('text=Rutas Totales')).toBeVisible();
    
    console.log('✅ Date range filter interaction working correctly');
  });

  test('should display correct data when learning paths exist', async ({ page }) => {
    // Login as admin
    await page.goto('/login');
    await page.fill('input[type="email"]', testData.adminUser.email);
    await page.fill('input[type="password"]', 'testPassword123!');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/dashboard/);
    
    // Navigate to learning paths analytics
    await page.goto('/reports');
    await page.click('button:has-text("Rutas de Aprendizaje")');
    
    // Wait for component to load
    await page.waitForSelector('text=Rutas Totales', { timeout: 10000 });
    
    // Verify that we have data (since we created test data)
    // Check that summary cards show non-zero values where expected
    
    // Total paths should be >= 2 (we created 2 test paths)
    const totalPathsCard = page.locator('text=Rutas Totales').locator('..').locator('p.text-2xl.font-bold');
    await expect(totalPathsCard).not.toContainText('0');
    
    // Assigned users should be > 0 (we assigned paths to users)
    const assignedUsersCard = page.locator('text=Usuarios Asignados').locator('..').locator('p.text-2xl.font-bold');
    await expect(assignedUsersCard).not.toContainText('0');
    
    // Should show path names in performance chart
    await expect(page.locator('text=High Performance Learning Path')).toBeVisible();
    await expect(page.locator('text=Medium Performance Learning Path')).toBeVisible();
    
    console.log('✅ Analytics displays correct data for existing learning paths');
  });

  test('should handle loading states gracefully', async ({ page }) => {
    // Login as admin
    await page.goto('/login');
    await page.fill('input[type="email"]', testData.adminUser.email);
    await page.fill('input[type="password"]', 'testPassword123!');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/dashboard/);
    
    // Navigate to reports page
    await page.goto('/reports');
    
    // Click on learning paths tab and immediately check for loading state
    await page.click('button:has-text("Rutas de Aprendizaje")');
    
    // Check if loading skeletons are shown (they load very quickly, so might be missed)
    // This is a best-effort check - loading states are often too fast to catch in E2E tests
    const loadingElements = page.locator('.animate-pulse');
    
    // Wait for final content to load
    await page.waitForSelector('text=Rutas Totales', { timeout: 10000 });
    
    // Verify final state shows actual content, not loading skeletons
    await expect(page.locator('text=Rutas Totales')).toBeVisible();
    await expect(loadingElements).toHaveCount(0);
    
    console.log('✅ Loading states handled appropriately');
  });

  test('should maintain state when switching between tabs', async ({ page }) => {
    // Login as admin
    await page.goto('/login');
    await page.fill('input[type="email"]', testData.adminUser.email);
    await page.fill('input[type="password"]', 'testPassword123!');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/dashboard/);
    
    // Navigate to reports
    await page.goto('/reports');
    
    // Go to learning paths analytics
    await page.click('button:has-text("Rutas de Aprendizaje")');
    await page.waitForSelector('text=Rutas Totales', { timeout: 10000 });
    
    // Switch to another tab
    await page.click('button:has-text("Resumen General")');
    await page.waitForSelector('text=Total Usuarios', { timeout: 5000 });
    
    // Switch back to learning paths
    await page.click('button:has-text("Rutas de Aprendizaje")');
    
    // Verify analytics component loads again
    await page.waitForSelector('text=Rutas Totales', { timeout: 10000 });
    await expect(page.locator('text=Usuarios Asignados')).toBeVisible();
    
    console.log('✅ Tab switching maintains proper state');
  });

  test('should display error handling when API fails', async ({ page }) => {
    // Login as admin
    await page.goto('/login');
    await page.fill('input[type="email"]', testData.adminUser.email);
    await page.fill('input[type="password"]', 'testPassword123!');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/dashboard/);
    
    // Mock API failure by intercepting and failing the analytics request
    await page.route('**/api/learning-paths/analytics**', route => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Test API failure' })
      });
    });
    
    // Navigate to learning paths analytics
    await page.goto('/reports');
    await page.click('button:has-text("Rutas de Aprendizaje")');
    
    // Wait for error state to appear
    await page.waitForSelector('text=Error al cargar analíticas', { timeout: 10000 });
    
    // Verify error message is displayed
    await expect(page.locator('.bg-red-50.border.border-red-200')).toBeVisible();
    await expect(page.locator('text=Error al cargar analíticas')).toBeVisible();
    
    console.log('✅ Error handling works correctly');
  });
});