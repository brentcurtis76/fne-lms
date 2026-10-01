import { NextApiRequest, NextApiResponse } from 'next';
import { getApiUser } from '../../../lib/api-auth';

/**
 * API endpoint to get current session information
 * Used as fallback when frontend auth context fails
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // The user comes from the auth server (cookie token or Bearer), never
    // from the cookie's stored `user`, which is client-controlled (SM-B015).
    // No forced-password gate: /change-password relies on this route.
    const { user, error } = await getApiUser(req, res);

    if (error || !user) {
      return res.status(200).json({ user: null });
    }

    // Return user information
    return res.status(200).json({
      user: {
        id: user.id,
        email: user.email,
        user_metadata: user.user_metadata
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