#!/usr/bin/env node

/**
 * Run the quiz submission integration test
 * This verifies that the quiz submission fix is working correctly
 */

const { execSync } = require('child_process');
const path = require('path');

console.log('🧪 Running Quiz Submission Integration Test...\n');

console.log('📋 This test will:');
console.log('  - Create a test student and course');
console.log('  - Submit a quiz as the student');
console.log('  - Verify the submission was successful');
console.log('  - Check that RLS policies work correctly');
console.log('  - Clean up all test data afterwards\n');

console.log('⚠️  Prerequisites:');
console.log('  1. The frontend fix has been deployed (quiz components pass Supabase client)');
console.log('  2. The RLS fix migration has been applied to the database');
console.log('  3. Environment variables are configured (.env file)\n');

try {
  // Run the test
  console.log('🏃 Running test...\n');
  execSync('npm test -- __tests__/services/quizSubmissions.test.js', {
    cwd: path.join(__dirname, '..'),
    stdio: 'inherit'
  });
  
  console.log('\n✅ All tests passed! The quiz submission fix is working correctly.');
} catch (error) {
  console.error('\n❌ Test failed. Please check:');
  console.error('  1. Have you applied the RLS fix migration?');
  console.error('  2. Are your environment variables configured?');
  console.error('  3. Is your Supabase instance running?');
  process.exit(1);
}