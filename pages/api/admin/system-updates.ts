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
    // Only allow POST method for creating system updates
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    // Get auth header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid authorization header' });
    }

    // Verify the user is authenticated and is admin
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid authentication token' });
    }

    // Check if user is admin
    const { data: adminRole } = await supabaseAdmin
      .from('user_roles')
      .select('*')
      .eq('user_id', user.id)
      .eq('role_type', 'admin')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    if (profileData?.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required for system updates' });
    }

    const { 
      title, 
      description, 
      version, 
      features = [], 
      importance = 'low',
      target_users = 'all',
      scheduled_for 
    } = req.body;
    
    if (!title || !description) {
      return res.status(400).json({ error: 'Missing required fields: title, description' });
    }

    // Create system update record
    const updateData = {
      title,
      description,
      version: version || null,
      features: Array.isArray(features) ? features : [],
      importance,
      target_users,
      published_by: user.id,
      published_at: scheduled_for ? new Date(scheduled_for).toISOString() : new Date().toISOString(),
      is_published: !scheduled_for // If scheduled, don't publish immediately
    };

    const { data: updateResult, error: updateError } = await supabaseAdmin
      .from('system_updates')
      .insert(updateData)
      .select()
      .single();

    if (updateError) {
      console.error('Error creating system update:', updateError);
      return res.status(500).json({ error: 'Failed to create system update: ' + updateError.message });
    }

    // If not scheduled, trigger immediate notifications
    if (!scheduled_for) {
      try {
        await NotificationService.triggerNotification('system_update', {
          update_id: updateResult.id,
          title: title,
          description: description.substring(0, 200),
          version: version || 'Sin versión',
          features: features.slice(0, 3), // First 3 features for notification
          importance,
          published_by: user.id,
          published_at: updateResult.published_at
        });

        console.log(`✅ System update notifications triggered for all users`);
      } catch (notificationError) {
        console.error('❌ Failed to trigger system update notifications:', notificationError);
        // Don't fail the API call if notifications fail
      }
    }

    // If scheduled, you might want to set up a scheduled job here
    if (scheduled_for) {
      console.log(`📅 System update scheduled for: ${scheduled_for}`);
      // Note: In a production system, you'd add this to a job queue
      // For this implementation, we'll rely on manual publishing
    }

    return res.status(200).json({ 
      success: true, 
      message: scheduled_for ? 'System update scheduled successfully' : 'System update published and notifications sent',
      updateId: updateResult.id,
      isScheduled: !!scheduled_for
    });

  } catch (error) {
    console.error('Unexpected error in system updates API:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}