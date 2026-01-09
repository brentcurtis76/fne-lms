// Course and Instructor Types
// For Netflix-style course visualization

/**
 * Base Instructor interface
 */
export interface Instructor {
  id: string;
  full_name: string;
  photo_url?: string | null;
  bio?: string | null;
  specialty?: string | null;
  created_at?: string;
}

/**
 * Course difficulty levels
 */
export type DifficultyLevel = 'beginner' | 'intermediate' | 'advanced';

/**
 * Course structure types
 */
export type CourseStructureType = 'simple' | 'structured';

/**
 * Base Course interface
 */
export interface Course {
  id: string;
  title: string;
  description: string | null;
  thumbnail_url?: string | null;
  instructor_id?: string | null;
  status?: string;
  estimated_duration_hours?: number | null;
  difficulty_level?: DifficultyLevel | null;
  structure_type?: CourseStructureType;
  learning_objectives?: string[] | null;
  prerequisites?: string[] | null;
  created_at?: string;
  created_by?: string | null;
}

/**
 * Course with joined instructor data
 * Used for displaying course cards with instructor info
 */
export interface CourseWithInstructor extends Course {
  instructor?: Instructor | null;
}

/**
 * User enrollment data for a course
 */
export interface CourseEnrollment {
  progress_percentage: number;
  lessons_completed: number;
  total_lessons: number;
  is_completed: boolean;
  last_activity?: string | null;
  enrolled_at?: string;
}

/**
 * Combined course data with enrollment for Netflix card
 */
export interface CourseWithEnrollment extends CourseWithInstructor {
  enrollment?: CourseEnrollment | null;
}

/**
 * Props for Netflix-style course card component
 */
export interface NetflixCourseCardProps {
  course: {
    id: string;
    title: string;
    description: string | null;
    thumbnail_url: string | null;
    estimated_duration_hours: number | null;
    difficulty_level: string | null;
    learning_objectives: string[] | null;
    instructor?: {
      full_name: string;
      photo_url?: string | null;
    } | null;
  };
  enrollment?: {
    progress_percentage: number;
    is_completed: boolean;
    lessons_completed?: number;
    total_lessons?: number;
  } | null;
  onSelect?: (courseId: string) => void;
}

/**
 * Props for Netflix-style course row component
 */
export interface NetflixCourseRowProps {
  title: string;
  courses: CourseWithEnrollment[];
  emptyMessage?: string;
  onCourseSelect?: (courseId: string) => void;
}

/**
 * Props for dynamic course thumbnail component
 */
export interface CourseThumbnailProps {
  title: string;
  instructorName?: string;
  instructorPhotoUrl?: string | null;
  difficultyLevel?: DifficultyLevel | string | null;
  className?: string;
}
