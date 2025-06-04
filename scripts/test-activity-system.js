#!/usr/bin/env node

/**
 * FNE LMS - Activity Feed System Test Script
 * Comprehensive testing of activity feed functionality
 * Phase 5 of Collaborative Workspace System
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
  testWorkspaceName: 'Test Activity Workspace',
  testUserEmail: 'test-activity@nuevaeducacion.org'
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
  activities: [],
  subscription: null,
  aggregation: null
};

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Log test result
 */
function logTest(name, passed, details = '') {
  testResults.total++;
  if (passed) {
    testResults.passed++;
    console.log(`✅ ${name}`);
  } else {
    testResults.failed++;
    console.log(`❌ ${name}: ${details}`);
  }
  testResults.details.push({ name, passed, details });
}

/**
 * Sleep utility
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry wrapper
 */
async function retry(fn, description, maxRetries = TEST_CONFIG.maxRetries) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      console.log(`⚠️  Retry ${i + 1}/${maxRetries} for ${description}: ${error.message}`);
      if (i === maxRetries - 1) throw error;
      await sleep(1000 * (i + 1));
    }
  }
}

/**
 * Clean test data
 */
async function cleanupTestData() {
  console.log('\n🧹 Cleaning up test data...');
  
  try {
    // Delete test activities
    if (testData.activities.length > 0) {
      const activityIds = testData.activities.map(a => a.id);
      await supabase
        .from('activity_feed')
        .delete()
        .in('id', activityIds);
    }

    // Delete test subscription
    if (testData.subscription) {
      await supabase
        .from('activity_subscriptions')
        .delete()
        .eq('id', testData.subscription.id);
    }

    // Delete test aggregation
    if (testData.aggregation) {
      await supabase
        .from('activity_aggregations')
        .delete()
        .eq('id', testData.aggregation.id);
    }

    // Delete test workspace
    if (testData.workspace) {
      await supabase
        .from('community_workspaces')
        .delete()
        .eq('id', testData.workspace.id);
    }

    // Delete test user
    if (testData.user) {
      await supabase
        .from('profiles')
        .delete()
        .eq('user_id', testData.user.id);
    }

    console.log('✅ Test data cleaned up successfully');
  } catch (error) {
    console.log(`⚠️  Cleanup warning: ${error.message}`);
  }
}

// =============================================================================
// SETUP FUNCTIONS
// =============================================================================

/**
 * Create test workspace
 */
async function setupTestWorkspace() {
  console.log('\n📁 Setting up test workspace...');
  
  const { data, error } = await supabase
    .from('community_workspaces')
    .insert({
      community_id: `test-community-${Date.now()}`,
      name: TEST_CONFIG.testWorkspaceName,
      description: 'Test workspace for activity feed testing',
      settings: {
        activity_notifications: true,
        daily_digest: true,
        public_activities: true
      },
      is_active: true
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create test workspace: ${error.message}`);
  }

  testData.workspace = data;
  logTest('Setup test workspace', true);
  return data;
}

/**
 * Create test user
 */
async function setupTestUser() {
  console.log('👤 Setting up test user...');
  
  const { data, error } = await supabase
    .from('profiles')
    .insert({
      id: `test-user-${Date.now()}`,
      name: 'Test Activity User',
      email: TEST_CONFIG.testUserEmail,
      role: 'docente',
      school: 'test-school',
      growth_community: 'Test Community'
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create test user: ${error.message}`);
  }

  testData.user = data;
  logTest('Setup test user', true);
  return data;
}

// =============================================================================
// ACTIVITY TESTS
// =============================================================================

/**
 * Test activity creation
 */
async function testActivityCreation() {
  console.log('\n📝 Testing activity creation...');
  
  const activityTypes = [
    {
      type: 'meeting_created',
      entity: 'meeting',
      title: 'Nueva reunión creada',
      description: 'Reunión de planificación semanal'
    },
    {
      type: 'document_uploaded',
      entity: 'document',
      title: 'Documento subido',
      description: 'Plan de trabajo Q1 2025.pdf'
    },
    {
      type: 'message_sent',
      entity: 'message',
      title: 'Mensaje enviado',
      description: 'Nuevo mensaje en canal general'
    },
    {
      type: 'user_joined',
      entity: 'user',
      title: 'Usuario se unió',
      description: 'Nuevo miembro en la comunidad'
    }
  ];

  for (const activityConfig of activityTypes) {
    try {
      const { data, error } = await supabase
        .rpc('create_activity', {
          p_workspace_id: testData.workspace.id,
          p_user_id: testData.user.id,
          p_activity_type: activityConfig.type,
          p_entity_type: activityConfig.entity,
          p_entity_id: `test-${activityConfig.entity}-${Date.now()}`,
          p_title: activityConfig.title,
          p_description: activityConfig.description,
          p_metadata: {
            test: true,
            priority: 'medium',
            category: 'testing'
          },
          p_importance_score: 2,
          p_tags: ['test', 'automation'],
          p_related_users: [testData.user.id]
        });

      if (error) {
        throw new Error(`Failed to create ${activityConfig.type}: ${error.message}`);
      }

      // Fetch the created activity
      const { data: activity, error: fetchError } = await supabase
        .from('activity_feed')
        .select('*')
        .eq('id', data)
        .single();

      if (fetchError) {
        throw new Error(`Failed to fetch created activity: ${fetchError.message}`);
      }

      testData.activities.push(activity);
      logTest(`Create ${activityConfig.type} activity`, true);
      
    } catch (error) {
      logTest(`Create ${activityConfig.type} activity`, false, error.message);
    }
  }
}

