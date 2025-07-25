import React, { useState } from 'react';
import { Users, MessageCircle, FileText, Calendar, TrendingUp, TrendingDown, AlertCircle, CheckCircle, Info } from 'lucide-react';
import DashboardCard from './DashboardCard';

interface CommunityData {
  id: string;
  name: string;
  healthScore: number;
  memberCount: number;
  activeMembers: number;
  recentActivity: number;
  collaborationIndex: number;
  trendDirection: 'up' | 'down' | 'stable';
}

interface CommunityHealthCardProps {
  data: {
    overallScore: number;
    communities: CommunityData[];
  };
  insights: Array<{
    type: 'warning' | 'success' | 'info';
    message: string;
    communityId?: string;
    actionSuggestion?: string;
  }>;
  chartData: {
    healthTrends: Array<{
      date: string;
      score: number;
      communityId: string;
    }>;
  };
  loading?: boolean;
  error?: string;
  onRefresh?: () => void;
  onCommunityClick?: (communityId: string) => void;
  lastUpdated?: string;
}

const CommunityHealthCard: React.FC<CommunityHealthCardProps> = ({
  data,
  insights,
  chartData,
  loading,
  error,
  onRefresh,
  onCommunityClick,
  lastUpdated
}) => {
  const [selectedCommunity, setSelectedCommunity] = useState<string | null>(null);

  // Get health score color and label
  const getHealthStatus = (score: number) => {
    if (score >= 80) return { color: 'green', label: 'Excelente', bgColor: 'bg-green-50', textColor: 'text-green-700' };
    if (score >= 60) return { color: 'yellow', label: 'Bueno', bgColor: 'bg-yellow-50', textColor: 'text-yellow-700' };
    if (score >= 40) return { color: 'orange', label: 'Regular', bgColor: 'bg-orange-50', textColor: 'text-orange-700' };
    return { color: 'red', label: 'Necesita Atención', bgColor: 'bg-red-50', textColor: 'text-red-700' };
  };

  // Get trend indicator
  const getTrendIcon = (direction: CommunityData['trendDirection']) => {
    switch (direction) {
      case 'up':
        return <TrendingUp className="w-4 h-4 text-green-600" />;
      case 'down':
        return <TrendingDown className="w-4 h-4 text-red-600" />;
      default:
        return <div className="w-4 h-4" />; // Placeholder for stable
    }
  };

  // Get insight icon
  const getInsightIcon = (type: 'warning' | 'success' | 'info') => {
    switch (type) {
      case 'warning':
        return <AlertCircle className="w-4 h-4 text-yellow-600" />;
      case 'success':
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'info':
        return <Info className="w-4 h-4 text-blue-600" />;
    }
  };

  const overallHealth = getHealthStatus(data.overallScore);

  const CommunityRow: React.FC<{ community: CommunityData }> = ({ community }) => {
    const health = getHealthStatus(community.healthScore);
    const isSelected = selectedCommunity === community.id;
    
    return (
      <div
        className={`
          p-3 rounded-lg border transition-all duration-200 cursor-pointer
          ${isSelected ? 'border-blue-300 bg-blue-50' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'}
        `}
        onClick={() => {
          setSelectedCommunity(isSelected ? null : community.id);
          onCommunityClick?.(community.id);
        }}
      >
        <div className="flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center space-x-2">
              <h4 className="text-sm font-medium text-gray-900 truncate">
                {community.name}
              </h4>
              {getTrendIcon(community.trendDirection)}
            </div>
            <div className="mt-1 text-xs text-gray-500">
              {community.activeMembers} de {community.memberCount} miembros activos
            </div>
          </div>
          
          <div className="flex items-center space-x-3">
            {/* Health Score */}
            <div className={`
              px-2 py-1 rounded-full text-xs font-medium
              ${health.bgColor} ${health.textColor}
            `}>
              {community.healthScore}
            </div>
            
            {/* Quick Metrics */}
            <div className="hidden md:flex items-center space-x-2 text-xs text-gray-500">
              <div className="flex items-center">
                <MessageCircle className="w-3 h-3 mr-1" />
                {community.recentActivity}
              </div>
              <div className="flex items-center">
                <Users className="w-3 h-3 mr-1" />
                {Math.round(community.collaborationIndex)}%
              </div>
            </div>
          </div>
        </div>
        
        {/* Expanded Details */}
        {isSelected && (
          <div className="mt-3 pt-3 border-t border-gray-200 space-y-2">
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-gray-500">Actividad Reciente:</span>
                <span className="ml-2 font-medium">{community.recentActivity} acciones</span>
              </div>
              <div>
                <span className="text-gray-500">Índice de Colaboración:</span>
                <span className="ml-2 font-medium">{community.collaborationIndex}%</span>
              </div>
            </div>
            
            {/* Community-specific insights */}
            {insights
              .filter(insight => insight.communityId === community.id)
              .map((insight, index) => (
                <div key={index} className="flex items-start space-x-2 text-xs">
                  {getInsightIcon(insight.type)}
                  <div className="flex-1">
                    <p className="text-gray-700">{insight.message}</p>
                    {insight.actionSuggestion && (
                      <p className="text-gray-500 mt-1 italic">{insight.actionSuggestion}</p>
                    )}
                  </div>
                </div>
              ))
            }
          </div>
        )}
      </div>
    );
  };

  const mainContent = (
    <div className="h-full space-y-4">
      {/* Overall Health Score */}
      <div className={`
        p-4 rounded-lg border-2
        ${overallHealth.color === 'green' ? 'border-green-200 bg-green-50' :
          overallHealth.color === 'yellow' ? 'border-yellow-200 bg-yellow-50' :
          overallHealth.color === 'orange' ? 'border-orange-200 bg-orange-50' :
          'border-red-200 bg-red-50'}
      `}>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              Salud General de Comunidades
            </h3>
            <p className="text-sm text-gray-600 mt-1">
              Puntuación basada en actividad, colaboración y participación
            </p>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold text-gray-900">
              {data.overallScore}
            </div>
            <div className={`text-sm font-medium ${overallHealth.textColor}`}>
              {overallHealth.label}
            </div>
          </div>
        </div>
      </div>

      {/* Communities List */}
      <div className="space-y-2">
        <h4 className="text-sm font-semibold text-gray-700 flex items-center">
          <Users className="w-4 h-4 mr-2" />
          Comunidades ({data.communities.length})
        </h4>
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {data.communities.map(community => (
            <CommunityRow key={community.id} community={community} />
          ))}
        </div>
      </div>

      {/* General Insights */}
      {insights.filter(insight => !insight.communityId).length > 0 && (
        <div className="bg-gray-50 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-gray-700 mb-3">
            Observaciones Generales
          </h4>
          <div className="space-y-2">
            {insights
              .filter(insight => !insight.communityId)
              .map((insight, index) => (
                <div key={index} className="flex items-start space-x-2 text-sm">
                  {getInsightIcon(insight.type)}
                  <div className="flex-1">
                    <p className="text-gray-700">{insight.message}</p>
                    {insight.actionSuggestion && (
                      <p className="text-gray-500 mt-1 italic text-xs">
                        💡 {insight.actionSuggestion}
                      </p>
                    )}
                  </div>
                </div>
              ))
            }
          </div>
        </div>
      )}
    </div>
  );

  const expandedContent = (
    <div className="space-y-4">
      <h4 className="text-sm font-semibold text-gray-700">Análisis Detallado</h4>
      
      {/* Health Trends Chart Placeholder */}
      <div className="bg-white border rounded-lg p-4">
        <h5 className="text-sm font-medium text-gray-700 mb-3">
          Tendencias de Salud (Últimos 30 días)
        </h5>
        <div className="h-32 bg-gray-50 rounded-lg flex items-center justify-center text-sm text-gray-500">
          <div className="text-center">
            <FileText className="w-8 h-8 mx-auto mb-2 text-gray-400" />
            <p>Gráfico de tendencias disponible próximamente</p>
            <p className="text-xs mt-1">
              Datos de {chartData.healthTrends.length} puntos de medición
            </p>
          </div>
        </div>
      </div>

      {/* Collaboration Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white border rounded-lg p-4">
          <h5 className="text-sm font-medium text-gray-700 mb-3">
            Métricas de Colaboración
          </h5>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Promedio de Participación:</span>
              <span className="font-medium">
                {Math.round(data.communities.reduce((acc, c) => acc + (c.activeMembers / c.memberCount * 100), 0) / data.communities.length)}%
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Comunidades Activas:</span>
              <span className="font-medium">
                {data.communities.filter(c => c.healthScore >= 60).length} de {data.communities.length}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Índice de Colaboración Promedio:</span>
              <span className="font-medium">
                {Math.round(data.communities.reduce((acc, c) => acc + c.collaborationIndex, 0) / data.communities.length)}%
              </span>
            </div>
          </div>
        </div>

        <div className="bg-white border rounded-lg p-4">
          <h5 className="text-sm font-medium text-gray-700 mb-3">
            Recomendaciones de Mejora
          </h5>
          <div className="space-y-2 text-sm">
            <div className="flex items-start space-x-2">
              <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
              <span className="text-gray-700">
                Fomentar actividades colaborativas en comunidades con bajo puntaje
              </span>
            </div>
            <div className="flex items-start space-x-2">
              <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
              <span className="text-gray-700">
                Reconocer y destacar comunidades con alto rendimiento
              </span>
            </div>
            <div className="flex items-start space-x-2">
              <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
              <span className="text-gray-700">
                Implementar programas de mentorización entre comunidades
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <DashboardCard
      id="community-health"
      type="community-health"
      title="Salud de Comunidades"
      subtitle={`${data.communities.length} comunidades monitoreadas`}
      size="large"
      priority="medium"
      loading={loading}
      error={error}
      onRefresh={onRefresh}
      lastUpdated={lastUpdated}
      expandable={true}
      defaultExpanded={false}
      expandedContent={expandedContent}
      ariaLabel="Community health dashboard card showing collaboration metrics"
    >
      {mainContent}
    </DashboardCard>
  );
};

export default CommunityHealthCard;