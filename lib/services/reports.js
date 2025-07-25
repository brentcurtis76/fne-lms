import { supabase } from '../supabase.ts';
import { getRoleBasedFilters, applyReportFilters } from '../../utils/reportFilters.ts';

class ReportsService {
  /**
   * Fetch user progress data based on role permissions
   * Refactored to use existing tables instead of missing user_progress_view
   */
  async getUserProgress(userProfile, additionalFilters = {}) {
    try {
      // Get role-based filters
      const roleFilters = getRoleBasedFilters(userProfile);
      
      // Step 1: Get filtered user IDs based on role permissions
      const filteredUserIds = await this.getFilteredUserIds(roleFilters, additionalFilters);
      
      if (filteredUserIds.length === 0) {
        return { data: [], error: null };
      }
      
      // Step 2: Get user profiles with organizational info
      const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select(`
          id,
          first_name,
          last_name,
          email,
          school_id,
          generation_id,
          community_id
        `)
        .in('id', filteredUserIds);
      
      if (profileError) {
        console.error('Error fetching user profiles:', profileError);
        return { data: null, error: profileError };
      }

      // Step 2a: Get organizational data separately to avoid relationship issues
      const schoolIds = [...new Set(profiles?.map(p => p.school_id).filter(Boolean) || [])];
      const generationIds = [...new Set(profiles?.map(p => p.generation_id).filter(Boolean) || [])];
      const communityIds = [...new Set(profiles?.map(p => p.community_id).filter(Boolean) || [])];

      const [schoolsData, generationsData, communitiesData] = await Promise.all([
        schoolIds.length > 0 ? supabase
          .from('schools')
          .select('id, name')
          .in('id', schoolIds) : Promise.resolve({ data: [] }),
        
        generationIds.length > 0 ? supabase
          .from('generations')
          .select('id, name')
          .in('id', generationIds) : Promise.resolve({ data: [] }),
        
        communityIds.length > 0 ? supabase
          .from('growth_communities')
          .select('id, name')
          .in('id', communityIds) : Promise.resolve({ data: [] })
      ]);

      // Create lookup maps
      const schoolsMap = new Map(schoolsData.data?.map(s => [s.id, s]) || []);
      const generationsMap = new Map(generationsData.data?.map(g => [g.id, g]) || []);
      const communitiesMap = new Map(communitiesData.data?.map(c => [c.id, c]) || []);

      // Enrich profiles with organizational info
      const enrichedProfiles = profiles?.map(profile => ({
        ...profile,
        schools: profile.school_id ? schoolsMap.get(profile.school_id) : null,
        generations: profile.generation_id ? generationsMap.get(profile.generation_id) : null,
        communities: profile.community_id ? communitiesMap.get(profile.community_id) : null
      })) || [];
      
      // Step 3: Get course enrollment data
      const { data: enrollments, error: enrollmentError } = await supabase
        .from('course_enrollments')
        .select(`
          user_id,
          course_id,
          progress_percentage,
          completed_at,
          updated_at,
          time_spent
        `)
        .in('user_id', filteredUserIds);
      
      if (enrollmentError) {
        console.error('Error fetching course enrollments:', enrollmentError);
      }
      
      // Step 4: Get learning path data (if available)
      let learningPathData = [];
      try {
        const { data: pathData } = await supabase
          .from('user_learning_path_summary')
          .select(`
            user_id,
            total_time_spent_minutes,
            last_session_date,
            overall_progress_percentage,
            total_courses,
            completed_courses
          `)
          .in('user_id', filteredUserIds);
        
        learningPathData = pathData || [];
      } catch (pathError) {
        // Learning path table might not exist - continue without it
        console.log('Learning path data not available:', pathError.message);
      }
      
      // Step 5: Aggregate the data into user progress format
      const userProgressData = this.aggregateUserProgress(
        enrichedProfiles || [],
        enrollments || [],
        learningPathData,
        additionalFilters
      );
      
      return { data: userProgressData, error: null };
      
    } catch (error) {
      console.error('Error in getUserProgress:', error);
      return { data: null, error };
    }
  }

