/**
 * FNE LMS Data Seeding - Security System Test
 * 
 * This script tests the security validation system to ensure it properly
 * blocks production databases and requires proper sandbox configuration.
 */

const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(process.cwd(), '.env.local') });

const { confirmAndGetSandboxClient } = require('./utils/database');

async function testSecuritySystem() {
  console.log('🔒 TESTING DATA SEEDING SECURITY SYSTEM\n');
  
  // Test 1: Current environment configuration
  console.log('📋 Test 1: Current Environment Configuration');
  console.log(`   NEXT_PUBLIC_SUPABASE_URL: ${process.env.NEXT_PUBLIC_SUPABASE_URL || 'NOT SET'}`);
  console.log(`   FNE_LMS_ENVIRONMENT: ${process.env.FNE_LMS_ENVIRONMENT || 'NOT SET'}`);
  console.log(`   SUPABASE_SERVICE_ROLE_KEY: ${process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SET' : 'NOT SET'}\n`);
  
  // Test 2: Security validation
  console.log('🛡️  Test 2: Security Validation');
  try {
    const client = await confirmAndGetSandboxClient();
    console.log('✅ Security validation PASSED - Safe to proceed with data seeding');
    console.log('   All security checks completed successfully\n');
    return true;
  } catch (error) {
    console.log('❌ Security validation FAILED - Data seeding blocked for safety');
    console.log(`   Error: ${error.message}\n`);
    return false;
  }
}

// Test 3: Production URL Detection Test
async function testProductionBlocking() {
  console.log('🚨 Test 3: Production URL Blocking');
  
  // Temporarily set production URL to test blocking
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://sxlogxqzmarhqsblxmtj.supabase.co';
  
  try {
    await confirmAndGetSandboxClient();
    console.log('❌ CRITICAL FAILURE: Production URL was NOT blocked!');
    return false;
  } catch (error) {
    console.log('✅ Production URL correctly blocked');
    console.log('   System properly prevents production database access\n');
    return true;
  } finally {
    // Restore original URL
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
  }
}

// Main test execution
async function runAllTests() {
  console.log('🔍 COMPREHENSIVE SECURITY TESTING\n');
  
  const test1 = await testSecuritySystem();
  const test2 = await testProductionBlocking();
  
  console.log('📊 TEST RESULTS SUMMARY');
  console.log('========================');
  console.log(`Environment Configuration: ${test1 ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Production URL Blocking: ${test2 ? '✅ PASS' : '❌ FAIL'}`);
  
  if (test1 && test2) {
    console.log('\n🎉 ALL SECURITY TESTS PASSED');
    console.log('The data seeding system is secure and ready for use.\n');
    process.exit(0);
  } else {
    console.log('\n🚨 SECURITY TESTS FAILED');
    console.log('Do not proceed with data seeding until issues are resolved.\n');
    process.exit(1);
  }
}

// Run tests if called directly
if (require.main === module) {
  runAllTests().catch(error => {
    console.error('❌ Test execution failed:', error);
    process.exit(1);
  });
}

module.exports = { testSecuritySystem, testProductionBlocking };