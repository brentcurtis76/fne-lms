// Rule-based automatic insight generation for analytics data
interface AnalyticsData {
  progressTrends: any[];
  completionRatesByOrg: any;
  performanceDistribution: any[];
  timeSpentTrends: any[];
  quizPerformance: any[];
  kpiData: {
    current: any;
    previous: any;
    trends: any;
  };
}

interface Insight {
  type: 'success' | 'warning' | 'info' | 'error';
  title: string;
  message: string;
  metric?: number;
  recommendation?: string;
}

export class InsightGenerator {
  
  static generateInsights(data: AnalyticsData): Insight[] {
    const insights: Insight[] = [];
    
    // Generate performance insights
    insights.push(...this.generatePerformanceInsights(data));
    
    // Generate trend insights
    insights.push(...this.generateTrendInsights(data));
    
    // Generate engagement insights
    insights.push(...this.generateEngagementInsights(data));
    
    // Generate time efficiency insights
    insights.push(...this.generateTimeInsights(data));
    
    // Generate organizational insights
    insights.push(...this.generateOrganizationalInsights(data));
    
    // Return top 3 most important insights
    return this.prioritizeInsights(insights).slice(0, 3);
  }

  private static generatePerformanceInsights(data: AnalyticsData): Insight[] {
    const insights: Insight[] = [];
    const { performanceDistribution, kpiData } = data;
    
    if (!performanceDistribution || performanceDistribution.length === 0) {
      return insights;
    }
    
    // Calculate high performers (61-100% range)
    const highPerformers = performanceDistribution
      .filter(range => range.range === '61-80%' || range.range === '81-100%')
      .reduce((sum, range) => sum + range.count, 0);
    
    const totalUsers = performanceDistribution.reduce((sum, range) => sum + range.count, 0);
    const highPerformancePercentage = totalUsers > 0 ? Math.round((highPerformers / totalUsers) * 100) : 0;
    
    // Rule: Excellent performance if >70% are high performers
    if (highPerformancePercentage >= 70) {
      insights.push({
        type: 'success',
        title: 'Excelente Rendimiento',
        message: `El ${highPerformancePercentage}% de los usuarios mantiene un rendimiento superior al 60%`,
        metric: highPerformancePercentage
      });
    }
    // Rule: Good performance if 50-69% are high performers
    else if (highPerformancePercentage >= 50) {
      insights.push({
        type: 'info',
        title: 'Buen Rendimiento',
        message: `El ${highPerformancePercentage}% de los usuarios tiene un rendimiento satisfactorio`,
        metric: highPerformancePercentage,
        recommendation: 'Continuar con estrategias actuales y apoyar a usuarios con menor rendimiento'
      });
    }
    // Rule: Poor performance if <50% are high performers
    else {
      const lowPerformers = performanceDistribution
        .filter(range => range.range === '0-20%' || range.range === '21-40%')
        .reduce((sum, range) => sum + range.count, 0);
      const lowPerformancePercentage = totalUsers > 0 ? Math.round((lowPerformers / totalUsers) * 100) : 0;
      
      // Only show this insight if there are actually low performers
      if (lowPerformancePercentage > 0) {
        insights.push({
          type: 'warning',
          title: 'Rendimiento Requiere Atención',
          message: `${lowPerformancePercentage}% de usuarios tiene rendimiento bajo (menos del 40%)`,
          metric: lowPerformancePercentage,
          recommendation: 'Implementar sesiones de apoyo y seguimiento personalizado'
        });
      }
    }
    
    return insights;
  }

