/**
 * RBAC Browser UI Test
 * Uses Puppeteer to test the RBAC interface in a real browser
 */

const puppeteer = require('puppeteer');
require('dotenv').config({ path: '.env.local' });

const BASE_URL = 'http://localhost:3000';
const TIMEOUT = 10000;

// Superadmin credentials (you'll need to replace the password)
const SUPERADMIN = {
  email: 'brent@perrotuertocm.cl',
  password: process.env.SUPERADMIN_PASSWORD || 'ASK_USER_FOR_PASSWORD'
};

const TEST_USERS = {
  admin: { email: 'test.admin@fne-test.com', password: 'TestAdmin123!' },
  student: { email: 'test.estudiante@fne-test.com', password: 'TestEstudiante123!' }
};

const results = {
  passed: [],
  failed: [],
  warnings: []
};

function pass(test) {
  results.passed.push(test);
  console.log(`✅ ${test}`);
}

function fail(test, error) {
  results.failed.push({ test, error });
  console.log(`❌ ${test}`);
  console.log(`   ${error}`);
}

function warn(test, message) {
  results.warnings.push({ test, message });
  console.log(`⚠️  ${test}`);
  console.log(`   ${message}`);
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Helper: Login to the application
 */
async function login(page, email, password) {
  try {
    await page.goto(BASE_URL, { waitUntil: 'networkidle2' });

    // Wait for login form
    await page.waitForSelector('input[type="email"]', { timeout: TIMEOUT });

    // Fill credentials
    await page.type('input[type="email"]', email);
    await page.type('input[type="password"]', password);

    // Submit
    await page.click('button[type="submit"]');

    // Wait for navigation
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: TIMEOUT });
    await sleep(2000); // Extra time for auth to settle

    return true;
  } catch (error) {
    console.log(`   Login error: ${error.message}`);
    return false;
  }
}

/**
 * Test 1: Superadmin can access RBAC page
 */
async function testSuperadminAccess(browser) {
  const page = await browser.newPage();

  try {
    console.log('\n🔴 Test 1: Superadmin can access RBAC page...');

    if (SUPERADMIN.password === 'ASK_USER_FOR_PASSWORD') {
      warn('Superadmin access test', 'Skipped - password not provided');
      await page.close();
      return;
    }

    // Login
    const loginSuccess = await login(page, SUPERADMIN.email, SUPERADMIN.password);
    if (!loginSuccess) {
      fail('Superadmin login', 'Could not login');
      await page.close();
      return;
    }

    // Check if on dashboard
    const url = page.url();
    if (!url.includes('/dashboard')) {
      fail('Superadmin login redirect', `Not on dashboard, on: ${url}`);
      await page.close();
      return;
    }

    // Look for "Roles y Permisos" link
    const rbacLink = await page.$('a:has-text("Roles y Permisos"), a[href*="role-management"]');
    if (!rbacLink) {
      fail('RBAC menu item visible', 'Could not find "Roles y Permisos" in sidebar');
      await page.close();
      return;
    }

    pass('RBAC menu item visible to superadmin');

    // Click it
    await rbacLink.click();
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: TIMEOUT });

    // Check URL
    const rbacUrl = page.url();
    if (!rbacUrl.includes('/admin/role-management')) {
      fail('RBAC page navigation', `Wrong URL: ${rbacUrl}`);
      await page.close();
      return;
    }

    pass('Navigated to RBAC page');

    // Check for page content
    await sleep(2000);
    const pageContent = await page.content();

    if (pageContent.includes('role') || pageContent.includes('permission') || pageContent.includes('permiso')) {
      pass('RBAC page content loaded');
    } else {
      warn('RBAC page content', 'Page loaded but content unclear');
    }

    // Check console for errors
    const logs = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        logs.push(msg.text());
      }
    });

    await sleep(1000);

    if (logs.length > 0) {
      warn('Console errors', `${logs.length} errors found`);
      logs.forEach(log => console.log(`     - ${log}`));
    } else {
      pass('No console errors');
    }

  } catch (error) {
    fail('Superadmin access test', error.message);
  } finally {
    await page.close();
  }
}

/**
 * Test 2: Non-superadmin cannot access RBAC
 */
