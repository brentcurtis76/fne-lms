import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '../supabase';

interface LearningPath {
  id: string;
  name: string;
  description: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface LearningPathCourse {
  id: string;
  path_id: string;
  course_id: string;
  sequence: number;
  created_at: string;
}

interface LearningPathAssignment {
  id: string;
  path_id: string;
  user_id?: string;
  group_id?: string;
  assigned_by: string;
  assigned_at: string;
}

interface CourseWithSequence {
  course_id: string;
  course_title: string;
  course_description: string;
  sequence: number;
}

interface LearningPathWithDetails extends LearningPath {
  created_by_name?: string;
  course_count?: number;
}

interface LearningPathWithCourses extends LearningPath {
  courses: CourseWithSequence[];
}

export class LearningPathsService {
  /**
   * Create a new learning path with courses (atomic database transaction)
   */
  static async createLearningPath(
    supabaseClient: any,
    name: string,
    description: string,
    courseIds: string[],
    userId: string
  ): Promise<LearningPath> {
    try {
      console.log('[LearningPathsService] Calling RPC with params:', {
        p_name: name,
        p_description: description,
        p_course_ids: courseIds,
        p_created_by: userId
      });
      
      // Use the atomic database function for true transactional integrity
      const { data, error } = await supabaseClient
        .rpc('create_full_learning_path', {
          p_name: name,
          p_description: description,
          p_course_ids: courseIds,
          p_created_by: userId
        });

      console.log('[LearningPathsService] RPC response:', { data, error });

      if (error) throw error;

      return data;
    } catch (error: any) {
      console.error('[LearningPathsService] Error details:', error);
      throw new Error(`Failed to create learning path: ${error.message}`);
    }
  }

  /**
   * Get all learning paths with creator names and course counts
   */
  static async getAllLearningPaths(
    supabaseClient: any
  ): Promise<LearningPathWithDetails[]> {
    try {
      // First, fetch all learning paths without the join
      const { data: paths, error: pathsError } = await supabaseClient
        .from('learning_paths')
        .select('*')
        .order('created_at', { ascending: false });

      if (pathsError) throw pathsError;

      // If no paths, return empty array
      if (!paths || paths.length === 0) {
        return [];
      }

      // Get unique creator IDs
      const creatorIds = [...new Set(paths.map((p: any) => p.created_by))];

      // Fetch creator profiles separately to avoid join issues
      const { data: profiles, error: profilesError } = await supabaseClient
        .from('profiles')
        .select('id, first_name, last_name')
        .in('id', creatorIds);

      if (profilesError) {
        console.warn('Could not fetch profiles:', profilesError);
        // Continue without profile names rather than failing
      }

      // Create a map of profile data
      const profileMap = (profiles || []).reduce((acc: any, profile: any) => {
        acc[profile.id] = profile;
        return acc;
      }, {});

      // Get course counts for each path (only if there are paths)
      let courseCounts = [];
      if (paths.length > 0) {
        const { data, error: countError } = await supabaseClient
          .from('learning_path_courses')
          .select('path_id')
          .in('path_id', paths.map((p: any) => p.id));

        if (countError) {
          console.warn('Could not fetch course counts:', countError);
          // Continue without counts rather than failing
        } else {
          courseCounts = data || [];
        }
      }

      // Count courses per path
      const countMap = (courseCounts || []).reduce((acc: any, item: any) => {
        acc[item.path_id] = (acc[item.path_id] || 0) + 1;
        return acc;
      }, {});

      // Format the response
      return paths.map((path: any) => {
        const creator = profileMap[path.created_by];
        return {
          ...path,
          created_by_name: creator 
            ? `${creator.first_name || ''} ${creator.last_name || ''}`.trim() || 'Unknown'
            : 'Unknown',
          course_count: countMap[path.id] || 0
        };
      });
    } catch (error: any) {
      throw new Error(`Failed to fetch learning paths: ${error.message}`);
    }
  }

  /**
   * Get a single learning path with all its courses
   */
  static async getLearningPathWithCourses(
    supabaseClient: any,
    pathId: string
  ): Promise<LearningPathWithCourses | null> {
    try {
      // Fetch the learning path
      const { data: path, error: pathError } = await supabaseClient
        .from('learning_paths')
        .select('*')
        .eq('id', pathId)
        .single();

      if (pathError) throw pathError;
      if (!path) return null;

      // Fetch associated courses with their details
      const { data: pathCourses, error: coursesError } = await supabaseClient
        .from('learning_path_courses')
        .select(`
          course_id,
          sequence,
          course:courses(
            id,
            title,
            description
          )
        `)
        .eq('path_id', pathId)
        .order('sequence', { ascending: true });

      if (coursesError) throw coursesError;

      // Format the courses
      const courses: CourseWithSequence[] = (pathCourses || [])
        .filter((pc: any) => pc.course) // Filter out any null courses
        .map((pc: any) => ({
          course_id: pc.course_id,
          course_title: pc.course.title,
          course_description: pc.course.description,
          sequence: pc.sequence
        }));

      return {
        ...path,
        courses
      };
    } catch (error: any) {
      throw new Error(`Failed to fetch learning path: ${error.message}`);
    }
  }