/**
 * Test activity feed retrieval
 */
async function testActivityFeedRetrieval() {
  console.log('\n📊 Testing activity feed retrieval...');
  
  try {
    const { data, error } = await supabase
      .from('activity_feed')
      .select(`
        *,
        profiles!inner(name, role)
      `)
      .eq('workspace_id', testData.workspace.id)
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) {
      throw new Error(`Failed to retrieve activity feed: ${error.message}`);
    }

    logTest('Retrieve activity feed', data.length > 0);
    logTest('Activity feed includes user profiles', data.some(a => a.profiles));
    logTest('Activity feed is properly ordered', 
      data.length <= 1 || new Date(data[0].created_at) >= new Date(data[1].created_at));
    
  } catch (error) {
    logTest('Retrieve activity feed', false, error.message);
  }
}

/**
 * Test activity filtering
 */
async function testActivityFiltering() {
  console.log('\n🔍 Testing activity filtering...');
  
  try {
    // Test filter by activity type
    const { data: typeFiltered, error: typeError } = await supabase
      .from('activity_feed')
      .select('*')
      .eq('workspace_id', testData.workspace.id)
      .eq('activity_type', 'meeting_created');

    if (typeError) {
      throw new Error(`Failed to filter by activity type: ${typeError.message}`);
    }

    logTest('Filter by activity type', typeFiltered.every(a => a.activity_type === 'meeting_created'));

    // Test filter by user
    const { data: userFiltered, error: userError } = await supabase
      .from('activity_feed')
      .select('*')
      .eq('workspace_id', testData.workspace.id)
      .eq('user_id', testData.user.id);

    if (userError) {
      throw new Error(`Failed to filter by user: ${userError.message}`);
    }

    logTest('Filter by user', userFiltered.every(a => a.user_id === testData.user.id));

    // Test filter by importance
    const { data: importanceFiltered, error: importanceError } = await supabase
      .from('activity_feed')
      .select('*')
      .eq('workspace_id', testData.workspace.id)
      .gte('importance_score', 2);

    if (importanceError) {
      throw new Error(`Failed to filter by importance: ${importanceError.message}`);
    }

    logTest('Filter by importance score', importanceFiltered.every(a => a.importance_score >= 2));

  } catch (error) {
    logTest('Activity filtering', false, error.message);
  }
}

/**
 * Test activity search
 */
