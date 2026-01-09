import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Verify authentication
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      console.error('No authorization header provided');
      return res.status(401).json({ error: 'No authorization header' });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      console.error('No token in authorization header');
      return res.status(401).json({ error: 'No token provided' });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError) {
      console.error('Auth error:', authError.message);
      return res.status(401).json({ error: 'Invalid authentication', details: authError.message });
    }
    
    if (!user) {
      console.error('No user found for token');
      return res.status(401).json({ error: 'User not found' });
    }

    // Get user profile and verify role
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role, id')
      .eq('id', user.id)
      .single();

    if (profileError) {
      console.error('Profile fetch error:', profileError.message);
      return res.status(500).json({ error: 'Failed to fetch user profile', details: profileError.message });
    }

    // Check if user has access to reports
    const allowedRoles = ['admin', 'consultor', 'equipo_directivo', 'lider_generacion', 'lider_comunidad', 'supervisor_de_red'];
    if (!profile || !allowedRoles.includes(profile.role)) {
      console.error('User does not have report access:', profile?.role);
      return res.status(403).json({ error: 'Report access required' });
    }

    // Get query parameters
    const { community_id, start_date, end_date } = req.query;

    // Get accessible communities based on user role
    const accessibleCommunities = await getAccessibleCommunities(user.id, profile.role);

    // Since community_progress_report view doesn't exist, generate report data from existing tables
    let communityData: any[] = [];
    let communityError = null;

    try {
      // Get communities to report on
      let communitiesToQuery = accessibleCommunities;
      if (community_id) {
        const communityIdStr = Array.isArray(community_id) ? community_id[0] : community_id;
        communitiesToQuery = communitiesToQuery.includes(communityIdStr) ? [communityIdStr] : [];
      }
      
      if (communitiesToQuery.length === 0 && profile.role !== 'admin') {
        return res.status(200).json({
          message: 'No accessible communities found',
          data: []
        });
      }

      // If admin and no specific communities, get all communities
      if (profile.role === 'admin' && communitiesToQuery.length === 0) {
        const { data: allCommunities } = await supabase
          .from('growth_communities')
          .select('id');
        communitiesToQuery = allCommunities?.map(c => c.id) || [];
      }

      if (communitiesToQuery.length > 0) {
        // Get community details
        const { data: communities } = await supabase
          .from('growth_communities')
          .select('id, name')
          .in('id', communitiesToQuery);

        // Get users in these communities
        const { data: communityUsers } = await supabase
          .from('profiles')
          .select('id, community_id')
          .in('community_id', communitiesToQuery)
          .not('community_id', 'is', null);

        // Get course enrollments for these users
        const userIds = communityUsers?.map(u => u.id) || [];
        const { data: courseEnrollments } = userIds.length > 0 ? await supabase
          .from('course_enrollments')
          .select('user_id, course_id, progress_percentage, completed_at, time_spent')
          .in('user_id', userIds) : { data: [] };

        // Aggregate data for each community
        communityData = communities?.map((community: any) => {
          const communityUsersData = communityUsers?.filter(u => u.community_id === community.id) || [];
          const communityUserIds = communityUsersData.map(u => u.id);
          
          // Calculate metrics
          const totalUsers = communityUsersData.length;
          const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
          
          // Get enrollments for this community's users
          const communityEnrollments = courseEnrollments?.filter(e => communityUserIds.includes(e.user_id)) || [];
          
          let activeUsers = 0;
          let totalCourses = communityEnrollments.length;
          let completedCourses = communityEnrollments.filter(e => e.progress_percentage >= 100).length;
          
          // Count active users (users with activity in last 7 days)
          const activeUserIds = new Set();
          communityEnrollments.forEach(enrollment => {
            if (enrollment.completed_at && new Date(enrollment.completed_at) > sevenDaysAgo) {
              activeUserIds.add(enrollment.user_id);
            }
          });
          activeUsers = activeUserIds.size;

          return {
            community_id: community.id,
            community_name: community.name,
            report_date: new Date().toISOString().split('T')[0], // Today's date
            total_users: totalUsers,
            active_users: activeUsers,
            total_courses: totalCourses,
            completed_courses: completedCourses
          };
        }) || [];
      }
    } catch (error) {
      console.error('Error generating community report data:', error);
      communityError = error;
    }

    if (communityError) {
      console.error('Community report error:', communityError.message);
      return res.status(500).json({ error: 'Failed to fetch community data', details: communityError.message });
    }

    // Format data for dashboard UI
    const formattedData = formatCommunityData(communityData || []);

    return res.status(200).json({
      data: formattedData,
      total_communities: new Set(communityData?.map(c => c.community_id)).size || 0,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Community reports API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function getAccessibleCommunities(userId: string, userRole: string): Promise<string[]> {
  try {
    if (userRole === 'admin') {
      // Admins can see all communities
      const { data: allCommunities } = await supabase
        .from('growth_communities')
        .select('id');
      
      return allCommunities?.map(c => c.id) || [];
    } else if (userRole === 'consultor') {
      // Consultors can see communities where they have assigned students
      const { data: assignments } = await supabase
        .from('consultant_assignments')
        .select(`
          community_id,
          student:student_id(community_id)
        `)
        .eq('consultant_id', userId)
        .eq('is_active', true);
      
      const communityIds = new Set<string>();
      assignments?.forEach((assignment: any) => {
        if (assignment.community_id) {
          communityIds.add(assignment.community_id);
        }
        // Also include communities from student profiles
        if (assignment.student?.community_id) {
          communityIds.add(assignment.student.community_id);
        }
      });
      
      return Array.from(communityIds);
    }
    
    return [];
  } catch (error) {
    console.error('Error getting accessible communities:', error);
    return [];
  }
}

function formatCommunityData(communityData: any[]): any {
  // Group data by community
  const communityGroups = communityData.reduce((acc, item) => {
    const key = item.community_id;
    if (!acc[key]) {
      acc[key] = {
        community_id: item.community_id,
        community_name: item.community_name,
        reports: []
      };
    }
    acc[key].reports.push(item);
    return acc;
  }, {});

  // Calculate summary statistics for each community
  const communities = Object.values(communityGroups).map((community: any) => {
    const latestReport = community.reports[0]; // Assuming sorted by date desc
    const totalUsers = community.reports.reduce((sum: number, r: any) => sum + (r.total_users || 0), 0);
    const activeUsers = community.reports.reduce((sum: number, r: any) => sum + (r.active_users || 0), 0);
    const completedCourses = community.reports.reduce((sum: number, r: any) => sum + (r.completed_courses || 0), 0);
    const totalCourses = community.reports.reduce((sum: number, r: any) => sum + (r.total_courses || 0), 0);

    return {
      community_id: community.community_id,
      community_name: community.community_name,
      summary: {
        total_users: latestReport?.total_users || 0,
        active_users: latestReport?.active_users || 0,
        completed_courses: latestReport?.completed_courses || 0,
        total_courses: latestReport?.total_courses || 0,
        completion_rate: latestReport?.total_courses > 0 
          ? Math.round((latestReport.completed_courses / latestReport.total_courses) * 100 * 100) / 100
          : 0,
        engagement_rate: latestReport?.total_users > 0
          ? Math.round((latestReport.active_users / latestReport.total_users) * 100 * 100) / 100
          : 0
      },
      trends: {
        user_growth: calculateGrowthRate(community.reports, 'total_users'),
        activity_trend: calculateGrowthRate(community.reports, 'active_users'),
        course_completion_trend: calculateGrowthRate(community.reports, 'completed_courses')
      },
      recent_reports: community.reports.slice(0, 5).map((r: any) => ({
        report_date: r.report_date,
        total_users: r.total_users,
        active_users: r.active_users,
        completed_courses: r.completed_courses,
        total_courses: r.total_courses
      }))
    };
  });

  // Overall summary across all communities
  const overallSummary = {
    total_communities: communities.length,
    total_users: communities.reduce((sum, c) => sum + c.summary.total_users, 0),
    total_active_users: communities.reduce((sum, c) => sum + c.summary.active_users, 0),
    total_completed_courses: communities.reduce((sum, c) => sum + c.summary.completed_courses, 0),
    average_completion_rate: communities.length > 0
      ? Math.round(communities.reduce((sum, c) => sum + c.summary.completion_rate, 0) / communities.length * 100) / 100
      : 0,
    average_engagement_rate: communities.length > 0
      ? Math.round(communities.reduce((sum, c) => sum + c.summary.engagement_rate, 0) / communities.length * 100) / 100
      : 0
  };

  return {
    summary: overallSummary,
    communities: communities
  };
}

function calculateGrowthRate(reports: any[], field: string): number {
  if (reports.length < 2) return 0;
  
  const latest = reports[0][field] || 0;
  const previous = reports[1][field] || 0;
  
  if (previous === 0) return latest > 0 ? 100 : 0;
  
  return Math.round(((latest - previous) / previous) * 100 * 100) / 100;
}