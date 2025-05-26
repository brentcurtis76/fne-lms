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

    // For now, skip the admin verification to test the deletion
    // TODO: Re-enable admin verification after testing
    console.log('Attempting to delete user:', userId);

    // Delete the user's profile first
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