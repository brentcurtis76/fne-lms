import { NextApiRequest, NextApiResponse } from 'next';
import { getApiUser, createApiSupabaseClient, sendAuthError } from '../../../../lib/api-auth';

/**
 * Enhanced progress endpoint for learning path detail page
 * Simplified version that works with existing basic tables
 *
 * "At risk" follows the report views' definition (W-B2c-01 figures, Brent
 * 2026-10-02; migration 20261002120000): assigned, not finished (every course
 * of the path completed), and no activity for 14 days; a path with no courses
 * is never at risk. The learning-path engagement score / level is retired.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
export const AT_RISK_INACTIVE_DAYS = 14;
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { user, error: authError } = await getApiUser(req, res);
  if (authError || !user) {
    return sendAuthError(res, 'Authentication required');
  }

  const { id: pathId } = req.query;
  const userId = user.id;

  try {
    const supabaseClient = await createApiSupabaseClient(req, res);

    // Literal admin only may read a path without being assigned to it
    // (cross-user reporting, W-B2c-01). Every other role goes through its
    // own assignment below.
    const { data: userRoles } = await supabaseClient
      .from('user_roles')
      .select('role_type')
      .eq('user_id', userId)
      .eq('is_active', true);

    const hasAdminAccess = userRoles?.some(role => role.role_type === 'admin');

    let assignment = null;
    let learningPath = null;

    if (hasAdminAccess) {
      // For admins, get the learning path directly without checking assignment
      const { data: pathData, error: pathError } = await supabaseClient
        .from('learning_paths')
        .select('id, name, description, created_at')
        .eq('id', pathId)
        .single();

      if (pathError || !pathData) {
        return res.status(404).json({ error: 'Learning path not found' });
      }

      learningPath = pathData;
      // Create a mock assignment for admin access
      assignment = {
        id: 'admin-access',
        user_id: userId,
        path_id: pathId,
        assigned_at: new Date().toISOString(),
        learning_paths: pathData
      };
    } else {
      // For non-admin users, check assignment. A DIRECT assignee has their own
      // row; a GROUP-ONLY assignee has none (R2-04) — their authority is the
      // auth.uid()-derived helper the database policies use, and their progress
      // lives in learning_path_user_progress (own row, RLS-readable).
      const { data: assignmentData, error: assignmentError } = await supabaseClient
        .from('learning_path_assignments')
        .select(`
          *,
          learning_paths!inner(id, name, description, created_at)
        `)
        .eq('user_id', userId)
        .eq('path_id', pathId)
        .maybeSingle();

      if (assignmentError) {
        return res.status(404).json({ error: 'Learning path assignment not found' });
      }

      if (assignmentData) {
        // R3-04: learning_path_user_progress is the ONE authoritative
        // own-progress record (it is seeded from / mirrored into the direct
        // row, and it survives assignment-source changes). The direct row
        // establishes the assignment and its metadata; its progress columns
        // are only the fallback for a pair that has no progress row yet.
        const { data: ownProgress } = await supabaseClient
          .from('learning_path_user_progress')
          .select('started_at, last_activity_at, completed_at, current_course_sequence, total_time_spent_minutes')
          .eq('path_id', pathId)
          .eq('user_id', userId)
          .maybeSingle();
        assignment = ownProgress
          ? {
              ...assignmentData,
              started_at: ownProgress.started_at ?? assignmentData.started_at ?? null,
              last_activity_at: ownProgress.last_activity_at ?? assignmentData.last_activity_at ?? null,
              completed_at: ownProgress.completed_at ?? assignmentData.completed_at ?? null,
              current_course_sequence: ownProgress.current_course_sequence ?? assignmentData.current_course_sequence ?? 1,
              total_time_spent_minutes: ownProgress.total_time_spent_minutes ?? assignmentData.total_time_spent_minutes ?? 0,
            }
          : assignmentData;
        learningPath = assignmentData.learning_paths;
      } else {
        const { data: isAssignee } = await supabaseClient
          .rpc('auth_is_learning_path_assignee', { p_path_id: pathId });
        if (isAssignee !== true) {
          return res.status(404).json({ error: 'Learning path assignment not found' });
        }
        const { data: groupRow, error: groupError } = await supabaseClient
          .from('learning_path_assignments')
          .select(`
            id, path_id, group_id, assigned_at,
            learning_paths!inner(id, name, description, created_at)
          `)
          .eq('path_id', pathId)
          .not('group_id', 'is', null)
          .order('assigned_at', { ascending: true })
          .limit(1)
          .maybeSingle();
        if (groupError || !groupRow) {
          return res.status(404).json({ error: 'Learning path assignment not found' });
        }
        const { data: ownProgress } = await supabaseClient
          .from('learning_path_user_progress')
          .select('started_at, last_activity_at, completed_at, current_course_sequence, total_time_spent_minutes')
          .eq('path_id', pathId)
          .eq('user_id', userId)
          .maybeSingle();
        assignment = {
          id: groupRow.id,
          user_id: userId,
          path_id: pathId,
          group_id: groupRow.group_id,
          assigned_at: groupRow.assigned_at,
          started_at: ownProgress?.started_at ?? null,
          last_activity_at: ownProgress?.last_activity_at ?? null,
          completed_at: ownProgress?.completed_at ?? null,
          current_course_sequence: ownProgress?.current_course_sequence ?? 1,
          total_time_spent_minutes: ownProgress?.total_time_spent_minutes ?? 0,
          learning_paths: groupRow.learning_paths,
        };
        learningPath = groupRow.learning_paths;
      }
    }

    // 2. Get all courses in this learning path
    const { data: pathCourses, error: coursesError } = await supabaseClient
      .from('learning_path_courses')
      .select(`
        sequence_order,
        course_id,
        courses!inner(id, title, description, difficulty_level)
      `)
      .eq('learning_path_id', pathId)
      .order('sequence_order', { ascending: true });

    if (coursesError) {
      console.error('Courses error:', coursesError);
    }

    // 3. Get user's course enrollments for courses in this path
    const courseIds = pathCourses?.map(pc => pc.course_id) || [];
    let courseEnrollments = [];
    if (courseIds.length > 0) {
      const { data: enrollments } = await supabaseClient
        .from('course_enrollments')
        .select('course_id, progress_percentage, is_completed, completed_at, created_at, updated_at')
        .eq('user_id', userId)
        .in('course_id', courseIds);
      
      courseEnrollments = enrollments || [];
    }

    // 4. Get basic path statistics for peer comparison
    const { data: pathStats } = await supabaseClient
      .from('learning_path_assignments')
      .select(`
        user_id,
        assigned_at
      `)
      .eq('path_id', pathId);

    // 4b. The caller's own row of the report summary (own rows are always
    // visible to them): its last_activity_effective_at includes lesson
    // activity on the path's courses, which this route cannot read cheaply.
    // Absent (e.g. an admin who is not assigned) = fall back to local data.
    const { data: ownSummary } = await supabaseClient
      .from('user_learning_path_summary')
      .select('last_activity_effective_at')
      .eq('user_id', userId)
      .eq('path_id', pathId)
      .maybeSingle();

    // 5. Calculate user progress based on existing data
    const userProgress = calculateUserProgress(
      assignment,
      pathCourses,
      courseEnrollments,
      ownSummary?.last_activity_effective_at ?? null
    );
    const pathBenchmarks = calculatePathBenchmarks(pathStats || []);
    const insights = calculateBasicInsights(userProgress, pathBenchmarks, assignment, pathCourses, courseEnrollments);

    res.status(200).json({
      userProgress,
      pathBenchmarks,
      insights,
      pathInfo: {
        id: assignment.learning_paths.id,
        name: assignment.learning_paths.name,
        description: assignment.learning_paths.description,
        totalCourses: pathCourses?.length || 0,
        courses: pathCourses || []
      },
      trendData: [], // Placeholder for future analytics
      recentActivity: [] // Placeholder for future session tracking
    });

  } catch (error: any) {
    console.error('Enhanced progress API error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to fetch enhanced progress data'
    });
  }
}

function isCourseFinished(enrollment: any): boolean {
  return enrollment?.is_completed === true || Number(enrollment?.progress_percentage ?? 0) >= 100;
}

function latestDate(values: Array<string | null | undefined>): string | null {
  let latest: string | null = null;
  for (const v of values) {
    if (!v) continue;
    const t = new Date(v).getTime();
    if (!Number.isFinite(t)) continue;
    if (latest === null || t > new Date(latest).getTime()) latest = v;
  }
  return latest;
}

/**
 * The 14-day rule (same as user_learning_path_summary.is_at_risk): the path
 * has at least one course, the learner has not finished every course, and the
 * last activity is older than 14 days.
 */
