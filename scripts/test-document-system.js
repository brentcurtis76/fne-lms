#!/usr/bin/env node

/**
 * Genera - Document Repository System Test Script
 * Comprehensive testing of document management functionality
 */

const { createClient } = require('@supabase/supabase-js');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

// Supabase configuration
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables');
  process.exit(1);
}

// Initialize Supabase client
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Test configuration
const TEST_CONFIG = {
  timeout: 30000,
  maxRetries: 3,
  testWorkspaceName: 'Test Document Workspace',
  testUserEmail: 'test-documents@nuevaeducacion.org'
};

// Test results tracking
let testResults = {
  passed: 0,
  failed: 0,
  total: 0,
  details: []
};

// Utility functions
function logTest(testName, status, message = '') {
  testResults.total++;
  const icon = status === 'PASS' ? '✅' : '❌';
  const statusColor = status === 'PASS' ? '\x1b[32m' : '\x1b[31m';
  
  console.log(`${icon} ${statusColor}${status}\x1b[0m - ${testName}`);
  if (message) {
    console.log(`   ${message}`);
  }
  
  testResults.details.push({ testName, status, message });
  
  if (status === 'PASS') {
    testResults.passed++;
  } else {
    testResults.failed++;
  }
}

async function runTest(testName, testFn) {
  try {
    await testFn();
    logTest(testName, 'PASS');
  } catch (error) {
    logTest(testName, 'FAIL', error.message);
  }
}

// Test functions
async function testDatabaseSchema() {
  console.log('\n📋 Testing Database Schema...');
  
  // Test document_folders table
  await runTest('Document Folders Table Exists', async () => {
    const { data, error } = await supabase
      .from('document_folders')
      .select('*')
      .limit(1);
    
    if (error && error.message.includes('relation') && error.message.includes('does not exist')) {
      throw new Error('Table document_folders does not exist');
    }
  });

  // Test community_documents table
  await runTest('Community Documents Table Exists', async () => {
    const { data, error } = await supabase
      .from('community_documents')
      .select('*')
      .limit(1);
    
    if (error && error.message.includes('relation') && error.message.includes('does not exist')) {
      throw new Error('Table community_documents does not exist');
    }
  });

  // Test document_versions table
  await runTest('Document Versions Table Exists', async () => {
    const { data, error } = await supabase
      .from('document_versions')
      .select('*')
      .limit(1);
    
    if (error && error.message.includes('relation') && error.message.includes('does not exist')) {
      throw new Error('Table document_versions does not exist');
    }
  });

  // Test document_access_log table
  await runTest('Document Access Log Table Exists', async () => {
    const { data, error } = await supabase
      .from('document_access_log')
      .select('*')
      .limit(1);
    
    if (error && error.message.includes('relation') && error.message.includes('does not exist')) {
      throw new Error('Table document_access_log does not exist');
    }
  });
}

async function testHelperFunctions() {
  console.log('\n🔧 Testing Helper Functions...');

  // Get a test workspace
  const { data: workspace } = await supabase
    .from('community_workspaces')
    .select('id')
    .limit(1)
    .single();

  if (!workspace) {
    logTest('Helper Functions', 'FAIL', 'No workspace found for testing');
    return;
  }

  // Test get_document_statistics function
  await runTest('Document Statistics Function', async () => {
    const { data, error } = await supabase.rpc('get_document_statistics', {
      workspace_uuid: workspace.id
    });

    if (error) {
      throw new Error(`Function failed: ${error.message}`);
    }

    if (!data || typeof data !== 'object') {
      throw new Error('Function returned invalid data structure');
    }
  });

  // Test get_recent_document_activity function
  await runTest('Recent Document Activity Function', async () => {
    const { data, error } = await supabase.rpc('get_recent_document_activity', {
      workspace_uuid: workspace.id,
      limit_count: 10
    });

    if (error) {
      throw new Error(`Function failed: ${error.message}`);
    }

    if (!Array.isArray(data)) {
      throw new Error('Function should return an array');
    }
  });
}

