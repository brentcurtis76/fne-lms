/**
 * Global setup for Playwright tests
 * Sets up test users and data before running E2E tests
 */

import { chromium, FullConfig } from '@playwright/test';
import { UserFactory } from '../__tests__/factories/userFactory';

async function globalSetup(config: FullConfig) {
  console.log('🚀 Setting up E2E test environment...');

  // Create test users for each role
  const testUsers = UserFactory.createRoleBasedUsers();
  
  // Store test data in global state
  process.env.TEST_ADMIN_EMAIL = testUsers.admin.email;
  process.env.TEST_ADMIN_PASSWORD = 'test123456';
  
  process.env.TEST_CONSULTANT_EMAIL = testUsers.consultor.email;
  process.env.TEST_CONSULTANT_PASSWORD = 'test123456';
  
  process.env.TEST_STUDENT_EMAIL = testUsers.docentes[0].email;
  process.env.TEST_STUDENT_PASSWORD = 'test123456';
  
  process.env.TEST_DIRECTOR_EMAIL = testUsers.equipoDirectivo.email;
  process.env.TEST_DIRECTOR_PASSWORD = 'test123456';

  console.log('✅ Test users created');
  console.log(`   Admin: ${testUsers.admin.email}`);
  console.log(`   Consultant: ${testUsers.consultor.email}`);
  console.log(`   Student: ${testUsers.docentes[0].email}`);
  console.log(`   Director: ${testUsers.equipoDirectivo.email}`);

  // Launch browser for initial setup
  const browser = await chromium.launch();
  const page = await browser.newPage();

  try {
    // Verify the application is running
    await page.goto(config.projects[0].use?.baseURL || 'http://localhost:3000');
    await page.waitForSelector('body', { timeout: 10000 });
    console.log('✅ Application is accessible');

    // Check if login page is working
    const baseUrl = config.projects[0].use?.baseURL || 'http://localhost:3000';
    await page.goto(`${baseUrl}/login`);
    await page.waitForSelector('input[type="email"]', { timeout: 5000 });
    console.log('✅ Login page is functional');

  } catch (error) {
    console.error('❌ Setup failed:', error);
    throw error;
  } finally {
    await browser.close();
  }

  console.log('🎭 E2E test environment ready!');
}

export default globalSetup;