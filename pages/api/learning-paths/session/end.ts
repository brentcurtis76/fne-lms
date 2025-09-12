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
  const { sessionId, timeSpentMinutes } = req.body;

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

    // Update assignment total time if we have a valid time spent value (atomic via RPC)
    if (timeSpentMinutes && timeSpentMinutes > 0) {
      const { data: incOk, error: incErr } = await supabaseClient
        .rpc('increment_path_assignment_time', {
          p_user_id: userId,
          p_path_id: session.path_id,
          p_minutes: timeSpentMinutes,
        });

      if (incErr || incOk !== true) {
        console.warn('Failed to increment assignment time:', incErr);
        // Don't fail the request for this
      }
    }

    // Return success
    res.status(200).json({
      sessionId,
      endedAt: new Date().toISOString(),
      timeSpentMinutes: timeSpentMinutes || 0
    });

  } catch (error: any) {
    console.error('Session end error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to end session'
    });
  }
}
