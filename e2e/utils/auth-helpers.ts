/**
 * Authentication helpers for E2E tests
 * Provides role-based login functions
 */

import { Page, expect } from '@playwright/test';

export interface TestUser {
  email: string;
  password: string;
  role: string;
  name: string;
}

// Use namespaced test users to avoid affecting production
const TEST_NAMESPACE = process.env.TEST_NAMESPACE || `e2e_test_${Date.now()}`;

// Standard E2E test users (generic)
export const TEST_USERS = {
  admin: {
    email: process.env.TEST_ADMIN_EMAIL || `admin_${TEST_NAMESPACE}@test.local`,
    password: process.env.TEST_ADMIN_PASSWORD || 'TestAdmin123!',
    role: 'admin',
    name: 'Test Admin'
  },
  consultant: {
    email: process.env.TEST_CONSULTANT_EMAIL || `consultant_${TEST_NAMESPACE}@test.local`,
    password: process.env.TEST_CONSULTANT_PASSWORD || 'TestConsultant123!',
    role: 'consultor',
    name: 'Test Consultant'
  },
  student: {
    email: process.env.TEST_STUDENT_EMAIL || `student_${TEST_NAMESPACE}@test.local`,
    password: process.env.TEST_STUDENT_PASSWORD || 'TestStudent123!',
    role: 'docente',
    name: 'Test Student'
  },
  director: {
    email: process.env.TEST_DIRECTOR_EMAIL || `director_${TEST_NAMESPACE}@test.local`,
    password: process.env.TEST_DIRECTOR_PASSWORD || 'TestDirector123!',
    role: 'equipo_directivo',
    name: 'Test Director'
  }
} as const;

// TEST_QA_ prefixed users for Assessment Builder E2E tests
// These users are created by scripts/qa-seed-users.js
export const TEST_QA_USERS = {
  admin: {
    email: 'test_qa_admin@test.com',
    password: 'TestQA2025!',
    role: 'admin',
    name: 'TEST_QA Admin User'
  },
  directivo: {
    email: 'test_qa_directivo@test.com',
    password: 'TestQA2025!',
    role: 'equipo_directivo',  // Correct enum value
    name: 'TEST_QA Directivo User'
  },
  docente: {
    email: 'test_qa_docente@test.com',
    password: 'TestQA2025!',
    role: 'docente',
    name: 'TEST_QA Docente User'
  }
} as const;

/**
 * Login as a TEST_QA_ user for Assessment Builder tests
 * These users are created by scripts/qa-seed-users.js
 */
export async function loginAsQA(page: Page, userType: keyof typeof TEST_QA_USERS) {
  const user = TEST_QA_USERS[userType];

  console.log(`🔐 Logging in as ${user.name} (${user.role})`);

  await page.goto('/login');
  await page.waitForLoadState('networkidle');

  // Wait for form elements to be visible
  // The login form uses custom input components, so we use placeholder-based selectors
  const emailInput = page.getByPlaceholder('tu@email.com');
  const passwordInput = page.getByPlaceholder('••••••••');

  await emailInput.waitFor({ state: 'visible', timeout: 10000 });
  await passwordInput.waitFor({ state: 'visible', timeout: 10000 });

  // Fill login form
  await emailInput.fill(user.email);
  await passwordInput.fill(user.password);

  // Submit form
  await page.click('button:has-text("Iniciar Sesión")');

  // Wait for redirect to dashboard or handle password change
  try {
    // Check if password change is required
    await page.waitForSelector('h1:has-text("Cambiar Contraseña")', { timeout: 3000 });
    console.log('Password change required, handling...');

    // Fill password change form
    await page.fill('input[placeholder*="nueva contraseña"]', 'newpassword123');
    await page.fill('input[placeholder*="confirmar"]', 'newpassword123');
    await page.click('button:has-text("Cambiar Contraseña")');

    // Wait for profile completion or dashboard
    await page.waitForLoadState('networkidle');

  } catch {
    // No password change required, should be at dashboard
  }

  // Wait for redirect away from login page
  try {
    await page.waitForURL(/(?!.*\/login).*/, { timeout: 15000 });
  } catch (e) {
    console.log('⚠️ Still on login page after submit, checking for errors...');
    const errorMsg = await page.locator('.text-red-500, .error-message, [role="alert"]').textContent().catch(() => null);
    if (errorMsg) {
      console.log('Login error:', errorMsg);
    }
    throw new Error(`Login failed for ${user.email}`);
  }

  // Wait for the page to fully load
  await page.waitForLoadState('networkidle');

  // Verify we're not on login page
  let currentUrl = page.url();
  if (currentUrl.includes('/login')) {
    throw new Error(`Still on login page after login attempt for ${user.email}`);
  }

  // Add session stabilization: reload to ensure auth state is consistent
  await page.waitForTimeout(500);
  await page.reload();
  await page.waitForLoadState('networkidle');

  // Re-verify we're still not on login page after reload
  currentUrl = page.url();
  if (currentUrl.includes('/login')) {
    throw new Error(`Session lost after reload for ${user.email}`);
  }

  console.log(`✅ Successfully logged in as ${user.name} - redirected to ${currentUrl}`);

  return user;
}

