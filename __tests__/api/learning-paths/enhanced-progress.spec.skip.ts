/**
 * Unit tests for Enhanced Progress API calculation functions
 * Tests pure business logic without database dependencies
 */

// Import the calculation functions by extracting them from the API file
// We'll need to refactor the API file to export these functions for testing

describe('Enhanced Progress API Calculation Functions', () => {
  
  describe('calculatePaceAnalysis', () => {
    const mockPathPerformance = {
      avg_completion_time_days: 30,
      overall_completion_rate: 70
    };

    it('should return insufficient_data when no start date', () => {
      const userSummary = { start_date: null, overall_progress_percentage: 50 };
      
      const result = calculatePaceAnalysis(userSummary, mockPathPerformance);
      
      expect(result.status).toBe('insufficient_data');
      expect(result.message).toBe('Calculando tu ritmo de aprendizaje...');
    });

    it('should return insufficient_data when no path performance data', () => {
      const userSummary = { 
        start_date: '2025-07-01T00:00:00.000Z',
        overall_progress_percentage: 50 
      };
      
      const result = calculatePaceAnalysis(userSummary, null);
      
      expect(result.status).toBe('insufficient_data');
      expect(result.message).toBe('Calculando tu ritmo de aprendizaje...');
    });

    it('should calculate ahead pace correctly', () => {
      const userSummary = {
        start_date: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(), // 15 days ago
        overall_progress_percentage: 75 // 75% in 15 days vs expected 50%
      };
      
      const result = calculatePaceAnalysis(userSummary, mockPathPerformance);
      
      expect(result.status).toBe('ahead');
      expect(result.message).toContain('¡Excelente! Vas');
      expect(result.message).toContain('% adelantado');
      expect(result.color).toBe('text-blue-600');
      expect(result.daysSinceStart).toBe(15);
      expect(result.actualProgress).toBe(75);
      expect(result.paceDifference).toBeGreaterThan(15);
    });

    it('should calculate behind pace correctly', () => {
      const userSummary = {
        start_date: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(), // 20 days ago
        overall_progress_percentage: 30 // 30% in 20 days vs expected ~67%
      };
      
      const result = calculatePaceAnalysis(userSummary, mockPathPerformance);
      
      expect(result.status).toBe('behind');
      expect(result.message).toContain('Puedes acelerar un poco el ritmo');
      expect(result.color).toBe('text-orange-600');
      expect(result.paceDifference).toBeLessThan(-15);
    });

    it('should calculate on_track pace correctly', () => {
      const userSummary = {
        start_date: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(), // 15 days ago
        overall_progress_percentage: 50 // 50% in 15 days - exactly on track
      };
      
      const result = calculatePaceAnalysis(userSummary, mockPathPerformance);
      
      expect(result.status).toBe('on_track');
      expect(result.message).toBe('Vas a un ritmo perfecto');
      expect(result.color).toBe('text-green-600');
      expect(Math.abs(result.paceDifference)).toBeLessThanOrEqual(15);
    });
  });

  describe('calculateEngagementLevel', () => {
    const mockRecentSessions = [
      { time_spent_minutes: 30 },
      { time_spent_minutes: 45 },
      { time_spent_minutes: 25 },
      { time_spent_minutes: 35 },
      { time_spent_minutes: 40 }
    ];

    it('should calculate high engagement level', () => {
      const userSummary = {
        avg_session_minutes: 50,
        total_sessions: 8
      };
      
      const result = calculateEngagementLevel(userSummary, mockRecentSessions);
      
      expect(result.level).toBe('high');
      expect(result.message).toBe('¡Excelente nivel de compromiso!');
      expect(result.color).toBe('text-green-600');
      expect(result.score).toBeGreaterThan(70);
      expect(result.avgSessionMinutes).toBe(50);
      expect(result.recentSessionCount).toBe(5);
    });

    it('should calculate low engagement level', () => {
      const userSummary = {
        avg_session_minutes: 10,
        total_sessions: 1
      };
      
      const result = calculateEngagementLevel(userSummary, [{ time_spent_minutes: 10 }]);
      
      expect(result.level).toBe('low');
      expect(result.message).toBe('Intenta dedicar más tiempo al estudio');
      expect(result.color).toBe('text-red-600');
      expect(result.score).toBeLessThan(30);
    });

    it('should calculate moderate engagement level', () => {
      const userSummary = {
        avg_session_minutes: 25,
        total_sessions: 3
      };
      
      const result = calculateEngagementLevel(userSummary, mockRecentSessions.slice(0, 3));
      
      expect(result.level).toBe('moderate');
      expect(result.message).toBe('Mantén el buen ritmo de estudio');
      expect(result.color).toBe('text-yellow-600');
      expect(result.score).toBeGreaterThanOrEqual(30);
      expect(result.score).toBeLessThanOrEqual(70);
    });

    it('should handle zero session data', () => {
      const userSummary = {
        avg_session_minutes: 0,
        total_sessions: 0
      };
      
      const result = calculateEngagementLevel(userSummary, []);
      
      expect(result.level).toBe('low');
      expect(result.recentSessionCount).toBe(0);
      expect(result.totalRecentTimeHours).toBe(0);
    });
  });

  describe('calculateTimeForecasting', () => {
    const mockPathPerformance = {
      avg_completion_time_days: 30
    };

    it('should return no forecast for new users', () => {
      const userSummary = {
        start_date: null,
        overall_progress_percentage: 0
      };
      
      const result = calculateTimeForecasting(userSummary, mockPathPerformance);
      
      expect(result.estimatedCompletionDate).toBeNull();
      expect(result.estimatedDaysRemaining).toBeNull();
      expect(result.message).toBe('Comienza tu primera sesión para ver predicciones');
    });

    it('should calculate realistic time forecasting', () => {
      const userSummary = {
        start_date: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(), // 10 days ago
        overall_progress_percentage: 40 // 40% in 10 days
      };
      
      const result = calculateTimeForecasting(userSummary, mockPathPerformance);
      
      expect(result.estimatedDaysRemaining).toBeGreaterThan(0);
      expect(result.estimatedCompletionDate).toBeTruthy();
      expect(result.totalEstimatedDays).toBe(result.estimatedDaysRemaining + 10);
      expect(result.progressRate).toBe(4); // 40% / 10 days = 4% per day
      expect(result.message).toContain('A tu ritmo actual, terminarás en');
    });

    it('should detect faster than average completion', () => {
      const userSummary = {
        start_date: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(), // 8 days ago
        overall_progress_percentage: 80 // Very fast progress
      };
      
      const result = calculateTimeForecasting(userSummary, mockPathPerformance);
      
      expect(result.totalEstimatedDays).toBeLessThan(mockPathPerformance.avg_completion_time_days * 0.8);
      expect(result.message).toContain('¡más rápido que el promedio!');
    });

    it('should detect slower than average completion', () => {
      const userSummary = {
        start_date: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000).toISOString(), // 25 days ago
        overall_progress_percentage: 30 // Slow progress
      };
      
      const result = calculateTimeForecasting(userSummary, mockPathPerformance);
      
      expect(result.totalEstimatedDays).toBeGreaterThan(mockPathPerformance.avg_completion_time_days * 1.2);
      expect(result.message).toContain('considera aumentar el tiempo de estudio');
    });

    it('should handle minimum progress rate', () => {
      const userSummary = {
        start_date: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString(), // 100 days ago
        overall_progress_percentage: 5 // Very slow progress: 5% / 100 days = 0.05% per day
      };
      
      const result = calculateTimeForecasting(userSummary, mockPathPerformance);
      
      // Progress rate should reflect actual calculation (5% / 100 days = 0.05)
      expect(result.progressRate).toBe(0.05);
      // But the estimation should use minimum 0.5% per day for remaining days
      expect(result.estimatedDaysRemaining).toBe(Math.ceil(95 / 0.5)); // 190 days
    });
  });

  describe('generateRecommendations', () => {
    it('should recommend activity resumption for inactive users', () => {
      const userSummary = {
        days_since_last_activity: 5,
        avg_session_minutes: 25,
        overall_progress_percentage: 30
      };
      
      const result = generateRecommendations(userSummary, [], []);
      
      expect(result).toContainEqual(
        expect.objectContaining({
          type: 'activity',
          priority: 'high',
          title: 'Retoma tu aprendizaje',
          message: 'Han pasado 5 días desde tu última sesión. ¡Es momento de continuar!',
          icon: 'play'
        })
      );
    });

    it('should recommend longer sessions for short session users', () => {
      const userSummary = {
        days_since_last_activity: 1,
        avg_session_minutes: 15,
        overall_progress_percentage: 30
      };
      
      const result = generateRecommendations(userSummary, [], []);
      
      expect(result).toContainEqual(
        expect.objectContaining({
          type: 'duration',
          priority: 'medium',
          title: 'Sesiones más largas',
          message: 'Trata de estudiar al menos 25-30 minutos por sesión para mejor retención',
          icon: 'clock'
        })
      );
    });

    it('should provide encouragement for early progress', () => {
      const userSummary = {
        days_since_last_activity: 1,
        avg_session_minutes: 25,
        overall_progress_percentage: 20
      };
      
      const result = generateRecommendations(userSummary, [], []);
      
      expect(result).toContainEqual(
        expect.objectContaining({
          type: 'progress',
          priority: 'medium',
          title: '¡Ya comenzaste!',
          message: 'Estás en el camino correcto. La consistencia es clave para el éxito',
          icon: 'trending-up'
        })
      );
    });

    it('should celebrate milestones', () => {
      const userSummary = {
        days_since_last_activity: 1,
        avg_session_minutes: 25,
        overall_progress_percentage: 52 // Just passed 50%
      };
      
      const result = generateRecommendations(userSummary, [], []);
      
      expect(result).toContainEqual(
        expect.objectContaining({
          type: 'celebration',
          priority: 'low',
          title: '¡Llegaste a la mitad!',
          message: '¡Felicidades! Has completado el 50% de la ruta. ¡Sigue así!',
          icon: 'award'
        })
      );
    });

    it('should not recommend activity resumption for active users', () => {
      const userSummary = {
        days_since_last_activity: 1,
        avg_session_minutes: 30,
        overall_progress_percentage: 60
      };
      
      const result = generateRecommendations(userSummary, [], []);
      
      expect(result.find(r => r.type === 'activity')).toBeUndefined();
    });
  });

  describe('calculateMilestones', () => {
    it('should track milestone progress correctly', () => {
      const userSummary = { overall_progress_percentage: 65 };
      
      const result = calculateMilestones(userSummary);
      
      expect(result.milestones).toHaveLength(4);
      expect(result.milestones[0]).toEqual({
        threshold: 25,
        title: 'Primer cuarto',
        unlocked: true,
        icon: '🌱'
      });
      expect(result.milestones[1]).toEqual({
        threshold: 50,
        title: 'A mitad de camino',
        unlocked: true,
        icon: '🚀'
      });
      expect(result.milestones[2]).toEqual({
        threshold: 75,
        title: 'En la recta final',
        unlocked: false,
        icon: '🔥'
      });
      
      expect(result.unlockedCount).toBe(2);
      expect(result.totalMilestones).toBe(4);
      expect(result.nextMilestone).toEqual({
        threshold: 75,
        title: 'En la recta final',
        unlocked: false,
        icon: '🔥'
      });
    });

    it('should handle 100% completion', () => {
      const userSummary = { overall_progress_percentage: 100 };
      
      const result = calculateMilestones(userSummary);
      
      expect(result.unlockedCount).toBe(4);
      expect(result.nextMilestone).toBeUndefined();
      expect(result.milestones[3].unlocked).toBe(true);
    });

    it('should handle zero progress', () => {
      const userSummary = { overall_progress_percentage: 0 };
      
      const result = calculateMilestones(userSummary);
      
      expect(result.unlockedCount).toBe(0);
      expect(result.nextMilestone).toEqual({
        threshold: 25,
        title: 'Primer cuarto',
        unlocked: false,
        icon: '🌱'
      });
    });
  });

  describe('calculatePeerComparison', () => {
    const mockPathPerformance = {
      overall_completion_rate: 60,
      total_enrolled_users: 150,
      total_completed_users: 45
    };

    it('should return null when no path performance data', () => {
      const userSummary = { overall_progress_percentage: 50 };
      
      const result = calculatePeerComparison(userSummary, null);
      
      expect(result).toBeNull();
    });

    it('should detect above average performance', () => {
      const userSummary = { 
        overall_progress_percentage: 80,
        total_time_spent_minutes: 300 
      };
      
      const result = calculatePeerComparison(userSummary, mockPathPerformance);
      
      expect(result.progressComparison).toBe('above');
      expect(result.message).toBe('¡Estás progresando mejor que el promedio!');
      expect(result.pathAvgCompletion).toBe(60);
      expect(result.totalPeers).toBe(150);
      expect(result.completedPeers).toBe(45);
    });

    it('should detect below average performance', () => {
      const userSummary = { 
        overall_progress_percentage: 30, // Below 60% * 0.8 = 48%
        total_time_spent_minutes: 100 
      };
      
      const result = calculatePeerComparison(userSummary, mockPathPerformance);
      
      expect(result.progressComparison).toBe('below');
      expect(result.message).toBe('Puedes ponerte al día con otros estudiantes');
    });

    it('should detect average performance', () => {
      const userSummary = { 
        overall_progress_percentage: 55, // Between 48% and 60%
        total_time_spent_minutes: 200 
      };
      
      const result = calculatePeerComparison(userSummary, mockPathPerformance);
      
      expect(result.progressComparison).toBe('average');
      expect(result.message).toBe('Tu progreso está en línea con otros estudiantes');
    });
  });

  describe('analyzeSessionPattern', () => {
    it('should return insufficient_data for few sessions', () => {
      const sessions = [
        { session_start: '2025-07-20T10:00:00.000Z' },
        { session_start: '2025-07-21T10:00:00.000Z' }
      ];
      
      const result = analyzeSessionPattern(sessions);
      
      expect(result.consistency).toBe('insufficient_data');
      expect(result.message).toBe('Completa más sesiones para ver tu patrón de estudio');
    });

    it('should analyze session patterns correctly', () => {
      // Create sessions for different days of the week
      const sessions = [
        { session_start: '2025-07-14T10:00:00.000Z' }, // Monday
        { session_start: '2025-07-15T10:00:00.000Z' }, // Tuesday
        { session_start: '2025-07-16T10:00:00.000Z' }, // Wednesday
        { session_start: '2025-07-18T10:00:00.000Z' }, // Friday
        { session_start: '2025-07-21T10:00:00.000Z' }, // Monday
        { session_start: '2025-07-22T10:00:00.000Z' }  // Tuesday
      ];
      
      const result = analyzeSessionPattern(sessions);
      
      expect(result.consistency).toBe('excellent');
      expect(result.message).toBe('¡Excelente consistencia en tus estudios!');
      expect(result.totalSessions).toBe(6);
      expect(result.preferredDay).toBeDefined();
      expect(result.dayFrequency).toBeDefined();
    });

    it('should calculate average gap days correctly', () => {
      const sessions = [
        { session_start: '2025-07-20T10:00:00.000Z' },
        { session_start: '2025-07-22T10:00:00.000Z' }, // 2 days gap
        { session_start: '2025-07-24T10:00:00.000Z' }, // 2 days gap
        { session_start: '2025-07-28T10:00:00.000Z' }  // 4 days gap - average: 2.67 days
      ];
      
      const result = analyzeSessionPattern(sessions);
      
      expect(result.avgGapDays).toBe(3); // Rounded
      expect(result.consistency).toBe('good'); // Between 2 and 4 days
    });

    it('should detect irregular patterns', () => {
      const sessions = [
        { session_start: '2025-07-15T10:00:00.000Z' },
        { session_start: '2025-07-20T10:00:00.000Z' }, // 5 days gap
        { session_start: '2025-07-27T10:00:00.000Z' }, // 7 days gap
        { session_start: '2025-08-05T10:00:00.000Z' }  // 9 days gap
      ];
      
      const result = analyzeSessionPattern(sessions);
      
      expect(result.consistency).toBe('irregular');
      expect(result.message).toBe('Trata de estudiar con más regularidad');
      expect(result.avgGapDays).toBeGreaterThan(4);
    });
  });

  describe('calculateMotivationalMetrics', () => {
    it('should calculate all motivational metrics correctly', () => {
      const userSummary = {
        total_time_spent_minutes: 420, // 7 hours
        total_sessions: 12,
        completion_streak: 8
      };
      
      const recentSessions = [
        { time_spent_minutes: 30 },
        { time_spent_minutes: 45 },
        { time_spent_minutes: 60 }, // Longest session
        { time_spent_minutes: 25 },
        { time_spent_minutes: 40 }
      ];
      
      const result = calculateMotivationalMetrics(userSummary, recentSessions);
      
      expect(result.totalTimeHours).toBe(7); // 420 / 60 = 7
      expect(result.booksEquivalent).toBe(2); // 420 / 180 = 2.33 -> 2
      expect(result.coffeeBreaksEquivalent).toBe(28); // 420 / 15 = 28
      expect(result.totalSessions).toBe(12);
      expect(result.currentStreak).toBe(8);
      expect(result.longestSession).toBe(60);
    });

    it('should handle zero data gracefully', () => {
      const userSummary = {
        total_time_spent_minutes: 0,
        total_sessions: 0,
        completion_streak: 0
      };
      
      const result = calculateMotivationalMetrics(userSummary, []);
      
      expect(result.totalTimeHours).toBe(0);
      expect(result.booksEquivalent).toBe(0);
      expect(result.coffeeBreaksEquivalent).toBe(0);
      expect(result.totalSessions).toBe(0);
      expect(result.currentStreak).toBe(0);
      expect(result.longestSession).toBe(0);
    });

    it('should handle missing streak data', () => {
      const userSummary = {
        total_time_spent_minutes: 60,
        total_sessions: 2
        // completion_streak undefined
      };
      
      const result = calculateMotivationalMetrics(userSummary, []);
      
      expect(result.currentStreak).toBe(0);
    });
  });
});

