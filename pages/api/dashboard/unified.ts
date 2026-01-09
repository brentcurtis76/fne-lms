import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { getUserPrimaryRole } from '../../../utils/roleUtils';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface DashboardQuery {
  view?: 'overview' | 'detailed' | 'collaborative' | 'custom';
  cards?: string;
  timeRange?: '7d' | '30d' | '90d' | '1y' | 'custom';
  startDate?: string;
  endDate?: string;
  schoolId?: string;
  generationId?: string;
  communityId?: string;
  courseId?: string;
  limit?: string;
  offset?: string;
  includeDetails?: string;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const startTime = Date.now();

  try {
    // Authentication
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid authorization header' });
    }

    const token = authHeader.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid authentication' });
    }

    // Get user role and permissions
    const userRole = await getUserPrimaryRole(user.id);
    const allowedRoles = ['admin', 'consultor', 'equipo_directivo', 'lider_generacion', 'lider_comunidad', 'supervisor_de_red', 'docente'];
    
    if (!userRole || !allowedRoles.includes(userRole)) {
      return res.status(403).json({ error: 'Dashboard access required' });
    }

    // Parse query parameters
    const query: DashboardQuery = req.query;
    const requestedCards = query.cards?.split(',') || ['kpiSummary'];
    const timeRange = query.timeRange || '30d';
    const includeDetails = query.includeDetails === 'true';

    // Build filters
    const filters = {
      schoolId: query.schoolId,
      generationId: query.generationId,
      communityId: query.communityId,
      courseId: query.courseId,
      startDate: query.startDate,
      endDate: query.endDate
    };

    // Get reportable users based on role
    const reportableUsers = await getReportableUsers(user.id, userRole, filters);
    
    if (reportableUsers.length === 0) {
      return res.status(200).json({
        cards: { kpiSummary: getEmptyKPIData() },
        metadata: {
          userId: user.id,
          userRole,
          generatedAt: new Date().toISOString(),
          timeRange,
          appliedFilters: filters,
          permissions: [userRole],
          loadTimeMs: Date.now() - startTime
        }
      });
    }

    // Fetch data for requested cards in parallel
    const cardPromises: Array<Promise<[string, any]>> = [];

    if (requestedCards.includes('kpiSummary')) {
      cardPromises.push(
        fetchKPISummaryData(reportableUsers, timeRange, filters).then(data => ['kpiSummary', data])
      );
    }

    if (requestedCards.includes('communityHealth')) {
      cardPromises.push(
        fetchCommunityHealthData(reportableUsers, timeRange, filters).then(data => ['communityHealth', data])
      );
    }

    if (requestedCards.includes('workspaceActivity')) {
      cardPromises.push(
        fetchWorkspaceActivityData(reportableUsers, timeRange, filters).then(data => ['workspaceActivity', data])
      );
    }

    // Execute all card data fetches
    const cardResults = await Promise.allSettled(cardPromises);
    const cards: Record<string, any> = {};

    cardResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        const [cardName, cardData] = result.value;
        cards[cardName] = cardData;
      } else {
        console.error(`Card fetch failed:`, result.reason);
        // Add error placeholder for failed cards
        const cardName = requestedCards[index] || 'unknown';
        cards[cardName] = { error: 'Failed to load data' };
      }
    });

    // Build response
    const response = {
      metadata: {
        userId: user.id,
        userRole,
        generatedAt: new Date().toISOString(),
        timeRange,
        appliedFilters: filters,
        permissions: [userRole],
        loadTimeMs: Date.now() - startTime
      },
      cards,
      quickActions: getQuickActions(userRole),
      realtimeChannel: `dashboard:${user.id}`
    };

    res.status(200).json(response);

  } catch (error) {
    console.error('Unified dashboard error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      metadata: {
        loadTimeMs: Date.now() - startTime,
        generatedAt: new Date().toISOString()
      }
    });
  }
}

