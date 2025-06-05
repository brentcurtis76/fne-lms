import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import NotificationService from '../../../lib/notificationService';

// Create admin client with service role key for elevated permissions
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

// Regular client for auth verification
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Only allow POST method
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    // Get auth header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid authorization header' });
    }

    // Verify the user is authenticated
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid authentication token' });
    }

    const { course_id, module_id, completion_type } = req.body;
    
    if (!course_id || !completion_type) {
      return res.status(400).json({ error: 'Missing required fields: course_id, completion_type' });
    }

    if (!['course', 'module'].includes(completion_type)) {
      return res.status(400).json({ error: 'completion_type must be "course" or "module"' });
    }

    // Record the completion
    const completionData = {
      user_id: user.id,
      course_id,
      module_id: module_id || null,
      completion_type,
      completed_at: new Date().toISOString(),
      completion_notification_sent: false
    };

    // Check if already completed to prevent duplicates
    const existingCompletion = await supabaseAdmin
      .from('course_completions')
      .select('id')
      .eq('user_id', user.id)
      .eq('course_id', course_id)
      .eq('completion_type', completion_type)
      .eq('module_id', module_id || null)
      .single();

    if (existingCompletion.data) {
      return res.status(200).json({ 
        success: true, 
        message: 'Already completed',
        alreadyCompleted: true
      });
    }

    const { data: completionResult, error: completionError } = await supabaseAdmin
      .from('course_completions')
      .insert(completionData)
      .select()
      .single();

    if (completionError) {
      console.error('Error recording completion:', completionError);
      return res.status(500).json({ error: 'Failed to record completion: ' + completionError.message });
    }

    // Get course and module details for notification
    const { data: courseData } = await supabaseAdmin
      .from('courses')
      .select('title')
      .eq('id', course_id)
      .single();

    let moduleData = null;
    if (module_id) {
      const { data: moduleResult } = await supabaseAdmin
        .from('course_modules')
        .select('title')
        .eq('id', module_id)
        .single();
      moduleData = moduleResult;
    }

    // Trigger appropriate completion notification
    try {
      if (completion_type === 'course') {
        await NotificationService.triggerNotification('course_completed', {
          course_id,
          student_id: user.id,
          course_name: courseData?.title || 'Curso',
          completion_date: completionData.completed_at
        });
        console.log(`✅ Course completion notification triggered for user ${user.id}`);
      } else if (completion_type === 'module') {
        await NotificationService.triggerNotification('module_completed', {
          course_id,
          module_id,
          student_id: user.id,
          course_name: courseData?.title || 'Curso',
          module_name: moduleData?.title || 'Módulo',
          completion_date: completionData.completed_at
        });
        console.log(`✅ Module completion notification triggered for user ${user.id}`);
      }

      // Mark notification as sent
      await supabaseAdmin
        .from('course_completions')
        .update({ completion_notification_sent: true })
        .eq('id', completionResult.id);

    } catch (notificationError) {
      console.error('❌ Failed to trigger completion notification:', notificationError);
      // Don't fail the API call if notifications fail
    }

    return res.status(200).json({ 
      success: true, 
      message: `${completion_type} completion recorded successfully`,
      completionId: completionResult.id,
      completionType: completion_type
    });

  } catch (error) {
    console.error('Unexpected error in completion API:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}