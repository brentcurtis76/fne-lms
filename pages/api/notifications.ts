import { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '../../lib/supabase';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
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
      console.error('Auth error:', authError);
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    console.log('Fetching notifications for user:', user.id);

    // Get limit from query params
    const limit = parseInt(req.query.limit as string) || 10;

    // Fetch user's notifications
    const { data: notifications, error: notifError } = await supabase
      .from('user_notifications')
      .select(`
        id,
        title,
        description,
        category,
        importance,
        read_at,
        related_url,
        created_at
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (notifError) {
      console.error('Error fetching notifications:', notifError);
      return res.status(500).json({ 
        success: false, 
        error: 'Failed to fetch notifications' 
      });
    }
    
    console.log('Notifications found:', notifications?.length || 0);

    // Count unread notifications
    const { count: unreadCount, error: countError } = await supabase
      .from('user_notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .is('read_at', null);

    if (countError) {
      console.error('Error counting unread notifications:', countError);
    }

    return res.status(200).json({
      success: true,
      data: notifications || [],
      unreadCount: unreadCount || 0
    });

  } catch (error: any) {
    console.error('API error:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message || 'Internal server error' 
    });
  }
}