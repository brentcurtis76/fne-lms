import { NextApiRequest, NextApiResponse } from 'next';
import { getApiUser, createApiSupabaseClient, sendAuthError } from '../../../../lib/api-auth';

/**
 * Enhanced progress endpoint for learning path detail page
 * Simplified version that works with existing basic tables
 */
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

    // Check if user is admin first - admins have access to everything
    const { data: userRoles } = await supabaseClient
      .from('user_roles')
      .select('role_type')
      .eq('user_id', userId)
      .eq('is_active', true);

    const hasAdminAccess = userRoles?.some(role => 
      ['admin', 'equipo_directivo', 'consultor'].includes(role.role_type)
    );

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
      // For non-admin users, check assignment
      const { data: assignmentData, error: assignmentError } = await supabaseClient
        .from('learning_path_assignments')
        .select(`
          *,
          learning_paths!inner(id, name, description, created_at)
        `)
        .eq('user_id', userId)
        .eq('path_id', pathId)
        .single();

      if (assignmentError || !assignmentData) {
        return res.status(404).json({ error: 'Learning path assignment not found' });
      }

      assignment = assignmentData;
      learningPath = assignmentData.learning_paths;
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
        .select('course_id, progress_percentage, completed_at, created_at')
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

    // 5. Calculate user progress based on existing data
    const userProgress = calculateUserProgress(assignment, pathCourses, courseEnrollments);
    const pathBenchmarks = calculatePathBenchmarks(pathStats || []);
    const insights = calculateBasicInsights(userProgress, pathBenchmarks, assignment, pathCourses);

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

function calculateUserProgress(assignment: any, pathCourses: any[], courseEnrollments: any[]) {
  const totalCourses = pathCourses?.length || 0;
  const completedCourses = courseEnrollments.filter(e => e.progress_percentage === 100).length;
  const inProgressCourses = courseEnrollments.filter(e => e.progress_percentage > 0 && e.progress_percentage < 100).length;
  
  // Calculate overall progress percentage based on course completions
  const overallProgress = totalCourses > 0 
    ? Math.round((completedCourses / totalCourses) * 100)
    : 0;
  
  // Determine status based on available data
  let status = 'not_started';
  if (overallProgress === 100) {
    status = 'completed';
  } else if (completedCourses > 0 || inProgressCourses > 0) {
    status = 'in_progress';
  }

  // Calculate time since assignment (as a proxy for last activity since we don't have last_activity_at)
  const daysSinceAssignment = assignment.assigned_at 
    ? Math.floor((Date.now() - new Date(assignment.assigned_at).getTime()) / (24 * 60 * 60 * 1000))
    : 0;

  // Find the most recent course activity
  const mostRecentActivity = courseEnrollments.length > 0
    ? courseEnrollments.reduce((latest, enrollment) => {
        const activityDate = enrollment.completed_at || enrollment.created_at;
        return activityDate && (!latest || new Date(activityDate) > new Date(latest))
          ? activityDate
          : latest;
      }, null)
    : null;

  const daysSinceLastActivity = mostRecentActivity
    ? Math.floor((Date.now() - new Date(mostRecentActivity).getTime()) / (24 * 60 * 60 * 1000))
    : daysSinceAssignment;

  return {
    status,
    overallProgress,
    totalTimeSpent: 0, // Not available in basic schema
    totalSessions: 0, // Not available in basic schema
    avgSessionMinutes: 0, // Not available in basic schema
    currentCourse: 1, // Placeholder - could be calculated from course sequence
    daysSinceLastActivity,
    isAtRisk: daysSinceLastActivity > 7 && status === 'in_progress',
    completionStreak: 0, // Not available in basic schema
    startDate: mostRecentActivity || assignment.assigned_at, // Use first course activity or assignment date
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
    avgDaysSinceAssignment: Math.round(avgDaysSinceAssignment),
    engagementScore: 50 // Placeholder since we can't calculate properly without activity data
  };
}

function calculateBasicInsights(userProgress: any, pathBenchmarks: any, assignment: any, pathCourses: any[]) {
  const insights = {
    paceAnalysis: calculateBasicPaceAnalysis(userProgress, pathBenchmarks),
    engagementLevel: calculateBasicEngagementLevel(userProgress),
    recommendations: generateBasicRecommendations(userProgress, assignment),
    milestones: calculateBasicMilestones(userProgress),
    peerComparison: calculateBasicPeerComparison(userProgress, pathBenchmarks),
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

  return {
    status,
    message,
    color,
    daysSinceStart,
    dailyProgressRate: Math.round(dailyProgressRate * 100) / 100,
    actualProgress: userProgress.overallProgress
  };
}

function calculateBasicEngagementLevel(userProgress: any) {
  const { completedCourses, inProgressCourses, daysSinceLastActivity, isAtRisk } = userProgress;
  
  let level = 'moderate';
  let message = 'Mantén el buen ritmo de estudio';
  let color = 'text-yellow-600';
  let score = 50;

  if (completedCourses > 0 && !isAtRisk) {
    level = 'high';
    message = '¡Excelente nivel de compromiso!';
    color = 'text-green-600';
    score = Math.min(100, 70 + completedCourses * 10);
  } else if (isAtRisk || daysSinceLastActivity > 7) {
    level = 'low';
    message = 'Intenta retomar tus estudios pronto';
    color = 'text-red-600';
    score = Math.max(0, 30 - daysSinceLastActivity);
  }

  return {
    level,
    message,
    color,
    score,
    completedCourses,
    inProgressCourses,
    daysSinceLastActivity
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
    coffeeBreaksEquivalent: Math.round(userProgress.totalTimeSpent / 15) // 15 min coffee breaks
  };

  return metrics;
}