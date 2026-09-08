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
  // timeSpentMinutes from the body is intentionally ignored (W-B2c-01): the
  // assignment credit is computed server-side from the session's own clock by
  // end_learning_path_session, at most once per session.
  const { sessionId } = req.body;

  // Validate required fields
  if (!sessionId) {
    return res.status(400).json({ error: 'Session ID is required' });
  }

  try {
    const supabaseClient = await createApiSupabaseClient(req, res);

    // Verify session belongs to user
    const { data: session, error: sessionError } = await supabaseClient
      .from('learning_path_progress_sessions')
      .select('id, user_id, path_id, session_end')
      .eq('id', sessionId)
      .eq('user_id', userId)
      .single();

    if (sessionError || !session) {
      return res.status(404).json({ error: 'Session not found or access denied' });
    }

    // Check if session is already ended
    if (session.session_end) {
      return res.status(200).json({ 
        message: 'Session already ended',
        sessionId 
      });
    }

    // End session using the database function
    const { data: success, error: endError } = await supabaseClient
      .rpc('end_learning_path_session', {
        p_session_id: sessionId
      });

    if (endError) {
      console.error('Failed to end session:', endError);
      throw new Error('Failed to end session');
    }

    const { data: closed } = await supabaseClient
      .from('learning_path_progress_sessions')
      .select('time_spent_minutes, session_end')
      .eq('id', sessionId)
      .maybeSingle();

    // Return success with the server-computed figures
    res.status(200).json({
      sessionId,
      endedAt: closed?.session_end ?? new Date().toISOString(),
      timeSpentMinutes: closed?.time_spent_minutes ?? 0
    });

  } catch (error: any) {
    console.error('Session end error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to end session'
    });
  }
}
