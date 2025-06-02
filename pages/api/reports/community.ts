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

    // Check if user has access to reports (admin or consultor)
    if (!profile || !['admin', 'consultor'].includes(profile.role)) {
      console.error('User does not have report access:', profile?.role);
      return res.status(403).json({ error: 'Report access required' });
    }

    // Get query parameters
    const { community_id, start_date, end_date } = req.query;

    // Get accessible communities based on user role
    const accessibleCommunities = await getAccessibleCommunities(user.id, profile.role);

    let query = supabase
      .from('community_progress_report')
      .select('*');

    // Filter by accessible communities
    if (accessibleCommunities.length > 0) {
      query = query.in('community_id', accessibleCommunities);
    } else if (profile.role !== 'admin') {
      // If user has no accessible communities and is not admin, return empty result
      return res.status(200).json({
        message: 'No accessible communities found',
        data: []
      });
    }

    // Filter by specific community if provided
    if (community_id) {
      query = query.eq('community_id', community_id);
    }

    // Apply date filters if provided
    if (start_date) {
      query = query.gte('report_date', start_date);
    }
    if (end_date) {
      query = query.lte('report_date', end_date);
    }

    const { data: communityData, error: communityError } = await query
      .order('community_name')
      .order('report_date', { ascending: false });

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
        .from('communities')
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