  private static generateTrendInsights(data: AnalyticsData): Insight[] {
    const insights: Insight[] = [];
    const { kpiData, progressTrends } = data;
    
    // Rule: Analyze KPI trends
    if (kpiData?.trends) {
      const { activeUsers, avgCompletionRate, totalTimeSpent, engagementScore } = kpiData.trends;
      
      // Positive trends
      if (activeUsers > 5 || avgCompletionRate > 5) {
        const mainTrend = activeUsers > avgCompletionRate ? 'participación' : 'completación';
        const trendValue = Math.max(activeUsers, avgCompletionRate);
        
        insights.push({
          type: 'success',
          title: 'Tendencia Positiva',
          message: `La ${mainTrend} muestra una mejora del ${trendValue.toFixed(1)}% respecto al período anterior`,
          metric: trendValue
        });
      }
      
      // Negative trends
      if (activeUsers < -10 || avgCompletionRate < -10) {
        const problemArea = activeUsers < avgCompletionRate ? 'participación' : 'completación';
        const trendValue = Math.min(activeUsers, avgCompletionRate);
        
        insights.push({
          type: 'warning',
          title: 'Tendencia Decreciente',
          message: `La ${problemArea} ha disminuido ${Math.abs(trendValue).toFixed(1)}% en las últimas semanas`,
          metric: Math.abs(trendValue),
          recommendation: `Investigar causas de la disminución en ${problemArea} y tomar acciones correctivas`
        });
      }
      
      // Engagement insights
      if (engagementScore > 0) {
        insights.push({
          type: 'info',
          title: 'Mejora en Engagement',
          message: `El engagement de usuarios ha mejorado ${engagementScore.toFixed(1)}%`,
          metric: engagementScore
        });
      }
    }
    
    // Rule: Analyze progress trends over time
    if (progressTrends && progressTrends.length >= 3) {
      const recent = progressTrends.slice(-3);
      const earlier = progressTrends.slice(0, 3);
      
      if (recent.length > 0 && earlier.length > 0) {
        const recentAvgLessons = recent.reduce((sum, item) => sum + (item.completedLessons || 0), 0) / recent.length;
        const earlierAvgLessons = earlier.reduce((sum, item) => sum + (item.completedLessons || 0), 0) / earlier.length;
        
        if (recentAvgLessons > earlierAvgLessons * 1.2) {
          insights.push({
            type: 'success',
            title: 'Aceleración en Completación',
            message: `Las completaciones de lecciones han aumentado significativamente en las últimas semanas`,
            metric: Math.round(((recentAvgLessons - earlierAvgLessons) / earlierAvgLessons) * 100)
          });
        }
      }
    }
    
    return insights;
  }

  private static generateEngagementInsights(data: AnalyticsData): Insight[] {
    const insights: Insight[] = [];
    const { kpiData } = data;
    
    if (!kpiData?.current) return insights;
    
    const { totalUsers, activeUsers, avgCompletionRate } = kpiData.current;
    
    // Rule: Calculate engagement rate
    const engagementRate = totalUsers > 0 ? (activeUsers / totalUsers) * 100 : 0;
    
    if (engagementRate >= 80) {
      insights.push({
        type: 'success',
        title: 'Alta Participación',
        message: `${engagementRate.toFixed(1)}% de usuarios han estado activos recientemente`,
        metric: engagementRate
      });
    } else if (engagementRate < 50) {
      insights.push({
        type: 'warning',
        title: 'Baja Participación',
        message: `Solo ${engagementRate.toFixed(1)}% de usuarios han estado activos`,
        metric: engagementRate,
        recommendation: 'Implementar estrategias de reactivación y comunicación directa'
      });
    }
    
    // Rule: Completion rate analysis
    if (avgCompletionRate >= 75) {
      insights.push({
        type: 'success',
        title: 'Excelente Tasa de Completación',
        message: `La tasa promedio de completación es del ${avgCompletionRate.toFixed(1)}%`,
        metric: avgCompletionRate
      });
    } else if (avgCompletionRate < 40) {
      insights.push({
        type: 'error',
        title: 'Completación Crítica',
        message: `La tasa de completación promedio es solo del ${avgCompletionRate.toFixed(1)}%`,
        metric: avgCompletionRate,
        recommendation: 'Revisar dificultad del contenido y proporcionar más apoyo'
      });
    }
    
    return insights;
  }

