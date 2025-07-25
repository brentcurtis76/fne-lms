import React, { useState, useEffect } from 'react';
import { MessageCircle, FileText, Calendar, Users, TrendingUp, TrendingDown, Activity, Clock } from 'lucide-react';
import DashboardCard from './DashboardCard';

interface WorkspaceData {
  workspaceId: string;
  workspaceName: string;
  activityCount: number;
  uniqueParticipants: number;
  activityTypes: Record<string, number>;
  recentActivity?: Array<{
    id: string;
    type: string;
    title: string;
    userName: string;
    timestamp: string;
  }>;
}

interface ActivityTimeline {
  date: string;
  activityCount: number;
  activityTypes: Record<string, number>;
}

interface WorkspaceActivityCardProps {
  data: {
    totalActivities: number;
    activitiesThisPeriod: number;
    mostActiveWorkspaces: WorkspaceData[];
    activityTimeline: ActivityTimeline[];
    engagementMetrics: {
      averageParticipantsPerActivity: number;
      messageVolume: number;
      documentShares: number;
      meetingAttendance: number;
    };
  };
  realTimeUpdates?: boolean;
  loading?: boolean;
  error?: string;
  onRefresh?: () => void;
  onWorkspaceClick?: (workspaceId: string) => void;
  lastUpdated?: string;
}

