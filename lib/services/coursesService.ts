import { SupabaseClient } from '@supabase/supabase-js';

interface Course {
  id: string;
  title: string;
  description: string;
  category: string;
  duration_hours: number;
  difficulty_level: string;
  instructor_id: string;
  created_by: string;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

interface Instructor {
  id: string;
  full_name: string;
  photo_url?: string | null;
  bio?: string | null;
  specialty?: string | null;
}

interface CourseWithInstructor extends Course {
  instructor_name: string;
}

export class CoursesService {
  /**
   * Get a single course by ID with instructor information
   */
  static async getCourseById(
    supabaseClient: SupabaseClient,
    courseId: string
  ): Promise<CourseWithInstructor | null> {
    try {
      // Fetch the course with instructor data in a single query
      const { data: courseData, error: courseError } = await supabaseClient
        .from('courses')
        .select(`
          *,
          instructor:instructors(
            id,
            full_name
          )
        `)
        .eq('id', courseId)
        .single();

      if (courseError) {
        if (courseError.code === 'PGRST116') {
          // Course not found
          return null;
        }
        throw courseError;
      }

      if (!courseData) {
        return null;
      }

      // Format the response
      const courseWithInstructor: CourseWithInstructor = {
        ...courseData,
        instructor_name: courseData.instructor?.full_name || 'Unknown Instructor'
      };

      // Remove the nested instructor object since we've flattened it
      delete (courseWithInstructor as any).instructor;

      return courseWithInstructor;
    } catch (error: any) {
      console.error('[CoursesService] Error fetching course:', error);
      throw new Error(`Failed to fetch course: ${error.message}`);
    }
  }

  /**
   * Get all courses with instructor information
   */
  static async getAllCourses(
    supabaseClient: SupabaseClient
  ): Promise<CourseWithInstructor[]> {
    try {
      const { data: courses, error } = await supabaseClient
        .from('courses')
        .select(`
          *,
          instructor:instructors(
            id,
            full_name
          )
        `)
        .eq('is_published', true)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Format the response
      return (courses || []).map((course: any) => ({
        ...course,
        instructor_name: course.instructor?.full_name || 'Unknown Instructor'
      })).map(({ instructor, ...course }) => course);
    } catch (error: any) {
      console.error('[CoursesService] Error fetching courses:', error);
      throw new Error(`Failed to fetch courses: ${error.message}`);
    }
  }

  /**
   * Get courses by instructor ID
   */
  static async getCoursesByInstructor(
    supabaseClient: SupabaseClient,
    instructorId: string
  ): Promise<CourseWithInstructor[]> {
    try {
      const { data: courses, error } = await supabaseClient
        .from('courses')
        .select(`
          *,
          instructor:instructors(
            id,
            full_name
          )
        `)
        .eq('instructor_id', instructorId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Format the response
      return (courses || []).map((course: any) => ({
        ...course,
        instructor_name: course.instructor?.full_name || 'Unknown Instructor'
      })).map(({ instructor, ...course }) => course);
    } catch (error: any) {
      console.error('[CoursesService] Error fetching courses by instructor:', error);
      throw new Error(`Failed to fetch courses by instructor: ${error.message}`);
    }
  }

  /**
   * Get courses by category
   */
  static async getCoursesByCategory(
    supabaseClient: SupabaseClient,
    category: string
  ): Promise<CourseWithInstructor[]> {
    try {
      const { data: courses, error } = await supabaseClient
        .from('courses')
        .select(`
          *,
          instructor:instructors(
            id,
            full_name
          )
        `)
        .eq('category', category)
        .eq('is_published', true)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Format the response
      return (courses || []).map((course: any) => ({
        ...course,
        instructor_name: course.instructor?.full_name || 'Unknown Instructor'
      })).map(({ instructor, ...course }) => course);
    } catch (error: any) {
      console.error('[CoursesService] Error fetching courses by category:', error);
      throw new Error(`Failed to fetch courses by category: ${error.message}`);
    }
  }

  /**
   * Check if a course exists and is published
   */
  static async isCourseAvailable(
    supabaseClient: SupabaseClient,
    courseId: string
  ): Promise<boolean> {
    try {
      const { data, error } = await supabaseClient
        .from('courses')
        .select('id')
        .eq('id', courseId)
        .eq('is_published', true)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return false; // Course not found
        }
        throw error;
      }

      return !!data;
    } catch (error: any) {
      console.error('[CoursesService] Error checking course availability:', error);
      return false;
    }
  }
}