// Helper function to get reportable users based on role
async function getReportableUsers(userId: string, userRole: string, filters: any): Promise<string[]> {
  try {
    switch (userRole) {
      case 'admin':
        // Admins can see all users
        const { data: allUsers } = await supabase
          .from('profiles')
          .select('id');
        return allUsers?.map(u => u.id) || [];

      case 'supervisor_de_red':
        // Network supervisors see users in their assigned schools
        const { data: networkUsers } = await supabase
          .from('red_escuelas')
          .select(`
            school_id,
            schools!inner(
              profiles!inner(id)
            )
          `)
          .eq('supervisor_id', userId);
        
        return networkUsers?.flatMap((n: any) => {
          const schools = Array.isArray(n.schools) ? n.schools : [n.schools];
          return schools.flatMap((s: any) => {
            const profiles = Array.isArray(s?.profiles) ? s.profiles : (s?.profiles ? [s.profiles] : []);
            return profiles.map((p: any) => p.id);
          });
        }) || [];

      case 'lider_comunidad':
        // Community leaders see users in their communities
        const { data: communityUsers } = await supabase
          .from('profiles')
          .select('id')
          .eq('community_id', filters.communityId || 'user-community-id');
        return communityUsers?.map(u => u.id) || [];

      case 'docente':
        // Teachers see their students
        const { data: studentUsers } = await supabase
          .from('course_enrollments')
          .select('user_id')
          .in('course_id', 
            await supabase
              .from('courses')
              .select('id')
              .eq('instructor_id', userId)
              .then(res => res.data?.map(c => c.id) || [])
          );
        return studentUsers?.map(u => u.user_id) || [];

      default:
        return [userId]; // Users can only see their own data
    }
  } catch (error) {
    console.error('Error getting reportable users:', error);
    return [];
  }
}

// KPI Summary Data
async function fetchKPISummaryData(userIds: string[], timeRange: string, filters: any) {
  const timeFilter = getTimeFilter(timeRange);
  
  try {
    // Get basic user counts
    const { data: userProfiles } = await supabase
      .from('profiles')
      .select('id, created_at')
      .in('id', userIds);

    // Get active users (those with recent activity)
    const { data: activeUsersData } = await supabase
      .from('user_sessions')
      .select('user_id')
      .in('user_id', userIds)
      .gte('created_at', timeFilter);

    // Get unique user IDs manually
    const activeUsers = Array.from(new Set(activeUsersData?.map((s: any) => s.user_id) || []))
      .map(user_id => ({ user_id }));

    // Get course completion data
    const { data: completionData } = await supabase
      .from('course_completions')
      .select('user_id, completed_at')
      .in('user_id', userIds)
      .gte('completed_at', timeFilter);

    // Get time spent data
    const { data: timeData } = await supabase
      .from('user_course_time')
      .select('user_id, total_time_minutes')
      .in('user_id', userIds);

    // Get at-risk users (low activity or completion)
    const { data: atRiskData } = await supabase
      .rpc('get_at_risk_users', { user_ids: userIds });

    const totalUsers = userProfiles?.length || 0;
    const activeUserCount = activeUsers?.length || 0;
    const totalCompletions = completionData?.length || 0;
    const totalTime = timeData?.reduce((acc, t) => acc + (t.total_time_minutes || 0), 0) || 0;
    const atRiskCount = atRiskData?.length || 0;

    return {
      type: 'kpi-summary',
      data: {
        totalUsers: {
          value: totalUsers,
          label: 'Total de Usuarios',
          format: 'number' as const,
          status: 'positive' as const,
          change: 5 // Mock data - would calculate from previous period
        },
        activeUsers: {
          value: activeUserCount,
          label: 'Usuarios Activos',
          format: 'number' as const,
          status: 'positive' as const,
          change: totalUsers > 0 ? Math.round((activeUserCount / totalUsers) * 100) : 0
        },
        avgCompletionRate: {
          value: totalUsers > 0 ? Math.round((totalCompletions / totalUsers) * 100) : 0,
          label: 'Tasa de Finalización',
          format: 'percentage' as const,
          status: 'positive' as const,
          change: 8
        },
        totalTimeSpent: {
          value: totalTime,
          label: 'Tiempo Total de Estudio',
          format: 'duration' as const,
          status: 'positive' as const,
          change: 12
        },
        coursesInProgress: {
          value: Math.floor(totalUsers * 0.6), // Mock calculation
          label: 'Cursos en Progreso',
          format: 'number' as const,
          status: 'neutral' as const,
          change: 3
        },
        atRiskUsers: {
          value: atRiskCount,
          label: 'Usuarios en Riesgo',
          format: 'number' as const,
          status: 'negative' as const,
          change: -2
        }
      },
      trends: {
        period: timeRange,
        percentageChanges: {
          totalUsers: 5,
          activeUsers: 8,
          avgCompletionRate: 8,
          totalTimeSpent: 12,
          coursesInProgress: 3,
          atRiskUsers: -2
        }
      },
      lastUpdated: new Date().toISOString()
    };
  } catch (error) {
    console.error('Error fetching KPI data:', error);
    return getEmptyKPIData();
  }
}

