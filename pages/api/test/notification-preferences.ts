import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import notificationService from '../../../lib/notificationService';

// Initialize Supabase client with service role
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Phase 4 Notification Preferences Test Endpoint
 * Tests all preference combinations and notification channels
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify authentication
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing authorization' });
  }

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  
  if (authError || !user) {
    return res.status(401).json({ error: 'Invalid authentication' });
  }

  const { test_type = 'all' } = req.body;
  console.log(`\n🧪 Running Phase 4 notification preference tests: ${test_type}\n`);

  try {
    const results: any = {
      test_type,
      timestamp: new Date().toISOString(),
      user_id: user.id,
      tests: {}
    };

    // Run selected tests
    if (test_type === 'all' || test_type === 'preferences') {
      results.tests.preferences = await testPreferenceSettings(user.id);
    }

    if (test_type === 'all' || test_type === 'quiet_hours') {
      results.tests.quiet_hours = await testQuietHours(user.id);
    }

    if (test_type === 'all' || test_type === 'email_digest') {
      results.tests.email_digest = await testEmailDigest(user.id);
    }

    if (test_type === 'all' || test_type === 'rate_limiting') {
      results.tests.rate_limiting = await testRateLimiting(user.id);
    }

    if (test_type === 'all' || test_type === 'smart_filtering') {
      results.tests.smart_filtering = await testSmartFiltering(user.id);
    }

    // Calculate summary
    let totalTests = 0;
    let passedTests = 0;
    let failedTests = 0;

    Object.values(results.tests).forEach((testGroup: any) => {
      if (testGroup.results) {
        testGroup.results.forEach((test: any) => {
          totalTests++;
          if (test.passed) passedTests++;
          else failedTests++;
        });
      }
    });

    results.summary = {
      total_tests: totalTests,
      passed: passedTests,
      failed: failedTests,
      success_rate: totalTests > 0 ? ((passedTests / totalTests) * 100).toFixed(1) + '%' : '0%'
    };

    console.log(`\n✅ Phase 4 test summary: ${passedTests}/${totalTests} passed (${results.summary.success_rate})\n`);

    return res.status(200).json({
      success: true,
      results
    });

  } catch (error) {
    console.error('Test error:', error);
    return res.status(500).json({ 
      error: 'Test failed', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
}

/**
 * Test 1: Preference Settings
 */
async function testPreferenceSettings(userId: string) {
  console.log('🔧 Testing preference settings...');
  const results = [];

  try {
    // Test getting default preferences
    const { data: prefs } = await supabaseAdmin
      .from('user_notification_preferences')
      .select('*')
      .eq('user_id', userId)
      .single();

    results.push({
      test: 'Get user preferences',
      passed: !!prefs,
      details: prefs ? 'Preferences retrieved successfully' : 'No preferences found'
    });

    // Test updating preferences
    const testSettings = {
      assignment_created: {
        in_app_enabled: false,
        email_enabled: true,
        frequency: 'daily',
        priority: 'high'
      }
    };

    const { error: updateError } = await supabaseAdmin
      .from('user_notification_preferences')
      .update({ notification_settings: testSettings })
      .eq('user_id', userId);

    results.push({
      test: 'Update notification settings',
      passed: !updateError,
      details: updateError ? `Error: ${updateError.message}` : 'Settings updated successfully'
    });

    // Test preference history tracking
    const { data: history } = await supabaseAdmin
      .from('notification_preference_history')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1);

    results.push({
      test: 'Preference history tracking',
      passed: Array.isArray(history),
      details: history ? `Found ${history.length} history records` : 'No history found'
    });

  } catch (error) {
    results.push({
      test: 'Preference settings',
      passed: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }

  return { category: 'Preference Settings', results };
}

/**
 * Test 2: Quiet Hours
 */
async function testQuietHours(userId: string) {
  console.log('🌙 Testing quiet hours functionality...');
  const results = [];

  try {
    // Set quiet hours for testing
    const now = new Date();
    const quietStart = new Date(now.getTime() - 60 * 60 * 1000); // 1 hour ago
    const quietEnd = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour from now

    await supabaseAdmin
      .from('user_notification_preferences')
      .update({
        quiet_hours_start: quietStart.toTimeString().slice(0, 5),
        quiet_hours_end: quietEnd.toTimeString().slice(0, 5),
        priority_override: true
      })
      .eq('user_id', userId);

    // Test quiet hours check
    const { data: isQuiet } = await supabaseAdmin.rpc('is_quiet_hours', {
      p_user_id: userId
    });

    results.push({
      test: 'Quiet hours detection',
      passed: isQuiet === true,
      details: `Quiet hours active: ${isQuiet}`
    });

    // Test high priority override
    const { data: shouldSend } = await supabaseAdmin.rpc('should_send_notification', {
      p_user_id: userId,
      p_notification_type: 'assignment_created',
      p_priority: 'high'
    });

    results.push({
      test: 'High priority override during quiet hours',
      passed: shouldSend && shouldSend.length > 0,
      details: shouldSend ? 'High priority notifications allowed' : 'Override not working'
    });

    // Reset quiet hours
    await supabaseAdmin
      .from('user_notification_preferences')
      .update({
        quiet_hours_start: '22:00',
        quiet_hours_end: '07:00'
      })
      .eq('user_id', userId);

  } catch (error) {
    results.push({
      test: 'Quiet hours',
      passed: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }

  return { category: 'Quiet Hours', results };
}

/**
 * Test 3: Email Digest
 */
async function testEmailDigest(userId: string) {
  console.log('📧 Testing email digest system...');
  const results = [];

  try {
    // Create test notification
    const { data: notification } = await supabaseAdmin
      .from('user_notifications')
      .insert({
        user_id: userId,
        title: 'Test Digest Notification',
        description: 'This is a test notification for digest',
        category: 'system',
        importance: 'normal'
      })
      .select()
      .single();

    results.push({
      test: 'Create test notification',
      passed: !!notification,
      details: notification ? `Notification ID: ${notification.id}` : 'Failed to create'
    });

    if (notification) {
      // Add to daily digest queue
      await supabaseAdmin.rpc('add_to_digest_queue', {
        p_user_id: userId,
        p_notification_id: notification.id,
        p_digest_type: 'daily'
      });

      // Check digest queue
      const { data: digestQueue } = await supabaseAdmin
        .from('email_digest_queue')
        .select('*')
        .eq('user_id', userId)
        .eq('digest_type', 'daily')
        .order('created_at', { ascending: false })
        .limit(1);

      results.push({
        test: 'Add to digest queue',
        passed: digestQueue && digestQueue.length > 0,
        details: digestQueue?.[0] ? `Scheduled for: ${digestQueue[0].scheduled_for}` : 'Not in queue'
      });

      // Clean up
      await supabaseAdmin
        .from('user_notifications')
        .delete()
        .eq('id', notification.id);
    }

  } catch (error) {
    results.push({
      test: 'Email digest',
      passed: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }

  return { category: 'Email Digest', results };
}

/**
 * Test 4: Rate Limiting
 */
async function testRateLimiting(userId: string) {
  console.log('⏱️ Testing rate limiting...');
  const results = [];

  try {
    // Set low rate limit for testing
    await supabaseAdmin
      .from('user_notification_preferences')
      .update({ max_per_hour: 3 })
      .eq('user_id', userId);

    // Try to create multiple notifications
    let successCount = 0;
    const testNotifications = [];

    for (let i = 0; i < 5; i++) {
      const notifData = {
        user_id: userId,
        title: `Rate limit test ${i + 1}`,
        description: 'Testing rate limiting',
        category: 'system',
        importance: 'normal',
        event_type: 'system_update'
      };

      try {
        const result = await notificationService.createNotification(notifData);
        if (result) {
          successCount++;
          testNotifications.push(result);
        }
      } catch (error) {
        // Expected for rate-limited notifications
      }
    }

    results.push({
      test: 'Rate limiting enforcement',
      passed: successCount <= 3,
      details: `Created ${successCount}/5 notifications (limit: 3)`
    });

    // Clean up test notifications
    for (const notif of testNotifications) {
      if (notif?.id) {
        await supabaseAdmin
          .from('user_notifications')
          .delete()
          .eq('id', notif.id);
      }
    }

    // Reset rate limit
    await supabaseAdmin
      .from('user_notification_preferences')
      .update({ max_per_hour: 5 })
      .eq('user_id', userId);

  } catch (error) {
    results.push({
      test: 'Rate limiting',
      passed: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }

  return { category: 'Rate Limiting', results };
}

/**
 * Test 5: Smart Filtering
 */
async function testSmartFiltering(userId: string) {
  console.log('🎯 Testing smart filtering...');
  const results = [];

  try {
    // Test Do Not Disturb
    await supabaseAdmin
      .from('user_notification_preferences')
      .update({ do_not_disturb: true })
      .eq('user_id', userId);

    const { data: dndCheck } = await supabaseAdmin.rpc('should_send_notification', {
      p_user_id: userId,
      p_notification_type: 'message_received',
      p_priority: 'normal'
    });

    results.push({
      test: 'Do Not Disturb filtering',
      passed: dndCheck && !dndCheck[0]?.send_in_app && !dndCheck[0]?.send_email,
      details: 'DND blocks all non-priority notifications'
    });

    // Reset DND and test category-specific settings
    await supabaseAdmin
      .from('user_notification_preferences')
      .update({ 
        do_not_disturb: false,
        notification_settings: {
          'assignment_created': {
            in_app_enabled: true,
            email_enabled: false,
            frequency: 'immediate',
            priority: 'high'
          },
          'system_update': {
            in_app_enabled: false,
            email_enabled: false,
            frequency: 'never',
            priority: 'low'
          }
        }
      })
      .eq('user_id', userId);

    // Test specific notification type filtering
    const { data: assignmentCheck } = await supabaseAdmin.rpc('should_send_notification', {
      p_user_id: userId,
      p_notification_type: 'assignment_created',
      p_priority: 'high'
    });

    results.push({
      test: 'Category-specific filtering',
      passed: assignmentCheck && assignmentCheck[0]?.send_in_app && !assignmentCheck[0]?.send_email,
      details: 'Assignment notifications: in-app only'
    });

    const { data: systemCheck } = await supabaseAdmin.rpc('should_send_notification', {
      p_user_id: userId,
      p_notification_type: 'system_update',
      p_priority: 'low'
    });

    results.push({
      test: 'Disabled notification filtering',
      passed: systemCheck && !systemCheck[0]?.send_in_app && !systemCheck[0]?.send_email,
      details: 'System updates completely disabled'
    });

  } catch (error) {
    results.push({
      test: 'Smart filtering',
      passed: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }

  return { category: 'Smart Filtering', results };
}