#!/usr/bin/env node

/**
 * Genera - Test Data Cleanup Script
 * 
 * This script removes all test data created during development and testing.
 * Features:
 * - Dry-run mode to preview deletions without making changes
 * - Safe identification of test data based on patterns
 * - Comprehensive logging and verification
 * - CASCADE deletion leveraging foreign key constraints
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Configuration
const DRY_RUN = process.argv.includes('--dry-run') || process.argv.includes('-d');
const VERBOSE = process.argv.includes('--verbose') || process.argv.includes('-v');

// Test data identification patterns
const TEST_PATTERNS = {
  // Test emails from faker.js typically use common domains
  email: [
    /@example\.com$/,
    /@test\.com$/,
    /@faker\.test$/,
    /@mailinator\.com$/,
    /@10minutemail\.com$/
  ],
  // Test group names from seed script
  groupNames: [
    /^Departamento /,
    /^Equipo /,
    /^Proyecto /,
    /^Comunidad /,
    /^Clase /
  ],
  // Faker-generated names often have distinctive patterns
  names: [
    /Test User/i,
    /Fake/i,
    /Demo/i,
    /Sample/i
  ]
};

/**
 * Check if an email matches test patterns
 */
function isTestEmail(email) {
  if (!email) return false;
  return TEST_PATTERNS.email.some(pattern => pattern.test(email));
}

/**
 * Check if a name matches test patterns
 */
function isTestName(name) {
  if (!name) return false;
  return TEST_PATTERNS.names.some(pattern => pattern.test(name)) ||
         TEST_PATTERNS.groupNames.some(pattern => pattern.test(name));
}

/**
 * Log with different levels
 */
function log(level, message, data = null) {
  const timestamp = new Date().toISOString();
  const prefix = DRY_RUN ? '[DRY RUN]' : '[CLEANUP]';
  
  if (level === 'verbose' && !VERBOSE) return;
  
  console.log(`${timestamp} ${prefix} ${message}`);
  if (data && VERBOSE) {
    console.log(JSON.stringify(data, null, 2));
  }
}

/**
 * Identify test users
 */
async function identifyTestUsers() {
  log('info', '🔍 Identifying test users...');
  
  const { data: users, error } = await supabase
    .from('profiles')
    .select('id, email, first_name, last_name, created_at')
    .order('created_at', { ascending: false });
  
  if (error) {
    throw new Error(`Failed to fetch users: ${error.message}`);
  }
  
  const testUsers = users.filter(user => {
    const isTest = isTestEmail(user.email) || 
                   isTestName(user.first_name) || 
                   isTestName(user.last_name) ||
                   isTestName(`${user.first_name} ${user.last_name}`);
    
    if (isTest && VERBOSE) {
      log('verbose', `Test user identified: ${user.email} (${user.first_name} ${user.last_name})`);
    }
    
    return isTest;
  });
  
  log('info', `Found ${testUsers.length} test users out of ${users.length} total users`);
  return testUsers;
}

/**
 * Identify test groups
 */
async function identifyTestGroups() {
  log('info', '🔍 Identifying test groups...');
  
  // Try community_workspaces first (based on refactored code)
  let { data: groups, error } = await supabase
    .from('community_workspaces')
    .select('id, name, description, created_at')
    .order('created_at', { ascending: false });
  
  // If community_workspaces doesn't exist, try groups table
  if (error && error.message.includes('does not exist')) {
    log('verbose', 'community_workspaces table not found, trying groups table...');
    
    const result = await supabase
      .from('groups')
      .select('id, name, description, created_at')
      .order('created_at', { ascending: false });
    
    groups = result.data;
    error = result.error;
  }
  
  if (error) {
    throw new Error(`Failed to fetch groups: ${error.message}`);
  }
  
  const testGroups = groups.filter(group => {
    const isTest = isTestName(group.name) || isTestName(group.description);
    
    if (isTest && VERBOSE) {
      log('verbose', `Test group identified: ${group.name}`);
    }
    
    return isTest;
  });
  
  log('info', `Found ${testGroups.length} test groups out of ${groups.length} total groups`);
  return testGroups;
}

/**
 * Identify test learning path assignments
 */
async function identifyTestAssignments(testUserIds, testGroupIds) {
  log('info', '🔍 Identifying test learning path assignments...');
  
  const { data: assignments, error } = await supabase
    .from('learning_path_assignments')
    .select('id, path_id, user_id, group_id, assigned_by, assigned_at')
    .order('assigned_at', { ascending: false });
  
  if (error) {
    if (error.message.includes('does not exist')) {
      log('info', 'learning_path_assignments table does not exist, skipping...');
      return [];
    }
    throw new Error(`Failed to fetch assignments: ${error.message}`);
  }
  
  const testAssignments = assignments.filter(assignment => {
    const isTest = testUserIds.includes(assignment.user_id) ||
                   testGroupIds.includes(assignment.group_id) ||
                   testUserIds.includes(assignment.assigned_by);
    
    if (isTest && VERBOSE) {
      log('verbose', `Test assignment identified: ${assignment.id}`);
    }
    
    return isTest;
  });
  
  log('info', `Found ${testAssignments.length} test assignments out of ${assignments.length} total assignments`);
  return testAssignments;
}

