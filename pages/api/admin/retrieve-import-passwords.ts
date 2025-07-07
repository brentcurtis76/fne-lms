import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { passwordStore } from '../../../lib/temporaryPasswordStore';

interface PasswordEntry {
  email: string;
  password: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<{ passwords: PasswordEntry[] } | { error: string }>
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

    // Create Supabase admin client
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
      return res.status(403).json({ error: 'Unauthorized. Only admins can retrieve passwords.' });
    }

    // Get session ID from request body
    const { sessionId } = req.body;
    
    if (!sessionId || typeof sessionId !== 'string') {
      return res.status(400).json({ error: 'Session ID is required' });
    }

    // Retrieve passwords from temporary store
    const passwords = passwordStore.retrieve(sessionId);
    
    // Clear the passwords after retrieval (one-time access)
    passwordStore.clear(sessionId);

    // Log the password retrieval (best effort)
    try {
      await supabaseAdmin
        .from('audit_logs')
        .insert({
          user_id: user.id,
          action: 'bulk_passwords_retrieved',
          details: {
            session_id: sessionId,
            count: passwords.length,
            retrieved_by: user.email
          }
        });
    } catch (auditError) {
      console.error('Failed to write to audit log:', auditError);
      // Do not re-throw; we want the main operation to succeed
    }

    return res.status(200).json({
      passwords: passwords.map(entry => ({
        email: entry.email,
        password: entry.password
      }))
    });

  } catch (error: any) {
    console.error('Error retrieving passwords:', error);
    return res.status(500).json({ 
      error: 'Error interno del servidor' 
    });
  }
}