import { NextApiRequest, NextApiResponse } from 'next';
import { getApiUser, createApiSupabaseClient, sendAuthError } from '../../../lib/api-auth';
import { LearningPathsService } from '../../../lib/services/learningPathsService';
import {
  UNAVAILABLE_METRICS,
  type LearningPathAnalyticsOverview,
  type PathSpecificAnalytics,
  type PathPerformanceEntry,
  type CourseProgressionEntry,
} from '../../../types/learning-path-analytics';

/**
 * GET /api/learning-paths/analytics[?pathId=&dateRange=]
 *
 * Cross-user learning-path reporting: literal admin only (W-B2c-01). Reads the
 * live summary views of migration 20260907120600 through the caller's session
 * client (the views themselves answer only a literal admin / backend for the
 * cross-user relations). Metric contract:
 * docs/reviews/rls-learning-path-reporting-contract-2026-09-07.md.
 *
 * Error contract (closure C3): a failed query is an error response, never a
 * silent zero. Metrics without a governing definition (engagement score,
 * at-risk flag, per-day completion rate) are returned as `null` = unavailable,
 * never 0 / false, and the payload says so in `unavailable`.
 */
// The shape (nullable rates, always-null undefined metrics, `unavailable` list)
// is the shared contract in types/learning-path-analytics.ts — C-R1-04: the
// UI consumer types against the same definitions.

function isoDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

class AnalyticsQueryError extends Error {
  constructor(public readonly relation: string, message: string) {
    super(`${relation}: ${message}`);
  }
}

async function readRows<T>(query: PromiseLike<{ data: T[] | null; error: { message: string } | null }>, relation: string): Promise<T[]> {
  const { data, error } = await query;
  if (error) throw new AnalyticsQueryError(relation, error.message);
  return data ?? [];
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { user, error } = await getApiUser(req, res);
  if (error || !user) {
    return sendAuthError(res, 'Authentication required');
  }

  try {
    const supabaseClient = await createApiSupabaseClient(req, res);

    const canViewAnalytics = await LearningPathsService.hasManagePermission(supabaseClient, user.id);
    if (!canViewAnalytics) {
      return res.status(403).json({ error: 'You do not have permission to view analytics' });
    }

    const { pathId, dateRange } = req.query;
    const parsedDays = parseInt(dateRange as string, 10);
    const days = Number.isFinite(parsedDays) && parsedDays > 0 ? Math.min(parsedDays, 365) : 30;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const analytics = pathId
      ? await getPathSpecificAnalytics(supabaseClient, String(pathId), cutoffDate, days)
      : await getOverviewAnalytics(supabaseClient, cutoffDate, days);

    return res.status(200).json(analytics);
  } catch (err: any) {
    if (err instanceof AnalyticsQueryError) {
      console.error('Learning path analytics query error:', err.message);
      return res.status(502).json({ error: 'Learning path analytics are temporarily unavailable', relation: err.relation });
    }
    if (err?.message === 'Learning path not found') {
      return res.status(404).json({ error: err.message });
    }
    console.error('Learning path analytics error:', err);
    return res.status(500).json({ error: err?.message || 'Failed to fetch learning path analytics' });
  }
}

