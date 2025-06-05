import { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '../../../lib/supabase';
import { createClient } from '@supabase/supabase-js';

export interface MarkAllReadResponse {
  success: boolean;
  data?: {
    affected_count: number;
    message: string;
  };
  error?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<MarkAllReadResponse>
) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed'
    });
  }

  try {
    // Get the user's session to verify authentication
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized - No valid session'
      });
    }

    const token = authHeader.split(' ')[1];
    
    // Verify the user session
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized - Invalid session'
      });
    }

    console.log('🔍 Mark All Read API: Marking all notifications as read for user:', user.id);

    // Create admin client for database operations
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Get count of unread notifications first
    const { count: unreadCount, error: countError } = await supabaseAdmin
      .from('user_notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_read', false);

    if (countError) {
      console.error('❌ Error getting unread count:', countError);
      return res.status(500).json({
        success: false,
        error: 'Failed to get unread count'
      });
    }

    if (unreadCount === 0) {
      console.log('📖 No unread notifications to mark');
      return res.status(200).json({
        success: true,
        data: {
          affected_count: 0,
          message: 'No unread notifications to mark'
        }
      });
    }

    // Mark all unread notifications as read
    const { data: updatedNotifications, error: updateError } = await supabaseAdmin
      .from('user_notifications')
      .update({
        is_read: true,
        read_at: new Date().toISOString()
      })
      .eq('user_id', user.id)
      .eq('is_read', false)
      .select('id');

    if (updateError) {
      console.error('❌ Error marking all notifications as read:', updateError);
      return res.status(500).json({
        success: false,
        error: `Failed to mark notifications as read: ${updateError.message}`
      });
    }

    const affectedCount = updatedNotifications?.length || 0;

    console.log(`✅ Marked ${affectedCount} notifications as read`);

    return res.status(200).json({
      success: true,
      data: {
        affected_count: affectedCount,
        message: `Marked ${affectedCount} notification${affectedCount !== 1 ? 's' : ''} as read`
      }
    });

  } catch (error) {
    console.error('Mark all read API error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}