  /**
   * Get filtered user IDs based on role permissions
   */
  async getFilteredUserIds(roleFilters, additionalFilters) {
    try {
      let userIds = [];
      
      if (roleFilters.consultant_id) {
        // For consultants, get their assigned students
        const { data: assignments } = await supabase
          .from('consultant_assignments')
          .select('student_id')
          .eq('consultant_id', roleFilters.consultant_id)
          .eq('is_active', true);
        
        userIds = assignments?.map(a => a.student_id) || [];
      }
      else if (roleFilters.network_id) {
        // For network supervisors, get users from schools in their network
        const { data: networkSchools } = await supabase
          .from('red_escuelas')
          .select('school_id')
          .eq('red_id', roleFilters.network_id);
        
        const schoolIds = networkSchools?.map(ns => ns.school_id) || [];
        if (schoolIds.length > 0) {
          const { data: schoolUsers } = await supabase
            .from('profiles')
            .select('id')
            .in('school_id', schoolIds);
          
          userIds = schoolUsers?.map(u => u.id) || [];
        }
      }
      else {
        // Build profiles query with role-based filters
        let profilesQuery = supabase
          .from('profiles')
          .select('id');
        
        if (roleFilters.school_id) {
          profilesQuery = profilesQuery.eq('school_id', roleFilters.school_id);
        }
        
        if (roleFilters.generation_id) {
          profilesQuery = profilesQuery.eq('generation_id', roleFilters.generation_id);
        }
        
        if (roleFilters.community_id) {
          profilesQuery = profilesQuery.eq('community_id', roleFilters.community_id);
        }
        
        // Apply search filter if provided
        if (additionalFilters.search) {
          profilesQuery = profilesQuery.or(`
            first_name.ilike.%${additionalFilters.search}%,
            last_name.ilike.%${additionalFilters.search}%,
            email.ilike.%${additionalFilters.search}%
          `);
        }
        
        const { data: profiles } = await profilesQuery;
        userIds = profiles?.map(p => p.id) || [];
      }
      
      return userIds;
    } catch (error) {
      console.error('Error getting filtered user IDs:', error);
      return [];
    }
  }

  /**
   * Aggregate user progress data from multiple sources
   */
  aggregateUserProgress(profiles, enrollments, learningPathData, additionalFilters) {
    // Create maps for quick lookup
    const enrollmentsByUser = new Map();
    const pathDataByUser = new Map();
    
    // Group enrollments by user
    enrollments.forEach(enrollment => {
      if (!enrollmentsByUser.has(enrollment.user_id)) {
        enrollmentsByUser.set(enrollment.user_id, []);
      }
      enrollmentsByUser.get(enrollment.user_id).push(enrollment);
    });
    
    // Group learning path data by user
    learningPathData.forEach(pathData => {
      if (!pathDataByUser.has(pathData.user_id)) {
        pathDataByUser.set(pathData.user_id, []);
      }
      pathDataByUser.get(pathData.user_id).push(pathData);
    });
    
    // Create user progress records
    const userProgressData = profiles.map(profile => {
      const userEnrollments = enrollmentsByUser.get(profile.id) || [];
      const userPathData = pathDataByUser.get(profile.id) || [];
      
      // Calculate course metrics
      const totalCourses = userEnrollments.length;
      const completedCourses = userEnrollments.filter(e => e.progress_percentage >= 100).length;
      const completionPercentage = totalCourses > 0 ? (completedCourses / totalCourses) * 100 : 0;
      
      // Calculate time spent (from both enrollments and learning paths)
      const courseTimeSpent = userEnrollments.reduce((sum, e) => sum + (e.time_spent || 0), 0);
      const pathTimeSpent = userPathData.reduce((sum, p) => sum + (p.total_time_spent_minutes || 0), 0);
      const totalTimeSpentMinutes = courseTimeSpent + pathTimeSpent;
      
      // Determine last activity
      const courseActivities = userEnrollments.map(e => e.completed_at || e.updated_at).filter(Boolean);
      const pathActivities = userPathData.map(p => p.last_session_date).filter(Boolean);
      const allActivities = [...courseActivities, ...pathActivities].sort().reverse();
      const lastActivityDate = allActivities.length > 0 ? allActivities[0] : null;
      
      // Create aggregated user progress record
      const userProgress = {
        user_id: profile.id,
        user_name: `${profile.first_name || ''} ${profile.last_name || ''}`.trim(),
        user_email: profile.email,
        first_name: profile.first_name,
        last_name: profile.last_name,
        school_id: profile.school_id,
        school_name: profile.schools?.name || null,
        generation_id: profile.generation_id,
        generation_name: profile.generations?.name || null,
        community_id: profile.community_id,
        community_name: profile.communities?.name || null,
        total_courses: totalCourses,
        completed_courses: completedCourses,
        completion_percentage: Math.round(completionPercentage),
        total_time_spent_minutes: Math.round(totalTimeSpentMinutes),
        last_activity_date: lastActivityDate,
        average_quiz_score: null // Would need quiz data to calculate
      };
      
      return userProgress;
    });
    
    // Apply status filters
    let filteredData = userProgressData;
    
    if (additionalFilters.status && additionalFilters.status !== 'all') {
      switch (additionalFilters.status) {
        case 'active':
          const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
          filteredData = filteredData.filter(user => 
            user.last_activity_date && new Date(user.last_activity_date) > sevenDaysAgo
          );
          break;
        case 'completed':
          filteredData = filteredData.filter(user => user.completion_percentage >= 100);
          break;
        case 'in_progress':
          filteredData = filteredData.filter(user => 
            user.completion_percentage > 0 && user.completion_percentage < 100
          );
          break;
      }
    }
    
    return filteredData;
  }
  
