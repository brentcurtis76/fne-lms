import { NextApiRequest, NextApiResponse } from 'next';
import { getApiUser, createApiSupabaseClient, sendAuthError } from '../../../lib/api-auth';
import { getUserPrimaryRole } from '../../../utils/roleUtils';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Authenticate user
  const { user, error } = await getApiUser(req, res);
  
  if (error || !user) {
    return sendAuthError(res, 'Authentication required');
  }

  const userId = user.id;

  try {
    // Check if user has admin/reporting permissions
    const userRole = await getUserPrimaryRole(userId);
    if (!['admin', 'equipo_directivo', 'consultor'].includes(userRole)) {
      return res.status(403).json({ error: 'You do not have permission to view analytics' });
    }

    const supabaseClient = await createApiSupabaseClient(req, res);

    // Get query parameters for filtering
    const { pathId, dateRange } = req.query;
    const days = parseInt(dateRange as string) || 30; // Default 30 days
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    let analytics: any = {};

    if (pathId) {
      // Get analytics for a specific learning path
      analytics = await getPathSpecificAnalytics(supabaseClient, pathId as string, cutoffDate);
    } else {
      // Get overview analytics for all learning paths
      analytics = await getOverviewAnalytics(supabaseClient, cutoffDate);
    }

    res.status(200).json(analytics);

  } catch (error: any) {
    console.error('Learning path analytics error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to fetch learning path analytics'
    });
  }
}

async function getOverviewAnalytics(supabaseClient: any, cutoffDate: Date) {
  // Use pre-aggregated performance summary table for fast queries
  const { data: pathStats } = await supabaseClient
    .from('learning_path_performance_summary')
    .select(`
      path_id,
      total_enrolled_users,
      total_completed_users,
      total_time_spent_hours,
      overall_completion_rate,
      avg_completion_time_days,
      engagement_score,
      total_courses,
      recent_enrollments,
      recent_completions,
      recent_session_time_hours,
      learning_paths!inner(name)
    `);

  // Get recent daily summaries instead of raw sessions
  const { data: recentActivity } = await supabaseClient
    .from('learning_path_daily_summary')
    .select('path_id, total_active_users, total_sessions_count, total_session_time_minutes, summary_date')
    .gte('summary_date', cutoffDate.toISOString().split('T')[0])
    .order('summary_date', { ascending: true });

  // Get completion trends from daily summaries
  const { data: completionTrends } = await supabaseClient
    .from('learning_path_daily_summary')
    .select('summary_date, course_completions, new_enrollments')
    .gte('summary_date', cutoffDate.toISOString().split('T')[0])
    .order('summary_date', { ascending: true });

  // Calculate summary metrics from pre-aggregated data
  const totalPaths = pathStats?.length || 0;
  const totalAssignedUsers = pathStats?.reduce((sum: number, path: any) => 
    sum + (path.total_enrolled_users || 0), 0) || 0;
  const totalCompletedUsers = pathStats?.reduce((sum: number, path: any) => 
    sum + (path.total_completed_users || 0), 0) || 0;
  const averageCompletionRate = pathStats?.length > 0 
    ? pathStats.reduce((sum: number, path: any) => 
        sum + (path.overall_completion_rate || 0), 0) / pathStats.length
    : 0;
  const totalTimeSpentHours = pathStats?.reduce((sum: number, path: any) => 
    sum + (path.total_time_spent_hours || 0), 0) || 0;

  // Process pre-aggregated activity data
  const totalRecentSessions = (recentActivity || []).reduce((sum: number, day: any) => 
    sum + (day.total_sessions_count || 0), 0);
  const totalActiveUsers = (recentActivity || []).reduce((sum: number, day: any) => 
    sum + (day.total_active_users || 0), 0);

  // Process completion trends from daily summaries
  const completionsByDate = (completionTrends || []).reduce((acc: any, day: any) => {
    const date = day.summary_date;
    if (!acc[date]) {
      acc[date] = { completions: 0, enrollments: 0 };
    }
    acc[date].completions += day.course_completions || 0;
    acc[date].enrollments += day.new_enrollments || 0;
    return acc;
  }, {});

  // Calculate path performance ranking using pre-calculated engagement scores
  const pathPerformance = (pathStats || [])
    .map((path: any) => ({
      pathId: path.path_id,
      pathName: path.learning_paths.name,
      completionRate: path.overall_completion_rate || 0,
      avgCompletionTime: (path.avg_completion_time_days || 0) * 24 * 60, // Convert days to minutes
      totalUsers: path.total_enrolled_users || 0,
      completedUsers: path.total_completed_users || 0,
      engagementScore: path.engagement_score || 0,
      recentEnrollments: path.recent_enrollments || 0,
      recentCompletions: path.recent_completions || 0
    }))
    .sort((a: any, b: any) => b.engagementScore - a.engagementScore);

  return {
    summary: {
      totalPaths,
      totalAssignedUsers,
      totalCompletedUsers,
      averageCompletionRate: Math.round(averageCompletionRate * 100) / 100,
      totalTimeSpentHours: Math.round(totalTimeSpentHours * 100) / 100
    },
    recentActivity: {
      timeframe: `${Math.floor((Date.now() - cutoffDate.getTime()) / (24 * 60 * 60 * 1000))} days`,
      totalSessions: totalRecentSessions,
      totalActiveUsers: totalActiveUsers
    },
    completionTrends: Object.keys(completionsByDate).map(date => ({
      date,
      completions: completionsByDate[date].completions,
      enrollments: completionsByDate[date].enrollments
    })),
    pathPerformance: pathPerformance.slice(0, 10), // Top 10 performing paths
    lowPerformingPaths: pathPerformance.filter((p: any) => p.completionRate < 40).slice(0, 5)
  };
}

