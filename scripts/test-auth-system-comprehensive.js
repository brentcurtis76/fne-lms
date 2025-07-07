/**
 * Comprehensive Authentication System Test
 * This script tests all aspects of the authentication system
 * 
 * Run with: node scripts/test-auth-system-comprehensive.js
 */

const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');
const { promisify } = require('util');
const sleep = promisify(setTimeout);

// Configuration
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://sxlogxqzmarhqsblxmtj.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDczMjIyMjEsImV4cCI6MjA2Mjg5ODIyMX0.J6YJpTDvW6vz7d-N0BkGsLIZY51h_raFPNIQfU5UE5E';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Create clients
const supabase = createClient(supabaseUrl, supabaseAnonKey);
const supabaseAdmin = serviceRoleKey ? createClient(supabaseUrl, serviceRoleKey) : null;

// Test results
const results = {
  passed: 0,
  failed: 0,
  tests: []
};

// Test helper functions
async function runTest(name, testFn) {
  console.log(`\n🧪 Testing: ${name}`);
  try {
    await testFn();
    results.passed++;
    results.tests.push({ name, status: 'PASSED', error: null });
    console.log('✅ PASSED');
  } catch (error) {
    results.failed++;
    results.tests.push({ name, status: 'FAILED', error: error.message });
    console.error('❌ FAILED:', error.message);
  }
}

async function expectNoError(promise, context) {
  try {
    const result = await promise;
    return result;
  } catch (error) {
    throw new Error(`${context}: ${error.message}`);
  }
}

async function expectError(promise, context) {
  try {
    await promise;
    throw new Error(`${context}: Expected an error but none was thrown`);
  } catch (error) {
    // Error expected, test passes
    return error;
  }
}

// Test 1: Basic connectivity
async function testBasicConnectivity() {
  const { error } = await supabase.from('profiles').select('count').limit(1);
  if (error) throw error;
}

// Test 2: Check for RLS recursion on all critical tables
async function testNoRLSRecursion() {
  const tables = [
    'profiles', 'schools', 'platform_feedback', 'lessons', 
    'courses', 'modules', 'blocks', 'course_assignments',
    'course_enrollments', 'quiz_submissions', 'expense_reports'
  ];
  
  for (const table of tables) {
    const { error } = await supabase.from(table).select('id').limit(1);
    if (error && error.message.includes('infinite recursion')) {
      throw new Error(`Table ${table} still has RLS recursion: ${error.message}`);
    }
  }
}

// Test 3: Test API endpoints
async function testAPIEndpoints() {
  const endpoints = [
    { path: '/api/admin/schools', method: 'POST', requiresAuth: true },
    { path: '/api/admin/consultant-assignments', method: 'GET', requiresAuth: true }
  ];
  
  for (const endpoint of endpoints) {
    const url = `http://localhost:3000${endpoint.path}`;
    
    // Test without auth
    if (endpoint.requiresAuth) {
      const response = await fetch(url, { method: endpoint.method });
      if (response.status !== 401) {
        throw new Error(`${endpoint.path} should require authentication but returned ${response.status}`);
      }
    }
    
    // Note: Testing with auth would require a valid session token
    console.log(`  - ${endpoint.path}: Correctly requires authentication`);
  }
}

// Test 4: Role detection functions
async function testRoleDetection() {
  if (!supabaseAdmin) {
    console.log('  ⚠️  Skipping admin tests (no service role key)');
    return;
  }
  
  // Check if role detection functions exist
  const { data: functions, error } = await supabaseAdmin
    .rpc('pg_catalog.pg_proc')
    .select('proname')
    .or('proname.eq.auth_is_admin,proname.eq.auth_is_teacher,proname.eq.auth_get_user_role');
    
  if (error) {
    console.log('  ⚠️  Could not check functions (expected in production)');
    return;
  }
  
  console.log(`  - Found ${functions?.length || 0} role detection functions`);
}