  /**
   * Get summary statistics based on role permissions
   */
  async getSummaryStats(userProfile) {
    try {
      // Get filtered user progress
      const { data: users, error } = await this.getUserProgress(userProfile);
      
      if (error) {
        throw error;
      }
      
      const summary = {
        total_users: 0,
        active_users: 0,
        completed_users: 0,
        average_completion: 0,
        total_time_spent: 0,
        average_quiz_score: 0
      };
      
      if (users && users.length > 0) {
        summary.total_users = users.length;
        summary.active_users = users.filter(u => {
          if (!u.last_activity_date) return false;
          const lastActivity = new Date(u.last_activity_date);
          const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
          return lastActivity > sevenDaysAgo;
        }).length;
        summary.completed_users = users.filter(u => u.completion_percentage >= 100).length;
        summary.average_completion = Math.round(
          users.reduce((sum, u) => sum + (u.completion_percentage || 0), 0) / users.length
        );
        summary.total_time_spent = users.reduce((sum, u) => sum + (u.total_time_spent_minutes || 0), 0);
        
        const usersWithScores = users.filter(u => u.average_quiz_score !== null && u.average_quiz_score !== undefined);
        if (usersWithScores.length > 0) {
          summary.average_quiz_score = Math.round(
            usersWithScores.reduce((sum, u) => sum + u.average_quiz_score, 0) / usersWithScores.length
          );
        } else {
          summary.average_quiz_score = null;
        }
      }
      
      return { data: summary, error: null };
    } catch (error) {
      console.error('Error in getSummaryStats:', error);
      return { data: null, error };
    }
  }
  
  /**
   * Get available filters based on user's role and data access
   */
  async getAvailableFilters(userProfile) {
    try {
      const roleFilters = getRoleBasedFilters(userProfile);
      const filters = {
        schools: [],
        generations: [],
        communities: [],
        courses: []
      };
      
      // Admins see all options
      if (userProfile.role === 'admin') {
        const { data: schools } = await supabase
          .from('schools')
          .select('id, name')
          .order('name');
        filters.schools = schools || [];
        
        const { data: generations } = await supabase
          .from('generations')
          .select('id, name')
          .order('name');
        filters.generations = generations || [];
        
        const { data: communities } = await supabase
          .from('growth_communities')
          .select('id, name')
          .order('name');
        filters.communities = communities || [];
      }
      
      // Other roles see filtered options based on their access
      else {
        if (roleFilters.school_id) {
          const { data: school } = await supabase
            .from('schools')
            .select('id, name')
            .eq('id', roleFilters.school_id)
            .single();
          if (school) filters.schools = [school];
          
          // Get generations for this school
          const { data: generations } = await supabase
            .from('generations')
            .select('id, name')
            .eq('school_id', roleFilters.school_id)
            .order('name');
          filters.generations = generations || [];
        }
        
        if (roleFilters.generation_id) {
          // Filter to show only their generation
          filters.generations = filters.generations.filter(
            g => g.id === roleFilters.generation_id
          );
        }
        
        if (roleFilters.community_id) {
          const { data: community } = await supabase
            .from('growth_communities')
            .select('id, name')
            .eq('id', roleFilters.community_id)
            .single();
          if (community) filters.communities = [community];
        }
      }
      
      // Get courses (filtered by role access)
      let coursesQuery = supabase
        .from('courses')
        .select('id, title')
        .eq('is_published', true)
        .order('title');
      
      // Non-admins only see courses they have access to
      if (userProfile.role !== 'admin') {
        // This would need to be adjusted based on your course access logic
        // For now, we'll show all published courses
      }
      
      const { data: courses } = await coursesQuery;
      filters.courses = courses || [];
      
      return { data: filters, error: null };
    } catch (error) {
      console.error('Error in getAvailableFilters:', error);
      return { data: null, error };
    }
  }
}

export default new ReportsService();