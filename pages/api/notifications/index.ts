import { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '../../../lib/supabase-wrapper';
import { createClient } from '@supabase/supabase-js';

export interface UserNotification {
  id: string;
  user_id: string;
  notification_type_id: string; // This matches VARCHAR from notification_types.id
  title: string;
  description?: string;
  related_url?: string;
  is_read: boolean;
  created_at: string;
  read_at?: string;
  notification_type?: {
    id: string; // This also matches VARCHAR from notification_types.id
    name: string;
    category: string;
  };
}

export interface NotificationsResponse {
  success: boolean;
  data?: UserNotification[];
  unreadCount?: number;
  error?: string;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<NotificationsResponse>
) {
  // Only allow GET requests
  if (req.method !== 'GET') {
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

    // Parse query parameters
    const { 
      page = '1', 
      limit = '20', 
      unread_only = 'false',
      type_category 
    } = req.query;

    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const offset = (pageNum - 1) * limitNum;
    const unreadOnly = unread_only === 'true';

    console.log('🔍 Notifications API: Fetching notifications for user:', user.id);
    console.log('🔍 Query params:', { page: pageNum, limit: limitNum, unreadOnly, type_category });

    // Create admin client for database operations
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Build the query - use left join instead of inner join to include notifications with NULL/invalid types
    let query = supabaseAdmin
      .from('user_notifications')
      .select(`
        id,
        user_id,
        notification_type_id,
        title,
        description,
        related_url,
        is_read,
        created_at,
        read_at,
        notification_types!left (
          id,
          name,
          category
        )
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    // Apply filters
    if (unreadOnly) {
      query = query.eq('is_read', false);
    }

    if (type_category) {
      // For filtering by category, we need to check if notification_types exists
      query = query.not('notification_types', 'is', null)
        .eq('notification_types.category', type_category);
    }

    // Get total count for pagination
    const { count: totalCount, error: countError } = await supabaseAdmin
      .from('user_notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);

    if (countError) {
      console.error('❌ Error getting total count:', countError);
      return res.status(500).json({
        success: false,
        error: 'Failed to get notification count'
      });
    }

    // Get paginated results
    const { data: notifications, error: fetchError } = await query
      .range(offset, offset + limitNum - 1);

    if (fetchError) {
      console.error('❌ Error fetching notifications:', fetchError);
      return res.status(500).json({
        success: false,
        error: `Failed to fetch notifications: ${fetchError.message}`
      });
    }

    // Get unread count
    const { count: unreadCount, error: unreadCountError } = await supabaseAdmin
      .from('user_notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_read', false);

    if (unreadCountError) {
      console.error('❌ Error getting unread count:', unreadCountError);
    }

    // Transform the data to match our interface
    const transformedNotifications: UserNotification[] = (notifications || []).map((notification: any) => ({
      id: notification.id,
      user_id: notification.user_id,
      notification_type_id: notification.notification_type_id,
      title: notification.title,
      description: notification.description,
      related_url: notification.related_url,
      is_read: notification.is_read,
      created_at: notification.created_at,
      read_at: notification.read_at,
      notification_type: notification.notification_types ? {
        id: notification.notification_types.id,
        name: notification.notification_types.name,
        category: notification.notification_types.category
      } : undefined
    }));

    const totalPages = Math.ceil((totalCount || 0) / limitNum);

    console.log(`✅ Fetched ${transformedNotifications.length} notifications, ${unreadCount || 0} unread`);

    return res.status(200).json({
      success: true,
      data: transformedNotifications,
      unreadCount: unreadCount || 0,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: totalCount || 0,
        totalPages
      }
    });

  } catch (error) {
    console.error('Notifications API error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}