import { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '../../../lib/supabase-wrapper';
import { createClient } from '@supabase/supabase-js';

import { metadataHasRole } from '../../../utils/roleUtils';

export interface NotificationType {
  id: string;
  name: string;
  description: string;
  category: string;
  default_enabled: boolean;
  created_at: string;
}

export interface NotificationTypesResponse {
  success: boolean;
  data?: NotificationType[];
  error?: string;
  totalCount?: number;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<NotificationTypesResponse>
) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed'
    });
  }

  try {
    // Get the user's session to verify admin access
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

    // Check if user is admin
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    const isAdmin = metadataHasRole(user.user_metadata, 'admin') || profileData?.role === 'admin';
    
    if (!isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden - Admin access required'
      });
    }

    console.log('🔍 API: Starting notification types fetch...');
    console.log('🔍 API: User ID:', user.id);
    console.log('🔍 API: Is Admin:', isAdmin);

    // Create admin client with service role for database operations
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    console.log('🔍 API: Using service role client for database query...');

    // Fetch all notification types using service role (bypasses RLS)
    console.log('🔍 API: Executing Supabase query...');
    const { data: notificationTypes, error: fetchError } = await supabaseAdmin
      .from('notification_types')
      .select('id, name, description, category, default_enabled, created_at')
      .order('category', { ascending: true })
      .order('name', { ascending: true });

    console.log('🔍 API: Raw database response:', {
      data: notificationTypes,
      error: fetchError,
      dataLength: notificationTypes?.length || 0
    });

    if (fetchError) {
      console.error('❌ API: Error fetching notification types:', fetchError);
      return res.status(500).json({
        success: false,
        error: `Failed to fetch notification types: ${fetchError.message}`
      });
    }

    const responseData = notificationTypes || [];
    const responseCount = responseData.length;

    console.log('🔍 API: Preparing response:', {
      dataCount: responseCount,
      sampleData: responseData.slice(0, 2)
    });

    return res.status(200).json({
      success: true,
      data: responseData,
      totalCount: responseCount
    });

  } catch (error) {
    console.error('Notification types API error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}
