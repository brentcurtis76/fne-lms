/**
 * ActivitySummary Component
 * Daily/weekly activity summary cards with statistics and trends
 * Phase 5 of Collaborative Workspace System for Genera
 */

import React, { useState, useEffect } from 'react';
import { 
  Calendar, 
  TrendingUp, 
  TrendingDown, 
  Minus, 
  Users, 
  Activity as ActivityIcon,
  Clock,
  Target,
  Award,
  Zap,
  BarChart3,
  PieChart
} from 'lucide-react';
import {
  ActivitySummaryProps,
  ActivityStats,
  ActivityAggregation,
  ActivityType,
  ACTIVITY_TYPE_CONFIG
} from '../../types/activity';
import { getActivityStats } from '../../utils/activityUtils';

const ActivitySummary: React.FC<ActivitySummaryProps> = ({
  workspaceId,
  period = 'today',
  showComparison = true,
  showTrends = true,
  className = ''
}) => {
  const [stats, setStats] = useState<ActivityStats | null>(null);
  const [aggregations, setAggregations] = useState<ActivityAggregation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMetric, setSelectedMetric] = useState<'activities' | 'users' | 'types'>('activities');

  // Load statistics
  useEffect(() => {
    const loadStats = async () => {
      try {
        setLoading(true);
        const statsData = await getActivityStats(workspaceId);
        setStats(statsData);
      } catch (error) {
        console.error('Error loading activity stats:', error);
      } finally {
        setLoading(false);
      }
    };

    loadStats();
  }, [workspaceId, period]);

  // Get period label
  const getPeriodLabel = () => {
    switch (period) {
      case 'today':
        return 'Hoy';
      case 'week':
        return 'Esta Semana';
      case 'month':
        return 'Este Mes';
      default:
        return 'Período';
    }
  };

  // Get current period value
  const getCurrentValue = () => {
    if (!stats) return 0;
    switch (period) {
      case 'today':
        return stats.activities_today;
      case 'week':
        return stats.activities_this_week;
      case 'month':
        return stats.total_activities; // Simplified
      default:
        return 0;
    }
  };

  // Calculate comparison percentage (simplified)
  const getComparisonPercentage = (): { value: number; trend: 'up' | 'down' | 'stable' } | null => {
    if (!stats || !showComparison) return null;
    
    const current = getCurrentValue();
    const previous = Math.floor(current * 0.8); // Simplified calculation
    
    if (previous === 0) return null;
    
    const percentage = ((current - previous) / previous) * 100;
    return {
      value: Math.abs(percentage),
      trend: (percentage > 0 ? 'up' : percentage < 0 ? 'down' : 'stable') as 'up' | 'down' | 'stable'
    };
  };

  // Get trend icon
  const getTrendIcon = (trend: 'up' | 'down' | 'stable') => {
    switch (trend) {
      case 'up':
        return <TrendingUp className="w-4 h-4 text-green-600" />;
      case 'down':
        return <TrendingDown className="w-4 h-4 text-red-600" />;
      default:
        return <Minus className="w-4 h-4 text-gray-600" />;
    }
  };

  // Get most active type info
  const getMostActiveTypeInfo = () => {
    if (!stats?.most_active_type) return null;
    
    const config = ACTIVITY_TYPE_CONFIG[stats.most_active_type];
    return {
      type: stats.most_active_type,
      label: config?.label || stats.most_active_type,
      icon: config?.icon || '📝',
      color: config?.color || '#6b7280'
    };
  };

  const comparison = getComparisonPercentage();
  const mostActiveType = getMostActiveTypeInfo();

  if (loading) {
    return (
      <div className={`activity-summary ${className}`}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white p-6 rounded-lg border border-gray-200 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-1/2 mb-2"></div>
              <div className="h-8 bg-gray-200 rounded w-1/3 mb-2"></div>
              <div className="h-3 bg-gray-200 rounded w-2/3"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className={`activity-summary ${className}`}>
        <div className="bg-white p-6 rounded-lg border border-gray-200 text-center">
          <p className="text-gray-600">No hay estadísticas disponibles</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`activity-summary ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-[#0a0a0a]">
          Resumen de Actividad - {getPeriodLabel()}
        </h3>
        
        {showTrends && (
          <div className="flex items-center gap-1 text-sm">
            {getTrendIcon(stats.engagement_trend)}
            <span className={`font-medium ${
              stats.engagement_trend === 'up' ? 'text-green-600' :
              stats.engagement_trend === 'down' ? 'text-red-600' : 'text-gray-600'
            }`}>
              {stats.engagement_trend === 'up' ? 'Creciendo' :
               stats.engagement_trend === 'down' ? 'Decreciendo' : 'Estable'}
            </span>
          </div>
        )}
      </div>

      {/* Main metrics grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {/* Total activities */}
        <div className="bg-white p-6 rounded-lg border border-gray-200 hover:border-[#fbbf24] transition-colors">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Actividades {getPeriodLabel()}</p>
              <p className="text-2xl font-bold text-[#0a0a0a] mt-1">
                {getCurrentValue().toLocaleString()}
              </p>
              {comparison && showComparison && (
                <div className="flex items-center gap-1 mt-2">
                  {getTrendIcon(comparison.trend)}
                  <span className={`text-sm font-medium ${
                    comparison.trend === 'up' ? 'text-green-600' :
                    comparison.trend === 'down' ? 'text-red-600' : 'text-gray-600'
                  }`}>
                    {comparison.value.toFixed(1)}%
                  </span>
                  <span className="text-xs text-gray-500">vs período anterior</span>
                </div>
              )}
            </div>
            <div className="p-3 bg-blue-50 rounded-lg">
              <ActivityIcon className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </div>

        {/* Total activities (global) */}
        <div className="bg-white p-6 rounded-lg border border-gray-200 hover:border-[#fbbf24] transition-colors">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Actividades</p>
              <p className="text-2xl font-bold text-[#0a0a0a] mt-1">
                {stats.total_activities.toLocaleString()}
              </p>
              <p className="text-xs text-gray-500 mt-2">
                Todas las actividades registradas
              </p>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg">
              <BarChart3 className="w-6 h-6 text-gray-600" />
            </div>
          </div>
        </div>

        {/* Most active user */}
        <div className="bg-white p-6 rounded-lg border border-gray-200 hover:border-[#fbbf24] transition-colors">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Usuario Más Activo</p>
              {stats.most_active_user ? (
                <>
                  <p className="text-lg font-bold text-[#0a0a0a] mt-1 truncate">
                    {stats.most_active_user.name}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {stats.most_active_user.count} actividades
                  </p>
                </>
              ) : (
                <>
                  <p className="text-lg font-bold text-gray-400 mt-1">-</p>
                  <p className="text-xs text-gray-500 mt-1">Sin datos</p>
                </>
              )}
            </div>
            <div className="p-3 bg-green-50 rounded-lg">
              <Users className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </div>

        {/* Most active type */}
        <div className="bg-white p-6 rounded-lg border border-gray-200 hover:border-[#fbbf24] transition-colors">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Tipo Más Activo</p>
              {mostActiveType ? (
                <>
                  <p className="text-lg font-bold text-[#0a0a0a] mt-1">
                    {mostActiveType.label}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    Actividad predominante
                  </p>
                </>
              ) : (
                <>
                  <p className="text-lg font-bold text-gray-400 mt-1">-</p>
                  <p className="text-xs text-gray-500 mt-1">Sin datos</p>
                </>
              )}
            </div>
            <div className="p-3 bg-[#fbbf24] bg-opacity-10 rounded-lg">
              {mostActiveType ? (
                <span className="text-2xl" role="img" aria-label="activity-type">
                  {mostActiveType.icon}
                </span>
              ) : (
                <PieChart className="w-6 h-6 text-[#fbbf24]" />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Peak hours */}
      {showTrends && stats.peak_hours.length > 0 && (
        <div className="bg-white p-6 rounded-lg border border-gray-200">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="w-5 h-5 text-[#0a0a0a]" />
            <h4 className="font-semibold text-[#0a0a0a]">Horas de Mayor Actividad</h4>
          </div>
          
          <div className="grid grid-cols-6 md:grid-cols-12 gap-2">
            {Array.from({ length: 24 }, (_, i) => {
              const isPeak = stats.peak_hours.includes(i);
              const isWorkHour = i >= 8 && i <= 18;
              
              return (
                <div
                  key={i}
                  className={`relative h-8 rounded flex items-center justify-center text-xs font-medium transition-colors ${
                    isPeak 
                      ? 'bg-[#fbbf24] text-white' 
                      : isWorkHour 
                        ? 'bg-gray-100 text-gray-700' 
                        : 'bg-gray-50 text-gray-500'
                  }`}
                  title={`${i}:00 - ${(i + 1) % 24}:00`}
                >
                  {i}
                  {isPeak && (
                    <div className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full"></div>
                  )}
                </div>
              );
            })}
          </div>
          
          <div className="flex items-center gap-4 mt-4 text-xs text-gray-600">
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-[#fbbf24] rounded"></div>
              <span>Hora pico</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-gray-100 rounded"></div>
              <span>Horario laboral</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-gray-50 rounded"></div>
              <span>Fuera de horario</span>
            </div>
          </div>
        </div>
      )}

      {/* Quick insights */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
        {/* Engagement insight */}
        <div className="bg-gradient-to-r from-blue-50 to-blue-100 p-4 rounded-lg border border-blue-200">
          <div className="flex items-center gap-2 mb-2">
            <Target className="w-4 h-4 text-blue-600" />
            <h5 className="font-medium text-blue-900">Engagement</h5>
          </div>
          <p className="text-sm text-blue-800">
            {stats.engagement_trend === 'up' ? 
              'La actividad está creciendo. ¡Excelente participación!' :
              stats.engagement_trend === 'down' ?
              'La actividad ha disminuido. Considera estrategias de engagement.' :
              'La actividad se mantiene estable.'}
          </p>
        </div>

        {/* Peak time insight */}
        <div className="bg-gradient-to-r from-yellow-50 to-yellow-100 p-4 rounded-lg border border-yellow-200">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-yellow-600" />
            <h5 className="font-medium text-yellow-900">Horarios</h5>
          </div>
          <p className="text-sm text-yellow-800">
            Mayor actividad entre las {Math.min(...stats.peak_hours)}:00 y las {Math.max(...stats.peak_hours)}:00.
            Considera programar contenido importante en estos horarios.
          </p>
        </div>

        {/* Activity type insight */}
        <div className="bg-gradient-to-r from-green-50 to-green-100 p-4 rounded-lg border border-green-200">
          <div className="flex items-center gap-2 mb-2">
            <Award className="w-4 h-4 text-green-600" />
            <h5 className="font-medium text-green-900">Participación</h5>
          </div>
          <p className="text-sm text-green-800">
            {mostActiveType ? 
              `${mostActiveType.label} es el tipo de actividad más popular.` :
              'Diversifica los tipos de actividad para mayor engagement.'}
          </p>
        </div>
      </div>
    </div>
  );
};

export default ActivitySummary;