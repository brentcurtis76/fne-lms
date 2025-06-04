#!/usr/bin/env node

/**
 * FNE LMS - Messaging System Test Script
 * Comprehensive testing of messaging functionality
 * Phase 4 of Collaborative Workspace System
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
  testWorkspaceName: 'Test Messaging Workspace',
  testUserEmail: 'test-messaging@nuevaeducacion.org'
};

// Test results tracking
let testResults = {
  passed: 0,
  failed: 0,
  total: 0,
  details: []
};

// Test data storage
let testData = {
  workspace: null,
  user: null,
  thread: null,
  message: null,
  attachment: null
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
  console.log('\n📋 Testing Messaging Database Schema...');
  
  // Test message_threads table
  await runTest('Message Threads Table Exists', async () => {
    const { data, error } = await supabase
      .from('message_threads')
      .select('*')
      .limit(1);
    
    if (error && error.message.includes('relation') && error.message.includes('does not exist')) {
      throw new Error('Table message_threads does not exist');
    }
  });

  // Test community_messages table
  await runTest('Community Messages Table Exists', async () => {
    const { data, error } = await supabase
      .from('community_messages')
      .select('*')
      .limit(1);
    
    if (error && error.message.includes('relation') && error.message.includes('does not exist')) {
      throw new Error('Table community_messages does not exist');
    }
  });

  // Test message_mentions table
  await runTest('Message Mentions Table Exists', async () => {
    const { data, error } = await supabase
      .from('message_mentions')
      .select('*')
      .limit(1);
    
    if (error && error.message.includes('relation') && error.message.includes('does not exist')) {
      throw new Error('Table message_mentions does not exist');
    }
  });

  // Test message_reactions table
  await runTest('Message Reactions Table Exists', async () => {
    const { data, error } = await supabase
      .from('message_reactions')
      .select('*')
      .limit(1);
    
    if (error && error.message.includes('relation') && error.message.includes('does not exist')) {
      throw new Error('Table message_reactions does not exist');
    }
  });

  // Test message_attachments table
  await runTest('Message Attachments Table Exists', async () => {
    const { data, error } = await supabase
      .from('message_attachments')
      .select('*')
      .limit(1);
    
    if (error && error.message.includes('relation') && error.message.includes('does not exist')) {
      throw new Error('Table message_attachments does not exist');
    }
  });

  // Test message_activity_log table
  await runTest('Message Activity Log Table Exists', async () => {
    const { data, error } = await supabase
      .from('message_activity_log')
      .select('*')
      .limit(1);
    
    if (error && error.message.includes('relation') && error.message.includes('does not exist')) {
      throw new Error('Table message_activity_log does not exist');
    }
  });
}

async function testHelperFunctions() {
  console.log('\n🔧 Testing Helper Functions...');

  // Test get_thread_statistics function
  await runTest('Get Thread Statistics Function', async () => {
    const { data, error } = await supabase.rpc('get_thread_statistics', {
      p_thread_id: '00000000-0000-0000-0000-000000000000' // Dummy UUID
    });
    
    if (error && !error.message.includes('thread not found')) {
      throw new Error(`Function error: ${error.message}`);
    }
  });

  // Test extract_mentions function
  await runTest('Extract Mentions Function', async () => {
    const { data, error } = await supabase.rpc('extract_mentions', {
      p_content: 'Hello @user123 and @user456, how are you?'
    });
    
    if (error) {
      throw new Error(`Function error: ${error.message}`);
    }
    
    if (!Array.isArray(data)) {
      throw new Error('Function should return an array');
    }
  });

  // Test get_workspace_messaging_stats function
  await runTest('Get Workspace Messaging Stats Function', async () => {
    const { data, error } = await supabase.rpc('get_workspace_messaging_stats', {
      p_workspace_id: '00000000-0000-0000-0000-000000000000' // Dummy UUID
    });
    
    if (error && !error.message.includes('workspace not found')) {
      throw new Error(`Function error: ${error.message}`);
    }
  });
}

async function setupTestData() {
  console.log('\n🔨 Setting up Test Data...');

  // Get or create test workspace
  await runTest('Setup Test Workspace', async () => {
    let { data: workspace, error } = await supabase
      .from('community_workspaces')
      .select('*')
      .eq('name', TEST_CONFIG.testWorkspaceName)
      .single();

    if (error || !workspace) {
      // Create test workspace
      const { data: newWorkspace, error: createError } = await supabase
        .from('community_workspaces')
        .insert({
          name: TEST_CONFIG.testWorkspaceName,
          community_id: '00000000-0000-0000-0000-000000000001',
          created_by: '00000000-0000-0000-0000-000000000001',
          is_active: true
        })
        .select()
        .single();

      if (createError) {
        throw new Error(`Could not create test workspace: ${createError.message}`);
      }
      testData.workspace = newWorkspace;
    } else {
      testData.workspace = workspace;
    }
  });

  // Get or create test user
  await runTest('Setup Test User', async () => {
    let { data: user, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('email', TEST_CONFIG.testUserEmail)
      .single();

    if (error || !user) {
      // Create test user
      const { data: newUser, error: createError } = await supabase
        .from('profiles')
        .insert({
          email: TEST_CONFIG.testUserEmail,
          full_name: 'Test Messaging User',
          role: 'docente',
          is_active: true
        })
        .select()
        .single();

      if (createError) {
        throw new Error(`Could not create test user: ${createError.message}`);
      }
      testData.user = newUser;
    } else {
      testData.user = user;
    }
  });
}

async function testThreadOperations() {
  console.log('\n💬 Testing Thread Operations...');

  // Test thread creation
  await runTest('Create Message Thread', async () => {
    const { data, error } = await supabase
      .from('message_threads')
      .insert({
        workspace_id: testData.workspace.id,
        thread_title: 'Test Thread for Automated Testing',
        description: 'This is a test thread created by the automated test script.',
        category: 'general',
        created_by: testData.user.id,
        is_pinned: false,
        is_locked: false,
        is_archived: false,
        last_message_at: new Date().toISOString(),
        message_count: 0,
        participant_count: 1
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Could not create thread: ${error.message}`);
    }

    testData.thread = data;
  });

  // Test thread retrieval
  await runTest('Retrieve Message Thread', async () => {
    const { data, error } = await supabase
      .from('message_threads')
      .select('*')
      .eq('id', testData.thread.id)
      .single();

    if (error) {
      throw new Error(`Could not retrieve thread: ${error.message}`);
    }

    if (data.thread_title !== 'Test Thread for Automated Testing') {
      throw new Error('Thread data does not match');
    }
  });

  // Test thread update
  await runTest('Update Message Thread', async () => {
    const { data, error } = await supabase
      .from('message_threads')
      .update({
        description: 'Updated description for automated testing',
        is_pinned: true
      })
      .eq('id', testData.thread.id)
      .select()
      .single();

    if (error) {
      throw new Error(`Could not update thread: ${error.message}`);
    }

    if (!data.is_pinned) {
      throw new Error('Thread was not updated correctly');
    }
  });
}

async function testMessageOperations() {
  console.log('\n📨 Testing Message Operations...');

  // Test message creation
  await runTest('Create Message', async () => {
    const { data, error } = await supabase
      .from('community_messages')
      .insert({
        workspace_id: testData.workspace.id,
        thread_id: testData.thread.id,
        author_id: testData.user.id,
        content: 'This is a test message created by the automated test script.',
        content_html: '<p>This is a test message created by the automated test script.</p>',
        message_type: 'regular',
        is_edited: false,
        is_deleted: false
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Could not create message: ${error.message}`);
    }

    testData.message = data;
  });

  // Test message retrieval
  await runTest('Retrieve Message', async () => {
    const { data, error } = await supabase
      .from('community_messages')
      .select('*')
      .eq('id', testData.message.id)
      .single();

    if (error) {
      throw new Error(`Could not retrieve message: ${error.message}`);
    }

    if (!data.content.includes('automated test script')) {
      throw new Error('Message content does not match');
    }
  });

  // Test message with mentions
  await runTest('Create Message with Mentions', async () => {
    const { data, error } = await supabase
      .from('community_messages')
      .insert({
        workspace_id: testData.workspace.id,
        thread_id: testData.thread.id,
        author_id: testData.user.id,
        content: `Hello @${testData.user.id}, this is a test message with mentions.`,
        message_type: 'regular',
        is_edited: false,
        is_deleted: false
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Could not create message with mentions: ${error.message}`);
    }
  });

  // Test message edit
  await runTest('Edit Message', async () => {
    const { data, error } = await supabase
      .from('community_messages')
      .update({
        content: 'This message has been edited by the automated test script.',
        is_edited: true,
        edited_at: new Date().toISOString()
      })
      .eq('id', testData.message.id)
      .select()
      .single();

    if (error) {
      throw new Error(`Could not edit message: ${error.message}`);
    }

    if (!data.is_edited) {
      throw new Error('Message was not marked as edited');
    }
  });
}

async function testReactionOperations() {
  console.log('\n👍 Testing Reaction Operations...');

  // Test reaction creation
  await runTest('Add Message Reaction', async () => {
    const { data, error } = await supabase
      .from('message_reactions')
      .insert({
        message_id: testData.message.id,
        user_id: testData.user.id,
        reaction_type: 'thumbs_up',
        is_active: true
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Could not add reaction: ${error.message}`);
    }
  });

  // Test reaction retrieval
  await runTest('Retrieve Message Reactions', async () => {
    const { data, error } = await supabase
      .from('message_reactions')
      .select('*')
      .eq('message_id', testData.message.id)
      .eq('is_active', true);

    if (error) {
      throw new Error(`Could not retrieve reactions: ${error.message}`);
    }

    if (!data || data.length === 0) {
      throw new Error('No reactions found');
    }
  });

  // Test reaction toggle (remove)
  await runTest('Remove Message Reaction', async () => {
    const { data, error } = await supabase
      .from('message_reactions')
      .update({ is_active: false })
      .eq('message_id', testData.message.id)
      .eq('user_id', testData.user.id)
      .eq('reaction_type', 'thumbs_up')
      .select()
      .single();

    if (error) {
      throw new Error(`Could not remove reaction: ${error.message}`);
    }

    if (data.is_active) {
      throw new Error('Reaction was not deactivated');
    }
  });
}

async function testMentionOperations() {
  console.log('\n@ Testing Mention Operations...');

  // Test mention creation
  await runTest('Create Message Mention', async () => {
    const { data, error } = await supabase
      .from('message_mentions')
      .insert({
        message_id: testData.message.id,
        mentioned_user_id: testData.user.id,
        mention_type: 'user',
        mention_text: `@${testData.user.id}`,
        is_read: false
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Could not create mention: ${error.message}`);
    }
  });

  // Test mention retrieval
  await runTest('Retrieve User Mentions', async () => {
    const { data, error } = await supabase
      .from('message_mentions')
      .select('*')
      .eq('mentioned_user_id', testData.user.id)
      .eq('is_read', false);

    if (error) {
      throw new Error(`Could not retrieve mentions: ${error.message}`);
    }

    if (!data || data.length === 0) {
      throw new Error('No mentions found');
    }
  });

  // Test mention mark as read
  await runTest('Mark Mention as Read', async () => {
    const { data, error } = await supabase
      .from('message_mentions')
      .update({ is_read: true })
      .eq('mentioned_user_id', testData.user.id)
      .eq('message_id', testData.message.id)
      .select()
      .single();

    if (error) {
      throw new Error(`Could not mark mention as read: ${error.message}`);
    }

    if (!data.is_read) {
      throw new Error('Mention was not marked as read');
    }
  });
}

async function testStorageBucket() {
  console.log('\n📦 Testing Storage Bucket...');

  // Test bucket exists
  await runTest('Message Attachments Bucket Exists', async () => {
    const { data: buckets, error } = await supabase.storage.listBuckets();
    
    if (error) {
      throw new Error(`Could not list buckets: ${error.message}`);
    }

    const bucketExists = buckets?.some(bucket => bucket.name === 'message-attachments');
    if (!bucketExists) {
      throw new Error('Bucket "message-attachments" does not exist');
    }
  });

  // Test bucket permissions (list files)
  await runTest('Bucket File Listing Permission', async () => {
    const { data, error } = await supabase.storage
      .from('message-attachments')
      .list('test-folder', { limit: 1 });

    // Error is expected if folder doesn't exist, but should not be permission denied
    if (error && error.message.includes('permission')) {
      throw new Error(`Permission denied: ${error.message}`);
    }
  });
}

async function testRLS() {
  console.log('\n🔒 Testing Row Level Security...');

  // Test thread access with correct workspace
  await runTest('Thread RLS - Valid Workspace Access', async () => {
    const { data, error } = await supabase
      .from('message_threads')
      .select('*')
      .eq('workspace_id', testData.workspace.id);

    if (error) {
      throw new Error(`RLS denied valid access: ${error.message}`);
    }
  });

  // Test message access with correct thread
  await runTest('Message RLS - Valid Thread Access', async () => {
    const { data, error } = await supabase
      .from('community_messages')
      .select('*')
      .eq('thread_id', testData.thread.id);

    if (error) {
      throw new Error(`RLS denied valid access: ${error.message}`);
    }
  });
}

async function testActivityLogging() {
  console.log('\n📊 Testing Activity Logging...');

  // Test activity log entry creation
  await runTest('Create Activity Log Entry', async () => {
    const { data, error } = await supabase
      .from('message_activity_log')
      .insert({
        user_id: testData.user.id,
        workspace_id: testData.workspace.id,
        message_id: testData.message.id,
        thread_id: testData.thread.id,
        action_type: 'message_sent',
        metadata: {
          test: true,
          automated: true,
          timestamp: new Date().toISOString()
        }
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Could not create activity log: ${error.message}`);
    }
  });

  // Test activity log retrieval
  await runTest('Retrieve Activity Logs', async () => {
    const { data, error } = await supabase
      .from('message_activity_log')
      .select('*')
      .eq('workspace_id', testData.workspace.id)
      .eq('action_type', 'message_sent')
      .order('created_at', { ascending: false })
      .limit(5);

    if (error) {
      throw new Error(`Could not retrieve activity logs: ${error.message}`);
    }

    if (!data || data.length === 0) {
      throw new Error('No activity logs found');
    }
  });
}

async function cleanupTestData() {
  console.log('\n🧹 Cleaning up Test Data...');

  try {
    // Delete test messages
    if (testData.message) {
      await supabase
        .from('community_messages')
        .delete()
        .eq('thread_id', testData.thread.id);
    }

    // Delete test thread
    if (testData.thread) {
      await supabase
        .from('message_threads')
        .delete()
        .eq('id', testData.thread.id);
    }

    // Delete test workspace (optional - comment out to keep for manual testing)
    // if (testData.workspace && testData.workspace.name === TEST_CONFIG.testWorkspaceName) {
    //   await supabase
    //     .from('community_workspaces')
    //     .delete()
    //     .eq('id', testData.workspace.id);
    // }

    console.log('✅ Test data cleanup completed');
  } catch (error) {
    console.log('⚠️  Error during cleanup:', error.message);
  }
}

function printSummary() {
  console.log('\n' + '='.repeat(60));
  console.log('📊 MESSAGING SYSTEM TEST SUMMARY');
  console.log('='.repeat(60));
  console.log(`✅ Tests Passed: ${testResults.passed}`);
  console.log(`❌ Tests Failed: ${testResults.failed}`);
  console.log(`📋 Total Tests: ${testResults.total}`);
  console.log(`📈 Success Rate: ${Math.round((testResults.passed / testResults.total) * 100)}%`);

  if (testResults.failed > 0) {
    console.log('\n❌ Failed Tests:');
    testResults.details
      .filter(result => result.status === 'FAIL')
      .forEach(result => {
        console.log(`   • ${result.testName}: ${result.message}`);
      });
  }

  console.log('\n📌 Next Steps:');
  if (testResults.failed === 0) {
    console.log('   🎉 All tests passed! The messaging system is ready for use.');
    console.log('   🔗 Access the messaging system at: http://localhost:3000/community/workspace');
    console.log('   💬 Click on the "Mensajería" tab to start using the messaging features.');
  } else {
    console.log('   🔧 Fix the failing tests before using the messaging system.');
    console.log('   📖 Check the error messages above for debugging information.');
    console.log('   🚀 Re-run this test script after making fixes.');
  }
}

// Main execution
async function main() {
  console.log('🧪 FNE LMS - Messaging System Test Suite');
  console.log('========================================\n');

  try {
    await testDatabaseSchema();
    await testHelperFunctions();
    await setupTestData();
    await testThreadOperations();
    await testMessageOperations();
    await testReactionOperations();
    await testMentionOperations();
    await testStorageBucket();
    await testRLS();
    await testActivityLogging();
    await cleanupTestData();
    
    printSummary();
    
    // Exit with appropriate code
    process.exit(testResults.failed > 0 ? 1 : 0);
    
  } catch (error) {
    console.error('\n💥 Test suite failed with error:', error.message);
    process.exit(1);
  }
}

// Error handling
process.on('unhandledRejection', (error) => {
  console.error('\n💥 Unhandled error:', error);
  process.exit(1);
});

// Run the tests
main().catch(console.error);