// Community Health Data
async function fetchCommunityHealthData(userIds: string[], timeRange: string, filters: any) {
  const timeFilter = getTimeFilter(timeRange);
  
  try {
    // Get communities for these users
    const { data: communities } = await supabase
      .from('growth_communities')
      .select(`
        id,
        name,
        profiles!inner(id)
      `)
      .in('profiles.id', userIds);

    // Calculate health scores for each community
    const communityData = await Promise.all(
      (communities || []).map(async (community) => {
        const memberIds = community.profiles?.map((p: any) => p.id) || [];
        
        // Get activity data from activity_feed
        const { data: activities } = await supabase
          .from('activity_feed')
          .select('*')
          .in('user_id', memberIds)
          .gte('created_at', timeFilter);

        const activityCount = activities?.length || 0;
        const uniqueActiveMembers = new Set(activities?.map(a => a.user_id)).size;
        
        // Simple health score calculation
        const participationRate = memberIds.length > 0 ? (uniqueActiveMembers / memberIds.length) * 100 : 0;
        const activityScore = Math.min((activityCount / memberIds.length) * 10, 100);
        const healthScore = Math.round((participationRate + activityScore) / 2);

        return {
          id: community.id,
          name: community.name,
          healthScore,
          memberCount: memberIds.length,
          activeMembers: uniqueActiveMembers,
          recentActivity: activityCount,
          collaborationIndex: Math.round(participationRate),
          trendDirection: healthScore > 60 ? 'up' : healthScore < 40 ? 'down' : 'stable'
        };
      })
    );

    const overallScore = communityData.length > 0 
      ? Math.round(communityData.reduce((acc, c) => acc + c.healthScore, 0) / communityData.length)
      : 0;

    // Generate insights
    const insights = [];
    const lowHealthCommunities = communityData.filter(c => c.healthScore < 50);
    const highHealthCommunities = communityData.filter(c => c.healthScore >= 80);

    if (lowHealthCommunities.length > 0) {
      insights.push({
        type: 'warning' as const,
        message: `${lowHealthCommunities.length} comunidad(es) necesitan atención urgente`,
        actionSuggestion: 'Implementar actividades de participación para mejorar el engagement'
      });
    }

    if (highHealthCommunities.length > 0) {
      insights.push({
        type: 'success' as const,
        message: `${highHealthCommunities.length} comunidad(es) tienen excelente participación`,
        actionSuggestion: 'Documentar mejores prácticas para replicar en otras comunidades'
      });
    }

    return {
      type: 'community-health',
      data: {
        overallScore,
        communities: communityData
      },
      insights,
      chartData: {
        healthTrends: [] // Placeholder for chart data
      },
      lastUpdated: new Date().toISOString()
    };
  } catch (error) {
    console.error('Error fetching community health data:', error);
    return {
      type: 'community-health',
      data: { overallScore: 0, communities: [] },
      insights: [],
      chartData: { healthTrends: [] }
    };
  }
}

