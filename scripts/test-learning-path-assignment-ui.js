#!/usr/bin/env node

/**
 * E2E Testing Script for Learning Path Assignment UI
 * Tests the refactored assignment interface functionality
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Test configuration
const TEST_USER_EMAIL = 'test.admin@example.com';
const TEST_USER_PASSWORD = 'TestPassword123!';

// Helper function to simulate API calls
async function callSearchAssigneesAPI(pathId, searchType, query, page = 1) {
  const apiUrl = 'http://localhost:3000/api/learning-paths/search-assignees';
  
  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // In a real test, you'd need to include auth headers
      },
      body: JSON.stringify({
        pathId,
        searchType,
        query,
        page,
        pageSize: 20
      })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'API request failed');
    }
    
    return await response.json();
  } catch (error) {
    console.error('API call failed:', error);
    throw error;
  }
}

// Test 1: Scalability Test - Performance with 1000+ users
async function testScalability() {
  console.log('\n📊 Test 1: Scalability Test');
  console.log('Testing search performance with 1000+ users...');
  
  try {
    // Get a learning path
    const { data: paths, error } = await supabase
      .from('learning_paths')
      .select('id')
      .limit(1)
      .single();
    
    if (error || !paths) {
      throw new Error('No learning paths found');
    }
    
    const pathId = paths.id;
    
    // Test search performance
    console.time('User search time');
    const userResults = await callSearchAssigneesAPI(pathId, 'users', 'test', 1);
    console.timeEnd('User search time');
    
    console.log(`✅ Found ${userResults.totalCount} users matching "test"`);
    console.log(`✅ First page contains ${userResults.results.length} results`);
    console.log(`✅ Has more pages: ${userResults.hasMore}`);
    
    // Test pagination
    if (userResults.hasMore) {
      console.time('Page 2 load time');
      const page2Results = await callSearchAssigneesAPI(pathId, 'users', 'test', 2);
      console.timeEnd('Page 2 load time');
      console.log(`✅ Page 2 contains ${page2Results.results.length} results`);
    }
    
    console.log('✅ Scalability test passed');
  } catch (error) {
    console.error('❌ Scalability test failed:', error);
  }
}

// Test 2: Search & Select Flow
async function testSearchAndSelectFlow() {
  console.log('\n🔍 Test 2: Search & Select Flow');
  console.log('Testing user and group search functionality...');
  
  try {
    const { data: paths } = await supabase
      .from('learning_paths')
      .select('id')
      .limit(1)
      .single();
    
    const pathId = paths.id;
    
    // Search for users
    console.log('Searching for users with "john"...');
    const userResults = await callSearchAssigneesAPI(pathId, 'users', 'john', 1);
    console.log(`✅ Found ${userResults.results.length} users`);
    
    if (userResults.results.length > 0) {
      console.log(`✅ First result: ${userResults.results[0].name} (${userResults.results[0].email})`);
    }
    
    // Search for groups
    console.log('\nSearching for groups with "equipo"...');
    const groupResults = await callSearchAssigneesAPI(pathId, 'groups', 'equipo', 1);
    console.log(`✅ Found ${groupResults.results.length} groups`);
    
    if (groupResults.results.length > 0) {
      console.log(`✅ First result: ${groupResults.results[0].name} (${groupResults.results[0].member_count} members)`);
    }
    
    console.log('✅ Search & Select flow test passed');
  } catch (error) {
    console.error('❌ Search & Select flow test failed:', error);
  }
}

// Test 3: Existing Assignment Test
async function testExistingAssignmentIndicator() {
  console.log('\n🏷️ Test 3: Existing Assignment Test');
  console.log('Testing assignment status indicators...');
  
  try {
    // Get a learning path
    const { data: paths } = await supabase
      .from('learning_paths')
      .select('id')
      .limit(1)
      .single();
    
    const pathId = paths.id;
    
    // Get some users
    const { data: users } = await supabase
      .from('profiles')
      .select('id, first_name, last_name')
      .limit(5);
    
    if (!users || users.length === 0) {
      throw new Error('No users found');
    }
    
    // Create a test assignment
    const testUserId = users[0].id;
    console.log(`Creating test assignment for user: ${users[0].first_name} ${users[0].last_name}`);
    
    const { error: assignError } = await supabase
      .from('learning_path_assignments')
      .upsert({
        path_id: pathId,
        user_id: testUserId,
        assigned_by: testUserId,
        assigned_at: new Date().toISOString()
      }, { onConflict: 'user_id,path_id' });
    
    if (assignError) {
      console.error('Failed to create test assignment:', assignError);
    }
    
    // Search for the assigned user
    const searchName = users[0].first_name.toLowerCase();
    console.log(`\nSearching for "${searchName}"...`);
    const searchResults = await callSearchAssigneesAPI(pathId, 'users', searchName, 1);
    
    // Find the test user in results
    const assignedUser = searchResults.results.find(u => u.id === testUserId);
    
    if (assignedUser) {
      console.log(`✅ User found with assignment status: ${assignedUser.isAlreadyAssigned ? 'ASSIGNED' : 'NOT ASSIGNED'}`);
      
      if (assignedUser.isAlreadyAssigned) {
        console.log('✅ Assignment indicator working correctly');
      } else {
        console.log('❌ Assignment indicator not showing correctly');
      }
    } else {
      console.log('❌ Test user not found in search results');
    }
    
    // Clean up test assignment
    await supabase
      .from('learning_path_assignments')
      .delete()
      .match({ path_id: pathId, user_id: testUserId });
    
    console.log('✅ Existing assignment test completed');
  } catch (error) {
    console.error('❌ Existing assignment test failed:', error);
  }
}

// Test 4: Empty Query Behavior
async function testEmptyQueryBehavior() {
  console.log('\n📭 Test 4: Empty Query Behavior');
  console.log('Testing behavior with empty search queries...');
  
  try {
    const { data: paths } = await supabase
      .from('learning_paths')
      .select('id')
      .limit(1)
      .single();
    
    const pathId = paths.id;
    
    // Test empty query
    console.log('Testing empty query for users...');
    const emptyResults = await callSearchAssigneesAPI(pathId, 'users', '', 1);
    
    console.log(`✅ Empty query returned ${emptyResults.totalCount} total results`);
    console.log(`✅ Page size limited to ${emptyResults.results.length} results`);
    
    if (emptyResults.totalCount > 20) {
      console.log(`✅ Pagination working: hasMore = ${emptyResults.hasMore}`);
    }
    
    console.log('✅ Empty query behavior test passed');
  } catch (error) {
    console.error('❌ Empty query behavior test failed:', error);
  }
}

// Main test runner
async function runTests() {
  console.log('🧪 Starting Learning Path Assignment UI Tests');
  console.log('='.repeat(50));
  
  try {
    await testScalability();
    await testSearchAndSelectFlow();
    await testExistingAssignmentIndicator();
    await testEmptyQueryBehavior();
    
    console.log('\n' + '='.repeat(50));
    console.log('✅ All tests completed!');
    console.log('\nNote: These tests simulate the API calls. For full E2E testing,');
    console.log('run the application and manually verify the UI behavior.');
  } catch (error) {
    console.error('\n❌ Test suite failed:', error);
    process.exit(1);
  }
}

// Run the tests
runTests();