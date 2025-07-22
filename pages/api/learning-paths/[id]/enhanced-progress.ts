import { NextApiRequest, NextApiResponse } from 'next';
import { getApiUser, createApiSupabaseClient, sendAuthError } from '../../../../lib/api-auth';

/**
 * Enhanced progress endpoint for learning path detail page
 * Provides intelligent insights using pre-aggregated summary tables
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

    // 1. Get user's learning path summary
    const { data: userSummary, error: summaryError } = await supabaseClient
      .from('user_learning_path_summary')
      .select('*')
      .eq('user_id', userId)
      .eq('path_id', pathId)
      .single();

    if (summaryError || !userSummary) {
      return res.status(404).json({ error: 'Learning path assignment not found' });
    }

    // 2. Get path performance summary for peer comparison
    const { data: pathPerformance, error: perfError } = await supabaseClient
      .from('learning_path_performance_summary')
      .select(`
        *,
        learning_paths!inner(name, description)
      `)
      .eq('path_id', pathId)
      .single();

    if (perfError) {
      console.error('Performance summary error:', perfError);
    }

    // 3. Get recent daily summaries for trend analysis
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const { data: dailySummaries } = await supabaseClient
      .from('learning_path_daily_summary')
      .select('summary_date, total_active_users, avg_session_duration_minutes, completion_rate')
      .eq('path_id', pathId)
      .gte('summary_date', thirtyDaysAgo.toISOString().split('T')[0])
      .order('summary_date', { ascending: true });

    // 4. Get user's recent session pattern
    const { data: recentSessions } = await supabaseClient
      .from('learning_path_progress_sessions')
      .select('session_start, time_spent_minutes, activity_type')
      .eq('user_id', userId)
      .eq('path_id', pathId)
      .gte('session_start', thirtyDaysAgo.toISOString())
      .order('session_start', { ascending: true });

    // 5. Calculate intelligent insights
    const insights = calculateLearningInsights(userSummary, pathPerformance, dailySummaries, recentSessions);

    res.status(200).json({
      userProgress: {
        status: userSummary.status,
        overallProgress: userSummary.overall_progress_percentage,
        totalTimeSpent: userSummary.total_time_spent_minutes,
        totalSessions: userSummary.total_sessions,
        avgSessionMinutes: userSummary.avg_session_minutes,
        currentCourse: userSummary.current_course_sequence,
        daysSinceLastActivity: userSummary.days_since_last_activity,
        isAtRisk: userSummary.is_at_risk,
        completionStreak: userSummary.completion_streak || 0,
        startDate: userSummary.start_date,
        estimatedCompletionDate: userSummary.estimated_completion_date
      },
      pathBenchmarks: pathPerformance ? {
        avgCompletionRate: pathPerformance.overall_completion_rate,
        avgCompletionTimeDays: pathPerformance.avg_completion_time_days,
        totalEnrolledUsers: pathPerformance.total_enrolled_users,
        totalCompletedUsers: pathPerformance.total_completed_users,
        engagementScore: pathPerformance.engagement_score
      } : null,
      insights,
      trendData: dailySummaries || [],
      recentActivity: (recentSessions || []).slice(-10) // Last 10 sessions
    });

  } catch (error: any) {
    console.error('Enhanced progress API error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to fetch enhanced progress data'
    });
  }
}

function calculateLearningInsights(userSummary: any, pathPerformance: any, dailySummaries: any[], recentSessions: any[]) {
  const insights = {
    paceAnalysis: calculatePaceAnalysis(userSummary, pathPerformance),
    engagementLevel: calculateEngagementLevel(userSummary, recentSessions),
    timeForecasting: calculateTimeForecasting(userSummary, pathPerformance),
    recommendations: generateRecommendations(userSummary, recentSessions, dailySummaries),
    milestones: calculateMilestones(userSummary),
    peerComparison: calculatePeerComparison(userSummary, pathPerformance),
    sessionPattern: analyzeSessionPattern(recentSessions),
    motivationalMetrics: calculateMotivationalMetrics(userSummary, recentSessions)
  };

  return insights;
}

function calculatePaceAnalysis(userSummary: any, pathPerformance: any) {
  if (!userSummary.start_date || !pathPerformance) {
    return { status: 'insufficient_data', message: 'Calculando tu ritmo de aprendizaje...' };
  }

  const startDate = new Date(userSummary.start_date);
  const daysSinceStart = Math.floor((Date.now() - startDate.getTime()) / (24 * 60 * 60 * 1000));
  const expectedProgress = Math.min(100, (daysSinceStart / (pathPerformance.avg_completion_time_days || 30)) * 100);
  const actualProgress = userSummary.overall_progress_percentage;
  const paceDifference = actualProgress - expectedProgress;

  let status = 'on_track';
  let message = 'Vas a un ritmo perfecto';
  let color = 'text-green-600';

  if (paceDifference > 15) {
    status = 'ahead';
    message = `¡Excelente! Vas ${Math.round(paceDifference)}% adelantado`;
    color = 'text-blue-600';
  } else if (paceDifference < -15) {
    status = 'behind';
    message = `Puedes acelerar un poco el ritmo (${Math.round(Math.abs(paceDifference))}% atrás)`;
    color = 'text-orange-600';
  }

  return {
    status,
    message,
    color,
    daysSinceStart,
    expectedProgress: Math.round(expectedProgress),
    actualProgress,
    paceDifference: Math.round(paceDifference)
  };
}

function calculateEngagementLevel(userSummary: any, recentSessions: any[]) {
  const avgSessionTime = userSummary.avg_session_minutes || 0;
  const sessionCount = recentSessions.length;
  const totalRecentTime = recentSessions.reduce((sum, session) => sum + (session.time_spent_minutes || 0), 0);
  
  let level = 'moderate';
  let message = 'Mantén el buen ritmo de estudio';
  let color = 'text-yellow-600';
  let score = 50;

  // Calculate engagement score (0-100)
  if (avgSessionTime > 45 && sessionCount >= 5) {
    level = 'high';
    message = '¡Excelente nivel de compromiso!';
    color = 'text-green-600';
    score = Math.min(100, 70 + (avgSessionTime / 60) * 20 + sessionCount * 2);
  } else if (avgSessionTime < 15 || sessionCount < 2) {
    level = 'low';
    message = 'Intenta dedicar más tiempo al estudio';
    color = 'text-red-600';
    score = Math.max(0, 30 - (15 - avgSessionTime));
  } else {
    score = 30 + (avgSessionTime / 60) * 30 + sessionCount * 3;
  }

  return {
    level,
    message,
    color,
    score: Math.round(score),
    avgSessionMinutes: Math.round(avgSessionTime),
    recentSessionCount: sessionCount,
    totalRecentTimeHours: Math.round(totalRecentTime / 60 * 10) / 10
  };
}

function calculateTimeForecasting(userSummary: any, pathPerformance: any) {
  if (!userSummary.start_date || userSummary.overall_progress_percentage === 0) {
    return {
      estimatedCompletionDate: null,
      estimatedDaysRemaining: null,
      message: 'Comienza tu primera sesión para ver predicciones'
    };
  }

  const startDate = new Date(userSummary.start_date);
  const daysSinceStart = Math.floor((Date.now() - startDate.getTime()) / (24 * 60 * 60 * 1000));
  const progressRate = userSummary.overall_progress_percentage / daysSinceStart; // Progress per day
  const remainingProgress = 100 - userSummary.overall_progress_percentage;
  const estimatedDaysRemaining = Math.ceil(remainingProgress / Math.max(progressRate, 0.5)); // Min 0.5% per day

  const estimatedCompletionDate = new Date();
  estimatedCompletionDate.setDate(estimatedCompletionDate.getDate() + estimatedDaysRemaining);

  // Compare with path average
  const pathAvgDays = pathPerformance?.avg_completion_time_days || 30;
  const totalEstimatedDays = daysSinceStart + estimatedDaysRemaining;
  
  let message = `A tu ritmo actual, terminarás en ${estimatedDaysRemaining} días`;
  if (totalEstimatedDays < pathAvgDays * 0.8) {
    message += ' (¡más rápido que el promedio!)';
  } else if (totalEstimatedDays > pathAvgDays * 1.2) {
    message += ' (considera aumentar el tiempo de estudio)';
  }

  return {
    estimatedCompletionDate: estimatedCompletionDate.toISOString().split('T')[0],
    estimatedDaysRemaining,
    totalEstimatedDays,
    pathAverageDays: pathAvgDays,
    progressRate: Math.round(progressRate * 100) / 100,
    message
  };
}

function generateRecommendations(userSummary: any, recentSessions: any[], dailySummaries: any[]) {
  const recommendations = [];

  // Activity-based recommendations
  if (userSummary.days_since_last_activity > 3) {
    recommendations.push({
      type: 'activity',
      priority: 'high',
      title: 'Retoma tu aprendizaje',
      message: `Han pasado ${userSummary.days_since_last_activity} días desde tu última sesión. ¡Es momento de continuar!`,
      action: 'Empezar sesión',
      icon: 'play'
    });
  }

  // Session duration recommendations
  const avgSession = userSummary.avg_session_minutes || 0;
  if (avgSession < 20) {
    recommendations.push({
      type: 'duration',
      priority: 'medium',
      title: 'Sesiones más largas',
      message: 'Trata de estudiar al menos 25-30 minutos por sesión para mejor retención',
      action: 'Ver técnicas de estudio',
      icon: 'clock'
    });
  }

  // Progress-based recommendations
  if (userSummary.overall_progress_percentage > 0 && userSummary.overall_progress_percentage < 25) {
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
  if (userSummary.overall_progress_percentage >= 50 && userSummary.overall_progress_percentage < 55) {
    recommendations.push({
      type: 'celebration',
      priority: 'low',
      title: '¡Llegaste a la mitad!',
      message: '¡Felicidades! Has completado el 50% de la ruta. ¡Sigue así!',
      action: 'Ver progreso detallado',
      icon: 'award'
    });
  }

  return recommendations;
}

function calculateMilestones(userSummary: any) {
  const progress = userSummary.overall_progress_percentage;
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

function calculatePeerComparison(userSummary: any, pathPerformance: any) {
  if (!pathPerformance) {
    return null;
  }

  const userProgress = userSummary.overall_progress_percentage;
  const userTimeSpent = userSummary.total_time_spent_minutes;
  const avgCompletionRate = pathPerformance.overall_completion_rate;
  
  // Simple peer comparison metrics
  const progressComparison = userProgress > avgCompletionRate ? 'above' : userProgress < avgCompletionRate * 0.8 ? 'below' : 'average';
  
  let message = 'Tu progreso está en línea con otros estudiantes';
  if (progressComparison === 'above') {
    message = '¡Estás progresando mejor que el promedio!';
  } else if (progressComparison === 'below') {
    message = 'Puedes ponerte al día con otros estudiantes';
  }

  return {
    progressComparison,
    message,
    pathAvgCompletion: Math.round(avgCompletionRate),
    totalPeers: pathPerformance.total_enrolled_users,
    completedPeers: pathPerformance.total_completed_users
  };
}

function analyzeSessionPattern(recentSessions: any[]) {
  if (recentSessions.length < 3) {
    return {
      consistency: 'insufficient_data',
      message: 'Completa más sesiones para ver tu patrón de estudio'
    };
  }

  // Analyze session timing patterns
  const sessionDays = recentSessions.map(session => {
    const date = new Date(session.session_start);
    return date.getDay(); // 0 = Sunday, 6 = Saturday
  });

  const dayFrequency = sessionDays.reduce((acc, day) => {
    acc[day] = (acc[day] || 0) + 1;
    return acc;
  }, {} as Record<number, number>);

  const mostActiveDay = Object.entries(dayFrequency)
    .sort(([, a], [, b]) => b - a)[0];
  
  const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const preferredDay = mostActiveDay ? dayNames[parseInt(mostActiveDay[0])] : 'N/A';

  // Calculate consistency score
  const avgGapDays = calculateAverageGapDays(recentSessions);
  let consistency = 'irregular';
  let message = 'Trata de estudiar con más regularidad';

  if (avgGapDays <= 2) {
    consistency = 'excellent';
    message = '¡Excelente consistencia en tus estudios!';
  } else if (avgGapDays <= 4) {
    consistency = 'good';
    message = 'Buena regularidad en tus sesiones';
  }

  return {
    consistency,
    message,
    preferredDay,
    avgGapDays: Math.round(avgGapDays),
    totalSessions: recentSessions.length,
    dayFrequency
  };
}

function calculateAverageGapDays(sessions: any[]) {
  if (sessions.length < 2) return 0;

  const gaps = [];
  for (let i = 1; i < sessions.length; i++) {
    const prevDate = new Date(sessions[i-1].session_start);
    const currentDate = new Date(sessions[i].session_start);
    const gapDays = Math.floor((currentDate.getTime() - prevDate.getTime()) / (24 * 60 * 60 * 1000));
    gaps.push(gapDays);
  }

  return gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;
}

function calculateMotivationalMetrics(userSummary: any, recentSessions: any[]) {
  const totalTime = userSummary.total_time_spent_minutes;
  const totalSessions = userSummary.total_sessions;
  const streak = userSummary.completion_streak || 0;

  // Fun metrics for motivation
  const metrics = {
    totalTimeHours: Math.round(totalTime / 60 * 10) / 10,
    booksEquivalent: Math.round(totalTime / 180), // Assuming 3 hours per "book"
    coffeeBreaksEquivalent: Math.round(totalTime / 15), // 15 min coffee breaks
    totalSessions,
    currentStreak: streak,
    longestSession: recentSessions.length > 0 
      ? Math.max(...recentSessions.map(s => s.time_spent_minutes || 0))
      : 0
  };

  return metrics;
}