/**
 * The words and states of a route card, one copy for both looks (redesign 6B). Moved word for word
 * out of `LearningPathCard.tsx`, which imports them back; the new look's route card
 * (`components/panel/RouteCardNuevo.tsx`) calls the same functions.
 */
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

export interface RouteProgress {
  path_id: string;
  total_courses: number;
  completed_courses: number;
  progress_percentage: number;
  last_accessed: string;
}

/** The numbers and the three states (completed, started, not started), as the card worked them out. */
export const routeState = (progress?: RouteProgress) => {
  const progressPercentage = progress?.progress_percentage || 0;
  const completedCourses = progress?.completed_courses || 0;
  const totalCourses = progress?.total_courses || 0;
  const isCompleted = progressPercentage === 100;
  const isStarted = progressPercentage > 0 && progressPercentage < 100;
  return { progressPercentage, completedCourses, totalCourses, isCompleted, isStarted };
};

/** The level after «Nivel »: «2» when the route has more than three courses. */
export const routeLevel = (totalCourses: number) => (totalCourses > 3 ? '2' : '1');

/** The percentage as the card writes it. */
export const routePercent = (progressPercentage: number) => Math.round(progressPercentage);

/** The action's words (the card draws them only when the route is not completed). */
export const routeActionText = (isStarted: boolean) => (isStarted ? 'Continuar aprendiendo' : 'Comenzar ruta');

/** The time since the route was assigned, without «hace». */
export const timeSinceAssigned = (assigned_at: string) =>
  formatDistanceToNow(new Date(assigned_at), {
    addSuffix: false,
    locale: es,
  });