  /**
   * Update a learning path with courses (atomic database transaction)
   */
  static async updateLearningPath(
    supabaseClient: any,
    pathId: string,
    name: string,
    description: string,
    courseIds: string[],
    userId: string
  ): Promise<LearningPath> {
    try {
      // Use the atomic database function for true transactional integrity
      const { data, error } = await supabaseClient
        .rpc('update_full_learning_path', {
          p_path_id: pathId,
          p_name: name,
          p_description: description,
          p_course_ids: courseIds,
          p_updated_by: userId
        });

      if (error) throw error;

      return data;
    } catch (error: any) {
      throw new Error(`Failed to update learning path: ${error.message}`);
    }
  }

  /**
   * Delete a learning path (cascades to courses and assignments)
   */
  static async deleteLearningPath(
    supabaseClient: any,
    pathId: string,
    userId: string
  ): Promise<void> {
    try {
      // Check if user owns the path or is admin
      const canDelete = await this.canManagePath(supabaseClient, pathId, userId);
      
      if (!canDelete) {
        throw new Error('You do not have permission to delete this learning path');
      }

      // Delete the learning path (cascades automatically)
      const { error } = await supabaseClient
        .from('learning_paths')
        .delete()
        .eq('id', pathId);

      if (error) throw error;
    } catch (error: any) {
      throw new Error(`Failed to delete learning path: ${error.message}`);
    }
  }

  /**
   * Batch assign a learning path to users and/or groups
   */
  static async batchAssignLearningPath(
    supabaseClient: any,
    pathId: string,
    userIds: string[],
    groupIds: string[],
    assignedBy: string
  ): Promise<any> {
    try {
      // Use the atomic database function
      const { data, error } = await supabaseClient
        .rpc('batch_assign_learning_path', {
          p_path_id: pathId,
          p_user_ids: userIds,
          p_group_ids: groupIds,
          p_assigned_by: assignedBy
        });

      if (error) throw error;

      return data;
    } catch (error: any) {
      throw new Error(`Failed to assign learning path: ${error.message}`);
    }
  }

  /**
   * Check if a user has permission to manage learning paths
   */
  static async hasManagePermission(
    supabaseClient: any,
    userId: string
  ): Promise<boolean> {
    try {
      const { data, error } = await supabaseClient
        .from('user_roles')
        .select('role_type')
        .eq('user_id', userId)
        .eq('is_active', true)
        .in('role_type', ['admin', 'equipo_directivo', 'consultor']);

      // User has permission if they have at least one of the required roles
      return !error && data && data.length > 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * Check if a user can manage a specific learning path
   */
  static async canManagePath(
    supabaseClient: any,
    pathId: string,
    userId: string
  ): Promise<boolean> {
    try {
      // Check if user is admin
      const isAdmin = await this.hasManagePermission(supabaseClient, userId);
      if (isAdmin) return true;

      // Check if user owns the path
      const { data, error } = await supabaseClient
        .from('learning_paths')
        .select('created_by')
        .eq('id', pathId)
        .eq('created_by', userId)
        .single();

      return !error && data !== null;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get user's assigned learning paths
   */
  static async getUserAssignedPaths(
    supabaseClient: any,
    userId: string
  ): Promise<any[]> {
    try {
      // Get direct assignments and group assignments
      const { data: assignments, error } = await supabaseClient
        .from('learning_path_assignments')
        .select(`
          *,
          path:learning_paths(*)
        `)
        .or(`user_id.eq.${userId},group_id.in.(
          SELECT community_id FROM user_roles WHERE user_id = '${userId}' AND is_active = true
        )`);

      if (error) throw error;

      // Get unique paths
      const pathMap = new Map();
      (assignments || []).forEach((assignment: any) => {
        if (assignment.path && !pathMap.has(assignment.path.id)) {
          pathMap.set(assignment.path.id, {
            ...assignment.path,
            assigned_at: assignment.assigned_at,
            assignment_id: assignment.id
          });
        }
      });

      return Array.from(pathMap.values());
    } catch (error: any) {
      throw new Error(`Failed to fetch assigned paths: ${error.message}`);
    }
  }

  /**
   * Get progress for a user's learning path
   */
  static async getUserPathProgress(
    supabaseClient: any,
    userId: string,
    pathId: string
  ): Promise<any> {
    try {
      // Get all courses in the path
      const { data: pathCourses, error: coursesError } = await supabaseClient
        .from('learning_path_courses')
        .select('course_id')
        .eq('path_id', pathId)
        .order('sequence');

      if (coursesError) throw coursesError;

      const courseIds = pathCourses.map((pc: any) => pc.course_id);

      // Get user's progress in these courses
      // This is a simplified version - you'd need to implement actual progress tracking
      const progress = {
        path_id: pathId,
        total_courses: courseIds.length,
        completed_courses: 0, // Would need to check actual course completion
        progress_percentage: 0,
        last_accessed: new Date().toISOString()
      };

      return progress;
    } catch (error: any) {
      throw new Error(`Failed to fetch path progress: ${error.message}`);
    }
  }
}