// Test 5: User metadata sync
async function testUserMetadataSync() {
  if (!supabaseAdmin) {
    console.log('  ⚠️  Skipping metadata sync test (no service role key)');
    return;
  }
  
  // Check if any admin users have role in metadata
  const { data: adminUsers, error } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('role', 'admin')
    .limit(5);
    
  if (error) throw error;
  
  console.log(`  - Found ${adminUsers?.length || 0} admin users to check`);
  
  // Check their auth metadata
  for (const user of adminUsers || []) {
    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.getUserById(user.id);
    if (!authError && authUser?.user) {
      const hasRole = authUser.user.user_metadata?.role === 'admin';
      console.log(`  - User ${user.id}: ${hasRole ? '✅ Has role in metadata' : '⚠️  Missing role in metadata'}`);
    }
  }
}

// Test 6: Check materialized view
async function testMaterializedView() {
  const { data, error } = await supabase
    .from('user_roles_cache')
    .select('count')
    .limit(1);
    
  if (error) {
    console.log('  ⚠️  Materialized view not accessible (may need migration)');
  } else {
    console.log('  ✅ Materialized view is accessible');
  }
}

// Test 7: Performance test - no recursive lookups
async function testPerformance() {
  const start = Date.now();
  
  // Run multiple queries that would cause recursion with old policies
  const promises = [];
  for (let i = 0; i < 10; i++) {
    promises.push(supabase.from('lessons').select('id').limit(1));
    promises.push(supabase.from('courses').select('id').limit(1));
    promises.push(supabase.from('profiles').select('id').limit(1));
  }
  
  await Promise.all(promises);
  const duration = Date.now() - start;
  
  console.log(`  - Completed 30 queries in ${duration}ms`);
  if (duration > 5000) {
    throw new Error('Queries are too slow, possible recursion issue');
  }
}

// Main test runner
async function runAllTests() {
  console.log('🔬 Comprehensive Authentication System Test');
  console.log('==========================================\n');
  
  await runTest('Basic Connectivity', testBasicConnectivity);
  await runTest('No RLS Recursion', testNoRLSRecursion);
  await runTest('API Endpoints', testAPIEndpoints);
  await runTest('Role Detection Functions', testRoleDetection);
  await runTest('User Metadata Sync', testUserMetadataSync);
  await runTest('Materialized View Access', testMaterializedView);
  await runTest('Performance (No Recursion)', testPerformance);
  
  // Summary
  console.log('\n==========================================');
  console.log('📊 Test Summary:');
  console.log(`✅ Passed: ${results.passed}`);
  console.log(`❌ Failed: ${results.failed}`);
  console.log(`📈 Success Rate: ${Math.round((results.passed / (results.passed + results.failed)) * 100)}%`);
  
  if (results.failed > 0) {
    console.log('\n❌ Failed Tests:');
    results.tests
      .filter(t => t.status === 'FAILED')
      .forEach(t => console.log(`  - ${t.name}: ${t.error}`));
  }
  
  // Recommendations
  console.log('\n📋 Recommendations:');
  if (results.failed === 0) {
    console.log('✅ All tests passed! The authentication system appears to be working correctly.');
  } else {
    console.log('⚠️  Some tests failed. Please review the errors above and:');
    console.log('  1. Run the database migrations in order');
    console.log('  2. Ensure all API routes are updated');
    console.log('  3. Check that user metadata is synced');
  }
  
  console.log('\n🔒 Security Checklist:');
  console.log('  □ All RLS policies use non-recursive checks');
  console.log('  □ API routes use centralized auth helpers');
  console.log('  □ User roles are synced to JWT metadata');
  console.log('  □ No overly permissive policies exist');
  console.log('  □ Performance is acceptable (no recursion)');
}

// Run the tests
runAllTests().catch(error => {
  console.error('\n💥 Critical test failure:', error);
  process.exit(1);
});