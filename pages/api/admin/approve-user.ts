import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

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
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
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

    // Check if user is admin by checking both metadata and profile
    const { data: profileData } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    const isAdminFromMetadata = user.user_metadata?.role === 'admin';
    const isAdminFromProfile = profileData?.role === 'admin';

    if (!isAdminFromMetadata && !isAdminFromProfile) {
      return res.status(403).json({ error: 'Insufficient permissions. Admin access required.' });
    }

    // Get request data
    const { userId, action } = req.body;
    
    if (!userId || !action) {
      return res.status(400).json({ error: 'Missing userId or action' });
    }

    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ error: 'Invalid action. Must be "approve" or "reject"' });
    }

    // Update the user's approval status using admin client
    const newStatus = action === 'approve' ? 'approved' : 'rejected';
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .update({ approval_status: newStatus })
      .eq('id', userId)
      .select('id, email, first_name, last_name, approval_status')
      .single();

    if (error) {
      console.error('Error updating user approval status:', error);
      return res.status(500).json({ error: 'Failed to update user approval status: ' + error.message });
    }

    return res.status(200).json({ 
      success: true, 
      message: `User ${action}d successfully`,
      user: data 
    });

  } catch (error) {
    console.error('Unexpected error in approve-user API:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}