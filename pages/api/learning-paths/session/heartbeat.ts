import { NextApiRequest, NextApiResponse } from 'next';
import { getApiUser, createApiSupabaseClient, sendAuthError } from '../../../../lib/api-auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Authenticate user
  const { user, error } = await getApiUser(req, res);
  
  if (error || !user) {
    return sendAuthError(res, 'Authentication required');
  }

  const userId = user.id;
  const { sessionId } = req.body;

  // Validate required fields
  if (!sessionId) {
    return res.status(400).json({ error: 'Session ID is required' });
  }

  try {
    const supabaseClient = await createApiSupabaseClient(req, res);

    // Verify session belongs to user and is still active
    const { data: session, error: sessionError } = await supabaseClient
      .from('learning_path_progress_sessions')
      .select('id, user_id, session_end')
      .eq('id', sessionId)
      .eq('user_id', userId)
      .single();

    if (sessionError || !session) {
      return res.status(404).json({ error: 'Session not found or access denied' });
    }

    // Check if session is already ended
    if (session.session_end) {
      return res.status(400).json({ error: 'Session has already ended' });
    }

    // Update heartbeat using the database function
    const { data: success, error: heartbeatError } = await supabaseClient
      .rpc('update_session_heartbeat', {
        p_session_id: sessionId
      });

    if (heartbeatError) {
      console.error('Failed to update heartbeat:', heartbeatError);
      throw new Error('Failed to update session heartbeat');
    }

    if (!success) {
      return res.status(404).json({ error: 'Session not found or already ended' });
    }

    // Return minimal response for efficiency
    res.status(200).json({
      sessionId,
      heartbeatAt: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('Heartbeat error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to update heartbeat'
    });
  }
}