export function isAtRiskByRule(input: {
  totalCourses: number;
  isFinished: boolean;
  lastActivityAt: string | null;
  now?: number;
}): boolean {
  const { totalCourses, isFinished, lastActivityAt } = input;
  if (totalCourses <= 0 || isFinished || !lastActivityAt) return false;
  const t = new Date(lastActivityAt).getTime();
  if (!Number.isFinite(t)) return false;
  return t < (input.now ?? Date.now()) - AT_RISK_INACTIVE_DAYS * DAY_MS;
}

function calculateUserProgress(
  assignment: any,
  pathCourses: any[],
  courseEnrollments: any[],
  summaryLastActivityAt: string | null = null
) {
  const totalCourses = pathCourses?.length || 0;
  const completedCourses = courseEnrollments.filter(e => e.progress_percentage === 100).length;
  const inProgressCourses = courseEnrollments.filter(e => e.progress_percentage > 0 && e.progress_percentage < 100).length;
  
  // Calculate overall progress percentage based on course completions
  const overallProgress = totalCourses > 0 
    ? Math.round((completedCourses / totalCourses) * 100)
    : 0;
  
  // Determine status based on available data. The own-progress record
  // (R3-04: learning_path_user_progress, mirrored into a direct row) is
  // authoritative for completion, elapsed minutes, current course and start.
  let status = 'not_started';
  if (overallProgress === 100 || assignment.completed_at) {
    status = 'completed';
  } else if (completedCourses > 0 || inProgressCourses > 0 || assignment.started_at || (assignment.total_time_spent_minutes ?? 0) > 0) {
    status = 'in_progress';
  }

  // Finished = every course of the path completed (is_completed or progress
  // >= 100), as in the report views — not the self-reported path completion.
  const finishedCourseIds = new Set(courseEnrollments.filter(isCourseFinished).map((e) => e.course_id));
  const isFinished = totalCourses > 0 && (pathCourses || []).every((pc: any) => finishedCourseIds.has(pc.course_id));

  // Last activity, as in the report views: the summary's effective last
  // activity (path progress + lesson activity) when available, else the
  // latest of the own progress record and course activity, else the
  // assignment date.
  const lastActivityAt =
    summaryLastActivityAt ??
    latestDate([
      assignment.last_activity_at,
      ...courseEnrollments.map((e) => e.updated_at || e.completed_at || e.created_at),
    ]) ??
    assignment.assigned_at ??
    null;

  // Find the most recent course activity (used as a start-date fallback)
  const mostRecentActivity = courseEnrollments.length > 0
    ? courseEnrollments.reduce((latest, enrollment) => {
        const activityDate = enrollment.completed_at || enrollment.created_at;
        return activityDate && (!latest || new Date(activityDate) > new Date(latest))
          ? activityDate
          : latest;
      }, null)
    : null;

  const daysSinceLastActivity = lastActivityAt
    ? Math.max(0, Math.floor((Date.now() - new Date(lastActivityAt).getTime()) / DAY_MS))
    : 0;

  return {
    status,
    overallProgress,
    totalTimeSpent: Number(assignment.total_time_spent_minutes ?? 0) || 0, // own-progress record (R3-04)
    totalSessions: 0, // Not available in basic schema
    avgSessionMinutes: 0, // Not available in basic schema
    currentCourse: Number(assignment.current_course_sequence ?? 1) || 1, // own-progress record (R3-04)
    daysSinceLastActivity,
    isAtRisk: isAtRiskByRule({ totalCourses, isFinished, lastActivityAt }),
    completionStreak: 0, // Not available in basic schema
    startDate: assignment.started_at || mostRecentActivity || assignment.assigned_at, // own-progress start, else first course activity, else assignment date
    completedAt: assignment.completed_at ?? null, // own-progress record (R3-04)
    estimatedCompletionDate: null, // Not available in basic schema
    totalCourses,
    completedCourses,
    inProgressCourses,
    enrolledCourses: courseEnrollments.length,
    assignedAt: assignment.assigned_at
  };
}