const WorkspaceActivityCard: React.FC<WorkspaceActivityCardProps> = ({
  data,
  realTimeUpdates = false,
  loading,
  error,
  onRefresh,
  onWorkspaceClick,
  lastUpdated
}) => {
  const [selectedTimeframe, setSelectedTimeframe] = useState<'24h' | '7d' | '30d'>('7d');
  const [isLiveMode, setIsLiveMode] = useState(realTimeUpdates);

  // Activity type configurations
  const activityTypeConfig = {
    message_sent: { 
      icon: MessageCircle, 
      label: 'Mensajes', 
      color: 'text-blue-600', 
      bgColor: 'bg-blue-50' 
    },
    document_shared: { 
      icon: FileText, 
      label: 'Documentos', 
      color: 'text-green-600', 
      bgColor: 'bg-green-50' 
    },
    meeting_scheduled: { 
      icon: Calendar, 
      label: 'Reuniones', 
      color: 'text-purple-600', 
      bgColor: 'bg-purple-50' 
    },
    user_mentioned: { 
      icon: Users, 
      label: 'Menciones', 
      color: 'text-orange-600', 
      bgColor: 'bg-orange-50' 
    },
    collaboration_started: { 
      icon: Activity, 
      label: 'Colaboraciones', 
      color: 'text-indigo-600', 
      bgColor: 'bg-indigo-50' 
    }
  };

  // Calculate trend for activities
  const getActivityTrend = () => {
    if (data.activityTimeline.length < 2) return null;
    
    const recent = data.activityTimeline.slice(-3).reduce((acc, item) => acc + item.activityCount, 0);
    const previous = data.activityTimeline.slice(-6, -3).reduce((acc, item) => acc + item.activityCount, 0);
    
    if (previous === 0) return null;
    
    const change = ((recent - previous) / previous) * 100;
    return {
      percentage: Math.abs(Math.round(change)),
      direction: change > 0 ? 'up' : 'down',
      isPositive: change > 0
    };
  };

  const activityTrend = getActivityTrend();

  const EngagementMetric: React.FC<{
    icon: React.ComponentType<any>;
    label: string;
    value: number;
    format?: 'number' | 'percentage';
    color: string;
  }> = ({ icon: Icon, label, value, format = 'number', color }) => (
    <div className="flex items-center space-x-2 p-3 bg-gray-50 rounded-lg">
      <div className={`p-2 rounded-lg ${color} bg-white`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900">
          {format === 'percentage' ? `${value}%` : value.toLocaleString()}
        </p>
        <p className="text-xs text-gray-500 truncate">{label}</p>
      </div>
    </div>
  );

  const WorkspaceRow: React.FC<{ workspace: WorkspaceData }> = ({ workspace }) => {
    const [showDetails, setShowDetails] = useState(false);
    const totalActivities = Object.values(workspace.activityTypes).reduce((a, b) => a + b, 0);
    
    return (
      <div className="border rounded-lg overflow-hidden">
        <div 
          className="p-4 cursor-pointer hover:bg-gray-50 transition-colors"
          onClick={() => {
            setShowDetails(!showDetails);
            onWorkspaceClick?.(workspace.workspaceId);
          }}
        >
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-medium text-gray-900 truncate">
                {workspace.workspaceName}
              </h4>
              <p className="text-xs text-gray-500 mt-1">
                {workspace.uniqueParticipants} participantes activos
              </p>
            </div>
            <div className="flex items-center space-x-4">
              <div className="text-right">
                <p className="text-sm font-semibold text-gray-900">
                  {totalActivities}
                </p>
                <p className="text-xs text-gray-500">actividades</p>
              </div>
              {activityTrend && (
                <div className={`flex items-center text-xs ${
                  activityTrend.isPositive ? 'text-green-600' : 'text-red-600'
                }`}>
                  {activityTrend.direction === 'up' ? (
                    <TrendingUp className="w-3 h-3 mr-1" />
                  ) : (
                    <TrendingDown className="w-3 h-3 mr-1" />
                  )}
                  {activityTrend.percentage}%
                </div>
              )}
            </div>
          </div>
        </div>
        
        {showDetails && (
          <div className="px-4 pb-4 border-t bg-gray-50">
            <div className="mt-3 space-y-2">
              <h5 className="text-xs font-medium text-gray-700 mb-2">
                Tipos de Actividad
              </h5>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(workspace.activityTypes).map(([type, count]) => {
                  const config = activityTypeConfig[type as keyof typeof activityTypeConfig];
                  if (!config || count === 0) return null;
                  
                  const Icon = config.icon;
                  return (
                    <div key={type} className="flex items-center space-x-2 text-xs">
                      <Icon className={`w-3 h-3 ${config.color}`} />
                      <span className="text-gray-600">{config.label}:</span>
                      <span className="font-medium text-gray-900">{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            
            {workspace.recentActivity && workspace.recentActivity.length > 0 && (
              <div className="mt-4">
                <h5 className="text-xs font-medium text-gray-700 mb-2">
                  Actividad Reciente
                </h5>
                <div className="space-y-1">
                  {workspace.recentActivity.slice(0, 3).map(activity => (
                    <div key={activity.id} className="flex items-center justify-between text-xs">
                      <span className="text-gray-600 truncate flex-1">
                        <span className="font-medium">{activity.userName}</span> {activity.title}
                      </span>
                      <span className="text-gray-400 ml-2">
                        {new Date(activity.timestamp).toLocaleTimeString([], { 
                          hour: '2-digit', 
                          minute: '2-digit' 
                        })}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const mainContent = (
    <div className="h-full space-y-4">
      {/* Header with real-time indicator */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Activity className="w-5 h-5 text-gray-600" />
          <h3 className="font-medium text-gray-900">Actividad Colaborativa</h3>
          {isLiveMode && (
            <div className="flex items-center space-x-1">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <span className="text-xs text-green-600">En vivo</span>
            </div>
          )}
        </div>
        
        <div className="flex items-center space-x-2">
          <select
            value={selectedTimeframe}
            onChange={(e) => setSelectedTimeframe(e.target.value as any)}
            className="text-xs border-gray-300 rounded px-2 py-1 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="24h">24 horas</option>
            <option value="7d">7 días</option>
            <option value="30d">30 días</option>
          </select>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 gap-3">
        <EngagementMetric
          icon={Activity}
          label="Total de Actividades"
          value={data.totalActivities}
          color="text-blue-600"
        />
        <EngagementMetric
          icon={TrendingUp}
          label="Este Período"
          value={data.activitiesThisPeriod}
          color="text-green-600"
        />
        <EngagementMetric
          icon={Users}
          label="Promedio Participantes"
          value={data.engagementMetrics.averageParticipantsPerActivity}
          format="number"
          color="text-purple-600"
        />
        <EngagementMetric
          icon={MessageCircle}
          label="Volumen de Mensajes"
          value={data.engagementMetrics.messageVolume}
          color="text-orange-600"
        />
      </div>

      {/* Most Active Workspaces */}
      <div>
        <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center">
          <Clock className="w-4 h-4 mr-2" />
          Espacios Más Activos ({data.mostActiveWorkspaces.length})
        </h4>
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {data.mostActiveWorkspaces.length > 0 ? (
            data.mostActiveWorkspaces.map(workspace => (
              <WorkspaceRow key={workspace.workspaceId} workspace={workspace} />
            ))
          ) : (
            <div className="text-center py-8 text-gray-500">
              <Activity className="w-8 h-8 mx-auto mb-2 text-gray-300" />
              <p className="text-sm">No hay actividad colaborativa registrada</p>
              <p className="text-xs mt-1">
                Los espacios colaborativos aparecerán aquí cuando haya actividad
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const expandedContent = (
    <div className="space-y-4">
      <h4 className="text-sm font-semibold text-gray-700">Análisis Detallado de Actividad</h4>
      
      {/* Activity Timeline Chart Placeholder */}
      <div className="bg-white border rounded-lg p-4">
        <h5 className="text-sm font-medium text-gray-700 mb-3">
          Línea de Tiempo de Actividad
        </h5>
        <div className="h-32 bg-gray-50 rounded-lg flex items-center justify-center text-sm text-gray-500">
          <div className="text-center">
            <TrendingUp className="w-8 h-8 mx-auto mb-2 text-gray-400" />
            <p>Gráfico de actividad disponible próximamente</p>
            <p className="text-xs mt-1">
              {data.activityTimeline.length} puntos de datos disponibles
            </p>
          </div>
        </div>
      </div>

      {/* Detailed Engagement Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white border rounded-lg p-4">
          <h5 className="text-sm font-medium text-gray-700 mb-3">
            Métricas de Participación
          </h5>
          <div className="space-y-3">
            <EngagementMetric
              icon={MessageCircle}
              label="Mensajes Enviados"
              value={data.engagementMetrics.messageVolume}
              color="text-blue-600"
            />
            <EngagementMetric
              icon={FileText}
              label="Documentos Compartidos"
              value={data.engagementMetrics.documentShares}
              color="text-green-600"
            />
            <EngagementMetric
              icon={Calendar}
              label="Asistencia a Reuniones"
              value={data.engagementMetrics.meetingAttendance}
              format="percentage"
              color="text-purple-600"
            />
          </div>
        </div>

        <div className="bg-white border rounded-lg p-4">
          <h5 className="text-sm font-medium text-gray-700 mb-3">
            Patrones de Colaboración
          </h5>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Espacios Activos:</span>
              <span className="font-medium">
                {data.mostActiveWorkspaces.length}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Promedio Actividades/Espacio:</span>
              <span className="font-medium">
                {data.mostActiveWorkspaces.length > 0 
                  ? Math.round(data.totalActivities / data.mostActiveWorkspaces.length)
                  : 0
                }
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Participación Promedio:</span>
              <span className="font-medium">
                {data.engagementMetrics.averageParticipantsPerActivity}
              </span>
            </div>
            {activityTrend && (
              <div className="flex justify-between">
                <span className="text-gray-600">Tendencia:</span>
                <span className={`font-medium flex items-center ${
                  activityTrend.isPositive ? 'text-green-600' : 'text-red-600'
                }`}>
                  {activityTrend.direction === 'up' ? (
                    <TrendingUp className="w-3 h-3 mr-1" />
                  ) : (
                    <TrendingDown className="w-3 h-3 mr-1" />
                  )}
                  {activityTrend.isPositive ? '+' : '-'}{activityTrend.percentage}%
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Recommendations */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h5 className="text-sm font-medium text-blue-900 mb-2">
          💡 Recomendaciones para Mejorar la Colaboración
        </h5>
        <div className="space-y-2 text-sm text-blue-800">
          {data.engagementMetrics.averageParticipantsPerActivity < 3 && (
            <p>• Considerar actividades que fomenten la participación grupal</p>
          )}
          {data.engagementMetrics.documentShares < 10 && (
            <p>• Promover el intercambio de recursos y documentos entre usuarios</p>
          )}
          {data.mostActiveWorkspaces.length < 3 && (
            <p>• Crear más espacios colaborativos temáticos para aumentar la participación</p>
          )}
          <p>• Reconocer y destacar las comunidades más activas como ejemplo</p>
        </div>
      </div>
    </div>
  );

  return (
    <DashboardCard
      id="workspace-activity"
      type="workspace-activity"
      title="Actividad en Espacios Colaborativos"
      subtitle={`${data.totalActivities} actividades registradas`}
      size="large"
      priority="medium"
      loading={loading}
      error={error}
      onRefresh={onRefresh}
      lastUpdated={lastUpdated}
      expandable={true}
      defaultExpanded={false}
      expandedContent={expandedContent}
      isEmpty={data.totalActivities === 0}
      ariaLabel="Workspace activity dashboard card showing collaborative engagement metrics"
    >
      {mainContent}
    </DashboardCard>
  );
};

export default WorkspaceActivityCard;