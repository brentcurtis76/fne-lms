import React from 'react';
import { Users, BookOpen, Clock, TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react';
import DashboardCard from './DashboardCard';

interface KPIMetric {
  value: number;
  label: string;
  format: 'number' | 'percentage' | 'duration' | 'currency';
  status: 'positive' | 'negative' | 'neutral';
  change: number; // Percentage change
  icon?: React.ComponentType<any>;
}

interface KPISummaryCardProps {
  data: {
    totalUsers: KPIMetric;
    activeUsers: KPIMetric;
    avgCompletionRate: KPIMetric;
    totalTimeSpent: KPIMetric;
    coursesInProgress: KPIMetric;
    atRiskUsers: KPIMetric;
  };
  trends: {
    period: string;
    percentageChanges: Record<string, number>;
  };
  loading?: boolean;
  error?: string;
  onRefresh?: () => void;
  lastUpdated?: string;
}

const KPISummaryCard: React.FC<KPISummaryCardProps> = ({
  data,
  trends,
  loading,
  error,
  onRefresh,
  lastUpdated
}) => {
  // Format values based on type
  const formatValue = (value: number, format: KPIMetric['format']): string => {
    switch (format) {
      case 'percentage':
        return `${value}%`;
      case 'duration':
        const hours = Math.floor(value / 60);
        const minutes = value % 60;
        return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
      case 'currency':
        return new Intl.NumberFormat('es-CL', {
          style: 'currency',
          currency: 'CLP'
        }).format(value);
      case 'number':
      default:
        return new Intl.NumberFormat('es-CL').format(value);
    }
  };

  // Get trend indicator
  const getTrendIndicator = (change: number, status: KPIMetric['status']) => {
    if (change === 0) return null;
    
    const isPositiveTrend = (status === 'positive' && change > 0) || 
                           (status === 'negative' && change < 0);
    const Icon = change > 0 ? TrendingUp : TrendingDown;
    const colorClass = isPositiveTrend ? 'text-green-600' : 'text-red-600';
    
    return (
      <div className={`flex items-center ${colorClass} text-sm`}>
        <Icon className="w-4 h-4 mr-1" />
        <span>{Math.abs(change)}%</span>
      </div>
    );
  };

  // KPI configuration with icons and enhanced styling
  const kpiConfig = {
    totalUsers: { 
      icon: Users, 
      bgColor: 'bg-blue-50', 
      iconColor: 'text-blue-600',
      borderColor: 'border-blue-200'
    },
    activeUsers: { 
      icon: Users, 
      bgColor: 'bg-green-50', 
      iconColor: 'text-green-600',
      borderColor: 'border-green-200'
    },
    avgCompletionRate: { 
      icon: BookOpen, 
      bgColor: 'bg-amber-50', 
      iconColor: 'text-amber-600',
      borderColor: 'border-amber-200'
    },
    totalTimeSpent: { 
      icon: Clock, 
      bgColor: 'bg-yellow-50', 
      iconColor: 'text-yellow-600',
      borderColor: 'border-yellow-200'
    },
    coursesInProgress: { 
      icon: BookOpen, 
      bgColor: 'bg-slate-50', 
      iconColor: 'text-slate-600',
      borderColor: 'border-slate-200'
    },
    atRiskUsers: { 
      icon: AlertTriangle, 
      bgColor: 'bg-red-50', 
      iconColor: 'text-red-600',
      borderColor: 'border-red-200'
    }
  };

  const KPIMetricComponent: React.FC<{ metric: KPIMetric; configKey: keyof typeof kpiConfig }> = ({ 
    metric, 
    configKey 
  }) => {
    const config = kpiConfig[configKey];
    const Icon = config.icon;
    
    return (
      <div className={`
        p-4 rounded-lg border ${config.borderColor} ${config.bgColor}
        transition-all duration-200 hover:shadow-sm
      `}>
        <div className="flex items-center justify-between mb-2">
          <div className={`p-2 rounded-lg bg-white ${config.iconColor}`}>
            <Icon className="w-5 h-5" />
          </div>
          {getTrendIndicator(metric.change, metric.status)}
        </div>
        
        <div className="space-y-1">
          <div className="text-2xl font-bold text-gray-900">
            {formatValue(metric.value, metric.format)}
          </div>
          <div className="text-sm text-gray-600 font-medium">
            {metric.label}
          </div>
        </div>
      </div>
    );
  };

  const mainContent = (
    <div className="h-full">
      {/* 5-Second Overview Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <KPIMetricComponent metric={data.totalUsers} configKey="totalUsers" />
        <KPIMetricComponent metric={data.activeUsers} configKey="activeUsers" />
        <KPIMetricComponent metric={data.avgCompletionRate} configKey="avgCompletionRate" />
        <KPIMetricComponent metric={data.totalTimeSpent} configKey="totalTimeSpent" />
        <KPIMetricComponent metric={data.coursesInProgress} configKey="coursesInProgress" />
        <KPIMetricComponent metric={data.atRiskUsers} configKey="atRiskUsers" />
      </div>
      
      {/* Quick Insights */}
      <div className="bg-gray-50 rounded-lg p-4">
        <h4 className="text-sm font-semibold text-gray-700 mb-2">
          Resumen del Período ({trends.period})
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-600">Usuarios Activos:</span>
              <span className="font-medium">
                {data.activeUsers.value} de {data.totalUsers.value}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Tasa de Finalización:</span>
              <span className="font-medium">
                {formatValue(data.avgCompletionRate.value, 'percentage')}
              </span>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-600">Tiempo Promedio:</span>
              <span className="font-medium">
                {formatValue(data.totalTimeSpent.value / data.activeUsers.value || 0, 'duration')}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Usuarios en Riesgo:</span>
              <span className={`font-medium ${ 
                data.atRiskUsers.value > 5 ? 'text-red-600' : 'text-green-600'
              }`}>
                {data.atRiskUsers.value}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const expandedContent = (
    <div className="space-y-4">
      <h4 className="text-sm font-semibold text-gray-700">Análisis Detallado</h4>
      
      {/* Detailed Trends */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white border rounded-lg p-4">
          <h5 className="text-sm font-medium text-gray-700 mb-3">Tendencias de Cambio</h5>
          <div className="space-y-2 text-sm">
            {Object.entries(trends.percentageChanges).map(([key, change]) => (
              <div key={key} className="flex items-center justify-between">
                <span className="text-gray-600 capitalize">
                  {key.replace(/([A-Z])/g, ' $1').toLowerCase()}:
                </span>
                <div className="flex items-center">
                  {change > 0 ? (
                    <TrendingUp className="w-4 h-4 text-green-600 mr-1" />
                  ) : change < 0 ? (
                    <TrendingDown className="w-4 h-4 text-red-600 mr-1" />
                  ) : null}
                  <span className={`font-medium ${
                    change > 0 ? 'text-green-600' : 
                    change < 0 ? 'text-red-600' : 'text-gray-600'
                  }`}>
                    {change > 0 ? '+' : ''}{change}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
        
        <div className="bg-white border rounded-lg p-4">
          <h5 className="text-sm font-medium text-gray-700 mb-3">Alertas y Recomendaciones</h5>
          <div className="space-y-2 text-sm">
            {data.atRiskUsers.value > 5 && (
              <div className="flex items-start text-red-600">
                <AlertTriangle className="w-4 h-4 mr-2 flex-shrink-0 mt-0.5" />
                <span>Alto número de usuarios en riesgo requiere atención</span>
              </div>
            )}
            {data.avgCompletionRate.value < 60 && (
              <div className="flex items-start text-yellow-600">
                <AlertTriangle className="w-4 h-4 mr-2 flex-shrink-0 mt-0.5" />
                <span>Tasa de finalización por debajo del objetivo (60%)</span>
              </div>
            )}
            {data.activeUsers.change > 10 && (
              <div className="flex items-start text-green-600">
                <TrendingUp className="w-4 h-4 mr-2 flex-shrink-0 mt-0.5" />
                <span>Excelente crecimiento en usuarios activos</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <DashboardCard
      id="kpi-summary"
      type="kpi-summary"
      title="Indicadores Clave de Rendimiento"
      subtitle={`Resumen general del período: ${trends.period}`}
      size="wide"
      priority="high"
      loading={loading}
      error={error}
      onRefresh={onRefresh}
      lastUpdated={lastUpdated}
      expandable={true}
      defaultExpanded={false}
      expandedContent={expandedContent}
      ariaLabel="KPI summary dashboard card with key performance indicators"
    >
      {mainContent}
    </DashboardCard>
  );
};

export default KPISummaryCard;