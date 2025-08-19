#!/usr/bin/env node

/**
 * Verify E2E tests are safe to run
 * Checks configuration and prevents accidental production damage
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Verifying E2E Test Safety\n');
console.log('='.repeat(60));

let isSafe = true;
const issues = [];
const warnings = [];

// Check 1: Verify safe global setup is being used
console.log('\n1. Checking Playwright configuration...');
const playwrightConfig = fs.readFileSync(path.join(__dirname, '../playwright.config.ts'), 'utf-8');

if (playwrightConfig.includes('global-setup-safe')) {
  console.log('   ✅ Using safe global setup');
} else if (playwrightConfig.includes('global-setup')) {
  issues.push('DANGEROUS: Using unsafe global-setup.ts that deletes production data!');
  isSafe = false;
  console.log('   ❌ Using DANGEROUS global setup');
} else {
  warnings.push('No global setup configured');
  console.log('   ⚠️ No global setup found');
}

// Check 2: Verify test environment configuration
console.log('\n2. Checking test environment configuration...');
const testEnvLocal = path.join(__dirname, '../.env.test.local');
const testEnv = path.join(__dirname, '../.env.test');

let envContent = '';
if (fs.existsSync(testEnvLocal)) {
  envContent = fs.readFileSync(testEnvLocal, 'utf-8');
  console.log('   📄 Using .env.test.local');
} else if (fs.existsSync(testEnv)) {
  envContent = fs.readFileSync(testEnv, 'utf-8');
  console.log('   📄 Using .env.test');
} else {
  warnings.push('No test environment file found');
  console.log('   ⚠️ No test environment file');
}

if (envContent) {
  // Check if pointing to production
  if (envContent.includes('sxlogxqzmarhqsblxmtj.supabase.co')) {
    warnings.push('Tests configured to use production database');
    console.log('   ⚠️ Configured for PRODUCTION database');
    
    // Check if safety flag is set
    if (!process.env.ALLOW_PRODUCTION_TESTS) {
      console.log('   ℹ️ Production tests blocked (ALLOW_PRODUCTION_TESTS not set)');
    } else {
      warnings.push('ALLOW_PRODUCTION_TESTS is enabled - tests will run against production!');
      console.log('   ⚠️ ALLOW_PRODUCTION_TESTS is enabled!');
    }
  } else if (envContent.includes('127.0.0.1:54321')) {
    console.log('   ✅ Configured for local Supabase');
  }
}

// Check 3: Look for dangerous patterns in test files
console.log('\n3. Scanning for dangerous test patterns...');
const testDir = path.join(__dirname, '../e2e');
const dangerousPatterns = [
  /deleteUser.*brent@perrotuertocm\.cl/g,
  /delete.*from.*profiles.*where/gi,
  /truncate.*table/gi,
  /drop.*table/gi,
  /delete.*from.*courses(?!.*test)/gi
];

function scanDirectory(dir) {
  const files = fs.readdirSync(dir);
  
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory() && !file.includes('node_modules')) {
      scanDirectory(filePath);
    } else if (file.endsWith('.ts') || file.endsWith('.js')) {
      const content = fs.readFileSync(filePath, 'utf-8');
      
      for (const pattern of dangerousPatterns) {
        if (pattern.test(content)) {
          const relativePath = path.relative(process.cwd(), filePath);
          issues.push(`Dangerous pattern found in ${relativePath}: ${pattern}`);
          isSafe = false;
        }
      }
    }
  }
}

try {
  scanDirectory(testDir);
  if (isSafe) {
    console.log('   ✅ No dangerous patterns found in test files');
  }
} catch (err) {
  console.log('   ⚠️ Could not scan test files:', err.message);
}

// Check 4: Verify test data namespacing
console.log('\n4. Checking test data isolation...');
const helpersPath = path.join(__dirname, '../e2e/utils/course-structure-helpers.ts');
if (fs.existsSync(helpersPath)) {
  const helpersContent = fs.readFileSync(helpersPath, 'utf-8');
  
  if (helpersContent.includes('TEST_NAMESPACE') || helpersContent.includes('e2e_test_')) {
    console.log('   ✅ Test data uses namespace isolation');
  } else {
    warnings.push('Test helpers may not use proper data isolation');
    console.log('   ⚠️ Test data isolation not confirmed');
  }
}

// Check 5: Look for production user credentials
console.log('\n5. Checking for production credentials...');
const prodCredentials = [
  'brent@perrotuertocm.cl',
  'NuevaEdu2025!',
  'bcurtis@nuevaeducacion.org'
];

let foundProdCreds = false;
for (const cred of prodCredentials) {
  if (envContent.includes(cred)) {
    warnings.push(`Production credential found in test env: ${cred}`);
    foundProdCreds = true;
  }
}

if (!foundProdCreds) {
  console.log('   ✅ No production credentials in test environment');
} else {
  console.log('   ⚠️ Production credentials found in test configuration');
}

// Summary
console.log('\n' + '='.repeat(60));
console.log('📊 SAFETY CHECK SUMMARY\n');

if (issues.length > 0) {
  console.log('❌ CRITICAL ISSUES FOUND:\n');
  issues.forEach(issue => console.log(`   • ${issue}`));
}

if (warnings.length > 0) {
  console.log('\n⚠️ WARNINGS:\n');
  warnings.forEach(warning => console.log(`   • ${warning}`));
}

if (isSafe && warnings.length === 0) {
  console.log('✅ All safety checks passed!');
  console.log('\nTests appear safe to run.');
} else if (isSafe) {
  console.log('\n⚠️ Tests can run but review warnings above.');
  console.log('\nRecommendation: Use local Supabase for testing:');
  console.log('  1. Install: brew install supabase/tap/supabase');
  console.log('  2. Start: supabase start');
  console.log('  3. Update .env.test.local to use http://127.0.0.1:54321');
} else {
  console.log('\n❌ TESTS ARE NOT SAFE TO RUN!');
  console.log('\nRequired fixes:');
  console.log('  1. Use safe global setup: e2e/global-setup-safe.ts');
  console.log('  2. Remove dangerous deletion patterns from tests');
  console.log('  3. Use test data namespacing for isolation');
  console.log('\nDO NOT RUN TESTS until these issues are fixed!');
  process.exit(1);
}

console.log('\n' + '='.repeat(60));