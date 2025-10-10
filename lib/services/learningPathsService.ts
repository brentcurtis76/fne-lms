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
  assignment_count?: number;
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
          .select('learning_path_id')
          .in('learning_path_id', paths.map((p: any) => p.id));

        if (countError) {
          console.warn('Could not fetch course counts:', countError);
          // Continue without counts rather than failing
        } else {
          courseCounts = data || [];
        }
      }

      // Count courses per path
      const countMap = (courseCounts || []).reduce((acc: any, item: any) => {
        acc[item.learning_path_id] = (acc[item.learning_path_id] || 0) + 1;
        return acc;
      }, {});

      // Get assignment counts for each path
      let assignmentCounts = [];
      if (paths.length > 0) {
        const { data, error: assignmentError } = await supabaseClient
          .from('learning_path_assignments')
          .select('path_id')
          .in('path_id', paths.map((p: any) => p.id));

        if (assignmentError) {
          console.warn('Could not fetch assignment counts:', assignmentError);
          // Continue without assignment counts rather than failing
        } else {
          assignmentCounts = data || [];
        }
      }

      // Count assignments per path
      const assignmentCountMap = (assignmentCounts || []).reduce((acc: any, item: any) => {
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
            : 'Sistema',
          course_count: countMap[path.id] || 0,
          assignment_count: assignmentCountMap[path.id] || 0
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
          sequence_order,
          course:courses(
            id,
            title,
            description
          )
        `)
        .eq('learning_path_id', pathId)
        .order('sequence_order', { ascending: true });

      if (coursesError) throw coursesError;

      // Format the courses
      const courses: CourseWithSequence[] = (pathCourses || [])
        .filter((pc: any) => pc.course) // Filter out any null courses
        .map((pc: any) => ({
          course_id: pc.course_id,
          course_title: pc.course.title,
          course_description: pc.course.description,
          sequence: pc.sequence_order
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
      // First, get the user's community IDs (groups they belong to)
      const { data: userRoles, error: rolesError } = await supabaseClient
        .from('user_roles')
        .select('community_id')
        .eq('user_id', userId)
        .eq('is_active', true)
        .not('community_id', 'is', null);

      if (rolesError) throw rolesError;

      const communityIds = (userRoles || []).map((role: any) => role.community_id);

      // Build the query for assignments
      let query = supabaseClient
        .from('learning_path_assignments')
        .select(`
          *,
          path:learning_paths(*)
        `);

      // Add filters based on what we have
      if (communityIds.length > 0) {
        // User has communities, get both direct and group assignments
        query = query.or(`user_id.eq.${userId},group_id.in.(${communityIds.join(',')})`);
      } else {
        // User has no communities, only get direct assignments
        query = query.eq('user_id', userId);
      }

      const { data: assignments, error } = await query;

      if (error) throw error;

      // Get unique paths - ensure the path ID is at the top level
      const pathMap = new Map();
      (assignments || []).forEach((assignment: any) => {
        if (assignment.path && !pathMap.has(assignment.path.id)) {
          pathMap.set(assignment.path.id, {
            id: assignment.path.id, // Explicitly set the ID at top level
            name: assignment.path.name,
            description: assignment.path.description,
            created_at: assignment.path.created_at,
            updated_at: assignment.path.updated_at,
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
        .eq('learning_path_id', pathId)
        .order('sequence_order');

      if (coursesError) throw coursesError;

      const courseIds = pathCourses.map((pc: any) => pc.course_id);

      // If no courses in path, return empty progress
      if (courseIds.length === 0) {
        return {
          path_id: pathId,
          total_courses: 0,
          completed_courses: 0,
          progress_percentage: 0,
          last_accessed: null
        };
      }

      // Get user's enrollment status for these courses
      const { data: enrollments, error: enrollmentsError } = await supabaseClient
        .from('course_enrollments')
        .select('course_id, progress_percentage, completed_at')
        .eq('user_id', userId)
        .in('course_id', courseIds);

      if (enrollmentsError) throw enrollmentsError;

      // Count completed courses (consider a course completed if progress_percentage >= 100)
      const completedCourses = (enrollments || []).filter((enrollment: any) => 
        enrollment.progress_percentage >= 100
      ).length;

      // Find the most recent completion date
      const lastAccessedDate = (enrollments || [])
        .map((e: any) => e.completed_at)
        .filter((date: any) => date)
        .sort((a: any, b: any) => new Date(b).getTime() - new Date(a).getTime())[0];

      // Calculate progress percentage
      const progressPercentage = courseIds.length > 0 
        ? Math.round((completedCourses / courseIds.length) * 100)
        : 0;

      const progress = {
        path_id: pathId,
        total_courses: courseIds.length,
        completed_courses: completedCourses,
        progress_percentage: progressPercentage,
        last_accessed: lastAccessedDate || null
      };

      return progress;
    } catch (error: any) {
      throw new Error(`Failed to fetch path progress: ${error.message}`);
    }
  }

  /**
   * Get detailed learning path information for a specific user 
   * Uses regular database queries instead of RPC functions
   */
  static async getLearningPathDetailsForUser(
    supabaseClient: any,
    userId: string,
    pathId: string
  ): Promise<any> {
    try {
      console.log(`[LearningPathsService] Getting path details for user ${userId}, path ${pathId}`);

      // First, get user's community IDs (groups they belong to)
      const { data: userRoles, error: rolesError } = await supabaseClient
        .from('user_roles')
        .select('community_id')
        .eq('user_id', userId)
        .eq('is_active', true)
        .not('community_id', 'is', null);

      if (rolesError) throw rolesError;

      const communityIds = (userRoles || []).map((role: any) => role.community_id);

      // Now check for learning path assignment
      let assignmentQuery = supabaseClient
        .from('learning_path_assignments')
        .select('*')
        .eq('path_id', pathId);

      // Add filters based on what we have
      if (communityIds.length > 0) {
        // User has communities, get both direct and group assignments
        assignmentQuery = assignmentQuery.or(`user_id.eq.${userId},group_id.in.(${communityIds.join(',')})`);
      } else {
        // User has no communities, only get direct assignments
        assignmentQuery = assignmentQuery.eq('user_id', userId);
      }

      const { data: assignment, error: assignmentError } = await assignmentQuery.maybeSingle();

      if (assignmentError) {
        console.error('[LearningPathsService] Assignment check error:', assignmentError);
        throw assignmentError;
      }

      if (!assignment) {
        throw new Error('Learning path not found or not assigned to user');
      }

      // Get the learning path details
      const { data: pathData, error: pathError } = await supabaseClient
        .from('learning_paths')
        .select('*')
        .eq('id', pathId)
        .single();

      if (pathError) {
        console.error('[LearningPathsService] Path data error:', pathError);
        throw pathError;
      }

      if (!pathData) {
        throw new Error('Learning path not found');
      }

      // Get courses in the learning path with their details
      const { data: pathCourses, error: coursesError } = await supabaseClient
        .from('learning_path_courses')
        .select(`
          course_id,
          sequence_order,
          course:courses(
            id,
            title,
            description,
            estimated_duration_hours,
            difficulty_level
          )
        `)
        .eq('learning_path_id', pathId)
        .order('sequence_order', { ascending: true });

      if (coursesError) {
        console.error('[LearningPathsService] Courses error:', coursesError);
        throw coursesError;
      }

      const courses = pathCourses || [];
      const courseIds = courses.map(pc => pc.course_id);

      // Get user's enrollment status for all courses in the path
      let enrollments = [];
      if (courseIds.length > 0) {
        const { data: enrollmentData, error: enrollmentError } = await supabaseClient
          .from('course_enrollments')
          .select('course_id, progress_percentage, completed_at, enrolled_at, status')
          .eq('user_id', userId)
          .in('course_id', courseIds);

        if (enrollmentError) {
          console.error('[LearningPathsService] Enrollment error:', enrollmentError);
          // Don't throw here - user might not be enrolled in any courses yet
        } else {
          enrollments = enrollmentData || [];
        }
      }

      // Create enrollment map for easy lookup
      const enrollmentMap = new Map();
      enrollments.forEach(enrollment => {
        enrollmentMap.set(enrollment.course_id, enrollment);
      });

      // Calculate progress
      const completedCourses = enrollments.filter(e => e.progress_percentage >= 100).length;
      const totalCourses = courses.length;
      const progressPercentage = totalCourses > 0 ? Math.round((completedCourses / totalCourses) * 100) : 0;

      // Build course details with user progress (initial pass)
      const coursesWithProgressBase = courses.map((pathCourse, index) => {
        const course = pathCourse.course;
        const enrollment = enrollmentMap.get(pathCourse.course_id);
        
        // Determine status and button state
        let status = 'not_started';
        let buttonText = 'Comenzar curso';
        let buttonVariant = 'default';
        
        if (enrollment) {
          if (enrollment.progress_percentage >= 100) {
            status = 'completed';
            buttonText = 'Revisar curso';
            buttonVariant = 'outline';
          } else if (enrollment.progress_percentage > 0) {
            status = 'in_progress';
            buttonText = 'Continuar curso';
            buttonVariant = 'default';
          } else {
            status = 'enrolled';
            buttonText = 'Iniciar curso';
            buttonVariant = 'default';
          }
        }

        return {
          sequence: pathCourse.sequence_order,
          course_id: pathCourse.course_id,
          title: course?.title || 'Curso sin título',
          description: course?.description || '',
          category: '', // Not used in the new structure
          duration_hours: course?.estimated_duration_hours || 0,
          difficulty_level: course?.difficulty_level || 'intermediate',
          status,
          completion_rate: enrollment?.progress_percentage || 0,
          last_accessed: enrollment?.completed_at || enrollment?.enrolled_at || null,
          enrolled_at: enrollment?.enrolled_at || null,
          enrollment_status: enrollment?.status || null,
          buttonText,
          buttonVariant,
          buttonHref: `/student/course/${pathCourse.course_id}`,
          buttonTargetCourseId: pathCourse.course_id,
          buttonDisabled: false
        };
      });

      const allCoursesCompleted = coursesWithProgressBase.every(course => course.status === 'completed');

      let fallbackCourse: { course_id: string; title?: string | null } | null = null;

      if (allCoursesCompleted) {
        // Try to find another incomplete course assigned to the user (outside this path)
        const { data: otherEnrollments } = await supabaseClient
          .from('course_enrollments')
          .select('course_id, progress_percentage, courses(title)')
          .eq('user_id', userId)
          .order('created_at', { ascending: true });

        if (otherEnrollments && otherEnrollments.length > 0) {
          const courseIdsSet = new Set(courseIds);
          const nextIncomplete = otherEnrollments.find(enrollment => 
            enrollment.progress_percentage < 100 && !courseIdsSet.has(enrollment.course_id)
          );

          if (nextIncomplete) {
            fallbackCourse = {
              course_id: nextIncomplete.course_id,
              title: (nextIncomplete as any)?.courses?.title || null
            };
          }
        }

        if (!fallbackCourse) {
          const { data: assignments } = await supabaseClient
            .from('course_assignments')
            .select('course_id, courses(title)')
            .eq('teacher_id', userId);

          if (assignments && assignments.length > 0) {
            const courseIdsSet = new Set(courseIds);
            const assignment = assignments.find(item => !courseIdsSet.has(item.course_id));
            if (assignment) {
              fallbackCourse = {
                course_id: assignment.course_id,
                title: (assignment as any)?.courses?.title || null
              };
            }
          }
        }
      }

      // Enhance course actions with next-course logic
      const coursesWithProgress = coursesWithProgressBase.map((course, index, array) => {
        const nextInPath = array
          .filter(other => other.sequence > course.sequence)
          .find(other => other.status !== 'completed');

        let buttonText = course.buttonText;
        let buttonVariant = course.buttonVariant;
        let buttonHref = course.buttonHref;
        let buttonTargetCourseId = course.buttonTargetCourseId;
        let buttonDisabled = course.buttonDisabled;

        if (course.status === 'completed') {
          buttonVariant = 'outline';
          buttonText = 'Revisar curso';
          buttonHref = `/student/course/${course.course_id}`;
          buttonTargetCourseId = course.course_id;

          if (nextInPath) {
            buttonVariant = 'default';
            buttonText = 'Ir al siguiente curso';
            buttonHref = `/student/course/${nextInPath.course_id}`;
            buttonTargetCourseId = nextInPath.course_id;
          } else if (fallbackCourse) {
            buttonVariant = 'default';
            buttonText = fallbackCourse.title
              ? `Ir a ${fallbackCourse.title}`
              : 'Ir al siguiente curso disponible';
            buttonHref = `/student/course/${fallbackCourse.course_id}`;
            buttonTargetCourseId = fallbackCourse.course_id;
          } else {
            buttonVariant = 'outline';
            buttonText = 'No tienes más cursos asignados';
            buttonHref = '#';
            buttonTargetCourseId = null;
            buttonDisabled = true;
          }
        } else if (course.status === 'not_started') {
          buttonText = 'Comenzar curso';
          buttonVariant = 'default';
          buttonHref = `/student/course/${course.course_id}`;
          buttonTargetCourseId = course.course_id;
        } else if (course.status === 'enrolled') {
          buttonText = 'Iniciar curso';
          buttonVariant = 'default';
          buttonHref = `/student/course/${course.course_id}`;
          buttonTargetCourseId = course.course_id;
        } else if (course.status === 'in_progress') {
          buttonText = 'Continuar curso';
          buttonVariant = 'default';
          buttonHref = `/student/course/${course.course_id}`;
          buttonTargetCourseId = course.course_id;
        }

        return {
          ...course,
          buttonText,
          buttonVariant,
          buttonHref,
          buttonTargetCourseId,
          buttonDisabled
        };
      });

      // Build the final response structure expected by the frontend
      const result = {
        id: pathData.id,
        name: pathData.name,
        description: pathData.description,
        created_at: pathData.created_at,
        updated_at: pathData.updated_at,
        courses: coursesWithProgress,
        progress: {
          total_courses: totalCourses,
          completed_courses: completedCourses,
          progress_percentage: progressPercentage
        },
        // Optional time tracking (placeholder for future implementation)
        timeTracking: {
          totalTimeSpent: 0,
          estimatedCompletion: null,
          startedAt: assignment.assigned_at,
          completedAt: progressPercentage === 100 ? new Date().toISOString() : null,
          lastActivity: null
        }
      };

      console.log(`[LearningPathsService] Successfully built path details for ${pathData.name}`);
      return result;

    } catch (error: any) {
      console.error('[LearningPathsService] Error in getLearningPathDetailsForUser:', error);
      throw new Error(`Failed to fetch learning path details: ${error.message}`);
    }
  }
}