function calculatePathBenchmarks(pathStats: any[]) {
  if (!pathStats || pathStats.length === 0) {
    return null;
  }

  const totalUsers = pathStats.length;
  
  // Since we don't have started_at/completed_at in the basic schema,
  // we'll provide basic statistics
  const avgDaysSinceAssignment = pathStats.reduce((sum, s) => {
    const days = Math.floor((Date.now() - new Date(s.assigned_at).getTime()) / (24 * 60 * 60 * 1000));
    return sum + days;
  }, 0) / totalUsers;

  return {
    totalEnrolledUsers: totalUsers,
    totalStartedUsers: 0, // Not available in basic schema
    totalCompletedUsers: 0, // Not available in basic schema
    avgCompletionRate: 0, // Not available in basic schema
    avgCompletionTimeDays: 0, // Not available in basic schema
    avgDaysSinceAssignment: Math.round(avgDaysSinceAssignment)
  };
}

function calculateBasicInsights(userProgress: any, pathBenchmarks: any, assignment: any, pathCourses: any[], courseEnrollments: any[]) {
  const insights = {
    paceAnalysis: calculateBasicPaceAnalysis(userProgress, pathBenchmarks),
    timeForecasting: calculateBasicTimeForecasting(userProgress, pathBenchmarks),
    recommendations: generateBasicRecommendations(userProgress, assignment),
    milestones: calculateBasicMilestones(userProgress),
    peerComparison: calculateBasicPeerComparison(userProgress, pathBenchmarks),
    sessionPattern: calculateBasicSessionPattern(userProgress, courseEnrollments),
    motivationalMetrics: calculateBasicMotivationalMetrics(userProgress)
  };

  return insights;
}