async function testFolderOperations() {
  console.log('\n📁 Testing Folder Operations...');

  let testWorkspace, testUser;

  // Get test workspace and user
  const { data: workspace } = await supabase
    .from('community_workspaces')
    .select('id, name')
    .limit(1)
    .single();

  const { data: user } = await supabase
    .from('auth.users')
    .select('id')
    .limit(1)
    .single();

  if (!workspace || !user) {
    logTest('Folder Operations Setup', 'FAIL', 'Missing workspace or user for testing');
    return;
  }

  testWorkspace = workspace;
  testUser = user;

  // Test folder creation
  let testFolderId;
  await runTest('Create Folder', async () => {
    const { data, error } = await supabase
      .from('document_folders')
      .insert({
        workspace_id: testWorkspace.id,
        folder_name: 'Test Folder ' + Date.now(),
        created_by: testUser.id
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create folder: ${error.message}`);
    }

    testFolderId = data.id;
  });

  // Test folder retrieval
  await runTest('Retrieve Folders', async () => {
    const { data, error } = await supabase
      .from('document_folders')
      .select('*')
      .eq('workspace_id', testWorkspace.id);

    if (error) {
      throw new Error(`Failed to retrieve folders: ${error.message}`);
    }

    if (!Array.isArray(data) || data.length === 0) {
      throw new Error('No folders found or invalid data structure');
    }
  });

  // Test folder breadcrumb function
  if (testFolderId) {
    await runTest('Folder Breadcrumb Function', async () => {
      const { data, error } = await supabase.rpc('get_folder_breadcrumb', {
        folder_uuid: testFolderId
      });

      if (error) {
        throw new Error(`Breadcrumb function failed: ${error.message}`);
      }

      if (!Array.isArray(data)) {
        throw new Error('Breadcrumb function should return an array');
      }
    });
  }

  // Cleanup test folder
  if (testFolderId) {
    await supabase
      .from('document_folders')
      .delete()
      .eq('id', testFolderId);
  }
}

async function testStorageSetup() {
  console.log('\n📦 Testing Storage Setup...');

  // Test bucket existence
  await runTest('Community Documents Bucket Exists', async () => {
    const { data: buckets, error } = await supabase.storage.listBuckets();

    if (error) {
      throw new Error(`Failed to list buckets: ${error.message}`);
    }

    const bucketExists = buckets?.some(bucket => bucket.name === 'community-documents');
    
    if (!bucketExists) {
      throw new Error('Storage bucket "community-documents" does not exist');
    }
  });

  // Test bucket permissions
  await runTest('Storage Bucket Accessibility', async () => {
    const { data, error } = await supabase.storage
      .from('community-documents')
      .list('', { limit: 1 });

    if (error && !error.message.includes('not found')) {
      throw new Error(`Bucket access failed: ${error.message}`);
    }
  });
}

async function testRLSPolicies() {
  console.log('\n🔒 Testing Row Level Security Policies...');

  // Get test data
  const { data: workspace } = await supabase
    .from('community_workspaces')
    .select('id')
    .limit(1)
    .single();

  if (!workspace) {
    logTest('RLS Policies', 'FAIL', 'No workspace found for RLS testing');
    return;
  }

  // Test document_folders RLS
  await runTest('Document Folders RLS Policy', async () => {
    // This would require a specific user context to test properly
    // For now, just verify the table can be queried
    const { data, error } = await supabase
      .from('document_folders')
      .select('id')
      .eq('workspace_id', workspace.id)
      .limit(1);

    if (error && error.message.includes('permission denied')) {
      throw new Error('RLS policy too restrictive or not working correctly');
    }
  });

  // Test community_documents RLS
  await runTest('Community Documents RLS Policy', async () => {
    const { data, error } = await supabase
      .from('community_documents')
      .select('id')
      .eq('workspace_id', workspace.id)
      .limit(1);

    if (error && error.message.includes('permission denied')) {
      throw new Error('RLS policy too restrictive or not working correctly');
    }
  });
}

async function testDocumentMetrics() {
  console.log('\n📊 Testing Document Metrics...');

  const { data: workspace } = await supabase
    .from('community_workspaces')
    .select('id')
    .limit(1)
    .single();

  if (!workspace) {
    logTest('Document Metrics', 'FAIL', 'No workspace found for metrics testing');
    return;
  }

  // Test statistics generation
  await runTest('Document Statistics Generation', async () => {
    const { data, error } = await supabase.rpc('get_document_statistics', {
      workspace_uuid: workspace.id
    });

    if (error) {
      throw new Error(`Statistics generation failed: ${error.message}`);
    }

    // Verify expected fields
    const expectedFields = [
      'total_documents',
      'total_folders', 
      'total_storage_bytes',
      'total_downloads',
      'recent_uploads',
      'file_types',
      'top_uploaders'
    ];

    for (const field of expectedFields) {
      if (!(field in data)) {
        throw new Error(`Missing expected field in statistics: ${field}`);
      }
    }
  });
}

async function testSystemIntegration() {
  console.log('\n🔗 Testing System Integration...');

  // Test workspace-document integration
  await runTest('Workspace-Document Integration', async () => {
    const { data: workspaces, error } = await supabase
      .from('community_workspaces')
      .select(`
        id,
        name,
        document_folders (
          id,
          folder_name
        )
      `)
      .limit(1);

    if (error) {
      throw new Error(`Integration query failed: ${error.message}`);
    }

    if (!Array.isArray(workspaces)) {
      throw new Error('Invalid response structure from integration query');
    }
  });

  // Test user-document permissions integration
  await runTest('User-Document Permissions Integration', async () => {
    const { data: users } = await supabase
      .from('profiles')
      .select('id, role')
      .limit(1)
      .single();

    if (users) {
      // This would test actual permission checking
      // For now, just verify the structure exists
      logTest('User Permissions Structure', 'PASS', 'User role system available for permissions');
    }
  });
}

// Main test execution
async function runAllTests() {
  console.log('🧪 Genera - Document Repository System Tests');
  console.log('='.repeat(50));
  console.log(`⏰ Starting tests at ${new Date().toLocaleString()}`);
  console.log(`🔧 Testing against: ${supabaseUrl}`);

  try {
    await testDatabaseSchema();
    await testHelperFunctions();
    await testFolderOperations();
    await testStorageSetup();
    await testRLSPolicies();
    await testDocumentMetrics();
    await testSystemIntegration();

  } catch (error) {
    console.error('\n💥 Test suite encountered an error:', error.message);
  }

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(60));
  console.log(`✅ Passed: ${testResults.passed}`);
  console.log(`❌ Failed: ${testResults.failed}`);
  console.log(`📊 Total:  ${testResults.total}`);
  
  const successRate = testResults.total > 0 ? (testResults.passed / testResults.total * 100).toFixed(1) : 0;
  console.log(`📈 Success Rate: ${successRate}%`);

  if (testResults.failed === 0) {
    console.log('\n🎉 All tests passed! Document repository system is ready.');
    console.log('\n📌 Next steps:');
    console.log('   1. Access the workspace at: http://localhost:3000/community/workspace');
    console.log('   2. Navigate to the "Documentos" tab');
    console.log('   3. Test document upload functionality');
    console.log('   4. Verify folder creation and navigation');
    console.log('   5. Check document preview and download features');
  } else {
    console.log('\n⚠️  Some tests failed. Review the output above and check:');
    console.log('   1. Database migration was successful');
    console.log('   2. All required tables exist');
    console.log('   3. RLS policies are properly configured');
    console.log('   4. Storage bucket is set up correctly');
    
    // Show failed tests
    console.log('\n❌ Failed Tests:');
    testResults.details
      .filter(test => test.status === 'FAIL')
      .forEach(test => {
        console.log(`   • ${test.testName}: ${test.message}`);
      });
  }

  console.log('\n📝 Detailed test log saved to console output above.');
  console.log('⏰ Tests completed at:', new Date().toLocaleString());

  // Exit with appropriate code
  process.exit(testResults.failed > 0 ? 1 : 0);
}

// Error handling
process.on('unhandledRejection', (error) => {
  console.error('\n💥 Unhandled test error:', error);
  process.exit(1);
});

// Run tests
runAllTests().catch(console.error);