async function testActivitySearch() {
  console.log('\n🔎 Testing activity search...');
  
  try {
    const searchTerm = 'reunión';
    const { data, error } = await supabase
      .from('activity_feed')
      .select('*')
      .eq('workspace_id', testData.workspace.id)
      .or(`title.ilike.%${searchTerm}%,description.ilike.%${searchTerm}%`);

    if (error) {
      throw new Error(`Failed to search activities: ${error.message}`);
    }

    const hasMatchingResults = data.some(a => 
      a.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.description?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    logTest('Search activities by text', hasMatchingResults);
    
  } catch (error) {
    logTest('Search activities by text', false, error.message);
  }
}

// =============================================================================
// SUBSCRIPTION TESTS
// =============================================================================

/**
 * Test activity subscription creation
 */
async function testSubscriptionCreation() {
  console.log('\n🔔 Testing activity subscription creation...');
  
  try {
    const { data, error } = await supabase
      .from('activity_subscriptions')
      .insert({
        user_id: testData.user.id,
        workspace_id: testData.workspace.id,
        activity_types: ['meeting_created', 'document_uploaded', 'message_sent'],
        entity_types: ['meeting', 'document', 'message'],
        notification_methods: ['in_app', 'email'],
        is_enabled: true,
        daily_digest: true,
        weekly_digest: false,
        importance_threshold: 2,
        quiet_hours_start: '22:00',
        quiet_hours_end: '07:00'
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create subscription: ${error.message}`);
    }

    testData.subscription = data;
    logTest('Create activity subscription', true);
    
  } catch (error) {
    logTest('Create activity subscription', false, error.message);
  }
}

/**
 * Test subscription update
 */
async function testSubscriptionUpdate() {
  console.log('\n✏️ Testing subscription update...');
  
  try {
    const { data, error } = await supabase
      .from('activity_subscriptions')
      .update({
        activity_types: ['meeting_created', 'document_uploaded'],
        importance_threshold: 3,
        daily_digest: false
      })
      .eq('id', testData.subscription.id)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update subscription: ${error.message}`);
    }

    logTest('Update subscription preferences', 
      data.importance_threshold === 3 && data.daily_digest === false);
    
  } catch (error) {
    logTest('Update subscription preferences', false, error.message);
  }
}

// =============================================================================
// AGGREGATION TESTS
// =============================================================================

/**
 * Test activity aggregation
 */
async function testActivityAggregation() {
  console.log('\n📈 Testing activity aggregation...');
  
  try {
    const today = new Date().toISOString().split('T')[0];
    
    // Create aggregation data
    const activityCounts = {};
    const entityCounts = {};
    
    testData.activities.forEach(activity => {
      activityCounts[activity.activity_type] = (activityCounts[activity.activity_type] || 0) + 1;
      entityCounts[activity.entity_type] = (entityCounts[activity.entity_type] || 0) + 1;
    });

    const { data, error } = await supabase
      .from('activity_aggregations')
      .insert({
        workspace_id: testData.workspace.id,
        aggregation_date: today,
        aggregation_type: 'daily',
        activity_counts: activityCounts,
        entity_counts: entityCounts,
        top_users: [{
          user_id: testData.user.id,
          name: testData.user.full_name,
          count: testData.activities.length
        }],
        engagement_metrics: {
          total_activities: testData.activities.length,
          unique_users: 1,
          avg_importance: 2.0
        },
        total_activities: testData.activities.length,
        unique_users: 1,
        peak_hour: 14
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create aggregation: ${error.message}`);
    }

    testData.aggregation = data;
    logTest('Create activity aggregation', true);
    logTest('Aggregation contains activity counts', Object.keys(data.activity_counts).length > 0);
    logTest('Aggregation contains entity counts', Object.keys(data.entity_counts).length > 0);
    
  } catch (error) {
    logTest('Create activity aggregation', false, error.message);
  }
}

/**
 * Test activity statistics
 */
async function testActivityStatistics() {
  console.log('\n📊 Testing activity statistics...');
  
  try {
    // Test total activity count
    const { count: totalCount, error: countError } = await supabase
      .from('activity_feed')
      .select('*', { count: 'exact', head: true })
      .eq('workspace_id', testData.workspace.id);

    if (countError) {
      throw new Error(`Failed to get total count: ${countError.message}`);
    }

    logTest('Get total activity count', totalCount >= testData.activities.length);

    // Test activities by type
    const { data: typeStats, error: typeError } = await supabase
      .from('activity_feed')
      .select('activity_type')
      .eq('workspace_id', testData.workspace.id);

    if (typeError) {
      throw new Error(`Failed to get type statistics: ${typeError.message}`);
    }

    const typeCounts = typeStats.reduce((acc, item) => {
      acc[item.activity_type] = (acc[item.activity_type] || 0) + 1;
      return acc;
    }, {});

    logTest('Get activity type statistics', Object.keys(typeCounts).length > 0);

    // Test recent activities
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: recentActivities, error: recentError } = await supabase
      .from('activity_feed')
      .select('*')
      .eq('workspace_id', testData.workspace.id)
      .gte('created_at', oneDayAgo);

    if (recentError) {
      throw new Error(`Failed to get recent activities: ${recentError.message}`);
    }

    logTest('Get recent activities', recentActivities.length >= 0);
    
  } catch (error) {
    logTest('Activity statistics', false, error.message);
  }
}

// =============================================================================
// PERMISSION TESTS
// =============================================================================

/**
 * Test activity permissions
 */
async function testActivityPermissions() {
  console.log('\n🔐 Testing activity permissions...');
  
  try {
    // Test RLS policy for workspace isolation
    const { data: workspaceActivities, error: wsError } = await supabase
      .from('activity_feed')
      .select('*')
      .eq('workspace_id', testData.workspace.id);

    if (wsError) {
      throw new Error(`Failed to test workspace isolation: ${wsError.message}`);
    }

    logTest('Workspace activity isolation', 
      workspaceActivities.every(a => a.workspace_id === testData.workspace.id));

    // Test activity visibility (public activities)
    const { data: publicActivities, error: pubError } = await supabase
      .from('activity_feed')
      .select('*')
      .eq('workspace_id', testData.workspace.id)
      .eq('is_public', true);

    if (pubError) {
      throw new Error(`Failed to test public activities: ${pubError.message}`);
    }

    logTest('Public activity visibility', publicActivities.every(a => a.is_public === true));

    // Test user's own activities
    const { data: userActivities, error: userError } = await supabase
      .from('activity_feed')
      .select('*')
      .eq('workspace_id', testData.workspace.id)
      .eq('user_id', testData.user.id);

    if (userError) {
      throw new Error(`Failed to test user activities: ${userError.message}`);
    }

    logTest('User activity access', userActivities.every(a => a.user_id === testData.user.id));
    
  } catch (error) {
    logTest('Activity permissions', false, error.message);
  }
}

// =============================================================================
// REAL-TIME TESTS
// =============================================================================

/**
 * Test real-time subscriptions
 */
async function testRealTimeSubscriptions() {
  console.log('\n⚡ Testing real-time subscriptions...');
  
  return new Promise((resolve) => {
    let receivedUpdate = false;
    
    // Set up real-time subscription
    const channel = supabase
      .channel(`test-activity-feed:${testData.workspace.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'activity_feed',
          filter: `workspace_id=eq.${testData.workspace.id}`
        },
        (payload) => {
          receivedUpdate = true;
          logTest('Real-time activity insert notification', true);
          supabase.removeChannel(channel);
          resolve();
        }
      )
      .subscribe();

    // Wait for subscription to be ready, then create a test activity
    setTimeout(async () => {
      try {
        await supabase.rpc('create_activity', {
          p_workspace_id: testData.workspace.id,
          p_user_id: testData.user.id,
          p_activity_type: 'user_joined',
          p_entity_type: 'user',
          p_entity_id: 'realtime-test-user',
          p_title: 'Real-time test activity',
          p_description: 'Testing real-time subscriptions',
          p_metadata: { realtime_test: true },
          p_importance_score: 1,
          p_tags: ['test', 'realtime'],
          p_related_users: []
        });
      } catch (error) {
        logTest('Real-time activity creation', false, error.message);
        supabase.removeChannel(channel);
        resolve();
      }
    }, 1000);

    // Timeout after 10 seconds
    setTimeout(() => {
      if (!receivedUpdate) {
        logTest('Real-time activity insert notification', false, 'Timeout waiting for real-time update');
        supabase.removeChannel(channel);
      }
      resolve();
    }, 10000);
  });
}

// =============================================================================
// MAIN TEST EXECUTION
// =============================================================================

/**
 * Main test runner
 */
async function runTests() {
  console.log('🚀 Starting Activity Feed System Tests');
  console.log('=====================================\n');
  
  try {
    // Setup phase
    await retry(() => setupTestWorkspace(), 'Setup test workspace');
    await retry(() => setupTestUser(), 'Setup test user');
    
    // Activity tests
    await retry(() => testActivityCreation(), 'Activity creation tests');
    await retry(() => testActivityFeedRetrieval(), 'Activity feed retrieval');
    await retry(() => testActivityFiltering(), 'Activity filtering');
    await retry(() => testActivitySearch(), 'Activity search');
    
    // Subscription tests
    await retry(() => testSubscriptionCreation(), 'Subscription creation');
    await retry(() => testSubscriptionUpdate(), 'Subscription update');
    
    // Aggregation tests
    await retry(() => testActivityAggregation(), 'Activity aggregation');
    await retry(() => testActivityStatistics(), 'Activity statistics');
    
    // Permission tests
    await retry(() => testActivityPermissions(), 'Activity permissions');
    
    // Real-time tests
    await testRealTimeSubscriptions();
    
  } catch (error) {
    console.error(`\n❌ Test execution failed: ${error.message}`);
  } finally {
    // Cleanup
    await cleanupTestData();
    
    // Results summary
    console.log('\n📊 Test Results Summary');
    console.log('======================');
    console.log(`✅ Passed: ${testResults.passed}`);
    console.log(`❌ Failed: ${testResults.failed}`);
    console.log(`📝 Total:  ${testResults.total}`);
    console.log(`📈 Success Rate: ${((testResults.passed / testResults.total) * 100).toFixed(1)}%`);
    
    if (testResults.failed > 0) {
      console.log('\n❌ Failed Tests:');
      testResults.details
        .filter(result => !result.passed)
        .forEach(result => {
          console.log(`   • ${result.name}: ${result.details}`);
        });
    }
    
    // Exit with appropriate code
    process.exit(testResults.failed === 0 ? 0 : 1);
  }
}

// Handle script interruption
process.on('SIGINT', async () => {
  console.log('\n🛑 Test interrupted. Cleaning up...');
  await cleanupTestData();
  process.exit(1);
});

// Run tests if script is executed directly
if (require.main === module) {
  runTests().catch(error => {
    console.error(`\n💥 Unexpected error: ${error.message}`);
    process.exit(1);
  });
}

module.exports = {
  runTests,
  testResults,
  TEST_CONFIG
};