  private static generateTimeInsights(data: AnalyticsData): Insight[] {
    const insights: Insight[] = [];
    const { timeSpentTrends, kpiData } = data;
    
    if (!timeSpentTrends || timeSpentTrends.length === 0) return insights;
    
    // Rule: Analyze time efficiency
    const avgTimePerUser = timeSpentTrends.reduce((sum, item) => sum + (item.avgHoursPerUser || 0), 0) / timeSpentTrends.length;
    
    if (avgTimePerUser >= 2) {
      insights.push({
        type: 'success',
        title: 'Dedicación de Tiempo Adecuada',
        message: `Los usuarios dedican en promedio ${avgTimePerUser.toFixed(1)} horas por período`,
        metric: avgTimePerUser
      });
    } else if (avgTimePerUser < 0.5) {
      insights.push({
        type: 'warning',
        title: 'Tiempo de Estudio Insuficiente',
        message: `El tiempo promedio de estudio es solo ${avgTimePerUser.toFixed(1)} horas`,
        metric: avgTimePerUser,
        recommendation: 'Motivar mayor dedicación de tiempo y facilitar acceso a contenidos'
      });
    }
    
    // Rule: Time trend analysis
    if (timeSpentTrends.length >= 2) {
      const recent = timeSpentTrends[timeSpentTrends.length - 1];
      const previous = timeSpentTrends[timeSpentTrends.length - 2];
      
      if (recent && previous) {
        const timeChange = ((recent.totalHours - previous.totalHours) / Math.max(previous.totalHours, 1)) * 100;
        
        if (timeChange > 20) {
          insights.push({
            type: 'info',
            title: 'Incremento en Tiempo de Estudio',
            message: `El tiempo total de estudio aumentó ${timeChange.toFixed(1)}% esta semana`,
            metric: timeChange
          });
        } else if (timeChange < -20) {
          insights.push({
            type: 'warning',
            title: 'Disminución en Tiempo de Estudio',
            message: `El tiempo de estudio disminuyó ${Math.abs(timeChange).toFixed(1)}% esta semana`,
            metric: Math.abs(timeChange),
            recommendation: 'Investigar barreras y proporcionar flexibilidad en horarios'
          });
        }
      }
    }
    
    return insights;
  }

  private static generateOrganizationalInsights(data: AnalyticsData): Insight[] {
    const insights: Insight[] = [];
    const { completionRatesByOrg } = data;
    
    if (!completionRatesByOrg?.schools || completionRatesByOrg.schools.length === 0) {
      return insights;
    }
    
    const schools = completionRatesByOrg.schools;
    
    // Rule: Find top and bottom performing schools
    const sortedSchools = [...schools].sort((a, b) => (b.completionRate || 0) - (a.completionRate || 0));
    
    if (sortedSchools.length > 0) {
      const topSchool = sortedSchools[0];
      const bottomSchool = sortedSchools[sortedSchools.length - 1];
      
      // Top performer insight
      if (topSchool.completionRate >= 80) {
        insights.push({
          type: 'success',
          title: 'Escuela Destacada',
          message: `${topSchool.name} lidera con ${topSchool.completionRate}% de completación`,
          metric: topSchool.completionRate,
          recommendation: 'Analizar y replicar mejores prácticas de esta escuela'
        });
      }
      
      // Bottom performer insight
      if (bottomSchool.completionRate < 30 && schools.length > 1) {
        insights.push({
          type: 'warning',
          title: 'Escuela Requiere Apoyo',
          message: `${bottomSchool.name} tiene solo ${bottomSchool.completionRate}% de completación`,
          metric: bottomSchool.completionRate,
          recommendation: 'Proporcionar apoyo especializado y recursos adicionales'
        });
      }
      
      // Performance gap insight
      if (schools.length >= 3) {
        const avgCompletion = schools.reduce((sum, school) => sum + (school.completionRate || 0), 0) / schools.length;
        const gap = topSchool.completionRate - bottomSchool.completionRate;
        
        if (gap > 40) {
          insights.push({
            type: 'info',
            title: 'Disparidad Entre Escuelas',
            message: `Existe una brecha de ${gap.toFixed(1)}% entre la mejor y peor escuela`,
            metric: gap,
            recommendation: 'Implementar programa de nivelación y intercambio de experiencias'
          });
        }
      }
    }
    
    return insights;
  }

  private static prioritizeInsights(insights: Insight[]): Insight[] {
    // Priority order: error > warning > success > info
    const priorityOrder = { error: 4, warning: 3, success: 2, info: 1 };
    
    return insights.sort((a, b) => {
      const priorityDiff = priorityOrder[b.type] - priorityOrder[a.type];
      if (priorityDiff !== 0) return priorityDiff;
      
      // Secondary sort by metric value (higher is more important)
      return (b.metric || 0) - (a.metric || 0);
    });
  }
}

// Utility function for components to use
export const generateAutomaticInsights = (analyticsData: AnalyticsData): Insight[] => {
  return InsightGenerator.generateInsights(analyticsData);
};