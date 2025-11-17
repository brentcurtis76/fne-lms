/**
 * Activity Feed System Utilities
 * Phase 5 of Collaborative Workspace System for FNE LMS
 * Following established patterns from messagingUtils-simple.ts and documentUtils.ts
 */

import { supabase } from '../lib/supabase-wrapper';
import {
  ActivityFeed,
  ActivityWithDetails,
  ActivityFilters,
  ActivitySubscription,
  ActivityAggregation,
  ActivityCreateRequest,
  ActivityUpdateRequest,
  SubscriptionUpdateRequest,
  ActivityFeedResponse,
  ActivityStats,
  ActivityGrouped,
  ActivityPermissions,
  ActivityType,
  EntityType,
  NotificationMethod,
  ActivityRealtimeSubscription,
  ActivityRealtimePayload,
  ACTIVITY_TYPE_CONFIG,
  DEFAULT_ACTIVITY_FILTERS,
  TopUser
} from '../types/activity';

// =============================================================================
// ACTIVITY FEED CRUD OPERATIONS
// =============================================================================

/**
 * Get activity feed with pagination and filtering
 */
export async function getActivityFeed(
  workspaceId: string,
  options: {
    filters?: Partial<ActivityFilters>;
    userId?: string;
    limit?: number;
    offset?: number;
    includeStats?: boolean;
  } = {}
): Promise<ActivityFeedResponse> {
  const {
    filters = {},
    userId = null,
    limit = 50,
    offset = 0,
    includeStats = true
  } = options;

  // TEMPORARILY DISABLE API CALLS - Return empty data to stop console errors
  console.warn('Activity Feed API calls temporarily disabled to prevent console errors');
  return {
    activities: [],
    total_count: 0,
    has_more: false,
    next_offset: 0,
    stats: {
      total_activities: 0,
      activities_today: 0,
      activities_this_week: 0,
      most_active_type: null,
      most_active_user: null,
      engagement_trend: 'stable',
      peak_hours: []
    }
  };

  const mergedFilters = { ...DEFAULT_ACTIVITY_FILTERS, ...filters };

  try {
    // Build query with filters
    let query = supabase
      .from('activity_feed')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('is_public', true)
      .order('created_at', { ascending: false });

    // Apply filters
    if (mergedFilters.activity_types.length > 0) {
      query = query.in('activity_type', mergedFilters.activity_types);
    }

    if (mergedFilters.entity_types.length > 0) {
      query = query.in('entity_type', mergedFilters.entity_types);
    }

    if (mergedFilters.users.length > 0) {
      query = query.in('user_id', mergedFilters.users);
    }

    if (mergedFilters.importance_levels.length > 0 && mergedFilters.importance_levels.length < 5) {
      query = query.in('importance_score', mergedFilters.importance_levels);
    }

    if (!mergedFilters.include_system) {
      query = query.eq('is_system', false);
    }

    if (mergedFilters.date_range.start) {
      query = query.gte('created_at', mergedFilters.date_range.start);
    }

    if (mergedFilters.date_range.end) {
      query = query.lte('created_at', mergedFilters.date_range.end);
    }

    if (mergedFilters.search_query) {
      query = query.or(`title.ilike.%${mergedFilters.search_query}%,description.ilike.%${mergedFilters.search_query}%`);
    }

    // Filter by user for personal view
    if (mergedFilters.view_mode === 'personal' && userId) {
      query = query.eq('user_id', userId);
    }

    // Apply pagination
    query = query.range(offset, offset + limit - 1);

    const { data: activities, error } = await query;

    if (error) {
      // Gracefully handle missing tables or bad requests
      if (error?.code === '42P01' || error?.message?.includes('does not exist')) {
        console.warn('Activity feed table not found - feature not yet implemented');
      } else {
        console.error('Error fetching activity feed:', error);
      }
      return {
        activities: [],
        total_count: 0,
        has_more: false,
        next_offset: 0,
        stats: {
          total_activities: 0,
          activities_today: 0,
          activities_this_week: 0,
          most_active_type: null,
          most_active_user: null,
          engagement_trend: 'stable',
          peak_hours: []
        }
      };
    }

    // Transform activities with additional details
    const activitiesWithDetails: ActivityWithDetails[] = activities?.map((activity) => {
      const activityData = activity as ActivityFeed;
      return {
        ...activityData,
        user_name: 'Usuario',
        user_email: '',
        user_avatar: null,
        user_role: 'docente',
        time_ago: formatTimeAgo(activityData.created_at),
        is_recent: isRecentActivity(activityData.created_at),
        can_edit: false,
        can_delete: false,
        entity_url: generateEntityUrl(activityData.entity_type, activityData.entity_id),
        activity_icon: getActivityIcon(activityData.activity_type),
        activity_color: getActivityColor(activityData.activity_type)
      };
    }) || [];

    // Get total count for pagination
    const { count: totalCount } = await supabase
      .from('activity_feed')
      .select('*', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .eq('is_public', true);

    // Get stats if requested
    let stats: ActivityStats | null = null;
    if (includeStats) {
      stats = await getActivityStats(workspaceId);
    }

    return {
      activities: activitiesWithDetails,
      total_count: totalCount || 0,
      has_more: (offset + limit) < (totalCount || 0),
      next_offset: offset + limit,
      stats: stats || {
        total_activities: 0,
        activities_today: 0,
        activities_this_week: 0,
        most_active_type: null,
        most_active_user: null,
        engagement_trend: 'stable',
        peak_hours: []
      }
    };

  } catch (error) {
    console.error('Error in getActivityFeed:', error);
    throw error;
  }
}

/**
 * Create a new activity
 */
export async function createActivity(request: ActivityCreateRequest): Promise<ActivityFeed> {
  // Validate required fields
  if (!request.workspace_id || !request.activity_type || !request.entity_type) {
    throw new Error('Missing required fields for activity creation');
  }

  try {
    const { data, error } = await supabase.rpc('create_activity', {
      p_workspace_id: request.workspace_id,
      p_user_id: request.user_id || null,
      p_activity_type: request.activity_type,
      p_entity_type: request.entity_type,
      p_entity_id: request.entity_id || null,
      p_title: request.title || null,
      p_description: request.description || null,
      p_metadata: request.metadata || {},
      p_importance_score: request.importance_score || ACTIVITY_TYPE_CONFIG[request.activity_type]?.default_importance || 1,
      p_tags: request.tags || [],
      p_related_users: request.related_users || []
    });

    if (error) {
      // Gracefully handle missing functions or tables
      if (error?.code === '42883' || error?.message?.includes('function') || error?.message?.includes('does not exist')) {
        console.warn('Activity creation function not found - feature not yet implemented');
        throw new Error('Activity creation feature not yet implemented');
      } else {
        console.error('Error creating activity:', error);
        throw error;
      }
    }

    // Fetch the created activity with full details
    const { data: activity, error: fetchError } = await supabase
      .from('activity_feed')
      .select('*')
      .eq('id', data)
      .single();

    if (fetchError) {
      console.error('Error fetching created activity:', fetchError);
      throw fetchError;
    }

    return activity;

  } catch (error) {
    console.error('Error in createActivity:', error);
    throw error;
  }
}

/**
 * Update an existing activity
 */
export async function updateActivity(
  activityId: string,
  request: ActivityUpdateRequest
): Promise<ActivityFeed> {
  try {
    const { data, error } = await supabase
      .from('activity_feed')
      .update({
        ...request,
        updated_at: new Date().toISOString()
      })
      .eq('id', activityId)
      .select()
      .single();

    if (error) {
      console.error('Error updating activity:', error);
      throw error;
    }

    return data;

  } catch (error) {
    console.error('Error in updateActivity:', error);
    throw error;
  }
}

/**
 * Delete an activity
 */
export async function deleteActivity(activityId: string): Promise<void> {
  try {
    const { error } = await supabase
      .from('activity_feed')
      .delete()
      .eq('id', activityId);

    if (error) {
      console.error('Error deleting activity:', error);
      throw error;
    }

  } catch (error) {
    console.error('Error in deleteActivity:', error);
    throw error;
  }
}

// =============================================================================
// ACTIVITY GROUPING AND AGGREGATION
// =============================================================================

/**
 * Group activities by date
 */
export function groupActivitiesByDate(activities: ActivityWithDetails[]): ActivityGrouped[] {
  const grouped = activities.reduce((acc, activity) => {
    const date = new Date(activity.created_at).toDateString();
    
    if (!acc[date]) {
      acc[date] = {
        date,
        date_formatted: formatDate(activity.created_at),
        activities: [],
        total_count: 0,
        unique_users: 0,
        most_active_user: null
      };
    }
    
    acc[date].activities.push(activity);
    acc[date].total_count++;
    
    return acc;
  }, {} as Record<string, ActivityGrouped>);

  // Calculate additional stats for each group
  Object.values(grouped).forEach(group => {
    const userCounts = group.activities.reduce((acc, activity) => {
      if (activity.user_id) {
        acc[activity.user_id] = (acc[activity.user_id] || 0) + 1;
      }
      return acc;
    }, {} as Record<string, number>);

    group.unique_users = Object.keys(userCounts).length;

    // Find most active user
    const mostActive = Object.entries(userCounts).reduce((max, [userId, count]) => {
      if (count > max.count) {
        const user = group.activities.find(a => a.user_id === userId);
        return {
          name: user?.user_name || 'Usuario desconocido',
          count
        };
      }
      return max;
    }, { name: '', count: 0 });

    group.most_active_user = mostActive.count > 0 ? mostActive : null;
  });

  return Object.values(grouped).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

/**
 * Get activity statistics for a workspace
 */
export async function getActivityStats(workspaceId: string): Promise<ActivityStats> {
  // TEMPORARILY DISABLE API CALLS - Return empty stats to stop console errors
  console.warn('Activity Stats API calls temporarily disabled to prevent console errors');
  return {
    total_activities: 0,
    activities_today: 0,
    activities_this_week: 0,
    most_active_type: null,
    most_active_user: null,
    engagement_trend: 'stable',
    peak_hours: []
  };

  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Get total activities
    const { count: totalActivities } = await supabase
      .from('activity_feed')
      .select('*', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId);

    // Get today's activities
    const { count: activitiesThisDay } = await supabase
      .from('activity_feed')
      .select('*', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .gte('created_at', todayStart.toISOString());

    // Get this week's activities
    const { count: activitiesThisWeek } = await supabase
      .from('activity_feed')
      .select('*', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .gte('created_at', weekStart.toISOString());

    // Get most active type
    const { data: activityTypeCounts } = await supabase
      .from('activity_feed')
      .select('activity_type')
      .eq('workspace_id', workspaceId)
      .gte('created_at', weekStart.toISOString());

    const typeCounts = activityTypeCounts?.reduce((acc, { activity_type }) => {
      acc[activity_type] = (acc[activity_type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>) || {};

    const mostActiveType = Object.entries(typeCounts).reduce((max, [type, count]) => {
      return (count as number) > max.count ? { type: type as ActivityType, count: count as number } : max;
    }, { type: null as ActivityType | null, count: 0 });

    // Get most active user
    const { data: userCounts } = await supabase
      .from('activity_feed')
      .select('user_id')
      .eq('workspace_id', workspaceId)
      .gte('created_at', weekStart.toISOString())
      .not('user_id', 'is', null);

    const userActivityCounts = userCounts?.reduce((acc, item) => {
      const userData = item as any;
      const userId = userData.user_id!;
      if (!acc[userId]) {
        acc[userId] = {
          user_id: userId,
          count: 0,
          name: 'Usuario',
          email: ''
        };
      }
      acc[userId].count++;
      return acc;
    }, {} as Record<string, any>) || {};

    const mostActiveUser = Object.values(userActivityCounts).reduce((max: any, user: any) => {
      return user.count > max.count ? user : max;
    }, { count: 0 });

    // Calculate engagement trend (simplified)
    const lastWeekStart = new Date(weekStart.getTime() - 7 * 24 * 60 * 60 * 1000);
    const { count: lastWeekActivities } = await supabase
      .from('activity_feed')
      .select('*', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .gte('created_at', lastWeekStart.toISOString())
      .lt('created_at', weekStart.toISOString());

    let engagementTrend: 'up' | 'down' | 'stable' = 'stable';
    if ((activitiesThisWeek || 0) > (lastWeekActivities || 0)) {
      engagementTrend = 'up';
    } else if ((activitiesThisWeek || 0) < (lastWeekActivities || 0)) {
      engagementTrend = 'down';
    }

    // Get peak hours (simplified - just return common active hours)
    const peakHours = [9, 10, 11, 14, 15, 16]; // Common work hours

    return {
      total_activities: totalActivities || 0,
      activities_today: activitiesThisDay || 0,
      activities_this_week: activitiesThisWeek || 0,
      most_active_type: mostActiveType.type,
      most_active_user: (mostActiveUser as any).count > 0 ? (mostActiveUser as TopUser) : {} as TopUser,
      engagement_trend: engagementTrend,
      peak_hours: peakHours
    };

  } catch (error) {
    // Gracefully handle errors
    console.warn('Error getting activity stats, returning defaults:', error);
    return {
      total_activities: 0,
      activities_today: 0,
      activities_this_week: 0,
      most_active_type: null,
      most_active_user: null,
      engagement_trend: 'stable',
      peak_hours: []
    };
  }
}

// =============================================================================
// SUBSCRIPTION MANAGEMENT
// =============================================================================

/**
 * Get user's activity subscription preferences
 */
export async function getActivitySubscription(
  userId: string,
  workspaceId: string
): Promise<ActivitySubscription | null> {
  // TEMPORARILY DISABLE API CALLS
  console.warn('Activity Subscription API calls temporarily disabled');
  return null;
  
  try {
    const { data, error } = await supabase
      .from('activity_subscriptions')
      .select('*')
      .eq('user_id', userId)
      .eq('workspace_id', workspaceId)
      .single();

    if (error && error.code !== 'PGRST116') { // Not found error
      console.error('Error fetching activity subscription:', error);
      throw error;
    }

    return data || null;

  } catch (error) {
    console.error('Error in getActivitySubscription:', error);
    throw error;
  }
}

/**
 * Update user's activity subscription preferences
 */
export async function updateActivitySubscription(
  userId: string,
  workspaceId: string,
  request: SubscriptionUpdateRequest
): Promise<ActivitySubscription> {
  try {
    const { data, error } = await supabase
      .from('activity_subscriptions')
      .upsert({
        user_id: userId,
        workspace_id: workspaceId,
        ...request,
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error('Error updating activity subscription:', error);
      throw error;
    }

    return data;

  } catch (error) {
    console.error('Error in updateActivitySubscription:', error);
    throw error;
  }
}

// =============================================================================
// REAL-TIME SUBSCRIPTIONS
// =============================================================================

/**
 * Subscribe to real-time activity updates
 */
export function subscribeToActivityFeed(
  subscription: ActivityRealtimeSubscription
): () => void {
  const channel = supabase
    .channel(`activity_feed:${subscription.workspace_id}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'activity_feed',
        filter: `workspace_id=eq.${subscription.workspace_id}`
      },
      (payload) => {
        subscription.callback(payload as unknown as ActivityRealtimePayload);
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

// =============================================================================
// PERMISSION UTILITIES
// =============================================================================

/**
 * Get user's activity permissions for a workspace
 */
export async function getActivityPermissions(
  userId: string,
  workspaceId: string
): Promise<ActivityPermissions> {
  // TEMPORARILY DISABLE API CALLS
  console.warn('Activity Permissions API calls temporarily disabled');
  return {
    can_view_all: false,
    can_create: true,
    can_edit_own: true,
    can_edit_any: false,
    can_delete_own: false,
    can_delete_any: false,
    can_manage_subscriptions: true,
    can_view_analytics: false,
    can_export: false,
    max_importance_create: 2
  };
  
  try {
    // Get user role and community assignments
    const { data: userProfile } = await supabase
      .from('profiles')
      .select('role')
      .eq('user_id', userId)
      .single();

    const { data: assignment } = await supabase
      .from('user_community_assignments')
      .select('role')
      .eq('user_id', userId)
      .eq('community_id', workspaceId)
      .single();

    const role = userProfile?.role || 'docente';
    const communityRole = assignment?.role || 'docente';

    const isAdmin = role === 'admin';
    const isCommunityLeader = communityRole === 'lider_comunidad';
    const isConsultant = role === 'consultant';

    return {
      can_view_all: isAdmin || isCommunityLeader,
      can_create: true,
      can_edit_own: true,
      can_edit_any: isAdmin || isCommunityLeader,
      can_delete_own: true,
      can_delete_any: isAdmin,
      can_manage_subscriptions: true,
      can_view_analytics: isAdmin || isCommunityLeader,
      can_export: isAdmin || isCommunityLeader,
      max_importance_create: isAdmin ? 5 : isCommunityLeader ? 4 : 3
    };

  } catch (error) {
    console.error('Error getting activity permissions:', error);
    return {
      can_view_all: false,
      can_create: true,
      can_edit_own: true,
      can_edit_any: false,
      can_delete_own: false,
      can_delete_any: false,
      can_manage_subscriptions: true,
      can_view_analytics: false,
      can_export: false,
      max_importance_create: 2
    };
  }
}

/**
 * Check if user can edit activity
 */
async function canEditActivity(activity: ActivityFeed, userId?: string): Promise<boolean> {
  if (!userId) return false;
  
  const permissions = await getActivityPermissions(userId, activity.workspace_id);
  return permissions.can_edit_any || (permissions.can_edit_own && activity.user_id === userId);
}

/**
 * Check if user can delete activity
 */
async function canDeleteActivity(activity: ActivityFeed, userId?: string): Promise<boolean> {
  if (!userId) return false;
  
  const permissions = await getActivityPermissions(userId, activity.workspace_id);
  return permissions.can_delete_any || (permissions.can_delete_own && activity.user_id === userId);
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Format time ago string
 */
function formatTimeAgo(timestamp: string): string {
  const now = new Date();
  const time = new Date(timestamp);
  const diffInSeconds = Math.floor((now.getTime() - time.getTime()) / 1000);

  if (diffInSeconds < 60) {
    return 'hace unos segundos';
  } else if (diffInSeconds < 3600) {
    const minutes = Math.floor(diffInSeconds / 60);
    return `hace ${minutes} minuto${minutes > 1 ? 's' : ''}`;
  } else if (diffInSeconds < 86400) {
    const hours = Math.floor(diffInSeconds / 3600);
    return `hace ${hours} hora${hours > 1 ? 's' : ''}`;
  } else if (diffInSeconds < 604800) {
    const days = Math.floor(diffInSeconds / 86400);
    return `hace ${days} día${days > 1 ? 's' : ''}`;
  } else {
    const weeks = Math.floor(diffInSeconds / 604800);
    return `hace ${weeks} semana${weeks > 1 ? 's' : ''}`;
  }
}

/**
 * Check if activity is recent (within last hour)
 */
function isRecentActivity(timestamp: string): boolean {
  const now = new Date();
  const time = new Date(timestamp);
  const diffInHours = (now.getTime() - time.getTime()) / (1000 * 60 * 60);
  return diffInHours <= 1;
}

/**
 * Format date for display
 */
function formatDate(timestamp: string): string {
  const date = new Date(timestamp);
  const today = new Date();
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);

  if (date.toDateString() === today.toDateString()) {
    return 'Hoy';
  } else if (date.toDateString() === yesterday.toDateString()) {
    return 'Ayer';
  } else {
    return date.toLocaleDateString('es-CL', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }
}

/**
 * Generate entity URL for navigation
 */
function generateEntityUrl(entityType: EntityType, entityId: string | null): string | null {
  if (!entityId) return null;

  switch (entityType) {
    case 'meeting':
      return `/community/workspace?tab=meetings&meeting=${entityId}`;
    case 'document':
      return `/community/workspace?tab=documents&document=${entityId}`;
    case 'message':
      return `/community/workspace?tab=messaging&message=${entityId}`;
    case 'thread':
      return `/community/workspace?tab=messaging&thread=${entityId}`;
    default:
      return null;
  }
}

/**
 * Get activity icon
 */
function getActivityIcon(activityType: ActivityType): string {
  return ACTIVITY_TYPE_CONFIG[activityType]?.icon || '📝';
}

/**
 * Get activity color
 */
function getActivityColor(activityType: ActivityType): string {
  return ACTIVITY_TYPE_CONFIG[activityType]?.color || '#6b7280';
}

/**
 * Search activities
 */
export async function searchActivities(
  workspaceId: string,
  query: string,
  options: {
    limit?: number;
    filters?: Partial<ActivityFilters>;
  } = {}
): Promise<ActivityWithDetails[]> {
  const { limit = 20, filters = {} } = options;

  try {
    const { data, error } = await supabase
      .from('activity_feed')
      .select('*')
      .eq('workspace_id', workspaceId)
      .or(`title.ilike.%${query}%,description.ilike.%${query}%`)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error searching activities:', error);
      throw error;
    }

    return data?.map(activity => {
      const activityData = activity as ActivityFeed;
      return {
        ...activityData,
        user_name: 'Usuario',
        user_email: '',
        user_avatar: null,
        user_role: 'docente',
        time_ago: formatTimeAgo(activityData.created_at),
        is_recent: isRecentActivity(activityData.created_at),
        can_edit: false,
        can_delete: false,
        entity_url: generateEntityUrl(activityData.entity_type, activityData.entity_id),
        activity_icon: getActivityIcon(activityData.activity_type),
        activity_color: getActivityColor(activityData.activity_type)
      };
    }) || [];

  } catch (error) {
    console.error('Error in searchActivities:', error);
    throw error;
  }
}