/**
 * The words and rules of a course card, one copy for both looks (redesign 6B). Moved word for word
 * out of `NetflixCourseCard.tsx`, which imports them back; the new look's course card
 * (`components/panel/CourseCardNuevo.tsx`) calls the same functions. A value the card had in scope
 * is now an argument.
 */
import type { NetflixCourseCardProps } from '@/types/courses';

type Course = NetflixCourseCardProps['course'];
type Enrollment = NetflixCourseCardProps['enrollment'];

// Get CTA text based on enrollment status
export const getCTAText = (enrollment: Enrollment): string => {
  if (!enrollment) return 'Ver Detalles';
  if (enrollment.completion_status === 'aprobado') return 'Repasar';
  if (enrollment.completion_status === 'completado') return 'Continuar';
  if (enrollment.progress_percentage > 0) return 'Continuar';
  return 'Comenzar';
};

// Get difficulty label in Spanish
export const getDifficultyLabel = (level: string | null): string => {
  switch (level?.toLowerCase()) {
    case 'beginner':
      return 'Principiante';
    case 'intermediate':
      return 'Intermedio';
    case 'advanced':
      return 'Avanzado';
    default:
      return '';
  }
};

// Format duration
export const formatDuration = (hours: number | null): string => {
  if (!hours) return '';
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  return `${hours}h`;
};

/**
 * Which picture a course shows: the instructor's photo, else the course's thumbnail, else the
 * generated `CourseThumbnail` (the card's own order, "prioritize instructor photo over course
 * thumbnail"). The source and the alternative text are the ones the card gave each image.
 */
export type CoursePicture =
  | { kind: 'instructor'; src: string; alt: string }
  | { kind: 'thumbnail'; src: string; alt: string }
  | { kind: 'generated' };

export const getCoursePicture = (course: Pick<Course, 'title' | 'thumbnail_url' | 'instructor'>): CoursePicture => {
  if (course.instructor?.photo_url) {
    return { kind: 'instructor', src: course.instructor.photo_url, alt: course.instructor.full_name };
  }
  if (course.thumbnail_url) {
    return { kind: 'thumbnail', src: course.thumbnail_url, alt: course.title };
  }
  return { kind: 'generated' };
};

/** The progress bar is drawn (when enrolled and above 0). The card's expression, as it was. */
export const showsProgress = (enrollment: Enrollment) => enrollment && enrollment.progress_percentage > 0;

/**
 * The lesson count and «{x} de {n} lecciones» are drawn. The card's expression as it was, value and
 * all: it answers `0` for a course with zero lessons, which today's card prints as a stray «0». A
 * caller that must not print it takes `Boolean(...)` of it.
 */
export const showsLessons = (enrollment: Enrollment) =>
  enrollment && enrollment.total_lessons && enrollment.total_lessons > 0;

/** «Tareas: a/b» is drawn. The card's expression as it was. */
export const showsAssignments = (enrollment: Enrollment) =>
  enrollment && enrollment.assignments_total != null && enrollment.assignments_total > 0;

/** The learning objectives shown (at most four) and how many more there are. */
export const objectivesPreview = (objectives: string[]) => ({
  shown: objectives.slice(0, 4),
  more: objectives.length - 4,
});