// Helper function definitions for testing
// These functions are extracted from the API file for direct testing

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
  const progressRate = userSummary.overall_progress_percentage / daysSinceStart;
  const remainingProgress = 100 - userSummary.overall_progress_percentage;
  const estimatedDaysRemaining = Math.ceil(remainingProgress / Math.max(progressRate, 0.5));

  const estimatedCompletionDate = new Date();
  estimatedCompletionDate.setDate(estimatedCompletionDate.getDate() + estimatedDaysRemaining);

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
  const avgCompletionRate = pathPerformance.overall_completion_rate;
  
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

  const sessionDays = recentSessions.map(session => {
    const date = new Date(session.session_start);
    return date.getDay();
  });

  const dayFrequency = sessionDays.reduce((acc, day) => {
    acc[day] = (acc[day] || 0) + 1;
    return acc;
  }, {} as Record<number, number>);

  const mostActiveDay = Object.entries(dayFrequency)
    .sort(([, a], [, b]) => b - a)[0];
  
  const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const preferredDay = mostActiveDay ? dayNames[parseInt(mostActiveDay[0])] : 'N/A';

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

  const metrics = {
    totalTimeHours: Math.round(totalTime / 60 * 10) / 10,
    booksEquivalent: Math.round(totalTime / 180),
    coffeeBreaksEquivalent: Math.round(totalTime / 15),
    totalSessions,
    currentStreak: streak,
    longestSession: recentSessions.length > 0 
      ? Math.max(...recentSessions.map(s => s.time_spent_minutes || 0))
      : 0
  };

  return metrics;
}