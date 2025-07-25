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
    const { school_id, community_id, start_date, end_date } = req.query;

    // Get accessible schools based on user role
    const accessibleSchools = await getAccessibleSchools(user.id, profile.role);

    // Since school_progress_report view doesn't exist, generate report data from existing tables
    let schoolData: any[] = [];
    let schoolError = null;

    try {
      // Get schools to report on
      let schoolsToQuery = accessibleSchools;
      if (school_id) {
        const schoolIdStr = Array.isArray(school_id) ? school_id[0] : school_id;
        schoolsToQuery = schoolsToQuery.includes(schoolIdStr) ? [schoolIdStr] : [];
      }
      
      if (schoolsToQuery.length === 0 && profile.role !== 'admin') {
        return res.status(200).json({
          message: 'No accessible schools found',
          data: []
        });
      }

      // If admin and no specific schools, get all schools
      if (profile.role === 'admin' && schoolsToQuery.length === 0) {
        const { data: allSchools } = await supabase
          .from('schools')
          .select('id');
        schoolsToQuery = allSchools?.map(s => s.id) || [];
      }

      if (schoolsToQuery.length > 0) {
        // Get school details
        const { data: schools } = await supabase
          .from('schools')
          .select('id, name, community_id')
          .in('id', schoolsToQuery);

        // Get community names separately to avoid relationship issues
        const communityIds = schools?.map(s => s.community_id).filter(Boolean) || [];
        const { data: communities } = communityIds.length > 0 ? await supabase
          .from('growth_communities')
          .select('id, name')
          .in('id', communityIds) : { data: [] };
        
        const communityMap = new Map(communities?.map(c => [c.id, c.name]) || []);

        // Filter by community if provided
        let filteredSchools = schools || [];
        if (community_id) {
          const communityIdStr = Array.isArray(community_id) ? community_id[0] : community_id;
          filteredSchools = filteredSchools.filter(s => s.community_id === communityIdStr);
        }

        // Get users in these schools
        const schoolIds = filteredSchools.map(s => s.id);
        const { data: schoolUsers } = await supabase
          .from('profiles')
          .select('id, school_id, role')
          .in('school_id', schoolIds)
          .not('school_id', 'is', null);

        // Get course enrollments for these users
        const userIds = schoolUsers?.map(u => u.id) || [];
        const { data: courseEnrollments } = userIds.length > 0 ? await supabase
          .from('course_enrollments')
          .select('user_id, course_id, progress_percentage, completed_at, time_spent')
          .in('user_id', userIds) : { data: [] };

        // Aggregate data for each school
        schoolData = filteredSchools.map((school: any) => {
          const schoolUsersData = schoolUsers?.filter(u => u.school_id === school.id) || [];
          const schoolUserIds = schoolUsersData.map(u => u.id);
          
          // Separate teachers and students
          const teachers = schoolUsersData.filter(u => u.role === 'docente' || u.role === 'admin');
          const students = schoolUsersData.filter(u => u.role === 'estudiante');
          
          // Calculate metrics
          const totalTeachers = teachers.length;
          const totalStudents = students.length;
          const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
          
          // Get enrollments for this school's users
          const schoolEnrollments = courseEnrollments?.filter(e => schoolUserIds.includes(e.user_id)) || [];
          
          let activeTeachers = 0;
          let activeStudents = 0;
          let totalCourses = schoolEnrollments.length;
          let completedCourses = schoolEnrollments.filter(e => e.progress_percentage >= 100).length;
          
          // Count active users (users with activity in last 7 days)
          const activeUserIds = new Set();
          schoolEnrollments.forEach(enrollment => {
            if (enrollment.completed_at && new Date(enrollment.completed_at) > sevenDaysAgo) {
              activeUserIds.add(enrollment.user_id);
            }
          });
          
          // Categorize active users as teachers or students
          activeUserIds.forEach(userId => {
            const user = schoolUsersData.find(u => u.id === userId);
            if (user?.role === 'docente' || user?.role === 'admin') {
              activeTeachers++;
            } else if (user?.role === 'estudiante') {
              activeStudents++;
            }
          });

          return {
            school_id: school.id,
            school_name: school.name,
            community_id: school.community_id,
            community_name: communityMap.get(school.community_id) || null,
            report_date: new Date().toISOString().split('T')[0], // Today's date
            total_teachers: totalTeachers,
            active_teachers: activeTeachers,
            total_students: totalStudents,
            active_students: activeStudents,
            total_courses: totalCourses,
            completed_courses: completedCourses,
            average_lesson_completion_rate: 0, // Would need lesson data to calculate
            average_assessment_score: 0, // Would need assessment data to calculate
            total_time_spent: schoolEnrollments.reduce((sum, e) => sum + (e.time_spent || 0), 0),
            unique_courses_accessed: new Set(schoolEnrollments.map(e => e.course_id)).size
          };
        });
      }
    } catch (error) {
      console.error('Error generating school report data:', error);
      schoolError = error;
    }

    if (schoolError) {
      console.error('School report error:', schoolError.message);
      return res.status(500).json({ error: 'Failed to fetch school data', details: schoolError.message });
    }

    // Format data for dashboard UI
    const formattedData = formatSchoolData(schoolData || []);

    return res.status(200).json({
      data: formattedData,
      total_schools: new Set(schoolData?.map(s => s.school_id)).size || 0,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('School reports API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function getAccessibleSchools(userId: string, userRole: string): Promise<string[]> {
  try {
    if (userRole === 'admin') {
      // Admins can see all schools
      const { data: allSchools } = await supabase
        .from('schools')
        .select('id');
      
      return allSchools?.map(s => s.id) || [];
    } else if (userRole === 'consultor') {
      // Consultors can see schools where they have assigned students
      const { data: assignments } = await supabase
        .from('consultant_assignments')
        .select(`
          school_id,
          student:student_id(school_id)
        `)
        .eq('consultant_id', userId)
        .eq('is_active', true);
      
      const schoolIds = new Set<string>();
      assignments?.forEach((assignment: any) => {
        if (assignment.school_id) {
          schoolIds.add(assignment.school_id);
        }
        // Also include schools from student profiles
        if (assignment.student?.school_id) {
          schoolIds.add(assignment.student.school_id);
        }
      });
      
      return Array.from(schoolIds);
    }
    
    return [];
  } catch (error) {
    console.error('Error getting accessible schools:', error);
    return [];
  }
}

function formatSchoolData(schoolData: any[]): any {
  // Group data by school
  const schoolGroups = schoolData.reduce((acc, item) => {
    const key = item.school_id;
    if (!acc[key]) {
      acc[key] = {
        school_id: item.school_id,
        school_name: item.school_name,
        community_id: item.community_id,
        community_name: item.community_name,
        reports: []
      };
    }
    acc[key].reports.push(item);
    return acc;
  }, {});

  // Calculate summary statistics for each school
  const schools = Object.values(schoolGroups).map((school: any) => {
    const latestReport = school.reports[0]; // Assuming sorted by date desc
    
    return {
      school_id: school.school_id,
      school_name: school.school_name,
      community_id: school.community_id,
      community_name: school.community_name,
      summary: {
        total_teachers: latestReport?.total_teachers || 0,
        active_teachers: latestReport?.active_teachers || 0,
        total_students: latestReport?.total_students || 0,
        active_students: latestReport?.active_students || 0,
        completed_courses: latestReport?.completed_courses || 0,
        total_courses: latestReport?.total_courses || 0,
        completion_rate: latestReport?.total_courses > 0 
          ? Math.round((latestReport.completed_courses / latestReport.total_courses) * 100 * 100) / 100
          : 0,
        teacher_engagement_rate: latestReport?.total_teachers > 0
          ? Math.round((latestReport.active_teachers / latestReport.total_teachers) * 100 * 100) / 100
          : 0,
        student_engagement_rate: latestReport?.total_students > 0
          ? Math.round((latestReport.active_students / latestReport.total_students) * 100 * 100) / 100
          : 0
      },
      performance: {
        average_lesson_completion_rate: latestReport?.average_lesson_completion_rate || 0,
        average_assessment_score: latestReport?.average_assessment_score || 0,
        time_spent_learning: latestReport?.total_time_spent || 0,
        course_diversity: latestReport?.unique_courses_accessed || 0
      },
      trends: {
        teacher_growth: calculateGrowthRate(school.reports, 'total_teachers'),
        student_growth: calculateGrowthRate(school.reports, 'total_students'),
        activity_trend: calculateGrowthRate(school.reports, 'active_teachers', 'active_students'),
        completion_trend: calculateGrowthRate(school.reports, 'completed_courses')
      },
      recent_reports: school.reports.slice(0, 5).map((r: any) => ({
        report_date: r.report_date,
        total_teachers: r.total_teachers,
        active_teachers: r.active_teachers,
        total_students: r.total_students,
        active_students: r.active_students,
        completed_courses: r.completed_courses,
        total_courses: r.total_courses
      }))
    };
  });

  // Group schools by community for better organization
  const communityGroups = schools.reduce((acc, school) => {
    const key = school.community_id || 'no_community';
    if (!acc[key]) {
      acc[key] = {
        community_id: school.community_id,
        community_name: school.community_name || 'Sin comunidad',
        schools: []
      };
    }
    acc[key].schools.push(school);
    return acc;
  }, {});

  // Overall summary across all schools
  const overallSummary = {
    total_schools: schools.length,
    total_communities: Object.keys(communityGroups).length,
    total_teachers: schools.reduce((sum, s) => sum + s.summary.total_teachers, 0),
    total_students: schools.reduce((sum, s) => sum + s.summary.total_students, 0),
    total_active_users: schools.reduce((sum, s) => sum + s.summary.active_teachers + s.summary.active_students, 0),
    total_completed_courses: schools.reduce((sum, s) => sum + s.summary.completed_courses, 0),
    average_completion_rate: schools.length > 0
      ? Math.round(schools.reduce((sum, s) => sum + s.summary.completion_rate, 0) / schools.length * 100) / 100
      : 0,
    average_teacher_engagement: schools.length > 0
      ? Math.round(schools.reduce((sum, s) => sum + s.summary.teacher_engagement_rate, 0) / schools.length * 100) / 100
      : 0,
    average_student_engagement: schools.length > 0
      ? Math.round(schools.reduce((sum, s) => sum + s.summary.student_engagement_rate, 0) / schools.length * 100) / 100
      : 0
  };

  return {
    summary: overallSummary,
    by_community: Object.values(communityGroups),
    all_schools: schools
  };
}

function calculateGrowthRate(reports: any[], ...fields: string[]): number {
  if (reports.length < 2) return 0;
  
  let latest = 0;
  let previous = 0;
  
  fields.forEach(field => {
    latest += reports[0][field] || 0;
    previous += reports[1][field] || 0;
  });
  
  if (previous === 0) return latest > 0 ? 100 : 0;
  
  return Math.round(((latest - previous) / previous) * 100 * 100) / 100;
}