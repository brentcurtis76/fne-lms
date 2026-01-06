/**
 * Test utilities for E2E tests
 * Provides role-based login and test data management
 */

import { Page, APIRequestContext } from '@playwright/test';
import { loginAsQA, TEST_QA_USERS } from '../utils/auth-helpers';

type RoleType = 'admin' | 'equipo_directivo' | 'consultor' | 'docente' | 'estudiante';

const ROLE_TO_QA_TYPE: Record<RoleType, keyof typeof TEST_QA_USERS | null> = {
  admin: 'admin',
  equipo_directivo: 'directivo',
  consultor: 'consultant', // TEST_QA consultant user exists
  docente: 'docente',
  estudiante: 'student', // Maps to docente role
};

/**
 * Login as a specific role using TEST_QA users
 */
export async function loginAsRole(page: Page, role: RoleType): Promise<void> {
  const qaType = ROLE_TO_QA_TYPE[role];

  if (!qaType) {
    console.log(`⚠️ No TEST_QA user for role: ${role}. Skipping login.`);
    return;
  }

  await loginAsQA(page, qaType);
}

/**
 * Setup test data for learning path tests
 */
export async function setupTestData(request: APIRequestContext): Promise<{ pathId: string; schoolId: string }> {
  // For now, return placeholder IDs - real implementation would create test data
  console.log('📦 Setting up test data...');

  // Use existing test school and a dummy path ID
  return {
    pathId: 'test-path-id',
    schoolId: '33', // TEST_QA_School ID
  };
}

/**
 * Cleanup test data after tests
 */
export async function cleanupTestData(
  request: APIRequestContext,
  data: { pathId: string; schoolId: string }
): Promise<void> {
  console.log('🧹 Cleaning up test data...');
  // Placeholder - real implementation would clean up test data
}
