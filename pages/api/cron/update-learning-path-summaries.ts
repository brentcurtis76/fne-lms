import { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';

/**
 * Background job to update learning path summary tables
 * Should be called daily via cron job or external scheduler
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const supabase = supabaseAdmin;
    
    console.log('Starting learning path summaries update...');
    const startTime = Date.now();

    // 1. Update performance summaries for all paths
    console.log('Updating performance summaries...');
    const { data: allPaths } = await supabase
      .from('learning_paths')
      .select('id')
      .eq('status', 'published'); // Only active paths

    let performanceUpdates = 0;
    for (const path of allPaths || []) {
      try {
        await supabase.rpc('update_learning_path_performance_summary', {
          p_path_id: path.id
        });
        performanceUpdates++;
      } catch (error) {
        console.error(`Failed to update performance summary for path ${path.id}:`, error);
      }
    }

    // 2. Update daily summaries for yesterday and today
    console.log('Updating daily summaries...');
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const today = new Date();
    
    const datesToUpdate = [
      yesterday.toISOString().split('T')[0],
      today.toISOString().split('T')[0]
    ];

    let dailyUpdates = 0;
    for (const path of allPaths || []) {
      for (const dateStr of datesToUpdate) {
        try {
          await supabase.rpc('update_learning_path_daily_summary', {
            p_path_id: path.id,
            p_date: dateStr
          });
          dailyUpdates++;
        } catch (error) {
          console.error(`Failed to update daily summary for path ${path.id} on ${dateStr}:`, error);
        }
      }
    }

    // 3. Update user summaries for recent activity
    console.log('Updating user summaries...');
    const { data: recentAssignments } = await supabase
      .from('learning_path_assignments')
      .select('user_id, path_id')
      .or(`
        started_at.gte.${new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()},
        last_activity_at.gte.${new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()},
        completed_at.gte.${new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()}
      `);

    let userUpdates = 0;
    for (const assignment of recentAssignments || []) {
      try {
        await supabase.rpc('update_user_learning_path_summary', {
          p_user_id: assignment.user_id,
          p_path_id: assignment.path_id
        });
        userUpdates++;
      } catch (error) {
        console.error(`Failed to update user summary for ${assignment.user_id}/${assignment.path_id}:`, error);
      }
    }

    // 4. Update monthly summaries (first day of month)
    const isFirstOfMonth = new Date().getDate() === 1;
    let monthlyUpdates = 0;
    
    if (isFirstOfMonth) {
      console.log('Updating monthly summaries...');
      const previousMonth = new Date();
      previousMonth.setMonth(previousMonth.getMonth() - 1);
      previousMonth.setDate(1); // First day of previous month
      const monthKey = previousMonth.toISOString().split('T')[0];
      
      for (const path of allPaths || []) {
        try {
          // Get daily summaries for the previous month
          const { data: dailyData } = await supabase
            .from('learning_path_daily_summary')
            .select('*')
            .eq('path_id', path.id)
            .gte('summary_date', monthKey)
            .lt('summary_date', new Date(previousMonth.getFullYear(), previousMonth.getMonth() + 1, 1).toISOString().split('T')[0]);

          if (dailyData && dailyData.length > 0) {
            // Aggregate monthly metrics
            const totalActiveUsers = dailyData.reduce((sum, day) => sum + (day.total_active_users || 0), 0);
            const totalNewEnrollments = dailyData.reduce((sum, day) => sum + (day.new_enrollments || 0), 0);
            const totalCompletions = dailyData.reduce((sum, day) => sum + (day.course_completions || 0), 0);
            const totalSessionTime = dailyData.reduce((sum, day) => sum + (day.total_session_time_minutes || 0), 0);
            const totalSessions = dailyData.reduce((sum, day) => sum + (day.total_sessions_count || 0), 0);
            
            const avgDailyActiveUsers = totalActiveUsers / dailyData.length;
            const avgSessionDuration = totalSessions > 0 ? totalSessionTime / totalSessions : 0;
            const avgCompletionRate = dailyData.reduce((sum, day) => sum + (day.completion_rate || 0), 0) / dailyData.length;

            // Insert/update monthly summary
            await supabase
              .from('learning_path_monthly_summary')
              .upsert({
                path_id: path.id,
                summary_month: monthKey,
                total_active_users: totalActiveUsers,
                total_new_enrollments: totalNewEnrollments,
                total_completions: totalCompletions,
                total_session_time_hours: Math.round(totalSessionTime / 60 * 100) / 100,
                total_sessions: totalSessions,
                avg_daily_active_users: Math.round(avgDailyActiveUsers * 100) / 100,
                avg_session_duration_minutes: Math.round(avgSessionDuration * 100) / 100,
                avg_completion_rate: Math.round(avgCompletionRate * 100) / 100,
                updated_at: new Date().toISOString()
              });
            
            monthlyUpdates++;
          }
        } catch (error) {
          console.error(`Failed to update monthly summary for path ${path.id}:`, error);
        }
      }
    }

    // 5. Clean up old daily summaries (keep last 90 days)
    console.log('Cleaning up old daily summaries...');
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 90);
    
    const { count: deletedCount } = await supabase
      .from('learning_path_daily_summary')
      .delete()
      .lt('summary_date', cutoffDate.toISOString().split('T')[0]);

    const duration = Date.now() - startTime;
    
    const summary = {
      success: true,
      duration: `${Math.round(duration / 1000)}s`,
      updates: {
        performanceSummaries: performanceUpdates,
        dailySummaries: dailyUpdates,
        userSummaries: userUpdates,
        monthlySummaries: monthlyUpdates
      },
      cleanup: {
        oldDailySummaries: deletedCount || 0
      },
      message: 'Learning path summaries updated successfully'
    };

    console.log('Summary update completed:', summary);
    
    res.status(200).json(summary);

  } catch (error: any) {
    console.error('Failed to update learning path summaries:', error);
    res.status(500).json({ 
      success: false,
      error: error.message || 'Failed to update summaries'
    });
  }
}