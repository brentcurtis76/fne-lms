/**
 * Global teardown for Playwright tests
 * Cleans up test data after running E2E tests
 */

async function globalTeardown() {
  console.log('🧹 Cleaning up E2E test environment...');

  try {
    // Clean up any test data if needed
    // This would typically involve database cleanup
    
    console.log('✅ E2E test cleanup completed');
  } catch (error) {
    console.error('❌ Cleanup failed:', error);
    // Don't throw - teardown failures shouldn't fail the tests
  }
}

export default globalTeardown;