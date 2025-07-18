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
    const { 
      course_id, 
      community_id, 
      school_id, 
      start_date, 
      end_date,
      limit = '50',
      sort_by = 'enrollment_count',
      sort_order = 'desc'
    } = req.query;

    // Get reportable users to scope data access
    const reportableUsers = await getReportableUsers(user.id, profile.role);

    let query = supabase
      .from('course_progress_analytics')
      .select('*');

    // Apply user access filtering
    if (profile.role !== 'admin' && reportableUsers.length > 0) {
      // For consultors, filter by their assigned users
      query = query.in('user_id', reportableUsers);
    } else if (profile.role !== 'admin') {
      // If no reportable users and not admin, return empty
      return res.status(200).json({
        message: 'No accessible course data found',
        data: []
      });
    }

    // Apply filters
    if (course_id) {
      query = query.eq('course_id', course_id);
    }
    if (community_id) {
      query = query.eq('community_id', community_id);
    }
    if (school_id) {
      query = query.eq('school_id', school_id);
    }
    if (start_date) {
      query = query.gte('analysis_date', start_date);
    }
    if (end_date) {
      query = query.lte('analysis_date', end_date);
    }

    // Apply sorting
    const validSortFields = ['enrollment_count', 'completion_rate', 'average_progress', 'course_name', 'analysis_date'];
    const sortField = validSortFields.includes(sort_by as string) ? sort_by as string : 'enrollment_count';
    const ascending = sort_order === 'asc';

    query = query.order(sortField, { ascending });

    // Apply limit
    const limitNum = Math.min(parseInt(limit as string) || 50, 200);
    query = query.limit(limitNum);

    const { data: analyticsData, error: analyticsError } = await query;

    if (analyticsError) {
      console.error('Course analytics error:', analyticsError.message);
      return res.status(500).json({ error: 'Failed to fetch course analytics', details: analyticsError.message });
    }

    // Format data for dashboard UI
    const formattedData = formatCourseAnalytics(analyticsData || []);

    return res.status(200).json({
      data: formattedData,
      total_courses: new Set(analyticsData?.map(c => c.course_id)).size || 0,
      total_enrollments: analyticsData?.reduce((sum, c) => sum + (c.enrollment_count || 0), 0) || 0,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Course analytics API error:', error);
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

function formatCourseAnalytics(analyticsData: any[]): any {
  // Group data by course to aggregate metrics
  const courseGroups = analyticsData.reduce((acc, item) => {
    const key = item.course_id;
    if (!acc[key]) {
      acc[key] = {
        course_id: item.course_id,
        course_name: item.course_name,
        course_category: item.course_category,
        course_difficulty: item.course_difficulty,
        course_duration: item.course_duration,
        records: []
      };
    }
    acc[key].records.push(item);
    return acc;
  }, {});

  // Calculate aggregated metrics for each course
  const courseAnalytics = Object.values(courseGroups).map((course: any) => {
    const latestRecord = course.records[0];
    const totalEnrollments = course.records.reduce((sum: number, r: any) => sum + (r.enrollment_count || 0), 0);
    const avgCompletionRate = course.records.length > 0
      ? course.records.reduce((sum: number, r: any) => sum + (r.completion_rate || 0), 0) / course.records.length
      : 0;
    const avgProgress = course.records.length > 0
      ? course.records.reduce((sum: number, r: any) => sum + (r.average_progress || 0), 0) / course.records.length
      : 0;
    const avgTimeSpent = course.records.length > 0
      ? course.records.reduce((sum: number, r: any) => sum + (r.average_time_spent || 0), 0) / course.records.length
      : 0;

    return {
      course_id: course.course_id,
      course_name: course.course_name,
      course_category: course.course_category,
      course_difficulty: course.course_difficulty,
      course_duration: course.course_duration,
      metrics: {
        total_enrollments: latestRecord?.enrollment_count || 0,
        completion_rate: Math.round((latestRecord?.completion_rate || 0) * 100) / 100,
        average_progress: Math.round((latestRecord?.average_progress || 0) * 100) / 100,
        dropout_rate: latestRecord?.dropout_rate || 0,
        average_completion_time: latestRecord?.average_completion_time || 0,
        average_time_spent: Math.round((latestRecord?.average_time_spent || 0) * 100) / 100,
        student_satisfaction: latestRecord?.student_satisfaction || 0,
        difficulty_rating: latestRecord?.difficulty_rating || 0
      },
      performance: {
        engagement_score: calculateEngagementScore(latestRecord),
        effectiveness_score: calculateEffectivenessScore(latestRecord),
        popularity_rank: 0, // Will be calculated after sorting
        completion_trend: calculateCompletionTrend(course.records)
      },
      demographics: {
        unique_communities: latestRecord?.unique_communities || 0,
        unique_schools: latestRecord?.unique_schools || 0,
        teacher_enrollments: latestRecord?.teacher_enrollments || 0,
        student_enrollments: latestRecord?.student_enrollments || 0
      },
      recent_activity: course.records.slice(0, 5).map((r: any) => ({
        analysis_date: r.analysis_date,
        enrollment_count: r.enrollment_count,
        completion_rate: r.completion_rate,
        average_progress: r.average_progress
      }))
    };
  });

  // Sort by total enrollments to assign popularity ranks
  const sortedCourses = [...courseAnalytics].sort((a, b) => 
    b.metrics.total_enrollments - a.metrics.total_enrollments
  );
  sortedCourses.forEach((course, index) => {
    course.performance.popularity_rank = index + 1;
  });

  // Category analysis
  const categoryAnalysis = calculateCategoryAnalysis(courseAnalytics);

  // Top performers
  const topPerformers = {
    most_enrolled: sortedCourses.slice(0, 5),
    highest_completion: [...courseAnalytics]
      .sort((a, b) => b.metrics.completion_rate - a.metrics.completion_rate)
      .slice(0, 5),
    highest_satisfaction: [...courseAnalytics]
      .sort((a, b) => b.metrics.student_satisfaction - a.metrics.student_satisfaction)
      .slice(0, 5),
    most_engaging: [...courseAnalytics]
      .sort((a, b) => b.performance.engagement_score - a.performance.engagement_score)
      .slice(0, 5)
  };

  // Overall summary
  const summary = {
    total_courses: courseAnalytics.length,
    total_enrollments: courseAnalytics.reduce((sum, c) => sum + c.metrics.total_enrollments, 0),
    average_completion_rate: courseAnalytics.length > 0
      ? Math.round(courseAnalytics.reduce((sum, c) => sum + c.metrics.completion_rate, 0) / courseAnalytics.length * 100) / 100
      : 0,
    average_satisfaction: courseAnalytics.length > 0
      ? Math.round(courseAnalytics.reduce((sum, c) => sum + c.metrics.student_satisfaction, 0) / courseAnalytics.length * 100) / 100
      : 0,
    total_communities: Math.max(...courseAnalytics.map(c => c.demographics.unique_communities), 0),
    total_schools: Math.max(...courseAnalytics.map(c => c.demographics.unique_schools), 0)
  };

  return {
    summary,
    courses: courseAnalytics,
    category_analysis: categoryAnalysis,
    top_performers: topPerformers
  };
}

function calculateEngagementScore(record: any): number {
  if (!record) return 0;
  
  const timeWeight = 0.3;
  const progressWeight = 0.3;
  const completionWeight = 0.4;
  
  const timeScore = Math.min((record.average_time_spent || 0) / 60, 100); // Normalize to hours
  const progressScore = record.average_progress || 0;
  const completionScore = record.completion_rate || 0;
  
  return Math.round((timeScore * timeWeight + progressScore * progressWeight + completionScore * completionWeight) * 100) / 100;
}

function calculateEffectivenessScore(record: any): number {
  if (!record) return 0;
  
  const completionWeight = 0.4;
  const satisfactionWeight = 0.3;
  const dropoutWeight = 0.3;
  
  const completionScore = record.completion_rate || 0;
  const satisfactionScore = record.student_satisfaction || 0;
  const dropoutScore = 100 - (record.dropout_rate || 0); // Invert dropout rate
  
  return Math.round((completionScore * completionWeight + satisfactionScore * satisfactionWeight + dropoutScore * dropoutWeight) * 100) / 100;
}

function calculateCompletionTrend(records: any[]): number {
  if (records.length < 2) return 0;
  
  const latest = records[0]?.completion_rate || 0;
  const previous = records[1]?.completion_rate || 0;
  
  if (previous === 0) return latest > 0 ? 100 : 0;
  
  return Math.round(((latest - previous) / previous) * 100 * 100) / 100;
}

function calculateCategoryAnalysis(courses: any[]): any {
  const categories = courses.reduce((acc, course) => {
    const category = course.course_category || 'Sin categoría';
    if (!acc[category]) {
      acc[category] = {
        name: category,
        total_courses: 0,
        total_enrollments: 0,
        average_completion_rate: 0,
        average_satisfaction: 0,
        courses: []
      };
    }
    
    acc[category].total_courses++;
    acc[category].total_enrollments += course.metrics.total_enrollments;
    acc[category].courses.push(course);
    
    return acc;
  }, {});

  // Calculate averages for each category
  Object.values(categories).forEach((category: any) => {
    category.average_completion_rate = category.courses.length > 0
      ? Math.round(category.courses.reduce((sum: number, c: any) => sum + c.metrics.completion_rate, 0) / category.courses.length * 100) / 100
      : 0;
    category.average_satisfaction = category.courses.length > 0
      ? Math.round(category.courses.reduce((sum: number, c: any) => sum + c.metrics.student_satisfaction, 0) / category.courses.length * 100) / 100
      : 0;
    
    // Remove individual course details for summary
    delete category.courses;
  });

  return Object.values(categories);
}