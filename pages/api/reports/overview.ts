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

    // Get reportable users based on role and assignments
    const reportableUsers = await getReportableUsers(user.id, profile.role);

    if (reportableUsers.length === 0) {
      return res.status(200).json({ 
        message: 'No reportable users found',
        data: []
      });
    }

    // Get individual progress report data
    const { data: progressData, error: progressError } = await supabase
      .from('individual_progress_report')
      .select('*')
      .in('user_id', reportableUsers);

    if (progressError) {
      console.error('Progress report error:', progressError.message);
      return res.status(500).json({ error: 'Failed to fetch progress data', details: progressError.message });
    }

    // Format data for dashboard UI
    const formattedData = formatOverviewData(progressData || []);

    return res.status(200).json({
      data: formattedData,
      total_users: reportableUsers.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Overview reports API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function getReportableUsers(userId: string, userRole: string): Promise<string[]> {
  try {
    if (userRole === 'admin') {
      // Admins can see all users
      const { data: allUsers } = await supabase
        .from('profiles')
        .select('id')
        .in('role', ['docente', 'teacher', 'estudiante', 'student']);
      
      return allUsers?.map(u => u.id) || [];
    } else if (userRole === 'consultor') {
      // Consultors can only see their assigned students
      const { data: assignments } = await supabase
        .from('consultant_assignments')
        .select('student_id')
        .eq('consultant_id', userId)
        .eq('is_active', true);
      
      return assignments?.map(a => a.student_id) || [];
    }
    
    return [];
  } catch (error) {
    console.error('Error getting reportable users:', error);
    return [];
  }
}

function formatOverviewData(progressData: any[]): any {
  // Calculate summary statistics
  const totalUsers = progressData.length;
  const activeUsers = progressData.filter(p => p.is_active).length;
  const completedCourses = progressData.reduce((sum, p) => sum + (p.completed_courses || 0), 0);
  const totalCourses = progressData.reduce((sum, p) => sum + (p.total_courses || 0), 0);
  const averageProgress = totalCourses > 0 ? (completedCourses / totalCourses) * 100 : 0;

  // Group by community/school for breakdown
  const communityBreakdown = progressData.reduce((acc, p) => {
    const key = p.community_name || 'Sin comunidad';
    if (!acc[key]) {
      acc[key] = {
        name: key,
        users: 0,
        completed_courses: 0,
        total_courses: 0,
        average_progress: 0
      };
    }
    acc[key].users++;
    acc[key].completed_courses += p.completed_courses || 0;
    acc[key].total_courses += p.total_courses || 0;
    acc[key].average_progress = acc[key].total_courses > 0 
      ? (acc[key].completed_courses / acc[key].total_courses) * 100 
      : 0;
    return acc;
  }, {});

  // Recent activity (last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const recentActivity = progressData.filter(p => 
    p.last_activity && new Date(p.last_activity) > thirtyDaysAgo
  ).length;

  return {
    summary: {
      total_users: totalUsers,
      active_users: activeUsers,
      completed_courses: completedCourses,
      total_courses: totalCourses,
      average_progress: Math.round(averageProgress * 100) / 100,
      recent_activity: recentActivity
    },
    community_breakdown: Object.values(communityBreakdown),
    user_details: progressData.map(p => ({
      user_id: p.user_id,
      user_name: p.user_name,
      email: p.email,
      community_name: p.community_name,
      school_name: p.school_name,
      completed_courses: p.completed_courses || 0,
      total_courses: p.total_courses || 0,
      progress_percentage: p.total_courses > 0 
        ? Math.round((p.completed_courses / p.total_courses) * 100 * 100) / 100
        : 0,
      last_activity: p.last_activity,
      is_active: p.is_active
    }))
  };
}