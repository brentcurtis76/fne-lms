/**
 * The words and rules of a course card, one copy for both looks (redesign 6B). Moved word for word
 * out of `NetflixCourseCard.tsx`, which imports them back; the new look's course card
 * (`components/panel/CourseCardNuevo.tsx`) calls the same functions. A value the card had in scope
 * is now an argument.
 */
import type { NetflixCourseCardProps } from '@/types/courses';

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

/**
 * The fields `getCoursePicture` reads, each as loose as its loosest caller has it: today's card
 * hands it `NetflixCourseCardProps['course']` (`thumbnail_url` present, possibly null), the new
 * look's card hands it `CourseWithEnrollment` (`thumbnail_url` and `instructor` optional).
 */
export interface CoursePictureSource {
  title: string;
  thumbnail_url?: string | null;
  instructor?: { full_name: string; photo_url?: string | null } | null;
}

export const getCoursePicture = (course: CoursePictureSource): CoursePicture => {
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

/*
 * The rules below are still written inline in today's card (`NetflixCourseCard.tsx`, which is not
 * edited again for this): each is copied here word for word, for the new look's card ONLY, with the
 * lines of today's card it mirrors. `__tests__/pages/dashboard.samePanel.test.tsx` feeds today's card
 * and the new one the same courses and compares what they show, which holds the two copies together.
 */

/**
 * The fields of a course the opened card reads, each as loose as its loosest caller has it (today's
 * card: `NetflixCourseCardProps['course']`; the new look's: `CourseWithEnrollment`).
 */
export interface CourseDetailsSource {
  description?: string | null;
  estimated_duration_hours?: number | null;
  difficulty_level?: string | null;
  learning_objectives?: string[] | null;
  instructor?: { full_name: string } | null;
}

/** The relator's name is drawn. Mirrors `course.instructor &&` (today's card, lines 216 and 260). */
export const showsInstructor = (course: CourseDetailsSource) => course.instructor;

/**
 * The duration pill is drawn. Mirrors `course.estimated_duration_hours &&` (line 282), value and all:
 * a caller that must not print a 0 takes `Boolean(...)` of it.
 */
export const showsDuration = (course: CourseDetailsSource) => course.estimated_duration_hours;

/** The difficulty pill is drawn. Mirrors line 290. */
export const showsDifficulty = (course: CourseDetailsSource) =>
  course.difficulty_level && getDifficultyLabel(course.difficulty_level);

/** The description is drawn. Mirrors `course.description &&` (line 369). */
export const showsDescription = (course: CourseDetailsSource) => course.description;

/** «Objetivos de aprendizaje» is drawn. Mirrors line 376. */
export const showsObjectives = (course: CourseDetailsSource) =>
  course.learning_objectives && course.learning_objectives.length > 0;

/** The lessons pill «{n} lecciones». Mirrors line 303. */
export const lessonsPillText = (enrollment: Enrollment) => `${enrollment?.total_lessons} lecciones`;

/** The lesson line «{x} de {n} lecciones». Mirrors line 313. */
export const lessonLineText = (enrollment: Enrollment) =>
  `${enrollment?.lessons_completed || 0} de ${enrollment?.total_lessons} lecciones`;

/** «Tareas: {a}/{b}». Mirrors line 344. */
export const assignmentsText = (enrollment: Enrollment) =>
  `Tareas: ${enrollment?.assignments_submitted ?? 0}/${enrollment?.assignments_total}`;

/**
 * The completion state and the words each state shows. Mirrors `enrollment?.completion_status ===
 * 'aprobado'` / `=== 'completado'` (lines 193, 201, 349 and 362): «Aprobado» on the picture and the
 * «Curso Aprobado» box when opened; «Completado» on the picture and the hint when opened; nothing for
 * any other state.
 */
export const completionTexts = (enrollment: Enrollment) => {
  if (enrollment?.completion_status === 'aprobado') {
    return {
      state: 'aprobado' as const,
      badge: 'Aprobado',
      title: 'Curso Aprobado',
      line: 'Has completado todas las lecciones y tareas.',
    };
  }
  if (enrollment?.completion_status === 'completado') {
    return {
      state: 'completado' as const,
      badge: 'Completado',
      line: 'Completa tus tareas pendientes para obtener la insignia.',
    };
  }
  return null;
};

/** The learning objectives shown (at most four) and how many more there are. */
export const objectivesPreview = (objectives: string[]) => ({
  shown: objectives.slice(0, 4),
  more: objectives.length - 4,
});
