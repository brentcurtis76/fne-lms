import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

/**
 * Cron job to clean up dangling learning path sessions
 * Runs every hour to close sessions that haven't received heartbeats
 * 
 * Expected to be called by Vercel Cron or external scheduler
 * Authorization via secret key or service role
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify authorization
  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;
  
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Create service role client for elevated permissions
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    const now = new Date();
    const cutoffTime = new Date(now.getTime() - (15 * 60 * 1000)); // 15 minutes ago

    // Find dangling sessions (no heartbeat in 15+ minutes and not closed)
    const { data: danglingSessions, error: findError } = await supabase
      .from('learning_path_progress_sessions')
      .select('id, user_id, path_id, session_start, last_heartbeat')
      .is('session_end', null)
      .lt('last_heartbeat', cutoffTime.toISOString());

    if (findError) {
      console.error('Error finding dangling sessions:', findError);
      throw findError;
    }

    if (!danglingSessions || danglingSessions.length === 0) {
      return res.status(200).json({
        message: 'No dangling sessions found',
        cleanedUp: 0,
        timestamp: now.toISOString()
      });
    }

    console.log(`[SessionCleanup] Found ${danglingSessions.length} dangling sessions`);

    // Process each dangling session
    let successCount = 0;
    let errorCount = 0;
    const errors: string[] = [];

    for (const session of danglingSessions) {
      try {
        // Calculate approximate time spent (from session start to last heartbeat)
        const sessionStart = new Date(session.session_start);
        const lastHeartbeat = new Date(session.last_heartbeat);
        const timeSpentMs = lastHeartbeat.getTime() - sessionStart.getTime();
        const timeSpentMinutes = Math.max(0, Math.round(timeSpentMs / 60000));

        // Close the session
        const { error: closeError } = await supabase
          .from('learning_path_progress_sessions')
          .update({
            session_end: lastHeartbeat.toISOString(), // Use last heartbeat as end time
            time_spent_minutes: timeSpentMinutes,
            updated_at: now.toISOString()
          })
          .eq('id', session.id);

        if (closeError) {
          errorCount++;
          errors.push(`Session ${session.id}: ${closeError.message}`);
          continue;
        }

        // Update assignment total time
        const { error: assignmentError } = await supabase
          .from('learning_path_assignments')
          .update({
            total_time_spent_minutes: supabase.raw(`COALESCE(total_time_spent_minutes, 0) + ${timeSpentMinutes}`),
            last_activity_at: lastHeartbeat.toISOString()
          })
          .eq('user_id', session.user_id)
          .eq('path_id', session.path_id);

        if (assignmentError) {
          console.warn(`Failed to update assignment time for session ${session.id}:`, assignmentError);
          // Don't count as error since session was closed successfully
        }

        successCount++;
        console.log(`[SessionCleanup] Closed session ${session.id} (${timeSpentMinutes} minutes)`);

      } catch (sessionError: any) {
        errorCount++;
        errors.push(`Session ${session.id}: ${sessionError.message}`);
        console.error(`[SessionCleanup] Failed to close session ${session.id}:`, sessionError);
      }
    }

    // Also clean up very old sessions (older than 7 days) to prevent table bloat
    const oldCutoffTime = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000)); // 7 days ago
    
    const { error: archiveError, count: archivedCount } = await supabase
      .from('learning_path_progress_sessions')
      .delete()
      .lt('session_start', oldCutoffTime.toISOString());

    if (archiveError) {
      console.warn('[SessionCleanup] Failed to archive old sessions:', archiveError);
    } else {
      console.log(`[SessionCleanup] Archived ${archivedCount || 0} old sessions`);
    }

    // Return cleanup summary
    const result = {
      message: 'Session cleanup completed',
      sessionsFound: danglingSessions.length,
      successfullyClosed: successCount,
      errors: errorCount,
      oldSessionsArchived: archivedCount || 0,
      timestamp: now.toISOString()
    };

    if (errors.length > 0) {
      result['errorDetails'] = errors;
    }

    console.log('[SessionCleanup] Cleanup summary:', result);

    return res.status(200).json(result);

  } catch (error: any) {
    console.error('[SessionCleanup] Cleanup job failed:', error);
    return res.status(500).json({
      error: 'Cleanup job failed',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
}

// Export configuration for Vercel Cron
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '1mb',
    },
  },
  // Run every hour
  maxDuration: 60,
};