/**
 * ActivityFeed Component
 * Main timeline component with infinite scroll and real-time subscriptions
 * Phase 5 of Collaborative Workspace System for FNE LMS
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'react-hot-toast';
import { RefreshCw, Filter, Search, Calendar, Users, TrendingUp } from 'lucide-react';
import {
  ActivityWithDetails,
  ActivityFilters,
  ActivityGrouped,
  ActivityFeedProps,
  ActivityStats,
  ActivityRealtimePayload,
  DEFAULT_ACTIVITY_FILTERS
} from '../../types/activity';
import {
  getActivityFeed,
  groupActivitiesByDate,
  subscribeToActivityFeed,
  getActivityPermissions
} from '../../utils/activityUtils';
import { useAuth } from '../../hooks/useAuth';
import ActivityCard from './ActivityCard';
import ActivityFiltersComponent from './ActivityFilters';
import ActivitySummary from './ActivitySummary';
import LoadingSkeleton from '../common/LoadingSkeleton';

const ActivityFeed: React.FC<ActivityFeedProps> = ({
  workspaceId,
  userId = null,
  filters = {},
  realTimeEnabled = true,
  showGrouping = true,
  showFilters = true,
  showStats = false,
  pageSize = 50,
  className = ''
}) => {
  const { user } = useAuth();
  const currentUserId = user?.id || '';
  
  // State management
  const [activities, setActivities] = useState<ActivityWithDetails[]>([]);
  const [groupedActivities, setGroupedActivities] = useState<ActivityGrouped[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [activeFilters, setActiveFilters] = useState<ActivityFilters>({
    ...DEFAULT_ACTIVITY_FILTERS,
    ...filters
  });
  const [stats, setStats] = useState<ActivityStats | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const [showFiltersPanel, setShowFiltersPanel] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [availableUsers, setAvailableUsers] = useState<Array<{
    id: string;
    name: string;
    email: string;
    role: string;
  }>>([]);

  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const realtimeUnsubscribeRef = useRef<(() => void) | null>(null);

  // Load initial activities
  const loadActivities = useCallback(async (reset = false) => {
    // Safety check for workspace ID
    if (!workspaceId) {
      console.warn('ActivityFeed: No workspace ID provided, skipping load');
      setLoading(false);
      setLoadingMore(false);
      return;
    }

    try {
      if (reset) {
        setLoading(true);
        setOffset(0);
      } else {
        setLoadingMore(true);
      }

      const currentOffset = reset ? 0 : offset;
      const response = await getActivityFeed(workspaceId, {
        filters: activeFilters,
        userId: activeFilters.view_mode === 'personal' ? currentUserId : undefined,
        limit: pageSize,
        offset: currentOffset,
        includeStats: showStats && reset
      });

      if (reset) {
        setActivities(response.activities);
        if (showStats) {
          setStats(response.stats);
        }
      } else {
        setActivities(prev => [...prev, ...response.activities]);
      }

      setHasMore(response.has_more);
      setOffset(response.next_offset);

    } catch (error) {
      console.warn('Failed to load activities, using empty state:', error);
      // Don't show toast error for missing features
      if (reset) {
        setActivities([]);
        if (showStats) {
          setStats({
            total_activities: 0,
            activities_today: 0,
            activities_this_week: 0,
            most_active_type: null,
            most_active_user: null,
            engagement_trend: 'stable',
            peak_hours: []
          });
        }
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [workspaceId, pageSize, showStats]); // Removed activeFilters and offset to prevent loops

  // Group activities by date
  useEffect(() => {
    if (showGrouping) {
      setGroupedActivities(groupActivitiesByDate(activities));
    }
  }, [activities, showGrouping]);

  // Load activities on mount and filter changes
  useEffect(() => {
    if (workspaceId) {
      loadActivities(true);
    }
  }, [JSON.stringify(activeFilters), workspaceId]); // Use JSON.stringify to prevent unnecessary re-renders

  // Real-time subscription
  useEffect(() => {
    if (!realTimeEnabled || !workspaceId) return;

    const unsubscribe = subscribeToActivityFeed({
      workspace_id: workspaceId,
      user_id: currentUserId,
      filters: activeFilters,
      callback: (payload: ActivityRealtimePayload) => {
        if (payload.eventType === 'INSERT' && payload.new) {
          // Add new activity to the top
          setActivities(prev => {
            const exists = prev.find(a => a.id === payload.new!.id);
            if (exists) return prev;
            
            // Convert to ActivityWithDetails format
            const newActivity: ActivityWithDetails = {
              ...payload.new!,
              user_name: 'Usuario',
              user_email: '',
              user_avatar: null,
              user_role: 'docente',
              time_ago: 'ahora',
              is_recent: true,
              can_edit: false,
              can_delete: false,
              entity_url: null,
              activity_icon: '📝',
              activity_color: '#6b7280'
            };
            
            return [newActivity, ...prev];
          });
          
          // Show notification for important activities
          if (payload.new.importance_score >= 3) {
            toast.success('Nueva actividad importante', {
              icon: '🔔',
              duration: 4000
            });
          }
        }
      }
    });

    realtimeUnsubscribeRef.current = unsubscribe;

    return () => {
      if (realtimeUnsubscribeRef.current) {
        realtimeUnsubscribeRef.current();
      }
    };
  }, [workspaceId, currentUserId, activeFilters, realTimeEnabled]);

  // Infinite scroll
  const handleScroll = useCallback(() => {
    if (!containerRef.current || loadingMore || !hasMore) return;

    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    if (scrollTop + clientHeight >= scrollHeight - 200) {
      loadActivities(false);
    }
  }, [loadActivities, loadingMore, hasMore]);

  useEffect(() => {
    const container = containerRef.current;
    if (container) {
      container.addEventListener('scroll', handleScroll);
      return () => container.removeEventListener('scroll', handleScroll);
    }
  }, [handleScroll]);

  // Handle filter changes
  const handleFiltersChange = useCallback((newFilters: ActivityFilters) => {
    setActiveFilters(newFilters);
  }, []);

  // Handle refresh
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadActivities(true);
    setRefreshing(false);
    toast.success('Feed actualizado');
  }, [loadActivities]);

  // Handle activity card actions
  const handleActivityClick = useCallback((activity: ActivityWithDetails) => {
    if (activity.entity_url) {
      window.location.href = activity.entity_url;
    }
  }, []);

  const handleUserClick = useCallback((userId: string) => {
    // Navigate to user profile or filter by user
    setActiveFilters(prev => ({
      ...prev,
      users: [userId],
      view_mode: 'all'
    }));
  }, []);

  const handleEntityClick = useCallback((entityType: string, entityId: string) => {
    // Navigate to entity or show details
    console.log('Navigate to:', entityType, entityId);
  }, []);

  if (loading) {
    return (
      <div className={`space-y-4 ${className}`}>
        <LoadingSkeleton count={5} height="120px" />
      </div>
    );
  }

  const displayActivities = showGrouping ? groupedActivities : null;
  const flatActivities = showGrouping ? [] : activities;

  return (
    <div className={`activity-feed ${className}`}>
      {/* Header with stats and controls */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-6">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-bold text-[#00365b]">
            Feed de Actividades
          </h2>
          
          {stats && (
            <div className="flex items-center gap-6 text-sm text-gray-600">
              <div className="flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                <span>{stats.activities_today} hoy</span>
              </div>
              <div className="flex items-center gap-1">
                <Users className="w-4 h-4" />
                <span>{stats.activities_this_week} esta semana</span>
              </div>
              <div className="flex items-center gap-1">
                <TrendingUp className="w-4 h-4" />
                <span className={`font-medium ${
                  stats.engagement_trend === 'up' ? 'text-green-600' : 
                  stats.engagement_trend === 'down' ? 'text-red-600' : 'text-gray-600'
                }`}>
                  {stats.engagement_trend === 'up' ? '↗️' : 
                   stats.engagement_trend === 'down' ? '↘️' : '→'} Engagement
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {showFilters && (
            <button
              onClick={() => setShowFiltersPanel(!showFiltersPanel)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
                showFiltersPanel 
                  ? 'bg-[#00365b] text-white border-[#00365b]' 
                  : 'bg-white text-gray-700 border-gray-300 hover:border-[#fdb933]'
              }`}
            >
              <Filter className="w-4 h-4" />
              <span className="hidden sm:inline">Filtros</span>
            </button>
          )}
          
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 hover:border-[#fdb933] transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Actualizar</span>
          </button>
        </div>
      </div>

      {/* Stats Summary */}
      {showStats && stats && (
        <div className="mb-6">
          <ActivitySummary 
            workspaceId={workspaceId}
            period="today"
            showTrends={true}
            className="mb-4"
          />
        </div>
      )}

      {/* Filters Panel */}
      {showFilters && showFiltersPanel && (
        <div className="mb-6 p-4 bg-gray-50 rounded-lg border">
          <ActivityFiltersComponent
            filters={activeFilters}
            onFiltersChange={handleFiltersChange}
            availableUsers={availableUsers}
            stats={stats || {
              total_activities: 0,
              activities_today: 0,
              activities_this_week: 0,
              most_active_type: null,
              most_active_user: null,
              engagement_trend: 'stable',
              peak_hours: []
            }}
            showAdvanced={true}
          />
        </div>
      )}

      {/* Activity Feed */}
      <div 
        ref={containerRef}
        className="activity-timeline max-h-[70vh] overflow-y-auto space-y-6"
      >
        {/* Grouped view */}
        {showGrouping && displayActivities?.map((group) => (
          <div key={group.date} className="activity-group">
            {/* Date header */}
            <div className="flex items-center gap-4 mb-4">
              <h3 className="text-lg font-semibold text-[#00365b]">
                {group.date_formatted}
              </h3>
              <div className="flex-1 h-px bg-gray-200"></div>
              <div className="flex items-center gap-4 text-sm text-gray-600">
                <span>{group.total_count} actividades</span>
                <span>{group.unique_users} usuarios</span>
                {group.most_active_user && (
                  <span className="text-[#fdb933] font-medium">
                    Más activo: {group.most_active_user.name}
                  </span>
                )}
              </div>
            </div>

            {/* Activities for this date */}
            <div className="space-y-3 ml-4">
              {group.activities.map((activity) => (
                <ActivityCard
                  key={activity.id}
                  activity={activity}
                  showActions={true}
                  showUserInfo={true}
                  showTimestamp={true}
                  onClick={handleActivityClick}
                  onUserClick={handleUserClick}
                  onEntityClick={handleEntityClick}
                />
              ))}
            </div>
          </div>
        ))}

        {/* Flat view */}
        {!showGrouping && flatActivities.map((activity) => (
          <ActivityCard
            key={activity.id}
            activity={activity}
            showActions={true}
            showUserInfo={true}
            showTimestamp={true}
            onClick={handleActivityClick}
            onUserClick={handleUserClick}
            onEntityClick={handleEntityClick}
          />
        ))}

        {/* Empty state */}
        {activities.length === 0 && !loading && (
          <div className="text-center py-12">
            <div className="text-gray-400 mb-4">
              <Search className="w-12 h-12 mx-auto" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              No hay actividades
            </h3>
            <p className="text-gray-600">
              No se encontraron actividades para los filtros seleccionados.
            </p>
          </div>
        )}

        {/* Loading more indicator */}
        {loadingMore && (
          <div className="flex justify-center py-4">
            <div className="flex items-center gap-2 text-gray-600">
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>Cargando más actividades...</span>
            </div>
          </div>
        )}

        {/* End of feed indicator */}
        {!hasMore && activities.length > 0 && (
          <div className="text-center py-6 text-gray-500">
            <div className="text-sm">
              Has llegado al final del feed
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ActivityFeed;