/**
 * Tests for EnhancedProgressIndicators component
 * Validates the display of intelligent learning analytics
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import EnhancedProgressIndicators from '../../../components/learning-paths/EnhancedProgressIndicators';

const mockEnhancedProgressData = {
  userProgress: {
    status: 'in_progress',
    overallProgress: 65,
    totalTimeSpent: 180, // 3 hours
    totalSessions: 8,
    avgSessionMinutes: 22.5,
    currentCourse: 3,
    daysSinceLastActivity: 1,
    isAtRisk: false,
    completionStreak: 5,
    startDate: '2025-07-01'
  },
  pathBenchmarks: {
    avgCompletionRate: 72,
    avgCompletionTimeDays: 30,
    totalEnrolledUsers: 150,
    engagementScore: 78
  },
  insights: {
    paceAnalysis: {
      status: 'ahead',
      message: '¡Excelente! Vas 15% adelantado',
      color: 'text-blue-600',
      daysSinceStart: 20,
      expectedProgress: 50,
      actualProgress: 65,
      paceDifference: 15
    },
    engagementLevel: {
      level: 'high',
      message: '¡Excelente nivel de compromiso!',
      color: 'text-green-600',
      score: 85,
      avgSessionMinutes: 22.5,
      recentSessionCount: 8,
      totalRecentTimeHours: 3.0
    },
    timeForecasting: {
      estimatedCompletionDate: '2025-07-30',
      estimatedDaysRemaining: 8,
      totalEstimatedDays: 28,
      pathAverageDays: 30,
      progressRate: 3.25,
      message: 'A tu ritmo actual, terminarás en 8 días (¡más rápido que el promedio!)'
    },
    recommendations: [
      {
        type: 'progress',
        priority: 'medium',
        title: '¡Ya comenzaste!',
        message: 'Estás en el camino correcto. La consistencia es clave para el éxito',
        action: 'Continuar aprendiendo',
        icon: 'trending-up'
      },
      {
        type: 'celebration',
        priority: 'low',
        title: '¡Llegaste a la mitad!',
        message: '¡Felicidades! Has completado el 50% de la ruta. ¡Sigue así!',
        action: 'Ver progreso detallado',
        icon: 'award'
      }
    ],
    milestones: {
      milestones: [
        { threshold: 25, title: 'Primer cuarto', unlocked: true, icon: '🌱' },
        { threshold: 50, title: 'A mitad de camino', unlocked: true, icon: '🚀' },
        { threshold: 75, title: 'En la recta final', unlocked: false, icon: '🔥' },
        { threshold: 100, title: 'Ruta completada', unlocked: false, icon: '🏆' }
      ],
      nextMilestone: { threshold: 75, title: 'En la recta final', unlocked: false, icon: '🔥' },
      unlockedCount: 2,
      totalMilestones: 4
    },
    peerComparison: {
      progressComparison: 'above',
      message: '¡Estás progresando mejor que el promedio!',
      pathAvgCompletion: 72,
      totalPeers: 150,
      completedPeers: 45
    },
    sessionPattern: {
      consistency: 'excellent',
      message: '¡Excelente consistencia en tus estudios!',
      preferredDay: 'Martes',
      avgGapDays: 1.5,
      totalSessions: 8,
      dayFrequency: { 1: 3, 2: 2, 4: 2, 6: 1 }
    },
    motivationalMetrics: {
      totalTimeHours: 3.0,
      booksEquivalent: 1,
      coffeeBreaksEquivalent: 12,
      totalSessions: 8,
      currentStreak: 5,
      longestSession: 35
    }
  }
};

describe('EnhancedProgressIndicators', () => {
  it('should render progress overview with key metrics', () => {
    render(
      <EnhancedProgressIndicators 
        data={mockEnhancedProgressData} 
        pathName="Test Learning Path" 
      />
    );

    // Check main progress overview
    expect(screen.getByText('Tu Progreso Inteligente')).toBeInTheDocument();
    expect(screen.getByText('Ritmo de Aprendizaje')).toBeInTheDocument();
    expect(screen.getByText('Nivel de Compromiso')).toBeInTheDocument();
    expect(screen.getByText('Predicción')).toBeInTheDocument();
  });

  it('should display pace analysis correctly', () => {
    render(
      <EnhancedProgressIndicators 
        data={mockEnhancedProgressData} 
        pathName="Test Learning Path" 
      />
    );

    expect(screen.getByText('¡Excelente! Vas 15% adelantado')).toBeInTheDocument();
    expect(screen.getByText('Progreso esperado')).toBeInTheDocument();
    expect(screen.getAllByText('50%')).toHaveLength(2); // One in pace analysis, one in milestones
  });

  it('should display engagement level information', () => {
    render(
      <EnhancedProgressIndicators 
        data={mockEnhancedProgressData} 
        pathName="Test Learning Path" 
      />
    );

    expect(screen.getByText('Alto')).toBeInTheDocument();
    expect(screen.getByText('(85/100)')).toBeInTheDocument();
    expect(screen.getByText('8 sesiones recientes • 3h total')).toBeInTheDocument();
  });

  it('should show time forecasting', () => {
    render(
      <EnhancedProgressIndicators 
        data={mockEnhancedProgressData} 
        pathName="Test Learning Path" 
      />
    );

    expect(screen.getByText('8 días restantes')).toBeInTheDocument();
    expect(screen.getByText(/Finalización:/)).toBeInTheDocument();
  });

  it('should display milestones correctly', () => {
    render(
      <EnhancedProgressIndicators 
        data={mockEnhancedProgressData} 
        pathName="Test Learning Path" 
      />
    );

    expect(screen.getByText('Logros y Hitos')).toBeInTheDocument();
    expect(screen.getByText('Primer cuarto')).toBeInTheDocument();
    expect(screen.getByText('A mitad de camino')).toBeInTheDocument();
    expect(screen.getByText('En la recta final')).toBeInTheDocument();
    expect(screen.getByText('Ruta completada')).toBeInTheDocument();
    
    // Check next milestone
    expect(screen.getByText('Próximo hito: En la recta final')).toBeInTheDocument();
    expect(screen.getByText('65% / 75%')).toBeInTheDocument();
  });

  it('should show study pattern analysis', () => {
    render(
      <EnhancedProgressIndicators 
        data={mockEnhancedProgressData} 
        pathName="Test Learning Path" 
      />
    );

    expect(screen.getByText('Patrón de Estudio')).toBeInTheDocument();
    expect(screen.getByText('Excelente')).toBeInTheDocument();
    expect(screen.getByText('Martes')).toBeInTheDocument();
    expect(screen.getByText('¡Excelente consistencia en tus estudios!')).toBeInTheDocument();
  });

  it('should display motivational metrics', () => {
    render(
      <EnhancedProgressIndicators 
        data={mockEnhancedProgressData} 
        pathName="Test Learning Path" 
      />
    );

    expect(screen.getByText('Estadísticas Motivacionales')).toBeInTheDocument();
    expect(screen.getByText('3h')).toBeInTheDocument(); // Total time
    expect(screen.getByText('1')).toBeInTheDocument(); // Books equivalent
    expect(screen.getByText('12')).toBeInTheDocument(); // Coffee breaks
    expect(screen.getByText('35min')).toBeInTheDocument(); // Longest session
    
    // Check completion streak
    expect(screen.getByText('¡Racha de 5 días!')).toBeInTheDocument();
  });

  it('should show peer comparison when available', () => {
    render(
      <EnhancedProgressIndicators 
        data={mockEnhancedProgressData} 
        pathName="Test Learning Path" 
      />
    );

    expect(screen.getByText('Comparación con Otros Estudiantes')).toBeInTheDocument();
    expect(screen.getByText('150')).toBeInTheDocument(); // Total peers
    expect(screen.getByText('72%')).toBeInTheDocument(); // Average completion
    expect(screen.getByText('45')).toBeInTheDocument(); // Completed peers
    expect(screen.getByText('¡Estás progresando mejor que el promedio!')).toBeInTheDocument();
  });

  it('should display recommendations', () => {
    render(
      <EnhancedProgressIndicators 
        data={mockEnhancedProgressData} 
        pathName="Test Learning Path" 
      />
    );

    expect(screen.getByText('Recomendaciones Personalizadas')).toBeInTheDocument();
    expect(screen.getByText('¡Ya comenzaste!')).toBeInTheDocument();
    expect(screen.getByText('¡Llegaste a la mitad!')).toBeInTheDocument();
    expect(screen.getByText('Estás en el camino correcto. La consistencia es clave para el éxito')).toBeInTheDocument();
  });

  it('should handle at-risk status', () => {
    const atRiskData = {
      ...mockEnhancedProgressData,
      userProgress: {
        ...mockEnhancedProgressData.userProgress,
        isAtRisk: true,
        daysSinceLastActivity: 7
      }
    };

    render(
      <EnhancedProgressIndicators 
        data={atRiskData} 
        pathName="Test Learning Path" 
      />
    );

    expect(screen.getByText('Necesita atención')).toBeInTheDocument();
  });

  it('should handle missing optional data gracefully', () => {
    const minimalData = {
      userProgress: {
        status: 'not_started',
        overallProgress: 0,
        totalTimeSpent: 0,
        totalSessions: 0,
        avgSessionMinutes: 0,
        currentCourse: 1,
        daysSinceLastActivity: 0,
        isAtRisk: false,
        completionStreak: 0,
        startDate: '2025-07-20'
      },
      insights: {
        paceAnalysis: { status: 'insufficient_data', message: 'Calculando tu ritmo de aprendizaje...' },
        engagementLevel: { level: 'low', message: 'Intenta dedicar más tiempo al estudio', score: 20 },
        timeForecasting: { message: 'Comienza tu primera sesión para ver predicciones' },
        recommendations: [],
        milestones: { milestones: [], nextMilestone: null, unlockedCount: 0, totalMilestones: 0 },
        peerComparison: null,
        sessionPattern: { consistency: 'insufficient_data', message: 'Completa más sesiones para ver tu patrón de estudio' },
        motivationalMetrics: { totalTimeHours: 0, booksEquivalent: 0, coffeeBreaksEquivalent: 0, totalSessions: 0, currentStreak: 0, longestSession: 0 }
      }
    };

    render(
      <EnhancedProgressIndicators 
        data={minimalData} 
        pathName="Test Learning Path" 
      />
    );

    expect(screen.getByText('Tu Progreso Inteligente')).toBeInTheDocument();
    expect(screen.getByText('Calculando tu ritmo de aprendizaje...')).toBeInTheDocument();
    expect(screen.getByText('Comienza tu primera sesión para ver predicciones')).toBeInTheDocument();
  });

  console.log('✅ Enhanced Progress Indicators component tests completed');
});