/**
 * Delete test data with proper ordering (respecting foreign keys)
 */
async function deleteTestData(testUsers, testGroups, testAssignments) {
  const summary = {
    assignments: 0,
    userRoles: 0,
    authUsers: 0,
    profiles: 0,
    groups: 0
  };
  
  try {
    // 1. Delete learning path assignments first (no dependencies)
    if (testAssignments.length > 0) {
      log('info', `${DRY_RUN ? 'Would delete' : 'Deleting'} ${testAssignments.length} test learning path assignments...`);
      
      if (!DRY_RUN) {
        const assignmentIds = testAssignments.map(a => a.id);
        const { error } = await supabase
          .from('learning_path_assignments')
          .delete()
          .in('id', assignmentIds);
        
        if (error) throw new Error(`Failed to delete assignments: ${error.message}`);
      }
      
      summary.assignments = testAssignments.length;
      log('info', `✅ ${DRY_RUN ? 'Would delete' : 'Deleted'} ${testAssignments.length} learning path assignments`);
    }
    
    // 2. Delete user roles (CASCADE should handle this but let's be explicit)
    const testUserIds = testUsers.map(u => u.id);
    const testGroupIds = testGroups.map(g => g.id);
    
    if (testUserIds.length > 0 || testGroupIds.length > 0) {
      log('info', `${DRY_RUN ? 'Would delete' : 'Deleting'} user roles for test users/groups...`);
      
      if (!DRY_RUN) {
        const { data: userRoles, error: userRolesError } = await supabase
          .from('user_roles')
          .delete()
          .or(`user_id.in.(${testUserIds.join(',')}),community_id.in.(${testGroupIds.join(',')})`)
          .select('id');
        
        if (userRolesError && !userRolesError.message.includes('does not exist')) {
          throw new Error(`Failed to delete user roles: ${userRolesError.message}`);
        }
        
        summary.userRoles = userRoles ? userRoles.length : 0;
      }
      
      log('info', `✅ ${DRY_RUN ? 'Would delete' : 'Deleted'} user roles`);
    }
    
    // 3. Delete auth users before profiles (auth.users references profiles)
    if (testUsers.length > 0) {
      log('info', `${DRY_RUN ? 'Would delete' : 'Deleting'} ${testUsers.length} auth users...`);
      
      if (!DRY_RUN) {
        for (const user of testUsers) {
          const { error } = await supabase.auth.admin.deleteUser(user.id);
          if (error && !error.message.includes('not found')) {
            log('warn', `Warning: Failed to delete auth user ${user.email}: ${error.message}`);
          }
        }
      }
      
      summary.authUsers = testUsers.length;
      log('info', `✅ ${DRY_RUN ? 'Would delete' : 'Deleted'} ${testUsers.length} auth users`);
    }
    
    // 4. Delete profiles (CASCADE should handle related records)
    if (testUsers.length > 0) {
      log('info', `${DRY_RUN ? 'Would delete' : 'Deleting'} ${testUsers.length} test user profiles...`);
      
      if (!DRY_RUN) {
        const { error } = await supabase
          .from('profiles')
          .delete()
          .in('id', testUserIds);
        
        if (error) throw new Error(`Failed to delete profiles: ${error.message}`);
      }
      
      summary.profiles = testUsers.length;
      log('info', `✅ ${DRY_RUN ? 'Would delete' : 'Deleted'} ${testUsers.length} profiles`);
    }
    
    // 5. Delete groups/community_workspaces last
    if (testGroups.length > 0) {
      log('info', `${DRY_RUN ? 'Would delete' : 'Deleting'} ${testGroups.length} test groups...`);
      
      if (!DRY_RUN) {
        // Try community_workspaces first
        let { error } = await supabase
          .from('community_workspaces')
          .delete()
          .in('id', testGroupIds);
        
        // If community_workspaces doesn't exist, try groups
        if (error && error.message.includes('does not exist')) {
          const result = await supabase
            .from('groups')
            .delete()
            .in('id', testGroupIds);
          
          error = result.error;
        }
        
        if (error) throw new Error(`Failed to delete groups: ${error.message}`);
      }
      
      summary.groups = testGroups.length;
      log('info', `✅ ${DRY_RUN ? 'Would delete' : 'Deleted'} ${testGroups.length} groups`);
    }
    
    return summary;
    
  } catch (error) {
    log('error', `❌ Error during deletion: ${error.message}`);
    throw error;
  }
}

/**
 * Verify cleanup results
 */
