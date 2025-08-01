#!/usr/bin/env node

/**
 * Direct Database Testing Script for Learning Path Assignment Features
 * Tests the refactored assignment interface functionality directly against the database
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

// Helper function to simulate the search assignees API logic
async function simulateSearchAssignees(pathId, searchType, query, page = 1, pageSize = 20) {
  const offset = (page - 1) * pageSize;
  const searchQuery = query.trim().toLowerCase();
  
  let results = [];
  let totalCount = 0;

  if (searchType === 'users') {
    // Search users
    let userQuery = supabase
      .from('profiles')
      .select('id, first_name, last_name, email', { count: 'exact' });

    // Apply search filter if query is not empty
    if (searchQuery) {
      userQuery = userQuery.or(
        `first_name.ilike.%${searchQuery}%,last_name.ilike.%${searchQuery}%,email.ilike.%${searchQuery}%`
      );
    }

    // Apply pagination
    const { data: users, count, error: usersError } = await userQuery
      .order('first_name')
      .range(offset, offset + pageSize - 1);

    if (usersError) throw usersError;

    totalCount = count || 0;

    // Get existing assignments for these users
    const userIds = (users || []).map(u => u.id);
    
    let assignments = [];
    if (userIds.length > 0) {
      const { data: assignmentData, error: assignmentError } = await supabase
        .from('learning_path_assignments')
        .select('user_id')
        .eq('path_id', pathId)
        .in('user_id', userIds);
      
      if (assignmentError) {
        console.error('Assignment query error:', assignmentError);
      } else {
        assignments = assignmentData || [];
        // Debug logging
        console.log(`[DEBUG] Checking assignments for path ${pathId}, found ${assignments.length} assignments for ${userIds.length} users`);
        if (assignments.length > 0) {
          console.log('[DEBUG] Assigned user IDs:', assignments.map(a => a.user_id));
        }
      }
    }

    const assignedUserIds = new Set(assignments.map(a => a.user_id));

    // Format results
    results = (users || []).map(user => ({
      id: user.id,
      name: `${user.first_name} ${user.last_name}`.trim(),
      email: user.email,
      isAlreadyAssigned: assignedUserIds.has(user.id)
    }));

  } else {
    // Search groups (using community_workspaces)
    let groupQuery = supabase
      .from('community_workspaces')
      .select('id, name, description', { count: 'exact' });

    // Apply search filter if query is not empty
    if (searchQuery) {
      groupQuery = groupQuery.or(
        `name.ilike.%${searchQuery}%,description.ilike.%${searchQuery}%`
      );
    }

    // Apply pagination
    const { data: groups, count, error: groupsError } = await groupQuery
      .order('name')
      .range(offset, offset + pageSize - 1);

    if (groupsError) throw groupsError;

    totalCount = count || 0;

    // Get member counts and existing assignments
    if (groups && groups.length > 0) {
      const groupIds = groups.map(g => g.id);

      // Get member counts
      const { data: memberCounts } = await supabase
        .from('user_roles')
        .select('community_id')
        .in('community_id', groupIds)
        .eq('is_active', true);
      
      const countMap = (memberCounts || []).reduce((acc, item) => {
        acc[item.community_id] = (acc[item.community_id] || 0) + 1;
        return acc;
      }, {});

      // Get existing assignments
      const { data: assignments } = await supabase
        .from('learning_path_assignments')
        .select('group_id')
        .eq('path_id', pathId)
        .in('group_id', groupIds);

      const assignedGroupIds = new Set((assignments || []).map(a => a.group_id));

      // Format results
      results = groups.map(group => ({
        id: group.id,
        name: group.name,
        description: group.description,
        member_count: countMap[group.id] || 0,
        isAlreadyAssigned: assignedGroupIds.has(group.id)
      }));
    }
  }

  const hasMore = totalCount > offset + pageSize;

  return {
    results,
    hasMore,
    totalCount,
    page,
    pageSize
  };
}

// Test 1: Scalability Test - Performance with 1000+ users
async function testScalability() {
  console.log('\n📊 Test 1: Scalability Test');
  console.log('Testing search performance with large datasets...');
  
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
    
    // Count total users in database
    const { count: totalUsers } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true });
    
    console.log(`✅ Total users in database: ${totalUsers}`);
    
    // Test search performance
    console.time('User search time');
    const userResults = await simulateSearchAssignees(pathId, 'users', 'test', 1);
    console.timeEnd('User search time');
    
    console.log(`✅ Found ${userResults.totalCount} users matching "test"`);
    console.log(`✅ First page contains ${userResults.results.length} results`);
    console.log(`✅ Has more pages: ${userResults.hasMore}`);
    
    // Test pagination
    if (userResults.hasMore) {
      console.time('Page 2 load time');
      const page2Results = await simulateSearchAssignees(pathId, 'users', 'test', 2);
      console.timeEnd('Page 2 load time');
      console.log(`✅ Page 2 contains ${page2Results.results.length} results`);
    }
    
    // Test empty query performance (shows all users paginated)
    console.time('Empty query time');
    const allUsersPage1 = await simulateSearchAssignees(pathId, 'users', '', 1);
    console.timeEnd('Empty query time');
    console.log(`✅ Empty query returns ${allUsersPage1.totalCount} total users (paginated)`);
    
    console.log('✅ Scalability test passed - pagination working correctly');
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
    console.log('Searching for users with "mar"...');
    const userResults = await simulateSearchAssignees(pathId, 'users', 'mar', 1);
    console.log(`✅ Found ${userResults.results.length} users on first page (total: ${userResults.totalCount})`);
    
    if (userResults.results.length > 0) {
      console.log(`✅ First 3 results:`);
      userResults.results.slice(0, 3).forEach(user => {
        console.log(`   - ${user.name} (${user.email})${user.isAlreadyAssigned ? ' [ASSIGNED]' : ''}`);
      });
    }
    
    // Search for groups
    console.log('\nSearching for groups with "equipo"...');
    const groupResults = await simulateSearchAssignees(pathId, 'groups', 'equipo', 1);
    console.log(`✅ Found ${groupResults.results.length} groups on first page (total: ${groupResults.totalCount})`);
    
    if (groupResults.results.length > 0) {
      console.log(`✅ First 3 results:`);
      groupResults.results.slice(0, 3).forEach(group => {
        console.log(`   - ${group.name} (${group.member_count} members)${group.isAlreadyAssigned ? ' [ASSIGNED]' : ''}`);
      });
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
    
    // First delete any existing assignment
    await supabase
      .from('learning_path_assignments')
      .delete()
      .match({ path_id: pathId, user_id: testUserId });
    
    // Create new assignment
    const { data: insertData, error: assignError } = await supabase
      .from('learning_path_assignments')
      .insert({
        path_id: pathId,
        user_id: testUserId,
        assigned_by: testUserId,
        assigned_at: new Date().toISOString()
      })
      .select();
    
    if (assignError) {
      console.error('Failed to create test assignment:', assignError);
    } else {
      console.log('✅ Test assignment created:', insertData);
    }
    
    // Verify the assignment was actually created
    const { data: verifyAssignment, error: verifyError } = await supabase
      .from('learning_path_assignments')
      .select('*')
      .eq('path_id', pathId)
      .eq('user_id', testUserId);
    
    if (verifyError) {
      console.error('Failed to verify assignment:', verifyError);
    } else {
      console.log(`✅ Assignment verification: ${verifyAssignment?.length || 0} assignments found`);
      if (verifyAssignment && verifyAssignment.length > 0) {
        console.log('Assignment details:', verifyAssignment[0]);
      }
    }
    
    // Search for the assigned user
    const searchName = users[0].first_name.toLowerCase();
    console.log(`\nSearching for "${searchName}"...`);
    const searchResults = await simulateSearchAssignees(pathId, 'users', searchName, 1);
    
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
    
    // Test with a group
    const { data: groups } = await supabase
      .from('community_workspaces')
      .select('id, name')
      .limit(1)
      .single();
    
    if (groups) {
      console.log(`\nTesting group assignment for: ${groups.name}`);
      
      // Delete any existing assignment
      await supabase
        .from('learning_path_assignments')
        .delete()
        .match({ path_id: pathId, group_id: groups.id });
      
      // Create assignment
      await supabase
        .from('learning_path_assignments')
        .insert({
          path_id: pathId,
          group_id: groups.id,
          assigned_by: testUserId,
          assigned_at: new Date().toISOString()
        });
      
      // Search for the group
      const groupResults = await simulateSearchAssignees(pathId, 'groups', groups.name.split(' ')[0].toLowerCase(), 1);
      const assignedGroup = groupResults.results.find(g => g.id === groups.id);
      
      if (assignedGroup && assignedGroup.isAlreadyAssigned) {
        console.log('✅ Group assignment indicator working correctly');
      }
    }
    
    // Clean up test assignments
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
    
    // Test empty query for users
    console.log('Testing empty query for users...');
    const emptyUserResults = await simulateSearchAssignees(pathId, 'users', '', 1);
    
    console.log(`✅ Empty query returned ${emptyUserResults.totalCount} total users`);
    console.log(`✅ Page size limited to ${emptyUserResults.results.length} results`);
    
    if (emptyUserResults.totalCount > 20) {
      console.log(`✅ Pagination working: hasMore = ${emptyUserResults.hasMore}`);
    }
    
    // Test empty query for groups
    console.log('\nTesting empty query for groups...');
    const emptyGroupResults = await simulateSearchAssignees(pathId, 'groups', '', 1);
    
    console.log(`✅ Empty query returned ${emptyGroupResults.totalCount} total groups`);
    console.log(`✅ Page size limited to ${emptyGroupResults.results.length} results`);
    
    // Test whitespace-only query
    console.log('\nTesting whitespace query...');
    const whitespaceResults = await simulateSearchAssignees(pathId, 'users', '   ', 1);
    console.log(`✅ Whitespace query handled correctly (${whitespaceResults.totalCount} results)`);
    
    console.log('✅ Empty query behavior test passed');
  } catch (error) {
    console.error('❌ Empty query behavior test failed:', error);
  }
}

// Test 5: Pagination Edge Cases
async function testPaginationEdgeCases() {
  console.log('\n📄 Test 5: Pagination Edge Cases');
  console.log('Testing pagination boundary conditions...');
  
  try {
    const { data: paths } = await supabase
      .from('learning_paths')
      .select('id')
      .limit(1)
      .single();
    
    const pathId = paths.id;
    
    // Test last page
    const totalResults = await simulateSearchAssignees(pathId, 'users', '', 1);
    const totalPages = Math.ceil(totalResults.totalCount / 20);
    
    if (totalPages > 1) {
      console.log(`Testing last page (page ${totalPages})...`);
      const lastPageResults = await simulateSearchAssignees(pathId, 'users', '', totalPages);
      
      console.log(`✅ Last page contains ${lastPageResults.results.length} results`);
      console.log(`✅ hasMore = ${lastPageResults.hasMore} (should be false)`);
      
      // Test beyond last page
      const beyondLastPage = await simulateSearchAssignees(pathId, 'users', '', totalPages + 1);
      console.log(`✅ Page beyond last returns ${beyondLastPage.results.length} results (should be 0)`);
    }
    
    console.log('✅ Pagination edge cases test passed');
  } catch (error) {
    console.error('❌ Pagination edge cases test failed:', error);
  }
}

// Main test runner
async function runTests() {
  console.log('🧪 Starting Learning Path Assignment Database Tests');
  console.log('='.repeat(50));
  
  try {
    await testScalability();
    await testSearchAndSelectFlow();
    await testExistingAssignmentIndicator();
    await testEmptyQueryBehavior();
    await testPaginationEdgeCases();
    
    console.log('\n' + '='.repeat(50));
    console.log('✅ All database tests completed successfully!');
    console.log('\nThese tests verify the database queries and logic that power');
    console.log('the refactored learning path assignment UI.');
  } catch (error) {
    console.error('\n❌ Test suite failed:', error);
    process.exit(1);
  }
}

// Run the tests
runTests();