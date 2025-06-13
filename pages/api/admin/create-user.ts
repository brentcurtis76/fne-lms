import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

// Create a Supabase client with the service role key for admin operations
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

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
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
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileError || profile?.role !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized. Only admins can create users.' });
    }

    // Get user data from request body
    const { email, password, firstName, lastName, role } = req.body;

    // Validate required fields
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Create the user with admin privileges (auto-confirms email)
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // This confirms the email immediately
      user_metadata: {
        role: role || 'docente'
      }
    });

    if (createError) {
      throw createError;
    }

    if (newUser.user) {
      // Check if profile already exists
      const { data: existingProfile } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('id', newUser.user.id)
        .single();

      if (!existingProfile) {
        // Create profile
        const { error: profileError } = await supabaseAdmin
          .from('profiles')
          .insert({
            id: newUser.user.id,
            email: email,
            name: firstName && lastName ? `${firstName} ${lastName}` : null,
            first_name: firstName,
            last_name: lastName,
            role: role || 'docente',
            approval_status: 'approved', // Admin-created users are auto-approved
            must_change_password: true // Flag to force password change on first login
          });

        if (profileError) {
          // If profile creation fails, delete the auth user
          await supabaseAdmin.auth.admin.deleteUser(newUser.user.id);
          throw profileError;
        }
      } else {
        // Update existing profile
        const { error: updateError } = await supabaseAdmin
          .from('profiles')
          .update({
            name: firstName && lastName ? `${firstName} ${lastName}` : null,
            first_name: firstName,
            last_name: lastName,
            role: role || 'docente',
            approval_status: 'approved',
            must_change_password: true // Flag to force password change on first login
          })
          .eq('id', newUser.user.id);

        if (updateError) throw updateError;
      }

      return res.status(200).json({
        success: true,
        user: {
          id: newUser.user.id,
          email: newUser.user.email,
          firstName,
          lastName,
          role: role || 'docente'
        }
      });
    }

    return res.status(500).json({ error: 'Failed to create user' });
  } catch (error: any) {
    console.error('Error creating user:', error);
    
    // Handle specific error cases
    if (error.message?.includes('duplicate key') || error.message?.includes('already exists')) {
      return res.status(409).json({ error: 'A user with this email already exists' });
    }
    
    return res.status(500).json({ 
      error: error.message || 'Internal server error' 
    });
  }
}