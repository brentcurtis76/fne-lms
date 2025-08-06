import { NextApiRequest, NextApiResponse } from 'next';
import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';

/**
 * API endpoint to get current session information
 * Used as fallback when frontend auth context fails
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Create Supabase client with session from cookies
    const supabase = createPagesServerClient({ req, res });
    
    // Get current session
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError) {
      console.error('[session API] Error getting session:', sessionError.message);
      return res.status(401).json({ error: 'Session error', user: null });
    }

    if (!session?.user) {
      console.log('[session API] No active session');
      return res.status(200).json({ user: null });
    }

    console.log('[session API] Found session for user:', session.user.id, session.user.email);
    
    // Return user information
    return res.status(200).json({
      user: {
        id: session.user.id,
        email: session.user.email,
        user_metadata: session.user.user_metadata
      }
    });

  } catch (error: any) {
    console.error('[session API] Unexpected error:', error.message);
    return res.status(500).json({ 
      error: 'Internal server error', 
      user: null 
    });
  }
}