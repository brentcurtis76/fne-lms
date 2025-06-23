import { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '../../../lib/supabase';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get auth token from headers
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing authorization header' });
    }

    const token = authHeader.substring(7);

    // Verify the token and get user
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { notificationId, markAll } = req.body;

    if (markAll) {
      // Mark all unread notifications as read
      const { error } = await supabase
        .from('user_notifications')
        .update({ 
          read_at: new Date().toISOString() 
        })
        .eq('user_id', user.id)
        .is('read_at', null);

      if (error) {
        console.error('Error marking all as read:', error);
        return res.status(500).json({ 
          success: false, 
          error: 'Failed to mark notifications as read' 
        });
      }

      return res.status(200).json({ 
        success: true, 
        message: 'All notifications marked as read' 
      });
    } else if (notificationId) {
      // Mark single notification as read
      const { error } = await supabase
        .from('user_notifications')
        .update({ 
          read_at: new Date().toISOString() 
        })
        .eq('id', notificationId)
        .eq('user_id', user.id);

      if (error) {
        console.error('Error marking as read:', error);
        return res.status(500).json({ 
          success: false, 
          error: 'Failed to mark notification as read' 
        });
      }

      return res.status(200).json({ 
        success: true, 
        message: 'Notification marked as read' 
      });
    } else {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing notificationId or markAll parameter' 
      });
    }

  } catch (error: any) {
    console.error('API error:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message || 'Internal server error' 
    });
  }
}