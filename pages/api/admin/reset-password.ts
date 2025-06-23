import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client with service role key for admin operations
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

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = authHeader.replace('Bearer ', '');

  try {
    // Verify the requesting user's token
    const { data: { user: requestingUser }, error: authError } = await supabaseAdmin.auth.getUser(token);
    
    if (authError || !requestingUser) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    // Check if requesting user is admin
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', requestingUser.id)
      .single();

    if (profileError || !profile || profile.role !== 'admin') {
      return res.status(403).json({ error: 'Only admins can reset passwords' });
    }

    const { userId, temporaryPassword } = req.body;

    if (!userId || !temporaryPassword) {
      return res.status(400).json({ error: 'User ID and temporary password are required' });
    }

    // Update the user's password
    const { data: updateData, error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      userId,
      { 
        password: temporaryPassword,
        user_metadata: { 
          password_change_required: true,
          password_reset_by_admin: true,
          password_reset_at: new Date().toISOString()
        }
      }
    );

    if (updateError) {
      console.error('Error updating password:', updateError);
      return res.status(500).json({ error: 'Failed to reset password' });
    }

    // Update the profile to indicate password change is required
    const { error: profileUpdateError } = await supabaseAdmin
      .from('profiles')
      .update({ 
        password_change_required: true,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId);

    if (profileUpdateError) {
      console.error('Error updating profile:', profileUpdateError);
      // Continue anyway as the password was already reset
    }

    // Log the password reset action
    const { error: logError } = await supabaseAdmin
      .from('audit_logs')
      .insert({
        user_id: requestingUser.id,
        action: 'password_reset',
        details: {
          target_user_id: userId,
          reset_by: 'admin',
          timestamp: new Date().toISOString()
        }
      });

    if (logError) {
      console.error('Error logging password reset:', logError);
      // Continue anyway as this is not critical
    }

    return res.status(200).json({ 
      success: true, 
      message: 'Password reset successfully',
      user: updateData.user
    });

  } catch (error) {
    console.error('Unexpected error in password reset:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}