// Workspace Activity Data - leverages activity_feed tables
async function fetchWorkspaceActivityData(userIds: string[], timeRange: string, filters: any) {
  const timeFilter = getTimeFilter(timeRange);
  
  try {
    // Get activity feed data for the time period
    const { data: activities, error: activitiesError } = await supabase
      .from('activity_feed')
      .select(`
        id,
        workspace_id,
        user_id,
        activity_type,
        entity_type,
        title,
        description,
        metadata,
        importance_score,
        created_at,
        profiles!inner(first_name, last_name)
      `)
      .in('user_id', userIds)
      .gte('created_at', timeFilter)
      .order('created_at', { ascending: false });

    if (activitiesError) {
      console.error('Error fetching activities:', activitiesError);
      return getEmptyWorkspaceData();
    }

    // Get workspace information (mock data for now - would come from community_workspaces table)
    const workspaceIds = [...new Set(activities?.map(a => a.workspace_id).filter(Boolean) || [])];
    const workspaceMap = new Map();
    
    // Mock workspace names - in real implementation, would join with community_workspaces
    workspaceIds.forEach(id => {
      workspaceMap.set(id, {
        id,
        name: `Espacio Colaborativo ${id?.substring(0, 8) || 'General'}`
      });
    });

    // Calculate metrics
    const totalActivities = activities?.length || 0;
    const uniqueParticipants = new Set(activities?.map(a => a.user_id)).size;
    
    // Group activities by type
    const activityTypes = activities?.reduce((acc, activity) => {
      const type = activity.activity_type || 'unknown';
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>) || {};

    // Group activities by workspace
    const workspaceActivity = activities?.reduce((acc, activity) => {
      const workspaceId = activity.workspace_id || 'general';
      if (!acc[workspaceId]) {
        acc[workspaceId] = {
          workspaceId,
          workspaceName: workspaceMap.get(workspaceId)?.name || 'General',
          activityCount: 0,
          uniqueParticipants: new Set(),
          activityTypes: {},
          recentActivity: []
        };
      }
      
      acc[workspaceId].activityCount++;
      acc[workspaceId].uniqueParticipants.add(activity.user_id);
      
      const type = activity.activity_type || 'unknown';
      acc[workspaceId].activityTypes[type] = (acc[workspaceId].activityTypes[type] || 0) + 1;
      
      // Add to recent activity (limit to 5 per workspace)
      if (acc[workspaceId].recentActivity.length < 5) {
        const profiles = Array.isArray(activity.profiles) ? activity.profiles[0] : activity.profiles;
        acc[workspaceId].recentActivity.push({
          id: activity.id,
          type: activity.activity_type || 'unknown',
          title: activity.title || 'Sin título',
          userName: `${profiles?.first_name || ''} ${profiles?.last_name || ''}`.trim() || 'Usuario',
          timestamp: activity.created_at
        });
      }
      
      return acc;
    }, {} as Record<string, any>) || {};

    // Convert workspace activity to array and sort by activity count
    const mostActiveWorkspaces = Object.values(workspaceActivity)
      .map(workspace => ({
        ...workspace,
        uniqueParticipants: workspace.uniqueParticipants.size
      }))
      .sort((a, b) => b.activityCount - a.activityCount)
      .slice(0, 10);

    // Calculate timeline data (group by day)
    const timelineData = activities?.reduce((acc, activity) => {
      const date = new Date(activity.created_at).toISOString().split('T')[0];
      if (!acc[date]) {
        acc[date] = {
          date,
          activityCount: 0,
          activityTypes: {}
        };
      }
      
      acc[date].activityCount++;
      const type = activity.activity_type || 'unknown';
      acc[date].activityTypes[type] = (acc[date].activityTypes[type] || 0) + 1;
      
      return acc;
    }, {} as Record<string, any>) || {};

    const activityTimeline = Object.values(timelineData)
      .sort((a: any, b: any) => a.date.localeCompare(b.date));

    // Calculate engagement metrics
    const messageVolume = activityTypes.message_sent || 0;
    const documentShares = activityTypes.document_shared || 0;
    const meetingActivities = activityTypes.meeting_scheduled || 0;
    
    // Mock meeting attendance - would come from actual meeting data
    const meetingAttendance = meetingActivities > 0 ? Math.round(Math.random() * 30 + 70) : 0;
    
    const averageParticipantsPerActivity = mostActiveWorkspaces.length > 0
      ? Math.round(mostActiveWorkspaces.reduce((acc, w) => acc + w.uniqueParticipants, 0) / mostActiveWorkspaces.length)
      : 0;

    return {
      type: 'workspace-activity',
      data: {
        totalActivities,
        activitiesThisPeriod: totalActivities, // For the selected time period
        mostActiveWorkspaces,
        activityTimeline,
        engagementMetrics: {
          averageParticipantsPerActivity,
          messageVolume,
          documentShares,
          meetingAttendance
        }
      },
      realTimeUpdates: true,
      lastUpdated: new Date().toISOString()
    };

  } catch (error) {
    console.error('Error fetching workspace activity data:', error);
    return getEmptyWorkspaceData();
  }
}

function getEmptyWorkspaceData() {
  return {
    type: 'workspace-activity',
    data: {
      totalActivities: 0,
      activitiesThisPeriod: 0,
      mostActiveWorkspaces: [],
      activityTimeline: [],
      engagementMetrics: {
        averageParticipantsPerActivity: 0,
        messageVolume: 0,
        documentShares: 0,
        meetingAttendance: 0
      }
    },
    realTimeUpdates: false,
    lastUpdated: new Date().toISOString()
  };
}

// Helper functions
function getTimeFilter(timeRange: string): string {
  const now = new Date();
  switch (timeRange) {
    case '7d':
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    case '30d':
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    case '90d':
      return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
    case '1y':
      return new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString();
    default:
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  }
}

function getEmptyKPIData() {
  return {
    type: 'kpi-summary',
    data: {
      totalUsers: { value: 0, label: 'Total de Usuarios', format: 'number', status: 'neutral', change: 0 },
      activeUsers: { value: 0, label: 'Usuarios Activos', format: 'number', status: 'neutral', change: 0 },
      avgCompletionRate: { value: 0, label: 'Tasa de Finalización', format: 'percentage', status: 'neutral', change: 0 },
      totalTimeSpent: { value: 0, label: 'Tiempo Total', format: 'duration', status: 'neutral', change: 0 },
      coursesInProgress: { value: 0, label: 'Cursos en Progreso', format: 'number', status: 'neutral', change: 0 },
      atRiskUsers: { value: 0, label: 'Usuarios en Riesgo', format: 'number', status: 'neutral', change: 0 }
    },
    trends: { period: '30d', percentageChanges: {} },
    lastUpdated: new Date().toISOString()
  };
}

function getQuickActions(userRole: string) {
  const baseActions = [
    { id: 'export', label: 'Exportar Datos', icon: 'download' },
    { id: 'refresh', label: 'Actualizar', icon: 'refresh' }
  ];

  switch (userRole) {
    case 'admin':
      return [
        ...baseActions,
        { id: 'user-management', label: 'Gestión de Usuarios', icon: 'users' },
        { id: 'system-settings', label: 'Configuración', icon: 'settings' }
      ];
    case 'lider_comunidad':
      return [
        ...baseActions,
        { id: 'community-management', label: 'Gestión de Comunidad', icon: 'users' },
        { id: 'activity-reports', label: 'Reportes de Actividad', icon: 'bar-chart' }
      ];
    default:
      return baseActions;
  }
}