async function verifyCleanup(originalCounts) {
  if (DRY_RUN) {
    log('info', '📊 Dry run completed - no actual changes were made');
    return;
  }
  
  log('info', '🔍 Verifying cleanup results...');
  
  // Re-check counts
  const { data: remainingUsers } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true });
  
  const { data: remainingGroups } = await supabase
    .from('community_workspaces')
    .select('id', { count: 'exact', head: true });
  
  // If community_workspaces doesn't exist, check groups
  if (!remainingGroups) {
    const { data: groupsData } = await supabase
      .from('groups')
      .select('id', { count: 'exact', head: true });
    
    if (groupsData) {
      log('info', `Groups remaining: ${groupsData.length || 0}`);
    }
  } else {
    log('info', `Community workspaces remaining: ${remainingGroups.length || 0}`);
  }
  
  log('info', `Users remaining: ${remainingUsers?.length || 0}`);
  log('info', '✅ Cleanup verification completed');
}

/**
 * Main cleanup function
 */
async function main() {
  try {
    console.log('🧹 Genera Test Data Cleanup Script');
    console.log('=====================================');
    
    if (DRY_RUN) {
      console.log('🔍 DRY RUN MODE - No changes will be made');
    } else {
      console.log('⚠️  LIVE MODE - Changes will be permanent');
      console.log('Press Ctrl+C within 5 seconds to cancel...');
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    
    console.log('');
    
    // Get original counts for reference
    const { data: allUsers } = await supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true });
    
    log('info', `Total users in database: ${allUsers?.length || 0}`);
    
    // Identify test data
    const testUsers = await identifyTestUsers();
    const testGroups = await identifyTestGroups();
    const testAssignments = await identifyTestAssignments(
      testUsers.map(u => u.id),
      testGroups.map(g => g.id)
    );
    
    // Show summary
    console.log('\n📋 CLEANUP SUMMARY');
    console.log('==================');
    console.log(`Test users to ${DRY_RUN ? 'preview' : 'delete'}: ${testUsers.length}`);
    console.log(`Test groups to ${DRY_RUN ? 'preview' : 'delete'}: ${testGroups.length}`);
    console.log(`Test assignments to ${DRY_RUN ? 'preview' : 'delete'}: ${testAssignments.length}`);
    
    if (testUsers.length === 0 && testGroups.length === 0 && testAssignments.length === 0) {
      log('info', '✅ No test data found - nothing to clean up');
      return;
    }
    
    // Show sample data if verbose
    if (VERBOSE && testUsers.length > 0) {
      console.log('\n📝 Sample test users:');
      testUsers.slice(0, 5).forEach(user => {
        console.log(`  - ${user.email} (${user.first_name} ${user.last_name})`);
      });
      if (testUsers.length > 5) {
        console.log(`  ... and ${testUsers.length - 5} more`);
      }
    }
    
    if (VERBOSE && testGroups.length > 0) {
      console.log('\n📝 Sample test groups:');
      testGroups.slice(0, 5).forEach(group => {
        console.log(`  - ${group.name}`);
      });
      if (testGroups.length > 5) {
        console.log(`  ... and ${testGroups.length - 5} more`);
      }
    }
    
    console.log('');
    
    // Perform cleanup
    const summary = await deleteTestData(testUsers, testGroups, testAssignments);
    
    // Final verification
    await verifyCleanup();
    
    // Show final summary
    console.log('\n🎯 CLEANUP COMPLETED');
    console.log('====================');
    console.log(`Learning path assignments ${DRY_RUN ? 'previewed' : 'deleted'}: ${summary.assignments}`);
    console.log(`User roles ${DRY_RUN ? 'previewed' : 'deleted'}: ${summary.userRoles}`);
    console.log(`Auth users ${DRY_RUN ? 'previewed' : 'deleted'}: ${summary.authUsers}`);
    console.log(`Profiles ${DRY_RUN ? 'previewed' : 'deleted'}: ${summary.profiles}`);
    console.log(`Groups ${DRY_RUN ? 'previewed' : 'deleted'}: ${summary.groups}`);
    
    if (DRY_RUN) {
      console.log('\n💡 To execute actual cleanup, run: node scripts/cleanup-test-data.js');
    } else {
      console.log('\n✅ Test data cleanup completed successfully!');
    }
    
  } catch (error) {
    console.error('\n❌ Cleanup failed:', error.message);
    if (VERBOSE) {
      console.error(error);
    }
    process.exit(1);
  }
}

// Show usage if help requested
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
Genera Test Data Cleanup Script

Usage:
  node scripts/cleanup-test-data.js [options]

Options:
  --dry-run, -d    Preview what would be deleted without making changes
  --verbose, -v    Show detailed logging and sample data
  --help, -h       Show this help message

Examples:
  node scripts/cleanup-test-data.js --dry-run          # Preview cleanup
  node scripts/cleanup-test-data.js --dry-run -v      # Preview with details
  node scripts/cleanup-test-data.js                   # Execute cleanup
  node scripts/cleanup-test-data.js -v                # Execute with verbose logging

The script identifies test data by:
- Email patterns (@example.com, @test.com, @faker.test, etc.)
- Name patterns (Test User, Fake, Demo, Sample)
- Group name patterns (Departamento, Equipo, Proyecto, etc.)

Deletion order (respects foreign key constraints):
1. Learning path assignments
2. User roles
3. Auth users
4. User profiles
5. Groups/community workspaces
`);
  process.exit(0);
}

// Run the script
main();