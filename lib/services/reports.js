import { supabase } from '../supabase';
import { getRoleBasedFilters, applyReportFilters } from '../../utils/reportFilters';

class ReportsService {
  /**
   * Fetch user progress data based on role permissions
   */
  async getUserProgress(userProfile, additionalFilters = {}) {
    try {
      // Get role-based filters
      const roleFilters = getRoleBasedFilters(userProfile);
      
      // Build base query
      let query = supabase
        .from('user_progress_view') // This would be a view that aggregates user progress data
        .select(`
          user_id,
          user_name: profiles!inner(first_name, last_name, email),
          user_role: profiles!inner(role),
          school_id,
          school_name: schools(name),
          generation_id,
          generation_name: generations(name),
          community_id,
          community_name: growth_communities(name),
          total_courses_enrolled,
          completed_courses,
          courses_in_progress,
          total_lessons_completed,
          completion_percentage,
          total_time_spent_minutes,
          average_quiz_score,
          last_activity_date
        `);
      
      // Apply role-based filters
      if (roleFilters.school_id) {
        query = query.eq('profiles.school_id', roleFilters.school_id);
      }
      
      if (roleFilters.generation_id) {
        query = query.eq('profiles.generation_id', roleFilters.generation_id);
      }
      
      if (roleFilters.community_id) {
        query = query.eq('profiles.community_id', roleFilters.community_id);
      }
      
      if (roleFilters.consultant_id) {
        // For consultants, get their assigned students
        const { data: assignments } = await supabase
          .from('consultant_assignments')
          .select('student_id')
          .eq('consultant_id', roleFilters.consultant_id);
        
        const studentIds = assignments?.map(a => a.student_id) || [];
        if (studentIds.length > 0) {
          query = query.in('user_id', studentIds);
        } else {
          // No students assigned
          return { data: [], error: null };
        }
      }
      
      // Apply additional filters (from UI)
      if (additionalFilters.search) {
        query = query.or(`
          profiles.first_name.ilike.%${additionalFilters.search}%,
          profiles.last_name.ilike.%${additionalFilters.search}%,
          profiles.email.ilike.%${additionalFilters.search}%
        `);
      }
      
      if (additionalFilters.course_id && additionalFilters.course_id !== 'all') {
        query = query.eq('course_id', additionalFilters.course_id);
      }
      
      if (additionalFilters.status && additionalFilters.status !== 'all') {
        switch (additionalFilters.status) {
          case 'active':
            query = query.gte('last_activity_date', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());
            break;
          case 'completed':
            query = query.eq('completion_percentage', 100);
            break;
          case 'in_progress':
            query = query.gt('completion_percentage', 0).lt('completion_percentage', 100);
            break;
        }
      }
      
      const { data, error } = await query;
      
      if (error) {
        console.error('Error fetching user progress:', error);
        return { data: null, error };
      }
      
      return { data, error: null };
    } catch (error) {
      console.error('Error in getUserProgress:', error);
      return { data: null, error };
    }
  }
  
  /**
   * Get summary statistics based on role permissions
   */
  async getSummaryStats(userProfile) {
    try {
      const roleFilters = getRoleBasedFilters(userProfile);
      
      // For now, return mock data
      // In production, this would aggregate from the filtered user progress data
      const summary = {
        total_users: 0,
        active_users: 0,
        completed_users: 0,
        average_completion: 0,
        total_time_spent: 0,
        average_quiz_score: 0
      };
      
      // Get filtered user progress
      const { data: users } = await this.getUserProgress(userProfile);
      
      if (users && users.length > 0) {
        summary.total_users = users.length;
        summary.active_users = users.filter(u => {
          const lastActivity = new Date(u.last_activity_date || 0);
          const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
          return lastActivity > sevenDaysAgo;
        }).length;
        summary.completed_users = users.filter(u => u.completion_percentage >= 100).length;
        summary.average_completion = Math.round(
          users.reduce((sum, u) => sum + u.completion_percentage, 0) / users.length
        );
        summary.total_time_spent = users.reduce((sum, u) => sum + u.total_time_spent_minutes, 0);
        summary.average_quiz_score = Math.round(
          users.reduce((sum, u) => sum + (u.average_quiz_score || 0), 0) / users.length
        );
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