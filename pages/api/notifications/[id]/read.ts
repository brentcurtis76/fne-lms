import { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '../../../../lib/supabase-wrapper';
import { createClient } from '@supabase/supabase-js';

export interface MarkReadResponse {
  success: boolean;
  data?: {
    id: string;
    is_read: boolean;
    read_at: string;
  };
  error?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<MarkReadResponse>
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

    // Get notification ID from URL
    const { id } = req.query;
    
    if (!id || typeof id !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Invalid notification ID'
      });
    }

    console.log('🔍 Mark Read API: Marking notification as read:', id, 'for user:', user.id);

    // Create admin client for database operations
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // First, verify the notification belongs to the user
    const { data: notification, error: fetchError } = await supabaseAdmin
      .from('user_notifications')
      .select('id, user_id, is_read')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !notification) {
      console.error('❌ Notification not found or access denied:', fetchError);
      return res.status(404).json({
        success: false,
        error: 'Notification not found or access denied'
      });
    }

    // If already read, return current state
    if (notification.is_read) {
      console.log('📖 Notification already marked as read');
      return res.status(200).json({
        success: true,
        data: {
          id: notification.id,
          is_read: true,
          read_at: new Date().toISOString()
        }
      });
    }

    // Mark as read
    const { data: updatedNotification, error: updateError } = await supabaseAdmin
      .from('user_notifications')
      .update({
        is_read: true,
        read_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('user_id', user.id)
      .select('id, is_read, read_at')
      .single();

    if (updateError) {
      console.error('❌ Error marking notification as read:', updateError);
      return res.status(500).json({
        success: false,
        error: `Failed to mark notification as read: ${updateError.message}`
      });
    }

    console.log('✅ Notification marked as read successfully');

    return res.status(200).json({
      success: true,
      data: {
        id: updatedNotification.id,
        is_read: updatedNotification.is_read,
        read_at: updatedNotification.read_at
      }
    });

  } catch (error) {
    console.error('Mark read API error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}