function calculateBasicPaceAnalysis(userProgress: any, pathBenchmarks: any) {
  if (!userProgress.startDate || userProgress.overallProgress === 0) {
    return { 
      status: 'getting_started', 
      message: 'Comienza tu primera lección para ver tu ritmo de aprendizaje',
      color: 'text-gray-600'
    };
  }

  const startDate = new Date(userProgress.startDate);
  const daysSinceStart = Math.floor((Date.now() - startDate.getTime()) / (24 * 60 * 60 * 1000));
  
  // Simple pace analysis based on progress vs time
  const dailyProgressRate = userProgress.overallProgress / Math.max(daysSinceStart, 1);
  
  let status = 'on_track';
  let message = 'Vas a un buen ritmo';
  let color = 'text-green-600';

  if (dailyProgressRate > 5) { // More than 5% per day
    status = 'ahead';
    message = '¡Excelente ritmo de aprendizaje!';
    color = 'text-blue-600';
  } else if (dailyProgressRate < 1) { // Less than 1% per day
    status = 'behind';
    message = 'Puedes acelerar un poco el ritmo';
    color = 'text-orange-600';
  }

  const expectedProgress = Math.min(100, Math.round(daysSinceStart * 3));
  const paceDifference = Math.round((userProgress.overallProgress - expectedProgress) * 10) / 10;

  return {
    status,
    message,
    color,
    daysSinceStart,
    dailyProgressRate: Math.round(dailyProgressRate * 100) / 100,
    actualProgress: userProgress.overallProgress,
    expectedProgress,
    paceDifference
  };
}

