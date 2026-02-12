import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import { toast } from 'react-hot-toast';
import KPISummaryCard from './KPISummaryCard';
import CommunityHealthCard from './CommunityHealthCard';
import WorkspaceActivityCard from './WorkspaceActivityCard';
import UpcomingSessionsCard from './UpcomingSessionsCard';
import DashboardCard from './DashboardCard';
import AdvancedFilters from './AdvancedFilters';
import { Filter, Download, Settings, RefreshCw } from 'lucide-react';
import { supabase } from '../../../lib/supabase';

export interface UnifiedDashboardProps {
  userId: string;
  userRole: string;
  initialFilters?: DashboardFilters;
  onFilterChange?: (filters: DashboardFilters) => void;
}

export interface DashboardFilters {
  timeRange: '7d' | '30d' | '90d' | '1y' | 'custom';
  startDate?: string;
  endDate?: string;
  schoolId?: string;
  generationId?: string;
  communityId?: string;
  courseId?: string;
}

interface DashboardData {
  kpiSummary?: any;
  communityHealth?: any;
  workspaceActivity?: any;
  learningPaths?: any;
  metadata?: {
    userId: string;
    userRole: string;
    generatedAt: string;
    timeRange: string;
    appliedFilters: Record<string, any>;
    permissions: string[];
    loadTimeMs: number;
  };
}