async function getPathSpecificAnalytics(supabaseClient: any, pathId: string, cutoffDate: Date) {
  // Use pre-aggregated performance summary for path info
  const { data: pathInfo } = await supabaseClient
    .from('learning_path_performance_summary')
    .select(`
      *,
      learning_paths!inner(name, description)
    `)
    .eq('path_id', pathId)
    .single();

  if (!pathInfo) {
    throw new Error('Learning path not found');
  }

  // Get daily summary data instead of raw sessions for better performance
  const { data: dailySummaries } = await supabaseClient
    .from('learning_path_daily_summary')
    .select('*')
    .eq('path_id', pathId)
    .gte('summary_date', cutoffDate.toISOString().split('T')[0])
    .order('summary_date', { ascending: true });

  // Get user summaries for detailed user analysis
  const { data: userSummaries } = await supabaseClient
    .from('user_learning_path_summary')
    .select('*')
    .eq('path_id', pathId);

  // Get course-level analysis using user summaries
  const { data: pathCourses } = await supabaseClient
    .from('learning_path_courses')
    .select(`
      course_id,
      sequence_order,
      courses!inner(title)
    `)
    .eq('learning_path_id', pathId)
    .order('sequence_order');

  // Analyze course progression from user summaries
  const courseProgression = (pathCourses || []).map((course: any) => {
    const usersReachedCourse = (userSummaries || []).filter((user: any) => 
      user.current_course_sequence >= course.sequence_order || user.status === 'completed'
    ).length;
    const totalUsers = userSummaries?.length || 0;
    
    return {
      courseId: course.course_id,
      courseName: course.courses.title,
      sequenceOrder: course.sequence_order,
      usersReached: usersReachedCourse,
      dropoffRate: totalUsers > 0 ? 
        Math.round(((totalUsers - usersReachedCourse) / totalUsers) * 100 * 100) / 100 : 0,
      completionRate: totalUsers > 0 ? 
        Math.round((usersReachedCourse / totalUsers) * 100 * 100) / 100 : 0
    };
  });

  // Calculate time-based metrics from user summaries and pre-aggregated data
  const completedUsers = (userSummaries || []).filter((user: any) => user.status === 'completed');
  const avgCompletionTimeMinutes = completedUsers.length > 0 
    ? completedUsers.reduce((sum: number, user: any) => sum + (user.total_time_spent_minutes || 0), 0) / completedUsers.length
    : 0;

  // Activity heatmap from daily summaries
  const activityHeatmap = (dailySummaries || []).reduce((acc: any, day: any) => {
    const date = day.summary_date;
    acc[date] = {
      sessions: day.total_sessions_count || 0,
      activeUsers: day.total_active_users || 0,
      timeSpent: day.total_session_time_minutes || 0
    };
    return acc;
  }, {});

  return {
    pathInfo: {
      pathId: pathInfo.path_id,
      pathName: pathInfo.learning_paths.name,
      description: pathInfo.learning_paths.description,
      totalAssignedUsers: pathInfo.total_enrolled_users || 0,
      completedUsers: pathInfo.total_completed_users || 0,
      completionRate: pathInfo.overall_completion_rate || 0,
      avgCompletionTimeDays: pathInfo.avg_completion_time_days || 0,
      engagementScore: pathInfo.engagement_score || 0,
      recentEnrollments: pathInfo.recent_enrollments || 0,
      recentCompletions: pathInfo.recent_completions || 0
    },
    courseProgression,
    timeAnalytics: {
      avgCompletionTimeMinutes: Math.round(avgCompletionTimeMinutes * 100) / 100,
      avgCompletionTimeHours: Math.round(avgCompletionTimeMinutes / 60 * 100) / 100,
      totalTimeSpentHours: Math.round((pathInfo.total_time_spent_hours || 0) * 100) / 100
    },
    userAnalytics: {
      totalUsers: userSummaries?.length || 0,
      completedUsers: completedUsers.length,
      inProgressUsers: (userSummaries || []).filter((u: any) => u.status === 'in_progress').length,
      atRiskUsers: (userSummaries || []).filter((u: any) => u.is_at_risk).length,
      avgProgressPercentage: userSummaries?.length > 0 
        ? Math.round(userSummaries.reduce((sum: number, u: any) => sum + u.overall_progress_percentage, 0) / userSummaries.length * 100) / 100 
        : 0
    },
    activityHeatmap,
    recentActivity: {
      totalDays: (dailySummaries || []).length,
      totalSessions: (dailySummaries || []).reduce((sum: number, day: any) => sum + (day.total_sessions_count || 0), 0),
      totalActiveUsers: (dailySummaries || []).reduce((sum: number, day: any) => sum + (day.total_active_users || 0), 0),
      timeframe: `${Math.floor((Date.now() - cutoffDate.getTime()) / (24 * 60 * 60 * 1000))} days`
    }
  };
}

function calculateEngagementScore(path: any): number {
  const completionRate = path.completion_rate_percentage || 0;
  const totalUsers = path.total_assigned_users || 0;
  const startedUsers = path.started_users || 0;
  const startRate = totalUsers > 0 ? (startedUsers / totalUsers) * 100 : 0;
  
  // Weighted engagement score (40% completion rate, 30% start rate, 30% total user volume)
  const volumeWeight = Math.min(totalUsers / 50, 1) * 30; // Cap volume at 50 users for fair comparison
  const score = (completionRate * 0.4) + (startRate * 0.3) + volumeWeight;
  
  return Math.round(score * 100) / 100;
}