async function getOverviewAnalytics(supabaseClient: any, cutoffDate: Date, days: number): Promise<LearningPathAnalyticsOverview> {
  const pathStats = await readRows<any>(
    supabaseClient
      .from('learning_path_performance_summary')
      .select('path_id, path_name, total_enrolled_users, total_completed_users, total_in_progress_users, total_time_spent_hours, overall_completion_rate, avg_completion_time_days, engagement_score, total_courses, recent_enrollments, recent_completions, recent_session_time_hours'),
    'learning_path_performance_summary'
  );

  const dailyRows = await readRows<any>(
    supabaseClient
      .from('learning_path_daily_summary')
      .select('path_id, summary_date, total_active_users, total_sessions_count, total_session_time_minutes, course_completions, new_enrollments')
      .gte('summary_date', isoDate(cutoffDate))
      .order('summary_date', { ascending: true }),
    'learning_path_daily_summary'
  );

  const totalPaths = pathStats.length;
  const totalAssignedUsers = pathStats.reduce((sum: number, p: any) => sum + (p.total_enrolled_users || 0), 0);
  const totalCompletedUsers = pathStats.reduce((sum: number, p: any) => sum + (p.total_completed_users || 0), 0);
  const ratedPaths = pathStats.filter((p: any) => p.overall_completion_rate !== null && p.overall_completion_rate !== undefined);
  const averageCompletionRate = ratedPaths.length > 0
    ? round2(ratedPaths.reduce((sum: number, p: any) => sum + Number(p.overall_completion_rate), 0) / ratedPaths.length)
    : null;
  const totalTimeSpentHours = round2(pathStats.reduce((sum: number, p: any) => sum + Number(p.total_time_spent_hours || 0), 0));

  const totalRecentSessions = dailyRows.reduce((sum: number, d: any) => sum + (d.total_sessions_count || 0), 0);
  // Distinct users across paths and days are not derivable from per-path
  // daily rows; the sum of per-(path, day) distinct counts is reported under
  // its true name.
  const activeUserDays = dailyRows.reduce((sum: number, d: any) => sum + (d.total_active_users || 0), 0);

  const completionsByDate: Record<string, { completions: number; enrollments: number }> = {};
  for (const d of dailyRows) {
    const key = d.summary_date;
    if (!completionsByDate[key]) completionsByDate[key] = { completions: 0, enrollments: 0 };
    completionsByDate[key].completions += d.course_completions || 0;
    completionsByDate[key].enrollments += d.new_enrollments || 0;
  }

  const pathPerformance: PathPerformanceEntry[] = pathStats
    .map((p: any): PathPerformanceEntry => ({
      pathId: p.path_id,
      pathName: p.path_name,
      completionRate: p.overall_completion_rate === null ? null : Number(p.overall_completion_rate),
      avgCompletionTimeDays: p.avg_completion_time_days === null ? null : Number(p.avg_completion_time_days),
      totalUsers: p.total_enrolled_users || 0,
      completedUsers: p.total_completed_users || 0,
      inProgressUsers: p.total_in_progress_users || 0,
      engagementScore: null,
      recentEnrollments: p.recent_enrollments || 0,
      recentCompletions: p.recent_completions || 0,
      recentSessionTimeHours: Number(p.recent_session_time_hours || 0),
    }))
    .sort((a, b) => (b.completionRate ?? -1) - (a.completionRate ?? -1) || b.totalUsers - a.totalUsers);

  return {
    summary: {
      totalPaths,
      totalAssignedUsers,
      totalCompletedUsers,
      averageCompletionRate,
      totalTimeSpentHours,
    },
    recentActivity: {
      timeframe: `${days} days`,
      totalSessions: totalRecentSessions,
      activeUserDays,
    },
    completionTrends: Object.keys(completionsByDate).sort().map((date) => ({
      date,
      completions: completionsByDate[date].completions,
      enrollments: completionsByDate[date].enrollments,
    })),
    pathPerformance: pathPerformance.slice(0, 10),
    lowPerformingPaths: pathPerformance.filter((p) => p.completionRate !== null && p.completionRate < 40).slice(0, 5),
    unavailable: [...UNAVAILABLE_METRICS],
  };
}