/**
 * Login as a specific user role
 */
export async function loginAs(page: Page, userType: keyof typeof TEST_USERS) {
  const user = TEST_USERS[userType];
  
  console.log(`🔐 Logging in as ${user.name} (${user.role})`);
  
  await page.goto('/login');
  
  // Fill login form
  await page.fill('input[type="email"]', user.email);
  await page.fill('input[type="password"]', user.password);
  
  // Submit form
  await page.click('button[type="submit"]');
  
  // Wait for redirect to dashboard or handle password change
  try {
    // Check if password change is required
    await page.waitForSelector('h1:has-text("Cambiar Contraseña")', { timeout: 3000 });
    console.log('Password change required, handling...');
    
    // Fill password change form
    await page.fill('input[placeholder*="nueva contraseña"]', 'newpassword123');
    await page.fill('input[placeholder*="confirmar"]', 'newpassword123');
    await page.click('button:has-text("Cambiar Contraseña")');
    
    // Wait for profile completion or dashboard
    await page.waitForLoadState('networkidle');
    
  } catch {
    // No password change required, should be at dashboard
  }
  
  // Verify successful login by checking for user-specific elements
  await expect(page.locator('body')).not.toContainText('Iniciar Sesión');
  
  // Wait for the page to fully load
  await page.waitForLoadState('networkidle');
  
  // Add a small delay to ensure profile data is accessible
  await page.waitForTimeout(1000);
  
  // Force a page reload to ensure fresh session data
  await page.reload();
  await page.waitForLoadState('networkidle');
  
  console.log(`✅ Successfully logged in as ${user.name}`);
  
  return user;
}

/**
 * Logout current user
 */
export async function logout(page: Page) {
  console.log('🚪 Logging out...');
  
  try {
    // Try to find and click logout button
    const logoutButton = page.locator('button:has-text("Cerrar Sesión"), button:has-text("Logout"), [data-testid="logout-button"]');
    
    if (await logoutButton.isVisible()) {
      await logoutButton.click();
    } else {
      // Try navigation menu logout
      await page.click('[data-testid="user-menu"], [data-testid="avatar-button"]');
      await page.click('button:has-text("Cerrar Sesión")');
    }
    
    // Verify logout by checking for login page
    await expect(page).toHaveURL(/\/login/);
    console.log('✅ Successfully logged out');
    
  } catch (error) {
    console.log('⚠️ Logout failed, navigating to login page directly');
    await page.goto('/login');
  }
}

/**
 * Check if user has specific role-based access
 */
export async function verifyRoleAccess(page: Page, expectedRole: string) {
  // Navigate to dashboard to check role-specific elements
  await page.goto('/dashboard');
  await page.waitForLoadState('networkidle');
  
  switch (expectedRole) {
    case 'admin':
      // Admins should see user management
      await expect(page.getByRole('button', { name: 'Usuarios Administrar usuarios' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Configuración Configuración del sistema' })).toBeVisible();
      break;
      
    case 'consultor':
      // Consultants should see course management
      await expect(page.locator('text=Cursos, text=Courses')).toBeVisible();
      await expect(page.locator('text=Consultorías')).toBeVisible();
      break;
      
    case 'docente':
      // Students should see their courses and assignments
      await expect(page.locator('text=Mis Tareas, text=My Assignments')).toBeVisible();
      // Should NOT see admin features
      await expect(page.locator('text=Usuarios, text=User Management')).not.toBeVisible();
      break;
      
    case 'equipo_directivo':
      // School directors should see reporting
      await expect(page.locator('text=Reportes, text=Reports')).toBeVisible();
      break;
  }
}

/**
 * Handle common authentication flows
 */
export async function handleAuthFlow(page: Page, userType: keyof typeof TEST_USERS) {
  const user = await loginAs(page, userType);
  
  // Handle any post-login flows (profile completion, etc.)
  const currentUrl = page.url();
  
  if (currentUrl.includes('/complete-profile')) {
    console.log('Completing profile...');
    // Fill required profile fields if needed
    await page.fill('input[name="first_name"]', user.name.split(' ')[0]);
    await page.fill('input[name="last_name"]', user.name.split(' ')[1] || 'User');
    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle');
  }
  
  return user;
}

/**
 * Create test context with authenticated user
 */
export async function createAuthenticatedContext(page: Page, userType: keyof typeof TEST_USERS) {
  const user = await handleAuthFlow(page, userType);
  
  // Verify role-based access
  await verifyRoleAccess(page, user.role);
  
  return {
    user,
    page,
    logout: () => logout(page)
  };
}