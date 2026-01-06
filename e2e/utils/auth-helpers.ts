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
    role: 'equipo_directivo',
    name: 'TEST_QA Directivo User'
  },
  // Alias for directivo (used by tests expecting 'director')
  director: {
    email: 'test_qa_directivo@test.com',
    password: 'TestQA2025!',
    role: 'equipo_directivo',
    name: 'TEST_QA Directivo User'
  },
  docente: {
    email: 'test_qa_docente@test.com',
    password: 'TestQA2025!',
    role: 'docente',
    name: 'TEST_QA Docente User'
  },
  // Alias for docente (used by tests expecting 'student')
  student: {
    email: 'test_qa_docente@test.com',
    password: 'TestQA2025!',
    role: 'docente',
    name: 'TEST_QA Docente User'
  },
  // Consultant user (created by qa-seed-users.js)
  consultant: {
    email: 'test_qa_consultant@test.com',
    password: 'TestQA2025!',
    role: 'consultor',
    name: 'TEST_QA Consultant User'
  }
} as const;

/**
 * Login as a TEST_QA_ user for Assessment Builder tests
 * These users are created by scripts/qa-seed-users.js
 */
export async function loginAsQA(page: Page, userType: keyof typeof TEST_QA_USERS) {
  const user = TEST_QA_USERS[userType];

  console.log(`🔐 Logging in as ${user.name} (${user.role})`);

  // Navigate with explicit timeout
  await page.goto('/login', { timeout: 20000, waitUntil: 'domcontentloaded' });

  // Wait for form elements to be visible with retries
  await page.waitForSelector('input[type="email"]', { state: 'visible', timeout: 15000 });
  await page.waitForSelector('input[type="password"]', { state: 'visible', timeout: 10000 });

  // Small delay to ensure form is interactive
  await page.waitForTimeout(300);

  // Fill login form
  await page.fill('input[type="email"]', user.email);
  await page.fill('input[type="password"]', user.password);

  // Submit form and wait for navigation
  await Promise.all([
    page.waitForNavigation({ timeout: 20000, waitUntil: 'domcontentloaded' }).catch(() => {}),
    page.click('button:has-text("Iniciar Sesión")')
  ]);

  // Wait a moment for navigation to settle
  await page.waitForTimeout(1000);

  // Check current URL to determine next steps
  let currentUrl = page.url();

  // Handle password change if required
  if (currentUrl.includes('/change-password')) {
    console.log('Password change required, handling...');
    await page.fill('input[placeholder*="nueva contraseña"]', 'newpassword123');
    await page.fill('input[placeholder*="confirmar"]', 'newpassword123');
    await page.click('button:has-text("Cambiar Contraseña")');
    await page.waitForTimeout(2000);
    currentUrl = page.url();
  }

  // If still on login page, wait a bit more and check for errors
  if (currentUrl.includes('/login')) {
    await page.waitForTimeout(2000);
    currentUrl = page.url();

    if (currentUrl.includes('/login')) {
      const errorMsg = await page.locator('.text-red-500, .error-message, [role="alert"]').textContent().catch(() => null);
      if (errorMsg) {
        console.log('Login error:', errorMsg);
      }
      throw new Error(`Login failed for ${user.email} - still on login page`);
    }
  }

  // Wait for page to stabilize
  await page.waitForLoadState('domcontentloaded', { timeout: 10000 });

  // Verify not on login page
  currentUrl = page.url();
  if (currentUrl.includes('/login')) {
    throw new Error(`Still on login page after login attempt for ${user.email}`);
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
    // Wait for page to be stable
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    // Look for the logout button - it might be at the bottom of sidebar
    const logoutButton = page.locator('button:has-text("Cerrar Sesión")').first();

    // Scroll sidebar to bottom if needed and click logout
    if (await logoutButton.isVisible({ timeout: 5000 })) {
      await logoutButton.scrollIntoViewIfNeeded();
      await logoutButton.click();

      // Wait for redirect to login
      await page.waitForURL(/\/login/, { timeout: 10000 });
      console.log('✅ Successfully logged out');
    } else {
      // Fallback: navigate directly to login
      console.log('⚠️ Logout button not found, navigating to login page directly');
      await page.goto('/login');
    }

  } catch (error) {
    console.log('⚠️ Logout failed, navigating to login page directly');
    await page.goto('/login');
  }
}

/**
 * Check if user has specific role-based access
 * Note: This verifies basic login success - detailed permission tests are in RBAC specs
 */
export async function verifyRoleAccess(page: Page, expectedRole: string) {
  // Navigate to dashboard to check we're logged in
  await page.goto('/dashboard', { timeout: 15000 });
  await page.waitForLoadState('domcontentloaded', { timeout: 10000 });

  // Give sidebar time to load permissions
  await page.waitForTimeout(1500);

  // Verify we're on dashboard, not redirected to login
  await expect(page).not.toHaveURL(/\/login/);

  // Verify dashboard heading is visible (all roles should see this)
  await expect(page.locator('h1:has-text("Mi Panel")').first()).toBeVisible({ timeout: 10000 });

  // Basic sidebar should be visible for all roles
  await expect(page.locator('button:has-text("Mi Panel")')).toBeVisible({ timeout: 10000 });

  // Role-specific basic checks (verifies user has some expected access)
  // Use longer timeout since sidebar permissions load asynchronously
  // Use .first() to avoid strict mode violations when multiple elements match
  switch (expectedRole) {
    case 'admin':
      // Admins should see user management button in sidebar
      await expect(page.locator('button:has-text("Usuarios")').first()).toBeVisible({ timeout: 15000 });
      break;

    case 'consultor':
      // Consultants should see course management
      await expect(page.locator('button:has-text("Cursos")').first()).toBeVisible({ timeout: 15000 });
      break;

    case 'docente':
      // Docentes should see Mi Aprendizaje
      await expect(page.locator('button:has-text("Mi Aprendizaje")').first()).toBeVisible({ timeout: 15000 });
      break;

    case 'equipo_directivo':
      // Directors should see reporting
      await expect(page.locator('button:has-text("Reportes")').first()).toBeVisible({ timeout: 15000 });
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