async function getPathSpecificAnalytics(supabaseClient: any, pathId: string, cutoffDate: Date, days: number): Promise<PathSpecificAnalytics> {
  const [pathInfo] = await readRows<any>(
    supabaseClient
      .from('learning_path_performance_summary')
      .select('*')
      .eq('path_id', pathId)
      .limit(1),
    'learning_path_performance_summary'
  );
  if (!pathInfo) {
    throw new Error('Learning path not found');
  }

  const dailySummaries = await readRows<any>(
    supabaseClient
      .from('learning_path_daily_summary')
      .select('*')
      .eq('path_id', pathId)
      .gte('summary_date', isoDate(cutoffDate))
      .order('summary_date', { ascending: true }),
    'learning_path_daily_summary'
  );

  const userSummaries = await readRows<any>(
    supabaseClient
      .from('user_learning_path_summary')
      .select('user_id, status, current_course_sequence, total_time_spent_minutes, overall_progress_percentage, started_at, completed_at, last_session_date')
      .eq('path_id', pathId),
    'user_learning_path_summary'
  );

  const pathCourses = await readRows<any>(
    supabaseClient
      .from('learning_path_courses')
      .select('course_id, sequence_order, courses!inner(title)')
      .eq('learning_path_id', pathId)
      .order('sequence_order'),
    'learning_path_courses'
  );

  const totalUsers = userSummaries.length;
  const courseProgression: CourseProgressionEntry[] = pathCourses.map((course: any): CourseProgressionEntry => {
    const usersReachedCourse = userSummaries.filter((u: any) =>
      u.current_course_sequence >= course.sequence_order || u.status === 'completed'
    ).length;
    return {
      courseId: course.course_id,
      courseName: course.courses?.title ?? null,
      sequenceOrder: course.sequence_order,
      usersReached: usersReachedCourse,
      dropoffRate: totalUsers > 0 ? round2(((totalUsers - usersReachedCourse) / totalUsers) * 100) : null,
      reachRate: totalUsers > 0 ? round2((usersReachedCourse / totalUsers) * 100) : null,
    };
  });

  const completedUsers = userSummaries.filter((u: any) => u.status === 'completed');
  const avgCompletionTimeMinutes = completedUsers.length > 0
    ? completedUsers.reduce((sum: number, u: any) => sum + (u.total_time_spent_minutes || 0), 0) / completedUsers.length
    : null;

  const activityHeatmap: Record<string, { sessions: number; activeUsers: number; timeSpent: number }> = {};
  for (const d of dailySummaries) {
    activityHeatmap[d.summary_date] = {
      sessions: d.total_sessions_count || 0,
      activeUsers: d.total_active_users || 0,
      timeSpent: d.total_session_time_minutes || 0,
    };
  }

  return {
    pathInfo: {
      pathId: pathInfo.path_id,
      pathName: pathInfo.path_name,
      description: pathInfo.path_description,
      totalAssignedUsers: pathInfo.total_enrolled_users || 0,
      completedUsers: pathInfo.total_completed_users || 0,
      completionRate: pathInfo.overall_completion_rate === null ? null : Number(pathInfo.overall_completion_rate),
      avgCompletionTimeDays: pathInfo.avg_completion_time_days === null ? null : Number(pathInfo.avg_completion_time_days),
      engagementScore: null,
      recentEnrollments: pathInfo.recent_enrollments || 0,
      recentCompletions: pathInfo.recent_completions || 0,
    },
    courseProgression,
    timeAnalytics: {
      avgCompletionTimeMinutes: avgCompletionTimeMinutes === null ? null : round2(avgCompletionTimeMinutes),
      avgCompletionTimeHours: avgCompletionTimeMinutes === null ? null : round2(avgCompletionTimeMinutes / 60),
      totalTimeSpentHours: round2(Number(pathInfo.total_time_spent_hours || 0)),
    },
    userAnalytics: {
      totalUsers,
      completedUsers: completedUsers.length,
      inProgressUsers: userSummaries.filter((u: any) => u.status === 'in_progress').length,
      notStartedUsers: userSummaries.filter((u: any) => u.status === 'not_started').length,
      atRiskUsers: null,
      avgProgressPercentage: totalUsers > 0
        ? round2(userSummaries.reduce((sum: number, u: any) => sum + Number(u.overall_progress_percentage || 0), 0) / totalUsers)
        : null,
    },
    activityHeatmap,
    recentActivity: {
      totalDays: dailySummaries.length,
      totalSessions: dailySummaries.reduce((sum: number, d: any) => sum + (d.total_sessions_count || 0), 0),
      activeUserDays: dailySummaries.reduce((sum: number, d: any) => sum + (d.total_active_users || 0), 0),
      timeframe: `${days} days`,
    },
    unavailable: [...UNAVAILABLE_METRICS],
  };
}