function calculateBasicTimeForecasting(userProgress: any, pathBenchmarks: any) {
  if (userProgress.overallProgress >= 100) {
    return {
      estimatedCompletionDate: userProgress.startDate,
      estimatedDaysRemaining: 0,
      totalEstimatedDays: null,
      pathAverageDays: pathBenchmarks?.avgCompletionTimeDays || null,
      progressRate: 0,
      message: '¡Ruta completada!'
    };
  }

  if (!userProgress.startDate || userProgress.overallProgress <= 0) {
    return {
      estimatedCompletionDate: null,
      estimatedDaysRemaining: null,
      totalEstimatedDays: null,
      pathAverageDays: pathBenchmarks?.avgCompletionTimeDays || null,
      progressRate: 0,
      message: 'Necesitamos más progreso para estimar tu fecha de finalización'
    };
  }

  const startDate = new Date(userProgress.startDate);
  const daysSinceStart = Math.max(1, Math.floor((Date.now() - startDate.getTime()) / (24 * 60 * 60 * 1000)));
  const progressRate = userProgress.overallProgress / daysSinceStart;
  const remainingProgress = Math.max(0, 100 - userProgress.overallProgress);
  const estimatedDaysRemaining = progressRate > 0 
    ? Math.ceil(remainingProgress / Math.max(progressRate, 0.5))
    : null;

  let estimatedCompletionDate = null;
  let totalEstimatedDays = null;
  if (estimatedDaysRemaining !== null) {
    const completionDate = new Date();
    completionDate.setDate(completionDate.getDate() + estimatedDaysRemaining);
    estimatedCompletionDate = completionDate.toISOString();
    totalEstimatedDays = daysSinceStart + estimatedDaysRemaining;
  }

  const fasterThanAverage = pathBenchmarks?.avgCompletionTimeDays
    ? (estimatedDaysRemaining || 0) < pathBenchmarks.avgCompletionTimeDays
    : false;

  return {
    estimatedCompletionDate,
    estimatedDaysRemaining,
    totalEstimatedDays,
    pathAverageDays: pathBenchmarks?.avgCompletionTimeDays || null,
    progressRate: Math.round(progressRate * 100) / 100,
    message: estimatedDaysRemaining !== null
      ? `A tu ritmo actual, terminarás en ${estimatedDaysRemaining} días${fasterThanAverage ? ' (¡más rápido que el promedio!)' : ''}`
      : 'Necesitamos más datos para estimar tu fecha de finalización'
  };
}

function calculateBasicSessionPattern(userProgress: any, courseEnrollments: any[]) {
  const totalSessions = userProgress.totalSessions || 0;
  let consistency = 'insufficient_data';
  let message = 'Aún no registramos suficientes sesiones para analizar tu patrón de estudio';

  if (totalSessions > 0) {
    if (userProgress.daysSinceLastActivity <= 2) {
      consistency = 'excellent';
      message = '¡Excelente consistencia en tus estudios!';
    } else if (userProgress.daysSinceLastActivity <= 5) {
      consistency = 'good';
      message = 'Tu ritmo es bueno, mantente activo.';
    } else {
      consistency = 'irregular';
      message = 'Intenta programar sesiones más frecuentes para mantener el ritmo.';
    }
  }

  return {
    consistency,
    message,
    preferredDay: null,
    avgGapDays: userProgress.daysSinceLastActivity || null,
    totalSessions,
    dayFrequency: {}
  };
}

