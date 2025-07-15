import type { NextApiRequest, NextApiResponse } from 'next';
import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get the user's session
    const supabase = createPagesServerClient({ req, res });
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !session) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { newPassword } = req.body;

    if (!newPassword) {
      return res.status(400).json({ error: 'New password is required' });
    }

    // Validate password requirements
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    if (!/[A-Z]/.test(newPassword)) {
      return res.status(400).json({ error: 'Password must contain at least one uppercase letter' });
    }
    if (!/[a-z]/.test(newPassword)) {
      return res.status(400).json({ error: 'Password must contain at least one lowercase letter' });
    }
    if (!/[0-9]/.test(newPassword)) {
      return res.status(400).json({ error: 'Password must contain at least one number' });
    }

    // Check if user actually needs to change password
    const { data: profile, error: profileCheckError } = await supabase
      .from('profiles')
      .select('must_change_password')
      .eq('id', session.user.id)
      .single();

    if (profileCheckError || !profile?.must_change_password) {
      return res.status(403).json({ error: 'Password change not required for this user' });
    }

    // Use admin client to update the password (bypasses secure password change requirement)
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      session.user.id,
      { password: newPassword }
    );

    if (updateError) {
      console.error('Admin password update error:', updateError);
      throw updateError;
    }

    // Update the profile flag
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({ 
        must_change_password: false
      })
      .eq('id', session.user.id);

    if (profileError) {
      console.error('Profile update error:', profileError);
      // Continue anyway - password was changed successfully
    }

    // Clear any admin reset metadata
    await supabaseAdmin.auth.admin.updateUserById(
      session.user.id,
      {
        user_metadata: {
          password_reset_by_admin: null,
          password_reset_at: null
        }
      }
    );

    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('Force password change error:', error);
    return res.status(500).json({ 
      error: 'Failed to update password',
      details: error.message 
    });
  }
}