const UnifiedDashboard: React.FC<UnifiedDashboardProps> = ({
  userId,
  userRole,
  initialFilters = { timeRange: '30d' },
  onFilterChange
}) => {
  const router = useRouter();
  const [data, setData] = useState<DashboardData>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<DashboardFilters>(initialFilters);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  // Role-based card configuration
  const getCardConfiguration = useCallback(() => {
    const baseCards = ['kpiSummary'];

    switch (userRole) {
      case 'admin':
        return [...baseCards, 'communityHealth', 'workspaceActivity', 'learningPaths', 'performanceMetrics', 'upcomingSessions'];
      case 'lider_comunidad':
        return [...baseCards, 'communityHealth', 'workspaceActivity', 'upcomingSessions', 'socialLearning'];
      case 'supervisor_de_red':
        return [...baseCards, 'upcomingSessions', 'schoolsOverview', 'communityHealth', 'performanceMetrics'];
      case 'consultor':
        return ['upcomingSessions', ...baseCards, 'learningPaths', 'performanceMetrics', 'workspaceActivity'];
      case 'docente':
        return [...baseCards, 'upcomingSessions', 'courseAnalytics', 'studentProgress'];
      default:
        return [...baseCards, 'upcomingSessions'];
    }
  }, [userRole]);

  // Fetch dashboard data
  const fetchDashboardData = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError(null);
    
    const startTime = Date.now();
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No authentication session');
      }

      // Build query parameters
      const queryParams = new URLSearchParams({
        view: 'overview',
        cards: getCardConfiguration().join(','),
        timeRange: filters.timeRange,
        includeDetails: 'false',
        ...filters.schoolId && { schoolId: filters.schoolId },
        ...filters.generationId && { generationId: filters.generationId },
        ...filters.communityId && { communityId: filters.communityId },
        ...filters.startDate && { startDate: filters.startDate },
        ...filters.endDate && { endDate: filters.endDate }
      });

      const response = await fetch(`/api/dashboard/unified?${queryParams}`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      const dashboardData = await response.json();
      const loadTime = Date.now() - startTime;
      
      setData({
        ...dashboardData,
        metadata: {
          ...dashboardData.metadata,
          loadTimeMs: loadTime
        }
      });
      
      setLastRefresh(new Date());
      
      // Show success toast for manual refreshes
      if (!showLoading && isRefreshing) {
        toast.success('Dashboard actualizado correctamente');
      }

    } catch (err) {
      console.error('Dashboard fetch error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Error al cargar el dashboard';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [filters, getCardConfiguration, isRefreshing]);

  // Handle filter changes
  const handleFilterChange = useCallback((newFilters: Partial<DashboardFilters>) => {
    const updatedFilters = { ...filters, ...newFilters };
    setFilters(updatedFilters);
    onFilterChange?.(updatedFilters);
  }, [filters, onFilterChange]);

  // Handle refresh
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await fetchDashboardData(false);
  }, [fetchDashboardData]);

  // Handle card-specific refresh
  const handleCardRefresh = useCallback(async (cardType: string) => {
    // For now, refresh entire dashboard
    // In future, could implement granular card updates
    await handleRefresh();
  }, [handleRefresh]);

  // Handle card interactions
  const handleCommunityClick = useCallback((communityId: string) => {
    // Navigate to detailed community view
    router.push(`/communities/${communityId}`);
  }, [router]);

  // Initial data fetch
  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // Auto-refresh every 5 minutes for real-time data
  useEffect(() => {
    const interval = setInterval(() => {
      if (!loading) {
        fetchDashboardData(false);
      }
    }, 5 * 60 * 1000); // 5 minutes

    return () => clearInterval(interval);
  }, [fetchDashboardData, loading]);

  if (loading && !data.metadata) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        </div>
        <div className="grid grid-cols-4 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="col-span-2 h-64 bg-gray-100 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const cardConfiguration = getCardConfiguration();

  return (
    <div className="space-y-6">
      {/* Dashboard Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between space-y-4 sm:space-y-0">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Dashboard de Reportes
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            Última actualización: {lastRefresh.toLocaleString('es-CL')}
            {data.metadata?.loadTimeMs && (
              <span className="ml-2 text-gray-400">
                ({data.metadata.loadTimeMs}ms)
              </span>
            )}
          </p>
        </div>
        
        <div className="flex items-center space-x-2">
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className={`
              px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 
              rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500
              disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2
            `}
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>Actualizar</span>
          </button>
          
          <AdvancedFilters
            filters={filters}
            onFiltersChange={handleFilterChange}
            userRole={userRole}
            userId={userId}
            isOpen={showFilters}
            onToggle={() => setShowFilters(!showFilters)}
          />
          
          <button className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 flex items-center space-x-2">
            <Download className="w-4 h-4" />
            <span>Exportar</span>
          </button>
          
          <button className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50">
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center">
            <div className="text-red-600 text-sm">
              <strong>Error:</strong> {error}
            </div>
            <button
              onClick={handleRefresh}
              className="ml-4 text-sm text-red-600 hover:text-red-800 underline"
            >
              Reintentar
            </button>
          </div>
        </div>
      )}

      {/* Dashboard Grid */}
      <div className="grid grid-cols-4 gap-6 auto-rows-max">
        {/* KPI Summary Card - Always First */}
        {cardConfiguration.includes('kpiSummary') && data.kpiSummary && (
          <KPISummaryCard
            data={data.kpiSummary.data}
            trends={data.kpiSummary.trends}
            loading={loading}
            error={!data.kpiSummary ? error : undefined}
            onRefresh={() => handleCardRefresh('kpiSummary')}
            lastUpdated={data.kpiSummary.lastUpdated}
          />
        )}

        {/* Community Health Card */}
        {cardConfiguration.includes('communityHealth') && data.communityHealth && (
          <CommunityHealthCard
            data={data.communityHealth.data}
            insights={data.communityHealth.insights}
            chartData={data.communityHealth.chartData}
            loading={loading}
            error={!data.communityHealth ? error : undefined}
            onRefresh={() => handleCardRefresh('communityHealth')}
            onCommunityClick={handleCommunityClick}
            lastUpdated={data.communityHealth.lastUpdated}
          />
        )}

        {/* Workspace Activity Card */}
        {cardConfiguration.includes('workspaceActivity') && data.workspaceActivity && (
          <WorkspaceActivityCard
            data={data.workspaceActivity.data}
            realTimeUpdates={data.workspaceActivity.realTimeUpdates}
            loading={loading}
            error={!data.workspaceActivity ? error : undefined}
            onRefresh={() => handleCardRefresh('workspaceActivity')}
            onWorkspaceClick={(workspaceId) => {
              // Navigate to workspace detail view
              router.push(`/workspaces/${workspaceId}`);
            }}
            lastUpdated={data.workspaceActivity.lastUpdated}
          />
        )}

        {/* Learning Paths Card */}
        {cardConfiguration.includes('learningPaths') && (
          <DashboardCard
            id="learning-paths"
            type="learning-paths"
            title="Rutas de Aprendizaje"
            subtitle="Progreso en rutas de aprendizaje personalizadas"
            size="medium"
            priority="medium"
            loading={loading}
            error={!data.learningPaths ? 'Próximamente disponible' : undefined}
            onRefresh={() => handleCardRefresh('learningPaths')}
            isEmpty={!data.learningPaths}
          >
            <div className="h-full flex items-center justify-center text-gray-500">
              <div className="text-center">
                <p className="text-sm">Integración disponible próximamente</p>
              </div>
            </div>
          </DashboardCard>
        )}

        {/* Upcoming Sessions Card */}
        {cardConfiguration.includes('upcomingSessions') && (
          <UpcomingSessionsCard />
        )}
      </div>

      {/* Performance Info */}
      {data.metadata && (
        <div className="text-xs text-gray-400 text-center">
          Carga: {data.metadata.loadTimeMs}ms | 
          Filtros: {Object.keys(data.metadata.appliedFilters).length} | 
          Permisos: {data.metadata.permissions.join(', ')}
        </div>
      )}
    </div>
  );
};

export default UnifiedDashboard;