function generateBasicRecommendations(userProgress: any, assignment: any) {
  const recommendations = [];

  // Activity-based recommendations
  if (userProgress.daysSinceLastActivity > 3) {
    recommendations.push({
      type: 'activity',
      priority: 'high',
      title: 'Retoma tu aprendizaje',
      message: `Han pasado ${userProgress.daysSinceLastActivity} días desde tu última actividad. ¡Es momento de continuar!`,
      action: 'Empezar lección',
      icon: 'play'
    });
  }

  // Progress-based recommendations
  if (userProgress.overallProgress === 0) {
    recommendations.push({
      type: 'start',
      priority: 'high',
      title: 'Comienza tu primera lección',
      message: 'Da el primer paso en tu ruta de aprendizaje',
      action: 'Empezar ahora',
      icon: 'rocket'
    });
  } else if (userProgress.overallProgress > 0 && userProgress.overallProgress < 25) {
    recommendations.push({
      type: 'progress',
      priority: 'medium',
      title: '¡Ya comenzaste!',
      message: 'Estás en el camino correcto. La consistencia es clave para el éxito',
      action: 'Continuar aprendiendo',
      icon: 'trending-up'
    });
  }

  // Milestone celebrations
  if (userProgress.overallProgress >= 50 && userProgress.overallProgress < 75) {
    recommendations.push({
      type: 'celebration',
      priority: 'low',
      title: '¡Llegaste a la mitad!',
      message: '¡Felicidades! Has completado más del 50% de la ruta. ¡Sigue así!',
      action: 'Ver progreso detallado',
      icon: 'award'
    });
  }

  return recommendations;
}

function calculateBasicMilestones(userProgress: any) {
  const progress = userProgress.overallProgress;
  const milestones = [
    { threshold: 25, title: 'Primer cuarto', unlocked: progress >= 25, icon: '🌱' },
    { threshold: 50, title: 'A mitad de camino', unlocked: progress >= 50, icon: '🚀' },
    { threshold: 75, title: 'En la recta final', unlocked: progress >= 75, icon: '🔥' },
    { threshold: 100, title: 'Ruta completada', unlocked: progress >= 100, icon: '🏆' }
  ];

  const nextMilestone = milestones.find(m => !m.unlocked);
  const unlockedCount = milestones.filter(m => m.unlocked).length;

  return {
    milestones,
    nextMilestone,
    unlockedCount,
    totalMilestones: milestones.length
  };
}

function calculateBasicPeerComparison(userProgress: any, pathBenchmarks: any) {
  if (!pathBenchmarks) {
    return {
      progressComparison: 'no_data',
      message: 'Datos de comparación no disponibles',
      pathAvgCompletion: 0,
      totalPeers: 0,
      completedPeers: 0
    };
  }

  const userProgressRate = userProgress.overallProgress;
  const avgCompletionRate = pathBenchmarks.avgCompletionRate;
  
  let progressComparison = 'average';
  let message = 'Tu progreso está en línea con otros estudiantes';
  
  if (userProgressRate > avgCompletionRate * 1.2) {
    progressComparison = 'above';
    message = '¡Estás progresando mejor que el promedio!';
  } else if (userProgressRate < avgCompletionRate * 0.8) {
    progressComparison = 'below';
    message = 'Puedes ponerte al día con otros estudiantes';
  }

  return {
    progressComparison,
    message,
    pathAvgCompletion: pathBenchmarks.avgCompletionRate,
    totalPeers: pathBenchmarks.totalEnrolledUsers,
    completedPeers: pathBenchmarks.totalCompletedUsers
  };
}

function calculateBasicMotivationalMetrics(userProgress: any) {
  const totalTimeHours = Math.round(userProgress.totalTimeSpent / 60 * 10) / 10;
  
  // Fun metrics for motivation
  const metrics = {
    totalTimeHours,
    coursesCompleted: userProgress.completedCourses,
    coursesInProgress: userProgress.inProgressCourses,
    totalCourses: userProgress.totalCourses,
    progressPercentage: userProgress.overallProgress,
    booksEquivalent: Math.round(userProgress.totalTimeSpent / 180), // Assuming 3 hours per "book"
    coffeeBreaksEquivalent: Math.round(userProgress.totalTimeSpent / 15), // 15 min coffee breaks
    totalSessions: userProgress.totalSessions || 0,
    currentStreak: userProgress.completionStreak || 0,
    longestSession: userProgress.avgSessionMinutes || 0
  };

  return metrics;
}
