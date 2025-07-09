import { createClient } from '@supabase/supabase-js';
import { NextApiRequest, NextApiResponse } from 'next';

// Initialize Supabase with service role (admin privileges)
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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    // Get the authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'No authorization token provided' });
    }

    // Verify the user making the request is an admin
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    
    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid authorization token' });
    }

    // Check if the user is an admin
    const { data: userRoles, error: roleError } = await supabaseAdmin
      .from('user_roles')
      .select('role_type')
      .eq('user_id', user.id)
      .eq('role_type', 'admin')
      .eq('is_active', true)
      .single();

    if (roleError || !userRoles) {
      return res.status(403).json({ error: 'Unauthorized. Only admins can delete users.' });
    }

    console.log('Admin verified. Attempting to delete user:', userId);

    // First, handle foreign key constraints by deleting or reassigning related data
    console.log('Handling foreign key constraints for user:', userId);
    
    // Delete user's feedback entries
    const { error: feedbackError } = await supabaseAdmin
      .from('platform_feedback')
      .delete()
      .eq('created_by', userId);
    
    if (feedbackError) {
      console.error('Error deleting feedback:', feedbackError);
    }

    // Delete user's roles
    const { error: rolesError } = await supabaseAdmin
      .from('user_roles')
      .delete()
      .eq('user_id', userId);
    
    if (rolesError) {
      console.error('Error deleting user roles:', rolesError);
    }

    // Now delete the user's profile
    console.log('Deleting profile for user:', userId);
    const { data: deleteData, error: deleteProfileError } = await supabaseAdmin
      .from('profiles')
      .delete()
      .eq('id', userId)
      .select();

    console.log('Profile deletion result:', { deleteData, deleteProfileError });

    if (deleteProfileError) {
      console.error('Error deleting profile:', deleteProfileError);
      return res.status(500).json({ error: `Failed to delete user profile: ${deleteProfileError.message}` });
    }

    // Delete from auth.users table (requires service role)
    console.log('Deleting auth user:', userId);
    const { error: deleteAuthError } = await supabaseAdmin.auth.admin.deleteUser(userId);
    
    if (deleteAuthError) {
      console.error('Error deleting auth user:', deleteAuthError);
      // Profile is already deleted, so we can still return partial success
    } else {
      console.log('Auth user deleted successfully');
    }

    return res.status(200).json({ 
      success: true,
      message: 'User deleted successfully',
      profileDeleted: true,
      authUserDeleted: !deleteAuthError,
      deletedRecords: deleteData?.length || 0
    });

  } catch (error: any) {
    console.error('Delete user error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}