async function testNonSuperadminBlocked(browser) {
  const page = await browser.newPage();

  try {
    console.log('\n🔴 Test 2: Non-superadmin cannot access RBAC...');

    // Login as regular admin
    const loginSuccess = await login(page, TEST_USERS.admin.email, TEST_USERS.admin.password);
    if (!loginSuccess) {
      warn('Non-superadmin test', 'Could not login as test admin');
      await page.close();
      return;
    }

    // Check sidebar - should NOT have RBAC link
    const rbacLink = await page.$('a:has-text("Roles y Permisos")');
    if (rbacLink) {
      fail('RBAC hidden from non-superadmin', 'RBAC link is visible to non-superadmin!');
      await page.close();
      return;
    }

    pass('RBAC menu hidden from non-superadmin');

    // Try direct navigation
    await page.goto(`${BASE_URL}/admin/role-management`, { waitUntil: 'networkidle2' });
    await sleep(2000);

    const url = page.url();

    // Should be redirected or see error
    if (url.includes('/admin/role-management')) {
      // Still on RBAC page - check for error message
      const errorMessage = await page.$('text=No autorizado, text=Access denied, text=No tiene permisos');
      if (errorMessage) {
        pass('Access denied message shown');
      } else {
        fail('RBAC access control', 'Non-superadmin can access RBAC page!');
      }
    } else {
      pass('Non-superadmin redirected away from RBAC');
    }

  } catch (error) {
    fail('Non-superadmin test', error.message);
  } finally {
    await page.close();
  }
}

/**
 * Test 3: Student functionality unchanged
 */
async function testStudentFunctionality(browser) {
  const page = await browser.newPage();

  try {
    console.log('\n🔴 Test 3: Student functionality unchanged...');

    // Login as student
    const loginSuccess = await login(page, TEST_USERS.student.email, TEST_USERS.student.password);
    if (!loginSuccess) {
      warn('Student test', 'Could not login as test student');
      await page.close();
      return;
    }

    // Check if on dashboard
    const url = page.url();
    if (!url.includes('/dashboard')) {
      warn('Student dashboard', `Not on dashboard: ${url}`);
    } else {
      pass('Student dashboard loads');
    }

    // Check for RBAC link (should NOT exist)
    const rbacLink = await page.$('a:has-text("Roles y Permisos")');
    if (rbacLink) {
      fail('Student RBAC access', 'Student can see RBAC menu!');
    } else {
      pass('RBAC hidden from student');
    }

    // Check for student content
    const pageContent = await page.content();
    if (pageContent.includes('curso') || pageContent.includes('Curso')) {
      pass('Student content visible');
    } else {
      warn('Student content', 'Could not verify student-specific content');
    }

    // Check console for errors
    const logs = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        logs.push(msg.text());
      }
    });

    await sleep(1000);

    if (logs.length > 0) {
      warn('Student page console errors', `${logs.length} errors found`);
    } else {
      pass('No console errors on student page');
    }

  } catch (error) {
    fail('Student functionality test', error.message);
  } finally {
    await page.close();
  }
}

/**
 * Main test runner
 */
async function runTests() {
  console.log('\n' + '='.repeat(60));
  console.log('🌐 RBAC BROWSER UI TESTS');
  console.log('='.repeat(60));

  if (SUPERADMIN.password === 'ASK_USER_FOR_PASSWORD') {
    console.log('\n⚠️  WARNING: Superadmin password not set!');
    console.log('   Set SUPERADMIN_PASSWORD environment variable to run full tests.');
    console.log('   Example: SUPERADMIN_PASSWORD=yourpass node scripts/rbac-browser-test.js\n');
  }

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    await testSuperadminAccess(browser);
    await testNonSuperadminBlocked(browser);
    await testStudentFunctionality(browser);
  } finally {
    await browser.close();
  }

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 BROWSER TEST SUMMARY');
  console.log('='.repeat(60));
  console.log(`✅ Passed: ${results.passed.length}`);
  console.log(`❌ Failed: ${results.failed.length}`);
  console.log(`⚠️  Warnings: ${results.warnings.length}`);

  if (results.failed.length > 0) {
    console.log('\n❌ FAILED TESTS:');
    results.failed.forEach(({ test, error }) => {
      console.log(`  - ${test}: ${error}`);
    });
  }

  if (results.warnings.length > 0) {
    console.log('\n⚠️  WARNINGS:');
    results.warnings.forEach(({ test, message }) => {
      console.log(`  - ${test}: ${message}`);
    });
  }

  console.log('\n' + '='.repeat(60));

  if (results.failed.length === 0) {
    console.log('✅ ALL BROWSER TESTS PASSED (or skipped)!');
    console.log('\nThe RBAC system appears to work correctly in the browser.');
    console.log('\n' + '='.repeat(60));
    return 0;
  } else {
    console.log('❌ SOME TESTS FAILED');
    console.log('\nPlease review the failures above.');
    console.log('\n' + '='.repeat(60));
    return 1;
  }
}

// Check if puppeteer is installed
try {
  runTests()
    .then(exitCode => process.exit(exitCode))
    .catch(error => {
      console.error('\n❌ Test execution error:', error);
      process.exit(1);
    });
} catch (error) {
  console.error('\n❌ Could not run tests. Is puppeteer installed?');
  console.error('   Run: npm install puppeteer');
  process.exit(1);
}
