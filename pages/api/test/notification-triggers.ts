import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import NotificationService from '../../../lib/notificationService';

// Create admin client for testing
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Regular client for auth verification
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/**
 * Comprehensive test endpoint for all notification triggers
 * This endpoint tests each trigger type to ensure the system is working
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Verify admin permissions
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid authorization header' });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid authentication token' });
    }

    // Check if user is admin
    const { data: profileData } = await supabaseAdmin
      .from('profiles')
      .select('role, first_name, last_name')
      .eq('id', user.id)
      .single();

    if (profileData?.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required for testing' });
    }

    console.log('🧪 Starting comprehensive notification trigger tests...');

    const testResults = {
      triggers_tested: 0,
      successful_triggers: 0,
      failed_triggers: 0,
      total_notifications_created: 0,
      test_details: []
    };

    const testUserName = profileData.first_name && profileData.last_name ? 
      `${profileData.first_name} ${profileData.last_name}` : 'Test User';

    // Test 1: Assignment Created Trigger
    console.log('📚 Testing assignment creation trigger...');
    try {
      const assignmentTest = await NotificationService.triggerNotification('assignment_created', {
        assignment_id: 'test-assignment-' + Date.now(),
        course_id: 'test-course',
        assigned_users: [user.id],
        assignment_name: 'Tarea de Prueba',
        course_name: 'Curso de Prueba',
        assigned_by: user.id
      });
      
      testResults.triggers_tested++;
      if (assignmentTest.success) {
        testResults.successful_triggers++;
        testResults.total_notifications_created += assignmentTest.notificationsCreated || 0;
      } else {
        testResults.failed_triggers++;
      }
      
      testResults.test_details.push({
        trigger: 'assignment_created',
        success: assignmentTest.success,
        notifications: assignmentTest.notificationsCreated || 0,
        error: assignmentTest.error || null
      });
    } catch (error) {
      console.error('❌ Assignment trigger test failed:', error);
      testResults.triggers_tested++;
      testResults.failed_triggers++;
      testResults.test_details.push({
        trigger: 'assignment_created',
        success: false,
        error: error.message
      });
    }

    // Test 2: Message Sent Trigger
    console.log('💬 Testing message sent trigger...');
    try {
      const messageTest = await NotificationService.triggerNotification('message_sent', {
        message_id: 'test-message-' + Date.now(),
        sender_id: user.id,
        recipient_id: user.id, // Send to self for testing
        sender_name: testUserName,
        content: 'Este es un mensaje de prueba',
        context: 'test message'
      });
      
      testResults.triggers_tested++;
      if (messageTest.success) {
        testResults.successful_triggers++;
        testResults.total_notifications_created += messageTest.notificationsCreated || 0;
      } else {
        testResults.failed_triggers++;
      }
      
      testResults.test_details.push({
        trigger: 'message_sent',
        success: messageTest.success,
        notifications: messageTest.notificationsCreated || 0,
        error: messageTest.error || null
      });
    } catch (error) {
      console.error('❌ Message trigger test failed:', error);
      testResults.triggers_tested++;
      testResults.failed_triggers++;
      testResults.test_details.push({
        trigger: 'message_sent',
        success: false,
        error: error.message
      });
    }

    // Test 3: User Mentioned Trigger
    console.log('🏷️ Testing user mention trigger...');
    try {
      const mentionTest = await NotificationService.triggerNotification('user_mentioned', {
        mention_id: 'test-mention-' + Date.now(),
        author_id: user.id,
        mentioned_user_id: user.id, // Mention self for testing
        author_name: testUserName,
        context: 'discusión de prueba',
        discussion_id: 'test-discussion',
        content_preview: 'Te han mencionado en una discusión de prueba'
      });
      
      testResults.triggers_tested++;
      if (mentionTest.success) {
        testResults.successful_triggers++;
        testResults.total_notifications_created += mentionTest.notificationsCreated || 0;
      } else {
        testResults.failed_triggers++;
      }
      
      testResults.test_details.push({
        trigger: 'user_mentioned',
        success: mentionTest.success,
        notifications: mentionTest.notificationsCreated || 0,
        error: mentionTest.error || null
      });
    } catch (error) {
      console.error('❌ Mention trigger test failed:', error);
      testResults.triggers_tested++;
      testResults.failed_triggers++;
      testResults.test_details.push({
        trigger: 'user_mentioned',
        success: false,
        error: error.message
      });
    }

    // Test 4: Assignment Feedback Trigger
    console.log('📝 Testing assignment feedback trigger...');
    try {
      const feedbackTest = await NotificationService.triggerNotification('assignment_feedback', {
        assignment_id: 'test-assignment-feedback',
        course_id: 'test-course',
        student_id: user.id,
        assignment_name: 'Tarea de Prueba',
        course_name: 'Curso de Prueba',
        feedback_text: 'Excelente trabajo en esta tarea',
        grade: 95,
        instructor_id: user.id
      });
      
      testResults.triggers_tested++;
      if (feedbackTest.success) {
        testResults.successful_triggers++;
        testResults.total_notifications_created += feedbackTest.notificationsCreated || 0;
      } else {
        testResults.failed_triggers++;
      }
      
      testResults.test_details.push({
        trigger: 'assignment_feedback',
        success: feedbackTest.success,
        notifications: feedbackTest.notificationsCreated || 0,
        error: feedbackTest.error || null
      });
    } catch (error) {
      console.error('❌ Feedback trigger test failed:', error);
      testResults.triggers_tested++;
      testResults.failed_triggers++;
      testResults.test_details.push({
        trigger: 'assignment_feedback',
        success: false,
        error: error.message
      });
    }

    // Test 5: Course Completion Trigger
    console.log('🎓 Testing course completion trigger...');
    try {
      const completionTest = await NotificationService.triggerNotification('course_completed', {
        course_id: 'test-course',
        student_id: user.id,
        course_name: 'Curso de Prueba Completado',
        completion_date: new Date().toISOString()
      });
      
      testResults.triggers_tested++;
      if (completionTest.success) {
        testResults.successful_triggers++;
        testResults.total_notifications_created += completionTest.notificationsCreated || 0;
      } else {
        testResults.failed_triggers++;
      }
      
      testResults.test_details.push({
        trigger: 'course_completed',
        success: completionTest.success,
        notifications: completionTest.notificationsCreated || 0,
        error: completionTest.error || null
      });
    } catch (error) {
      console.error('❌ Course completion trigger test failed:', error);
      testResults.triggers_tested++;
      testResults.failed_triggers++;
      testResults.test_details.push({
        trigger: 'course_completed',
        success: false,
        error: error.message
      });
    }

    // Test 6: System Update Trigger
    console.log('🔄 Testing system update trigger...');
    try {
      const systemTest = await NotificationService.triggerNotification('system_update', {
        update_id: 'test-update-' + Date.now(),
        title: 'Actualización de Prueba',
        description: 'Esta es una actualización de prueba del sistema',
        version: 'v2.0.0-test',
        features: ['Nueva funcionalidad', 'Mejoras de rendimiento'],
        importance: 'low',
        published_by: user.id,
        published_at: new Date().toISOString()
      });
      
      testResults.triggers_tested++;
      if (systemTest.success) {
        testResults.successful_triggers++;
        testResults.total_notifications_created += systemTest.notificationsCreated || 0;
      } else {
        testResults.failed_triggers++;
      }
      
      testResults.test_details.push({
        trigger: 'system_update',
        success: systemTest.success,
        notifications: systemTest.notificationsCreated || 0,
        error: systemTest.error || null
      });
    } catch (error) {
      console.error('❌ System update trigger test failed:', error);
      testResults.triggers_tested++;
      testResults.failed_triggers++;
      testResults.test_details.push({
        trigger: 'system_update',
        success: false,
        error: error.message
      });
    }

    // Get current notification count for verification
    const { data: notifications, error: notifError } = await supabaseAdmin
      .from('user_notifications')
      .select('id, title, category, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10);

    const summary = {
      test_completed: true,
      success_rate: testResults.triggers_tested > 0 ? 
        (testResults.successful_triggers / testResults.triggers_tested * 100).toFixed(1) + '%' : '0%',
      ...testResults,
      recent_notifications: notifications || [],
      timestamp: new Date().toISOString()
    };

    console.log('🧪 Notification trigger tests completed!');
    console.log(`✅ Success: ${testResults.successful_triggers}/${testResults.triggers_tested}`);
    console.log(`📧 Total notifications created: ${testResults.total_notifications_created}`);

    return res.status(200).json({
      success: true,
      message: 'Notification trigger tests completed',
      results: summary
    });

  } catch (error) {
    console.error('❌ Notification trigger tests failed:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Test failed: ' + error.message 
    });
  }
}