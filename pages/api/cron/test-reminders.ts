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
 * Test endpoint for manually triggering due date reminders
 * This is for development and testing purposes only
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
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileData?.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    console.log('🧪 Testing due date reminder system...');

    // Create a test assignment due tomorrow (if none exist)
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(10, 0, 0, 0); // 10 AM tomorrow

    const testAssignment = {
      id: 'test-assignment-' + Date.now(),
      title: 'Prueba de Recordatorio',
      due_date: tomorrow.toISOString(),
      course_id: 'test-course',
      student_id: user.id, // Send to admin user for testing
      due_reminder_sent: false,
      status: 'active',
      courses: { name: 'Curso de Prueba' }
    };

    // Test the notification service directly
    console.log('🔔 Testing notification trigger...');
    
    const result = await NotificationService.triggerNotification('assignment_due_soon', {
      assignment_id: testAssignment.id,
      course_id: testAssignment.course_id,
      student_id: testAssignment.student_id,
      assignment_name: testAssignment.title,
      course_name: testAssignment.courses.name,
      due_time: '10:00',
      due_date: testAssignment.due_date
    });

    // Also test the cron job logic
    console.log('📋 Testing cron job logic...');
    const dueAssignments = await NotificationService.getDueAssignments(24);
    
    return res.status(200).json({ 
      success: true,
      message: 'Reminder system test completed',
      testResults: {
        notificationTrigger: result,
        dueAssignmentsFound: dueAssignments.length,
        testAssignment: testAssignment,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('❌ Test reminder system failed:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Test failed: ' + error.message 
    });
  }
}